import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { AlbumsGeneratorClient, UserAlbumHistoryEntry } from "./api.js";
import { randomUUID } from "node:crypto";
import express from "express";

const client = new AlbumsGeneratorClient();

export function calculateProjectStats(history: UserAlbumHistoryEntry[]) {
  const albumsGenerated = history.length;
  const albumsRated = history.filter(
    (h) => typeof h.rating === "number" && h.rating > 0,
  ).length;
  const albumsUnrated = albumsGenerated - albumsRated;

  return {
    albumsGenerated,
    albumsRated,
    albumsUnrated,
  };
}

function getYear(dateStr: string): number {
  return parseInt(dateStr);
}

function getDecade(year: number): string {
  return `${Math.floor(year / 10) * 10}s`;
}

function getRatedEntries(history: UserAlbumHistoryEntry[]) {
  return history.filter(
    (h) => typeof h.rating === "number" && h.rating > 0,
  ) as (UserAlbumHistoryEntry & {
    rating: number;
  })[];
}

function frequencyMap<T>(items: T[]): Map<T, number> {
  const map = new Map<T, number>();
  for (const item of items) {
    map.set(item, (map.get(item) ?? 0) + 1);
  }
  return map;
}

function topN<T>(
  map: Map<T, number>,
  n: number,
): { value: T; count: number }[] {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([value, count]) => ({ value, count }));
}

function ratingAffinityMap(
  entries: { genres: string[]; rating: number }[],
  keyFn: (entry: { genres: string[]; rating: number }) => string[],
): { value: string; averageRating: number; albumCount: number }[] {
  const map = new Map<string, { sum: number; count: number }>();
  for (const entry of entries) {
    for (const key of keyFn(entry)) {
      const existing = map.get(key) ?? { sum: 0, count: 0 };
      map.set(key, {
        sum: existing.sum + entry.rating,
        count: existing.count + 1,
      });
    }
  }
  return [...map.entries()]
    .map(([value, { sum, count }]) => ({
      value,
      averageRating: Math.round((sum / count) * 100) / 100,
      albumCount: count,
    }))
    .sort((a, b) => b.averageRating - a.averageRating);
}

function requireParam(
  value: string | undefined | null,
  paramName: string,
):
  | string
  | { error: true; response: { content: { type: string; text: string }[] } } {
  if (!value || value.trim() === "") {
    const formatHint =
      paramName === "groupSlug"
        ? " The group slug is the group name in lowercase with hyphens instead of spaces — find it in the group page URL."
        : paramName === "projectIdentifier"
          ? " It can be the project name or the sharerId."
          : "";

    return {
      error: true,
      response: {
        content: [
          {
            type: "text",
            text: `Error: "${paramName}" is required and cannot be empty. Please provide a valid ${paramName} and try again.${formatHint}`,
          },
        ],
      },
    };
  }
  return value.trim();
}

function computeRatingTendencies(
  rated: (UserAlbumHistoryEntry & { rating: number })[],
) {
  if (rated.length === 0)
    return { meanRating: null, standardDeviation: null, label: null };
  const mean =
    Math.round((rated.reduce((s, h) => s + h.rating, 0) / rated.length) * 100) /
    100;
  const std =
    rated.length > 1
      ? Math.round(
          Math.sqrt(
            rated.reduce((s, h) => s + Math.pow(h.rating - mean, 2), 0) /
              rated.length,
          ) * 100,
        ) / 100
      : null;
  const label =
    mean >= 4.0 && std !== null && std < 0.8
      ? "generous and consistent rater"
      : mean >= 4.0
        ? "generous rater"
        : mean <= 2.5 && std !== null && std < 0.8
          ? "harsh and consistent rater"
          : mean <= 2.5
            ? "harsh rater"
            : std !== null && std > 1.2
              ? "erratic rater (wide spread of ratings)"
              : std !== null && std < 0.6
                ? "very consistent rater"
                : "average rater";
  return { meanRating: mean, standardDeviation: std, label };
}

function createMcpServer() {
  const server = new McpServer({
    name: "1001-albums-generator",
    version: "1.0.0",
  });

  const registerTool = <T extends z.ZodRawShape>(
    name: string,
    description: string,
    schema: T,
    handler: (args: any) => Promise<any>,
    readOnlyHint: boolean = false,
  ) => {
    const callback = (async (args: any) => {
      console.error(`[Tool Call] ${name}`, JSON.stringify(args));
      try {
        const result = await handler(args);
        console.error(`[Tool Success] ${name}`);
        return result;
      } catch (error) {
        console.error(`[Tool Error] ${name}`, error);
        throw error;
      }
    }) as any;

    if (readOnlyHint) {
      server.tool(name, description, schema, { readOnlyHint: true }, callback);
    } else {
      server.tool(name, description, schema, callback);
    }
  };

  registerTool(
    "list_book_album_stats",
    'Returns community voting statistics for all albums from the canonical "1001 Albums You Must Hear Before You Die" book list. Each entry includes: name, artist, release year, genres, total votes, average rating, controversial score, and vote distribution by grade (1–5). Use this to answer questions about the book list — e.g. "what is the highest rated book album?" or "find book albums in the jazz genre". For albums submitted by users outside the book list, use list_user_submitted_album_stats. Data is cached for 4 hours.',
    {},
    async () => {
      const stats = await client.getGlobalStats();
      const slim = stats.albums.map((s) => ({
        name: s.name,
        artist: s.artist,
        releaseDate: s.releaseDate,
        genres: s.genres,
        votes: s.votes,
        averageRating: s.averageRating,
        controversialScore: s.controversialScore,
        votesByGrade: s.votesByGrade,
      }));
      return {
        content: [{ type: "text", text: JSON.stringify(slim, null, 2) }],
      };
    },
    true,
  );

  registerTool(
    "get_group",
    `Returns a summary of a 1001 Albums Generator group. Use this as the entry point for any group-related conversation — it gives you the group's name, full member list (with their project identifiers), current album, all-time highest rated album, and all-time lowest rated album.

The member list is particularly important: the projectIdentifier for each member is what you pass to get_project_stats, list_project_history, get_taste_profile, get_rating_outliers, and get_group_member_comparison to analyse individual members.

The allTimeHighscore and allTimeLowscore include the album and all member votes — use these to open discussions like "your group's most beloved album of all time is..." or "this is the one album everyone agreed was bad".

Does not include the latest album with votes — use get_group_latest_album for that. The groupSlug is the group name in lowercase with hyphens instead of spaces (find it in the group page URL). Data is cached for 4 hours.`,
    {
      groupSlug: z
        .string()
        .describe(
          "The group slug (lowercase, hyphenated) from the group page URL",
        ),
    },
    async ({ groupSlug }) => {
      const gs = requireParam(groupSlug, "groupSlug");
      if (typeof gs === "object" && "error" in gs) return gs.response;
      const group = await client.getGroup(gs);
      // Strip latestAlbumWithVotes — that belongs to get_group_latest_album
      const { latestAlbumWithVotes, ...summary } = group;
      return {
        content: [{ type: "text", text: JSON.stringify(summary, null, 2) }],
      };
    },
    true,
  );

  registerTool(
    "get_group_latest_album",
    `Returns the most recently assigned group album along with every member's rating for it. Use this to discuss how the group responded to their latest shared listening experience — who rated it highest, who was coldest on it, and how the group average compares to the community rating.

This is the right starting point for "what did everyone think of the last album?" conversations. For the all-time most divisive albums across the group's full history, use get_group_album_insights instead.

The groupSlug is the group name in lowercase with hyphens instead of spaces. Data is cached for 4 hours.`,
    {
      groupSlug: z
        .string()
        .describe(
          "The group slug (lowercase, hyphenated) from the group page URL",
        ),
    },
    async ({ groupSlug }) => {
      const gs = requireParam(groupSlug, "groupSlug");
      if (typeof gs === "object" && "error" in gs) return gs.response;
      const group = await client.getGroup(gs);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(group.latestAlbumWithVotes ?? null, null, 2),
          },
        ],
      };
    },
    true,
  );

  registerTool(
    "get_group_album_reviews",
    "Returns all member reviews and ratings for a specific album within a group. Accepts either the album UUID or album name as the albumIdentifier — if a name is given, it is resolved to a UUID via the global book stats. For best results, prefer passing the UUID directly (available from get_group or get_group_latest_album). The groupSlug is the group name in lowercase with hyphens instead of spaces. Data is cached for 4 hours.",
    {
      groupSlug: z
        .string()
        .describe(
          "The group slug (lowercase, hyphenated) from the group page URL",
        ),
      albumIdentifier: z
        .string()
        .describe(
          "The album UUID, or album name to resolve against the book list",
        ),
    },
    async ({ groupSlug, albumIdentifier }) => {
      const gs = requireParam(groupSlug, "groupSlug");
      if (typeof gs === "object" && "error" in gs) return gs.response;
      const aid = requireParam(albumIdentifier, "albumIdentifier");
      if (typeof aid === "object" && "error" in aid) return aid.response;
      // Determine if albumIdentifier looks like a UUID (MongoDB ObjectIDs)
      const uuidRegex = /^[0-9a-f]{24}$/i;
      let albumUuid = aid;

      if (!uuidRegex.test(aid)) {
        // Attempt name resolution via global book stats
        // Global stats albums do not carry UUIDs  we need to find the UUID from the group data
        // Best-effort: search the group's highscore, lowscore, currentAlbum, and latestAlbumWithVotes
        const group = await client.getGroup(gs);
        const candidates = [
          group.currentAlbum,
          group.allTimeHighscore?.album,
          group.allTimeLowscore?.album,
          group.latestAlbumWithVotes?.album,
        ].filter((a): a is NonNullable<typeof a> => a != null);

        const lowerIdentifier = aid.toLowerCase();
        const match = candidates.find(
          (a) => a.name.toLowerCase() === lowerIdentifier,
        );

        if (!match) {
          return {
            content: [
              {
                type: "text",
                text: `Could not resolve album name "${aid}" to a UUID. Try passing the UUID directly instead.`,
              },
            ],
          };
        }
        albumUuid = match.uuid;
      }

      const reviews = await client.getGroupAlbumReviews(gs, albumUuid);
      return {
        content: [{ type: "text", text: JSON.stringify(reviews, null, 2) }],
      };
    },
    true,
  );

  registerTool(
    "get_book_album_stat",
    "Search the canonical book list by album name or artist. Returns matching entries with community voting stats (votes, average rating, controversial score, vote breakdown). Only searches the ~1001 albums from the original book — for user-submitted albums outside the book list, use list_user_submitted_album_stats. Data is cached for 4 hours.",
    {
      query: z.string().describe("Search query for album name or artist"),
    },
    async ({ query }) => {
      const q = requireParam(query, "query");
      if (typeof q === "object" && "error" in q) return q.response;
      const allStats = await client.getGlobalStats();
      const lowerQuery = q.toLowerCase();
      const filtered = allStats.albums.filter(
        (s) =>
          s.name.toLowerCase().includes(lowerQuery) ||
          s.artist.toLowerCase().includes(lowerQuery),
      );
      const slim = filtered.map((s) => ({
        name: s.name,
        artist: s.artist,
        releaseDate: s.releaseDate,
        genres: s.genres,
        votes: s.votes,
        averageRating: s.averageRating,
        controversialScore: s.controversialScore,
        votesByGrade: s.votesByGrade,
      }));
      return {
        content: [{ type: "text", text: JSON.stringify(slim, null, 2) }],
      };
    },
    true,
  );

  registerTool(
    "get_album_of_the_day",
    "Returns the current album assigned to a project for today, including full album metadata and any notes added by the project owner. This is the album the user is currently listening to and has not yet rated. Requires a projectIdentifier. Data is cached for 4 hours.",
    {
      projectIdentifier: z
        .string()
        .describe("The name of the project or the sharerId"),
    },
    async ({ projectIdentifier }) => {
      const pid = requireParam(projectIdentifier, "projectIdentifier");
      if (typeof pid === "object" && "error" in pid) return pid.response;
      const project = await client.getProject(pid);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                currentAlbum: project.currentAlbum,
                currentAlbumNotes: project.currentAlbumNotes,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
    true,
  );

  registerTool(
    "get_project_stats",
    'Returns summary statistics for a specific project: total albums generated, number rated, number unrated, current album of the day (with full detail), update frequency, and group membership. Use this when asked about a user\'s progress — e.g. "how many albums has the user rated?" or "what is the user\'s current album?". For the full rated/unrated history, use list_project_history. Requires a projectIdentifier (project name or sharerId). Data is cached for 4 hours.',
    {
      projectIdentifier: z
        .string()
        .describe("The name of the project or the sharerId"),
    },
    async ({ projectIdentifier }) => {
      const pid = requireParam(projectIdentifier, "projectIdentifier");
      if (typeof pid === "object" && "error" in pid) return pid.response;
      const project = await client.getProject(pid);
      // Remove history to keep summary small
      const { history, ...summary } = project;
      const stats = calculateProjectStats(history);
      const currentAlbum = project.currentAlbum
        ? (({ images, slug, ...rest }: any) => rest)(project.currentAlbum)
        : null;
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                ...summary,
                currentAlbum,
                ...stats,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
    true,
  );

  registerTool(
    "list_project_history",
    "Returns the full generated history for a project. Each entry includes: generatedAlbumId, album name, artist, release year, genres, the user's rating (1–5, or null if unrated), global community rating, and date generated. Reviews and full album detail (streaming IDs, images, Wikipedia, subgenres) are intentionally omitted to keep the response manageable — use get_album_detail to retrieve complete information for a specific album. Use this to browse, filter, or analyse the user's listening history. Requires a projectIdentifier. Data is cached for 4 hours.",
    {
      projectIdentifier: z
        .string()
        .describe("The name of the project or the sharerId"),
    },
    async ({ projectIdentifier }) => {
      const pid = requireParam(projectIdentifier, "projectIdentifier");
      if (typeof pid === "object" && "error" in pid) return pid.response;
      const project = await client.getProject(pid);
      const slim = project.history.map((h) => ({
        generatedAlbumId: h.generatedAlbumId,
        name: h.album.name,
        artist: h.album.artist,
        releaseDate: h.album.releaseDate,
        genres: h.album.genres,
        rating: h.rating ?? null,
        globalRating: h.globalRating,
        generatedAt: h.generatedAt,
      }));
      return {
        content: [{ type: "text", text: JSON.stringify(slim, null, 2) }],
      };
    },
    true,
  );

  registerTool(
    "list_user_submitted_album_stats",
    "Returns community voting statistics for albums that users have submitted to 1001 Albums Generator projects which are NOT in the original book list. Each entry includes: name, artist, release year, genres, votes, average rating, controversial score, and vote breakdown. Contains no data specific to any individual project — for a project's own history and ratings, use get_project_stats or list_project_history instead. Data is cached for 4 hours.",
    {},
    async () => {
      const stats = await client.getUserAlbumStats();
      const slim = stats.albums.map((a) => ({
        name: a.name,
        artist: a.artist,
        releaseDate: a.releaseDate,
        genres: a.genres,
        votes: a.votes,
        averageRating: a.averageRating,
        controversialScore: a.controversialScore,
        votesByGrade: a.votesByGrade,
      }));
      return {
        content: [{ type: "text", text: JSON.stringify(slim, null, 2) }],
      };
    },
    true,
  );

  registerTool(
    "get_album_detail",
    "Returns complete information for a single album from a project's history. Includes full album metadata (name, artist, release year, genres, styles, subgenres, Wikipedia URL, all streaming IDs: Spotify, Apple Music, Tidal, Amazon Music, YouTube Music, Qobuz, Deezer), the user's rating and full written review, global community rating, reveal status, and date generated. Use this when you need to read a review, find a streaming link, or prepare a detailed presentation for a specific album. Identify the album using its name, UUID, or generatedAlbumId (available from list_project_history or search_project_history). Requires a projectIdentifier. Data is cached for 4 hours.",
    {
      projectIdentifier: z
        .string()
        .describe("The name of the project or the sharerId"),
      albumIdentifier: z
        .string()
        .describe("The name, UUID, or generatedAlbumId of the album"),
    },
    async ({ projectIdentifier, albumIdentifier }) => {
      const pid = requireParam(projectIdentifier, "projectIdentifier");
      if (typeof pid === "object" && "error" in pid) return pid.response;
      const aid = requireParam(albumIdentifier, "albumIdentifier");
      if (typeof aid === "object" && "error" in aid) return aid.response;
      const project = await client.getProject(pid);
      const lowerId = aid.toLowerCase();
      const result = project.history.find((h) => {
        return (
          h.album.name.toLowerCase() === lowerId ||
          h.album.uuid === albumIdentifier ||
          h.generatedAlbumId === albumIdentifier
        );
      });
      return {
        content: [
          { type: "text", text: JSON.stringify(result || null, null, 2) },
        ],
      };
    },
    true,
  );

  registerTool(
    "get_taste_profile",
    `Analyses a project's full listening history and returns a structured taste profile for the user. Use this as a starting point for any conversation about a user's music taste, listening patterns, or identity as a listener. It is intentionally broad — use it to orient yourself before reaching for more specific tools.

The profile includes:

- DECADE DISTRIBUTION: How many albums per decade, and which decade dominates. Use this to open discussions like "you're clearly a 70s rock person" or "your history skews surprisingly modern".

- TOP GENRES & STYLES: The genres and styles that appear most frequently across the history. Note that genres are broad (e.g. "Rock") while styles are more specific (e.g. "Psychedelic Rock") — both are useful at different levels of conversation.

- TOP ARTISTS: Artists who appear more than once, ranked by frequency. A high count means the project has encountered multiple albums by that artist.

- RATING TENDENCIES: The user's mean rating, standard deviation, and a derived label (e.g. "generous rater", "harsh rater", "consistent", "erratic"). Use this to contextualise all other rating discussions — a 3/5 from a harsh rater means something different than a 3/5 from a generous one.

- COMMUNITY ALIGNMENT: The user's average divergence from global community ratings across all rated albums. A positive value means they tend to rate higher than the community; negative means lower. Also flags whether the user is a contrarian (high absolute divergence) or a consensus listener.

- COMPLETION STATS: Total generated, rated, unrated, and completion percentage.

Requires a projectIdentifier. For deeper analysis of a specific album, use get_album_context. For albums where the user most diverges from community, use get_rating_outliers. Data is cached for 4 hours.`,
    {
      projectIdentifier: z
        .string()
        .describe("The name of the project or the sharerId"),
    },
    async ({ projectIdentifier }) => {
      const pid = requireParam(projectIdentifier, "projectIdentifier");
      if (typeof pid === "object" && "error" in pid) return pid.response;
      const project = await client.getProject(pid);
      const history = project.history;
      const rated = getRatedEntries(history);

      // Only use rated entries for affinity — unrated albums carry no preference signal
      const ratedForAffinity = rated.map((h) => ({
        genres: h.album.genres,
        styles: h.album.styles ?? [],
        decade: getDecade(getYear(h.album.releaseDate)),
        rating: h.rating,
      }));

      const topGenres = ratingAffinityMap(
        ratedForAffinity,
        (e) => e.genres,
      ).slice(0, 10);

      const topStyles = ratingAffinityMap(
        ratedForAffinity.map((e) => ({ genres: e.styles, rating: e.rating })),
        (e) => e.genres,
      ).slice(0, 10);

      const decadeDistribution = ratingAffinityMap(
        ratedForAffinity.map((e) => ({ genres: [e.decade], rating: e.rating })),
        (e) => e.genres,
      ).slice(0, 10);

      // Top artists by average rating (only those appearing more than once)
      const topArtists = ratingAffinityMap(
        rated.map((h) => ({ genres: [h.album.artist], rating: h.rating })),
        (e) => e.genres,
      )
        .filter((a) => a.albumCount > 1)
        .slice(0, 10);

      // Rating tendencies
      const tendencies = computeRatingTendencies(rated);

      // Community alignment
      const ratedWithGlobal = rated.filter(
        (h) => typeof h.globalRating === "number",
      );
      const meanDivergence =
        ratedWithGlobal.length > 0
          ? Math.round(
              (ratedWithGlobal.reduce(
                (s, h) => s + (h.rating - (h.globalRating as number)),
                0,
              ) /
                ratedWithGlobal.length) *
                100,
            ) / 100
          : null;

      const meanAbsoluteDivergence =
        ratedWithGlobal.length > 0
          ? Math.round(
              (ratedWithGlobal.reduce(
                (s, h) => s + Math.abs(h.rating - (h.globalRating as number)),
                0,
              ) /
                ratedWithGlobal.length) *
                100,
            ) / 100
          : null;

      const communityAlignmentLabel =
        meanAbsoluteDivergence === null
          ? null
          : meanAbsoluteDivergence < 0.5
            ? "consensus listener — ratings closely match the community"
            : meanAbsoluteDivergence < 1.0
              ? "mild contrarian — some divergence from community norms"
              : "strong contrarian — frequently disagrees with the community";

      // Completion
      const albumsGenerated = history.length;
      const albumsRated = rated.length;

      const profile = {
        completionStats: {
          albumsGenerated,
          albumsRated,
          albumsUnrated: albumsGenerated - albumsRated,
          completionPercentage: Math.round(
            (albumsRated / albumsGenerated) * 100,
          ),
        },
        decadeDistribution,
        topGenres,
        topStyles,
        topArtists,
        ratingTendencies: tendencies,
        communityAlignment: {
          meanDivergence,
          meanAbsoluteDivergence,
          label: communityAlignmentLabel,
        },
      };

      return {
        content: [{ type: "text", text: JSON.stringify(profile, null, 2) }],
      };
    },
    true,
  );

  registerTool(
    "get_rating_outliers",
    `Returns albums where the user's rating diverges most from the global community average — in either direction. Use this to power conversations about what makes a user's taste unique, surprising, or contrarian.

Two lists are returned:
- UNDERRATED BY USER: Albums the community loves but the user rated low. Sorted by most negative divergence first. Use for "albums you're cold on that most people love".
- OVERRATED BY USER: Albums the user loves but the community is cooler on. Sorted by most positive divergence first. Use for "hidden gems or guilty pleasures".

Each entry includes the album name, artist, release year, genres, the user's rating, the global average rating, and the divergence value (user minus global).

Parameters:
- projectIdentifier: required
- limit: how many outliers to return per direction (default 10, max 25)
- direction: "both" (default), "underrated" (user lower than community), or "overrated" (user higher than community)

Combine with get_taste_profile to contextualise whether this user is generally contrarian (high mean absolute divergence) or whether these outliers are exceptional even for them. For a specific album's divergence in context, use get_album_context. Data is cached for 4 hours.`,
    {
      projectIdentifier: z
        .string()
        .describe("The name of the project or the sharerId"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(25)
        .default(10)
        .describe("Number of outliers to return per direction (default 10)"),
      direction: z
        .enum(["both", "underrated", "overrated"])
        .default("both")
        .describe(
          '"underrated" = user rated lower than community, "overrated" = user rated higher, "both" = return both lists',
        ),
    },
    async ({ projectIdentifier, limit, direction }) => {
      const pid = requireParam(projectIdentifier, "projectIdentifier");
      if (typeof pid === "object" && "error" in pid) return pid.response;
      const project = await client.getProject(pid);
      const ratedWithGlobal = getRatedEntries(project.history).filter(
        (h) => typeof h.globalRating === "number",
      );

      const withDivergence = ratedWithGlobal.map((h) => ({
        generatedAlbumId: h.generatedAlbumId,
        name: h.album.name,
        artist: h.album.artist,
        releaseDate: h.album.releaseDate,
        genres: h.album.genres,
        userRating: h.rating,
        globalRating: h.globalRating as number,
        divergence:
          Math.round((h.rating - (h.globalRating as number)) * 100) / 100,
      }));

      const result: {
        underrated?: typeof withDivergence;
        overrated?: typeof withDivergence;
      } = {};

      if (direction === "both" || direction === "underrated") {
        result.underrated = withDivergence
          .filter((a) => a.divergence < 0)
          .sort((a, b) => a.divergence - b.divergence)
          .slice(0, limit);
      }

      if (direction === "both" || direction === "overrated") {
        result.overrated = withDivergence
          .filter((a) => a.divergence > 0)
          .sort((a, b) => b.divergence - a.divergence)
          .slice(0, limit);
      }

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
    true,
  );

  registerTool(
    "get_group_album_insights",
    `Analyses rating patterns across all members of a group to surface the albums that generated the most disagreement and the most consensus. Requires a groupSlug.

Two lists are returned:

- MOST DIVISIVE: Albums where member ratings had the highest variance — i.e. some members loved it and others hated it. Sorted by variance descending. Use these to drive group discussion: "this is the album that split you most". Each entry includes the album name, artist, all individual member ratings, the mean group rating, and the variance score.

- Most CONSENSUS: Albums where all members rated similarly (low variance). Sorted by variance ascending. Includes both "universally loved" and "universally disliked" albums — check the mean rating to distinguish. Use these to identify shared taste anchors: "this is the one album you all agreed on".

Parameters:
- groupSlug: required
- limit: number of albums to return per category (default 10, max 25)

Note: Only albums where at least 2 members have submitted a numeric rating are included, as variance is meaningless with a single data point.

Use alongside get_group_member_comparison to understand not just which albums divided the group but which specific members drove the disagreement. Data is cached for 4 hours.`,
    {
      groupSlug: z
        .string()
        .describe(
          "The group slug (lowercase, hyphenated) from the group page URL",
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(25)
        .default(10)
        .describe("Number of albums to return per category (default 10)"),
    },
    async ({ groupSlug, limit }) => {
      const gs = requireParam(groupSlug, "groupSlug");
      if (typeof gs === "object" && "error" in gs) return gs.response;
      const group = await client.getGroup(gs);

      // Fetch all member projects
      const memberProjects = await Promise.all(
        group.members.map((m) => client.getProject(m.projectIdentifier)),
      );

      // Build a map: albumUuid -> { name, artist, releaseDate, ratings: { member, rating }[] }
      const albumRatingsMap = new Map<
        string,
        {
          name: string;
          artist: string;
          releaseDate: string;
          ratings: { member: string; rating: number }[];
        }
      >();

      memberProjects.forEach((project, i) => {
        const memberName = group.members[i].projectIdentifier;
        getRatedEntries(project.history).forEach((h) => {
          const uuid = h.album.uuid;
          if (!albumRatingsMap.has(uuid)) {
            albumRatingsMap.set(uuid, {
              name: h.album.name,
              artist: h.album.artist,
              releaseDate: h.album.releaseDate,
              ratings: [],
            });
          }
          albumRatingsMap
            .get(uuid)!
            .ratings.push({ member: memberName, rating: h.rating });
        });
      });

      // Filter to albums rated by at least 2 members and compute variance
      const albumStats = [...albumRatingsMap.values()]
        .filter((a) => a.ratings.length >= 2)
        .map((a) => {
          const mean =
            Math.round(
              (a.ratings.reduce((s, r) => s + r.rating, 0) / a.ratings.length) *
                100,
            ) / 100;
          const variance =
            Math.round(
              (a.ratings.reduce((s, r) => s + Math.pow(r.rating - mean, 2), 0) /
                a.ratings.length) *
                100,
            ) / 100;
          return { ...a, mean, variance };
        });

      const mostDivisive = [...albumStats]
        .sort((a, b) => b.variance - a.variance)
        .slice(0, limit);

      const mostConsensus = [...albumStats]
        .sort((a, b) => a.variance - b.variance)
        .slice(0, limit);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ mostDivisive, mostConsensus }, null, 2),
          },
        ],
      };
    },
    true,
  );

  registerTool(
    "get_group_member_comparison",
    `Compares the listening histories and rating patterns of two group members, given their project identifiers. Use this to answer questions like "do me and [member] have similar taste?", "which albums did we rate most differently?", and "who in the group do I agree with most?".

The comparison includes:

- SHARED ALBUMS: Albums that both members have rated, with each member's rating side by side. This is the foundation of the comparison — only shared, rated albums are used for all statistics.

- RATING DIVERGENCE: For each shared album, the difference between member A's rating and member B's rating (A minus B). Sorted by absolute divergence descending, so the most contested albums appear first.

- TASTE SIMILARITY SCORE: A score from 0–100 derived from the mean absolute rating divergence across all shared albums. 100 = perfect agreement, 0 = maximum disagreement. Use this as a headline number: "you and [member] have a taste similarity score of 74".

- GENRE OVERLAP: The genres that appear most frequently in both members' full histories (not just shared albums). Identifies common ground even on albums they haven't both heard.

- SUMMARY STATS: Total shared albums, mean divergence, and who tends to rate higher overall (useful context: "you're generally the harsher rater of the two").

Parameters:
- projectIdentifierA: first member's project identifier
- projectIdentifierB: second member's project identifier

Note: Members do not need to be in the same group — any two project identifiers can be compared. To compare all pairs within a group, call this tool once per pair.

Use get_group_album_insights first to identify which albums divided the group most, then use this tool to drill into which specific members drove that division. Data is cached for 4 hours.`,
    {
      projectIdentifierA: z
        .string()
        .describe("Project identifier for the first member"),
      projectIdentifierB: z
        .string()
        .describe("Project identifier for the second member"),
    },
    async ({ projectIdentifierA, projectIdentifierB }) => {
      const pidA = requireParam(projectIdentifierA, "projectIdentifierA");
      if (typeof pidA === "object" && "error" in pidA) return pidA.response;
      const pidB = requireParam(projectIdentifierB, "projectIdentifierB");
      if (typeof pidB === "object" && "error" in pidB) return pidB.response;
      const [projectA, projectB] = await Promise.all([
        client.getProject(pidA),
        client.getProject(pidB),
      ]);

      const ratedA = getRatedEntries(projectA.history);
      const ratedB = getRatedEntries(projectB.history);

      // Build UUID -> rating maps
      const mapA = new Map(ratedA.map((h) => [h.album.uuid, h]));
      const mapB = new Map(ratedB.map((h) => [h.album.uuid, h]));

      // Shared albums
      const sharedUuids = [...mapA.keys()].filter((uuid) => mapB.has(uuid));

      const sharedAlbums = sharedUuids.map((uuid) => {
        const a = mapA.get(uuid)!;
        const b = mapB.get(uuid)!;
        const divergence = Math.round((a.rating - b.rating) * 100) / 100;
        return {
          name: a.album.name,
          artist: a.album.artist,
          releaseDate: a.album.releaseDate,
          ratingA: a.rating,
          ratingB: b.rating,
          divergence,
        };
      });

      sharedAlbums.sort(
        (a, b) => Math.abs(b.divergence) - Math.abs(a.divergence),
      );

      // Taste similarity score (0–100)
      const meanAbsDivergence =
        sharedAlbums.length > 0
          ? sharedAlbums.reduce((s, a) => s + Math.abs(a.divergence), 0) /
            sharedAlbums.length
          : null;

      // Max possible divergence on a 1–5 scale is 4
      const similarityScore =
        meanAbsDivergence !== null
          ? Math.round(((4 - meanAbsDivergence) / 4) * 100)
          : null;

      // Who rates higher overall
      const tendenciesA = computeRatingTendencies(ratedA);
      const tendenciesB = computeRatingTendencies(ratedB);
      const meanA = tendenciesA.meanRating;
      const meanB = tendenciesB.meanRating;

      const higherRater =
        meanA !== null && meanB !== null
          ? meanA > meanB
            ? projectIdentifierA
            : meanB > meanA
              ? projectIdentifierB
              : "equal"
          : null;

      // Genre overlap
      const genresA = frequencyMap(ratedA.flatMap((h) => h.album.genres));
      const genresB = frequencyMap(ratedB.flatMap((h) => h.album.genres));
      const sharedGenres = [...genresA.keys()]
        .filter((g) => genresB.has(g))
        .map((g) => ({
          genre: g,
          countA: genresA.get(g)!,
          countB: genresB.get(g)!,
        }))
        .sort((a, b) => b.countA + b.countB - (a.countA + a.countB))
        .slice(0, 10);

      const result = {
        summaryStats: {
          sharedAlbumsCount: sharedAlbums.length,
          totalAlbumsA: ratedA.length,
          totalAlbumsB: ratedB.length,
          meanRatingA: meanA,
          meanRatingB: meanB,
          higherRater,
          tasteSimilarityScore: similarityScore,
          meanAbsoluteDivergence:
            meanAbsDivergence !== null
              ? Math.round(meanAbsDivergence * 100) / 100
              : null,
        },
        genreOverlap: sharedGenres,
        sharedAlbums,
      };

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
    true,
  );

  registerTool(
    "compare_projects",
    `Compares two projects' listening histories at a high level — shared albums, genre affinity overlap, decade preferences, and rating tendencies. Unlike get_group_member_comparison (which focuses on rating divergence on shared albums), this tool is broader and works well even when the two projects have little overlap.

Use this tool when the question is about overall taste compatibility or listening breadth rather than specific album disagreements. For detailed per-album rating divergence between two people, use get_group_member_comparison instead.

The comparison includes:

- OVERLAP SUMMARY: How many albums both projects have heard, as a count and as a percentage of each project's total. Low overlap is normal and interesting in itself — "you've only heard 12 albums in common out of 200 each".

- GENRE AFFINITY: For each project, the top genres by frequency. Highlights genres that dominate one project but not the other — useful for "project A is much more into jazz than project B".

- DECADE PREFERENCES: Side-by-side decade distributions. Useful for "project A skews 60s and 70s while project B is more 90s and 2000s".

- RATING TENDENCIES: Mean rating and standard deviation for each project, with the derived label from get_taste_profile logic. Provides essential context for any rating comparison.

- SHARED ALBUM HIGHLIGHTS: Up to 10 shared albums where both projects have rated, showing both ratings. Not sorted by divergence (use get_group_member_comparison for that) — sorted by global community rating descending, to surface the most significant shared albums.

Parameters:
- projectIdentifierA: first project
- projectIdentifierB: second project

Data is cached for 4 hours.`,
    {
      projectIdentifierA: z
        .string()
        .describe("Project identifier for the first project"),
      projectIdentifierB: z
        .string()
        .describe("Project identifier for the second project"),
    },
    async ({ projectIdentifierA, projectIdentifierB }) => {
      const pidA = requireParam(projectIdentifierA, "projectIdentifierA");
      if (typeof pidA === "object" && "error" in pidA) return pidA.response;
      const pidB = requireParam(projectIdentifierB, "projectIdentifierB");
      if (typeof pidB === "object" && "error" in pidB) return pidB.response;
      const [projectA, projectB] = await Promise.all([
        client.getProject(pidA),
        client.getProject(pidB),
      ]);

      const historyA = projectA.history;
      const historyB = projectB.history;
      const ratedA = getRatedEntries(historyA);
      const ratedB = getRatedEntries(historyB);

      const uuidsA = new Set(historyA.map((h) => h.album.uuid));
      const uuidsB = new Set(historyB.map((h) => h.album.uuid));
      const sharedUuids = [...uuidsA].filter((u) => uuidsB.has(u));

      // Shared album highlights (both rated, sorted by globalRating desc)
      const mapA = new Map(ratedA.map((h) => [h.album.uuid, h]));
      const mapB = new Map(ratedB.map((h) => [h.album.uuid, h]));
      const sharedRatedUuids = sharedUuids.filter(
        (u) => mapA.has(u) && mapB.has(u),
      );
      const sharedHighlights = sharedRatedUuids
        .map((uuid) => {
          const a = mapA.get(uuid)!;
          const b = mapB.get(uuid)!;
          return {
            name: a.album.name,
            artist: a.album.artist,
            globalRating: a.globalRating ?? null,
            ratingA: a.rating,
            ratingB: b.rating,
          };
        })
        .sort((a, b) => (b.globalRating ?? 0) - (a.globalRating ?? 0))
        .slice(0, 10);

      // Genre affinity (by average rating)
      const topGenresA = ratingAffinityMap(
        ratedA.map((h) => ({ genres: h.album.genres, rating: h.rating })),
        (e) => e.genres,
      ).slice(0, 10);

      const topGenresB = ratingAffinityMap(
        ratedB.map((h) => ({ genres: h.album.genres, rating: h.rating })),
        (e) => e.genres,
      ).slice(0, 10);

      // Decade preferences (by average rating)
      const decadesA = ratingAffinityMap(
        ratedA.map((h) => ({
          genres: [getDecade(getYear(h.album.releaseDate))],
          rating: h.rating,
        })),
        (e) => e.genres,
      ).slice(0, 8);

      const decadesB = ratingAffinityMap(
        ratedB.map((h) => ({
          genres: [getDecade(getYear(h.album.releaseDate))],
          rating: h.rating,
        })),
        (e) => e.genres,
      ).slice(0, 8);

      const result = {
        overlapSummary: {
          sharedAlbumsCount: sharedUuids.length,
          totalA: historyA.length,
          totalB: historyB.length,
          overlapPercentageA: Math.round(
            (sharedUuids.length / historyA.length) * 100,
          ),
          overlapPercentageB: Math.round(
            (sharedUuids.length / historyB.length) * 100,
          ),
        },
        ratingTendencies: {
          projectA: computeRatingTendencies(ratedA),
          projectB: computeRatingTendencies(ratedB),
        },
        genreAffinity: {
          projectA: topGenresA,
          projectB: topGenresB,
        },
        decadePreferences: {
          projectA: decadesA,
          projectB: decadesB,
        },
        sharedAlbumHighlights: sharedHighlights,
      };

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
    true,
  );

  registerTool(
    "get_album_context",
    `Returns rich contextual data for a specific album within a project's history, across four dimensions:

1. ARTIST ARC: All other albums by the same artist in the user's history, sorted chronologically by release date, with the user's rating and global rating for each. Use this to discuss an artist's career trajectory as heard by this user — e.g. "you rated their earlier work higher" or "this was their most acclaimed album but you disagreed".

2. MUSICAL CONNECTIONS: Albums in the history sharing genres or styles with the target album, grouped by how many dimensions they share (both genre and style = stronger connection). Use this to identify clusters of related listening and discuss musical lineage or recurring taste patterns.

3. COMMUNITY DIVERGENCE: The difference between the user's rating and the global community average for this album. Also provides the user's mean divergence across all rated albums as a baseline, so you can say whether this album is unusually loved/hated relative to the user's typical behaviour. A positive divergence means the user rated it higher than the community; negative means lower.

4. LISTENING JOURNEY: The 3 albums generated immediately before and after this one in the user's history (by generatedAt date), with ratings. Use this to give a sense of what the user was experiencing around this album — e.g. "you were on a strong run of jazz albums" or "this came right after your lowest-rated album".

Identify the target album using its name, UUID, or generatedAlbumId (from list_project_history or search_project_history). Requires a projectIdentifier. Data is cached for 4 hours.`,
    {
      projectIdentifier: z
        .string()
        .describe("The name of the project or the sharerId"),
      albumIdentifier: z
        .string()
        .describe(
          "The name, UUID, or generatedAlbumId of the album to contextualize",
        ),
    },
    async ({ projectIdentifier, albumIdentifier }) => {
      const pid = requireParam(projectIdentifier, "projectIdentifier");
      if (typeof pid === "object" && "error" in pid) return pid.response;
      const aid = requireParam(albumIdentifier, "albumIdentifier");
      if (typeof aid === "object" && "error" in aid) return aid.response;
      const project = await client.getProject(pid);
      const lowerId = aid.toLowerCase();
      const targetEntry = project.history.find((h) => {
        return (
          h.album.name.toLowerCase() === lowerId ||
          h.album.uuid === albumIdentifier ||
          h.generatedAlbumId === albumIdentifier
        );
      });

      if (!targetEntry) {
        return {
          content: [
            {
              type: "text",
              text: `Album "${albumIdentifier}" not found in project history.`,
            },
          ],
        };
      }

      const targetAlbum = targetEntry.album;
      const history = project.history;

      // Community divergence for this album
      const userRating =
        typeof targetEntry.rating === "number" ? targetEntry.rating : null;
      const globalRating = targetEntry.globalRating ?? null;
      const albumDivergence =
        userRating !== null && globalRating !== null
          ? Math.round((userRating - globalRating) * 100) / 100
          : null;

      // User's mean divergence across all rated albums (as baseline)
      const ratedWithGlobal = getRatedEntries(history).filter(
        (h) => typeof h.globalRating === "number",
      );
      const meanDivergence =
        ratedWithGlobal.length > 0
          ? Math.round(
              (ratedWithGlobal.reduce(
                (sum, h) =>
                  sum + ((h.rating as number) - (h.globalRating as number)),
                0,
              ) /
                ratedWithGlobal.length) *
                100,
            ) / 100
          : null;

      const artistArc = history
        .filter(
          (h) =>
            h.album.artist === targetAlbum.artist &&
            h.album.uuid !== targetAlbum.uuid,
        )
        .sort(
          (a, b) => getYear(a.album.releaseDate) - getYear(b.album.releaseDate),
        )
        .map((h) => ({
          name: h.album.name,
          releaseDate: h.album.releaseDate,
          userRating: h.rating ?? null,
          globalRating: h.globalRating ?? null,
        }));

      const musicalConnections = history
        .filter((h) => h.album.uuid !== targetAlbum.uuid)
        .map((h) => {
          const sharedGenres = h.album.genres.filter((g) =>
            targetAlbum.genres.includes(g),
          );
          const sharedStyles = (h.album.styles ?? []).filter((s) =>
            (targetAlbum.styles ?? []).includes(s),
          );
          return {
            name: h.album.name,
            artist: h.album.artist,
            releaseDate: h.album.releaseDate,
            sharedGenres,
            sharedStyles,
            connectionStrength: sharedGenres.length + sharedStyles.length,
          };
        })
        .filter((h) => h.connectionStrength > 0)
        .sort((a, b) => b.connectionStrength - a.connectionStrength)
        .slice(0, 20);

      const sortedHistory = [...history].sort((a, b) => {
        const aDate = a.generatedAt ?? "";
        const bDate = b.generatedAt ?? "";
        return aDate.localeCompare(bDate);
      });
      const targetIndex = sortedHistory.findIndex(
        (h) => h.generatedAlbumId === targetEntry.generatedAlbumId,
      );
      const journeyWindow = sortedHistory
        .slice(Math.max(0, targetIndex - 3), targetIndex + 4)
        .filter((h) => h.generatedAlbumId !== targetEntry.generatedAlbumId)
        .map((h) => ({
          name: h.album.name,
          artist: h.album.artist,
          generatedAt: h.generatedAt,
          userRating: h.rating ?? null,
          position: sortedHistory.indexOf(h) < targetIndex ? "before" : "after",
        }));

      const context = {
        targetAlbum: {
          name: targetAlbum.name,
          artist: targetAlbum.artist,
          releaseDate: targetAlbum.releaseDate,
          genres: targetAlbum.genres,
          styles: targetAlbum.styles,
          userRating,
          globalRating,
        },
        communityDivergence: {
          albumDivergence,
          userMeanDivergence: meanDivergence,
          interpretation:
            albumDivergence !== null && meanDivergence !== null
              ? albumDivergence > meanDivergence + 0.5
                ? "User rated this notably higher than their usual divergence from the community"
                : albumDivergence < meanDivergence - 0.5
                  ? "User rated this notably lower than their usual divergence from the community"
                  : "User divergence on this album is consistent with their typical pattern"
              : null,
        },
        artistArc,
        musicalConnections,
        listeningJourney: journeyWindow,
        // Retained for backwards compatibility
        sameArtist: artistArc, // alias
        sameYear: history
          .filter(
            (h) =>
              getYear(h.album.releaseDate) ===
                getYear(targetAlbum.releaseDate) &&
              h.album.uuid !== targetAlbum.uuid,
          )
          .map((h) => ({ name: h.album.name, artist: h.album.artist }))
          .slice(0, 50),
        relatedByParticipatingArtists: history
          .filter((h) => {
            if (h.album.uuid === targetAlbum.uuid) return false;
            const targetArtists = targetAlbum.artist
              .split(/&|,|and|with/i)
              .map((s) => s.trim())
              .filter(Boolean);
            const otherArtists = h.album.artist
              .split(/&|,|and|with/i)
              .map((s) => s.trim())
              .filter(Boolean);
            return targetArtists.some((ta) => otherArtists.includes(ta));
          })
          .map((h) => ({ name: h.album.name, artist: h.album.artist })),
      };

      return {
        content: [{ type: "text", text: JSON.stringify(context, null, 2) }],
      };
    },
  );

  registerTool(
    "search_project_history",
    "Searches a project's history by album name, artist, release year, or genre. Returns matching entries in the same slim format as list_project_history (generatedAlbumId, name, artist, year, genres, rating, globalRating, generatedAt — no reviews or streaming links). Use get_album_detail for full information on any result. Requires a projectIdentifier and a query string. Data is cached for 4 hours.",
    {
      projectIdentifier: z
        .string()
        .describe("The name of the project or the sharerId"),
      query: z
        .string()
        .describe("Search query for artist, name, year, or genre"),
    },
    async ({ projectIdentifier, query }) => {
      const pid = requireParam(projectIdentifier, "projectIdentifier");
      if (typeof pid === "object" && "error" in pid) return pid.response;
      const q = requireParam(query, "query");
      if (typeof q === "object" && "error" in q) return q.response;
      const project = await client.getProject(pid);
      const lowerQuery = q.toLowerCase();
      const filtered = project.history.filter((h) => {
        return (
          h.album.name.toLowerCase().includes(lowerQuery) ||
          h.album.artist.toLowerCase().includes(lowerQuery) ||
          h.album.releaseDate.includes(lowerQuery) ||
          h.album.genres.some((g: string) =>
            g.toLowerCase().includes(lowerQuery),
          )
        );
      });
      const slim = filtered.map((h) => ({
        generatedAlbumId: h.generatedAlbumId,
        name: h.album.name,
        artist: h.album.artist,
        releaseDate: h.album.releaseDate,
        genres: h.album.genres,
        rating: h.rating ?? null,
        globalRating: h.globalRating,
        generatedAt: h.generatedAt,
      }));
      return {
        content: [{ type: "text", text: JSON.stringify(slim, null, 2) }],
      };
    },
    true,
  );

  registerTool(
    "refresh_data",
    'Invalidates cached data. The next time the data is requested, it will be fetched fresh from the API. Use type "group" with a groupSlug or "project" with a projectIdentifier to refresh specific datasets.',
    {
      type: z
        .enum(["global", "user", "project", "group", "all"])
        .describe("Type of data to refresh"),
      projectIdentifier: z
        .string()
        .optional()
        .describe('Required if type is "project"'),
      groupSlug: z.string().optional().describe('Required if type is "group"'),
    },
    async ({ type, projectIdentifier, groupSlug }) => {
      if (type === "global") {
        client.invalidateGlobalStats();
      } else if (type === "user") {
        client.invalidateUserStats();
      } else if (type === "project") {
        const pid = requireParam(projectIdentifier ?? "", "projectIdentifier");
        if (typeof pid === "object" && "error" in pid) return pid.response;
        client.invalidateProject(pid);
      } else if (type === "group") {
        const gs = requireParam(groupSlug ?? "", "groupSlug");
        if (typeof gs === "object" && "error" in gs) return gs.response;
        client.invalidateGroup(gs);
      } else if (type === "all") {
        client.clearCache();
      }

      return {
        content: [
          { type: "text", text: `Successfully invalidated ${type} cache.` },
        ],
      };
    },
  );

  // MCP Prompt Templates
  // Prompt 1: todays-album
  server.prompt(
    "todays-album",
    "Get background and context on today's assigned album",
    {
      projectIdentifier: z.string().describe("Your project name or sharerId"),
    },
    (args: { projectIdentifier: string }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Using the 1001 Albums tools, fetch today's album for project "${args.projectIdentifier}" and give me a rich introduction to it. Cover: what makes it historically significant, its place in the artist's career, why it was included in the 1001 Albums book, and what the community thinks of it. If the album has notable connections to others in my listening history, mention those too.`,
          },
        },
      ],
    }),
  );

  // Prompt 2: predict-my-rating
  server.prompt(
    "predict-my-rating",
    "Predict how you'll rate today's album based on your history and past reviews",
    {
      projectIdentifier: z.string().describe("Your project name or sharerId"),
    },
    (args: { projectIdentifier: string }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Using the 1001 Albums tools, I want you to predict how I will rate today's album for project "${args.projectIdentifier}" and explain your reasoning.

To do this well, you should:
1. Fetch today's album using get_album_of_the_day to know what it is
2. Fetch my taste profile using get_taste_profile to understand my genre preferences, decade affinities, rating tendencies, and community alignment
3. Search my history using search_project_history for albums in the same genre, style, or by the same artist to find relevant past ratings and reviews
4. Use get_album_context to understand how this album fits musically into what I've already heard
5. Use get_rating_outliers to understand whether I tend to agree or disagree with the community on albums like this

Then give me a specific predicted rating (e.g. 3.5/5) with a confidence level and a detailed explanation of your reasoning — referencing my actual past ratings and reviews as evidence. Flag any uncertainties, e.g. if I have little history in this genre.`,
          },
        },
      ],
    }),
  );

  // Prompt 3: taste-profile
  server.prompt(
    "taste-profile",
    "Get a full analysis of your music taste based on your listening history",
    {
      projectIdentifier: z.string().describe("Your project name or sharerId"),
    },
    (args: { projectIdentifier: string }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Using the 1001 Albums tools, build a comprehensive profile of my music taste for project "${args.projectIdentifier}".

Use get_taste_profile as the foundation, then enrich it with get_rating_outliers to identify where I diverge most from the community. I want to understand:
- What genres, decades, and styles dominate my history
- How I rate compared to the community — am I a generous or harsh rater, and do I tend to agree or disagree with the crowd?
- Which albums I loved that others didn't, and which community favourites left me cold
- What kind of listener I am overall — give me a short "listener archetype" summary at the end, like a music personality profile`,
          },
        },
      ],
    }),
  );

  // Prompt 4: album-deep-dive
  server.prompt(
    "album-deep-dive",
    "Get a deep contextual analysis of a specific album in your history",
    {
      projectIdentifier: z.string().describe("Your project name or sharerId"),
      albumName: z.string().describe("The name of the album to analyse"),
    },
    (args: { projectIdentifier: string; albumName: string }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Using the 1001 Albums tools, give me a deep dive on "${args.albumName}" from my project "${args.projectIdentifier}".

Use get_album_context to explore:
- The artist arc: how does this album fit into everything else I've heard from this artist, and how did I rate their other work?
- Musical connections: which other albums in my history are most closely related by genre and style?
- My listening journey: what was I hearing just before and after this album, and does it represent a turning point or a continuation?
- Community divergence: did I rate this in line with the community or did I diverge significantly — and is that typical of me?

Also use get_album_detail to retrieve my written review if I left one. Synthesise everything into a narrative about what this album means in the context of my listening history.`,
          },
        },
      ],
    }),
  );

  // Prompt 5: rating-outliers
  server.prompt(
    "rating-outliers",
    "Find the albums where your taste diverges most from the community",
    {
      projectIdentifier: z.string().describe("Your project name or sharerId"),
    },
    (args: { projectIdentifier: string }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Using the 1001 Albums tools, find the albums where my ratings for project "${args.projectIdentifier}" diverge most from the global community.

Use get_rating_outliers (direction "both") to get my biggest divergences in each direction, and use get_taste_profile to contextualise whether I'm generally a contrarian or whether these are exceptional cases.

Present two lists:
1. Albums I loved that the community is cooler on — my "underrated gems"
2. Albums the community loves that I was cold on — my "controversial takes"

For each, include the album name, artist, my rating, the community average, and the divergence. Then give me a short reflection on what these outliers reveal about my taste.`,
          },
        },
      ],
    }),
  );

  // Prompt 6: genre-journey
  server.prompt(
    "genre-journey",
    "Explore how your genre exposure has evolved over your listening history",
    {
      projectIdentifier: z.string().describe("Your project name or sharerId"),
    },
    (args: { projectIdentifier: string }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Using the 1001 Albums tools, trace how my genre exposure has evolved over time for project "${args.projectIdentifier}".

Use list_project_history to get my full history in chronological order (sorted by generatedAt), then analyse how the genres shift across the timeline. I want to know:
- Did I go through distinct phases or "eras" dominated by a particular genre?
- Are there genres I encountered early and never returned to, or ones that keep recurring?
- Has my listening broadened over time or stayed focused?
- What does the progression say about the generator's sequencing?

Present the journey as a narrative arc, not just a list of statistics.`,
          },
        },
      ],
    }),
  );

  // Prompt 7: group-latest-album
  server.prompt(
    "group-latest-album",
    "See how your group rated their latest album and spark a discussion",
    {
      groupSlug: z.string().describe("Your group slug from the group page URL"),
    },
    (args: { groupSlug: string }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Using the 1001 Albums tools, fetch the latest album for group "${args.groupSlug}" and give me a full breakdown of how the group responded to it.

Use get_group_latest_album to get the album and all member votes. Then:
- Summarise how the group rated it overall vs the community average
- Highlight who rated it highest and lowest, and how wide the spread was
- Flag whether this was a divisive album for the group or a consensus one
- Give some background on the album itself and why opinions might vary

End with a discussion prompt or question that could spark conversation in the group about this album.`,
          },
        },
      ],
    }),
  );

  // Prompt 8: group-compatibility
  server.prompt(
    "group-compatibility",
    "Find out who in your group has the most similar and most different taste",
    {
      groupSlug: z.string().describe("Your group slug from the group page URL"),
    },
    (args: { groupSlug: string }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Using the 1001 Albums tools, analyse the taste compatibility across all members of group "${args.groupSlug}".

Use get_group_compatibility_matrix to get the full pairwise similarity scores, then give me:
- The most compatible pair in the group and what their shared taste looks like
- The least compatible pair — the two members who disagree most
- The most agreeable member (highest average similarity) and the group outlier (lowest average)
- Any affinity clusters — sub-groups who seem to share a strong taste alignment
- A short personality summary for the group as a whole: are you a cohesive group or a diverse one?

Make it conversational and fun — this should feel like a music compatibility report, not a spreadsheet.`,
          },
        },
      ],
    }),
  );

  // Prompt 9: group-divisive-albums
  server.prompt(
    "group-divisive-albums",
    "Find the albums that divided your group most — and the ones you all agreed on",
    {
      groupSlug: z.string().describe("Your group slug from the group page URL"),
    },
    (args: { groupSlug: string }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Using the 1001 Albums tools, find the albums that have generated the most disagreement and the most consensus in group "${args.groupSlug}".

Use get_group_album_insights to get the most divisive and most consensus albums. For the top divisive albums, use get_group_album_reviews to get the individual member reviews and ratings so you can show exactly who loved it and who didn't.

Present it in two sections:
1. "The Great Debates" — albums that split the group, with each member's rating shown and a note on what made it so divisive
2. "Rare Agreements" — albums where everyone was on the same page, noting whether that was universal love or universal disappointment

End with a reflection on what the pattern of disagreements reveals about the group's taste diversity.`,
          },
        },
      ],
    }),
  );

  // Prompt 10: compare-members
  server.prompt(
    "compare-members",
    "Get a detailed taste comparison between two group members",
    {
      projectIdentifierA: z
        .string()
        .describe("First member's project name or sharerId"),
      projectIdentifierB: z
        .string()
        .describe("Second member's project name or sharerId"),
    },
    (args: { projectIdentifierA: string; projectIdentifierB: string }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Using the 1001 Albums tools, give me a detailed taste comparison between "${args.projectIdentifierA}" and "${args.projectIdentifierB}".

Use get_group_member_comparison to get the full breakdown, then enrich it by fetching each member's taste profile using get_taste_profile.

Cover:
- Their overall taste similarity score and what it means in practice
- Where they agree most — shared genres, decades, and albums they both rated highly
- Where they diverge most — the albums they rated most differently, and what those disagreements reveal
- Who is the harsher rater of the two, and whether that affects how you interpret divergences
- A verdict: are these two musically compatible, or do they bring completely different sensibilities to the group?`,
          },
        },
      ],
    }),
  );

  // Prompt 11: listening-wrapped
  server.prompt(
    "listening-wrapped",
    "Get a Spotify Wrapped-style summary of your listening history",
    {
      projectIdentifier: z.string().describe("Your project name or sharerId"),
    },
    (args: { projectIdentifier: string }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Using the 1001 Albums tools, create a Spotify Wrapped-style summary of my listening history for project "${args.projectIdentifier}".

Use get_taste_profile as the foundation and get_rating_outliers for the most surprising moments. Make it punchy, visual in feel, and fun — like an end-of-year review. Include:
- Total albums heard and rated
- Top genre and decade
- Most listened artist
- Highest rated album and lowest rated album
- Biggest "controversial take" (where I diverged most from the community)
- A one-sentence listener archetype that captures my taste personality
- A made-up "album of my year" — the single album that best represents my listening journey

Format it as a series of bold headline stats followed by short punchy commentary on each.`,
          },
        },
      ],
    }),
  );

  // MCP Resources: static informational guides for agents
  server.registerResource(
    "1001-albums-about",
    "info://1001-albums/about",
    {
      description:
        "Background on the 1001 Albums You Must Hear Before You Die book and the 1001 Albums Generator web app — what they are, how they work, and key concepts needed to use this MCP server effectively.",
      mimeType: "text/markdown",
    },
    async () => {
      const text = `# 1001 Albums You Must Hear Before You Die — Concept Guide

## The Book

"1001 Albums You Must Hear Before You Die" is a reference book first published in 2003 and
edited by Robert Dimery. It presents a curated list of approximately 1001 albums judged by
a panel of music critics to be essential listening — not a popularity chart or a ranking,
but a deliberately broad survey of recorded music history across genres, decades, and
cultures.

The list spans from the 1950s to the present day and covers rock, jazz, pop, classical,
electronic, hip-hop, world music, and more. It is periodically revised: newer editions add
recent releases and occasionally remove older entries, so the list is not entirely fixed.
When users or tools refer to "book albums" or "the canonical list", they mean the albums
drawn from this book.

The book's goal is breadth and cultural significance over personal taste. An album being on
the list does not mean it is universally loved — it means it is considered important,
influential, or representative of its era or genre. Users will frequently encounter albums
they have never heard of, in genres they do not usually enjoy.

## The 1001 Albums Generator

1001 Albums Generator (https://1001albumsgenerator.com) is a web application built around
the book's list. Its core mechanic is simple: it assigns users one album at a time, chosen
randomly from the list, and asks them to listen to it and rate it.

Key facts about how it works:

- **Albums are assigned randomly.** Users do not choose what they listen to. Each day (or
  week, depending on settings) the generator picks the next album. This is fundamental to
  understanding the data: a user's listening history is not a reflection of their taste
  preferences — it is a random walk through music history. Listen count alone tells you
  nothing about what a user likes.

- **Ratings are 1–5.** After listening, users rate the album from 1 (lowest) to 5
  (highest). Ratings are the primary signal of preference. An unrated album means the user
  has not yet rated it — typically because it is the current album or they skipped rating.

- **Reviews are optional.** Users can write a short text review alongside their rating.
  Reviews are personal and qualitative — they are the richest source of insight into how a
  user experienced an album.

- **The current album is unrated.** The album assigned today has not yet been rated. It
  appears as \`currentAlbum\` in the project data. Do not confuse it with historical rated
  albums.

- **User-submitted albums.** In addition to the ~1001 book albums, users can submit albums
  that are not in the original book. These appear in a separate dataset. They are a niche
  feature and most projects will be dominated by book albums.

- **Update frequency varies.** Some users listen daily, others weekly. The \`generatedAt\`
  field on each history entry records when that album was assigned, not when it was
  listened to or rated.

## Projects

A "project" is an individual user's instance of the challenge. Each project has:
- A name and an optional sharerId (an anonymised identifier for sharing without revealing
  the project name)
- A listening history: the ordered list of albums the generator has assigned, with ratings
  and reviews
- A current album: the album currently assigned, not yet rated
- Optional group membership

When calling tools, the \`projectIdentifier\` can be either the project name or the sharerId.
If you have both, either works.

## Groups

A "group" is a collection of projects participating in the challenge together. Group members
receive the same album assignments, allowing them to compare their reactions to the same
music. Groups are identified by a \`groupSlug\` — the group name in lowercase with hyphens
instead of spaces, visible in the group page URL.

Groups enable social features: comparing ratings, finding the most divisive albums, and
understanding taste compatibility across members.

## The Community

The global community rating for each album is the average rating across all 1001 Albums
Generator users worldwide who have rated that album. This provides a baseline to compare
any individual's or group's rating against. A high community rating means most users who
heard this album liked it; a low one means most did not — though remember, all users are
assigned albums randomly, so community ratings reflect reactions from a diverse and
unself-selected audience.

## What "affinity" means in this context

Because albums are assigned randomly, genre and decade affinity must be inferred from
ratings, not from listen counts. If a user has heard 10 jazz albums and rated them all
highly, that signals genuine affinity for jazz. If they have heard 10 jazz albums and rated
them all poorly, high listen count would be misleading — the correct signal is the average
rating. All affinity computations in this server use average rating per genre/decade/artist,
not raw listen counts.
`;

      return {
        contents: [
          {
            uri: "info://1001-albums/about",
            mimeType: "text/markdown",
            text,
          },
        ],
      };
    },
  );

  server.registerResource(
    "1001-albums-tool-guide",
    "info://1001-albums/tool-guide",
    {
      description:
        "A practical guide to the tools available in this MCP server — when to use each one, how they relate to each other, and recommended workflows for common questions.",
      mimeType: "text/markdown",
    },
    async () => {
      const text = `# 1001 Albums MCP — Tool Usage Guide

## Orientation: start here

Before answering any question about a user's listening history or taste, orient yourself
with one of these two tools:

- **\`get_project_stats\`** — quick summary of a project: how many albums generated, rated,
  unrated, current album. Use when the question is about progress or status.
- **\`get_taste_profile\`** — comprehensive taste analysis: top genres, decades, artists,
  rating tendencies, community alignment. Use when the question is about taste, preference,
  or identity as a listener.

For group questions, start with:
- **\`get_group\`** — group summary, member list, all-time high/low. Always call this first
  for any group question — the member list it returns (with \`projectIdentifier\` for each
  member) is needed as input for all other group and member-level tools.

---

## Finding and browsing albums

| Question | Tool |
|---|---|
| What is today's album? | \`get_album_of_the_day\` |
| Show me my full history | \`list_project_history\` |
| Find albums by artist, genre, or year | \`search_project_history\` |
| Get full detail, review, and streaming links for one album | \`get_album_detail\` |

\`list_project_history\` and \`search_project_history\` return a slim format intentionally —
no reviews, no streaming links, no images. Always call \`get_album_detail\` when you need
a written review, a Spotify/Apple Music link, or full subgenre breakdown.

---

## Understanding an album in context

Use **\`get_album_context\`** when the question is about a specific album's place in the
user's history. It returns four dimensions:
1. Artist arc — other albums by the same artist, with ratings
2. Musical connections — related albums by genre/style overlap, scored by degree
3. Community divergence — how the user's rating compares to the global average, with
   a baseline of the user's typical divergence pattern
4. Listening journey — the 3 albums before and after in chronological order

Identify the album by name, UUID, or \`generatedAlbumId\` from \`list_project_history\`.

---

## Taste analysis

| Question | Tool |
|---|---|
| What are my favourite genres/decades? | \`get_taste_profile\` |
| Am I a harsh or generous rater? | \`get_taste_profile\` (ratingTendencies) |
| Do I agree or disagree with the community? | \`get_taste_profile\` (communityAlignment) |
| Which albums did I rate very differently from the community? | \`get_rating_outliers\` |
| How has my genre exposure evolved over time? | \`list_project_history\` sorted by generatedAt, then analyse |

\`get_rating_outliers\` takes a \`direction\` parameter: "\`underrated\`" (user rated lower than
community), "\`overrated\`" (user rated higher), or "\`both\`". Use "\`both\`" for open-ended
taste questions, and a specific direction when the user asks about hidden gems or
controversial takes.

---

## Group analysis

Always call \`get_group\` first to get the member list before calling any other group tool.
The \`projectIdentifier\` values in \`group.members\` are the inputs for member-level tools.

| Question | Tool |
|---|---|
| What is the group's current album and how did they rate it? | \`get_group_latest_album\` |
| Which albums divided the group most? | \`get_group_album_insights\` |
| Which albums did the group all agree on? | \`get_group_album_insights\` (mostConsensus) |
| What do all members think of a specific album? | \`get_group_album_reviews\` |
| Who in the group agrees with me most? | \`get_group_compatibility_matrix\` |
| Compare two specific members in detail | \`get_group_member_comparison\` |

**Recommended group workflow for "who agrees with whom":**
1. \`get_group\` → get member list
2. \`get_group_compatibility_matrix\` → get full pairwise scores and highlights
3. \`get_group_member_comparison\` → drill into a specific pair for album-level detail

**Recommended group workflow for "what divided us":**
1. \`get_group\` → get member list
2. \`get_group_album_insights\` → find most divisive albums
3. \`get_group_album_reviews\` → get individual reviews for the most divisive album
4. \`get_group_member_comparison\` → understand which members drove the division

---

## The book list and community data

These tools query the global community dataset, not any individual project:

| Question | Tool |
|---|---|
| What are the highest-rated book album globally? | \`list_book_album_stats\` |
| How does the community rate a specific book album? | \`get_book_album_stat\` |
| What user-submitted albums exist outside the book? | \`list_user_submitted_album_stats\` |

These tools return community-wide data only — no individual ratings, no project history.

---

## Cache and data freshness

All data is cached for 4 hours. If a user says their data seems stale or they have just
rated an album and want to see updated results, use **\`refresh_data\`** with the appropriate
type:
- "\`project\`" + \`projectIdentifier\` — refresh one project
- "\`group\`" + \`groupSlug\` — refresh one group
- "\`global\`" — refresh the book album community stats
- "\`user\`" — refresh the user-submitted album stats
- "\`all\`" — clear everything

---

## Common mistakes to avoid

- **Don't use listen count as a proxy for preference.** Albums are assigned randomly.
  Always use ratings as the preference signal.
- **Don't skip \`get_group\` before group tools.** The member \`projectIdentifier\` list it
  returns is required input for nearly every other group tool.
- **Don't call \`list_project_history\` when you need reviews or streaming links.** It
  returns a slim format. Use \`get_album_detail\` for full information.
- **Don't confuse the current album with history.** The \`currentAlbum\` is unrated and not
  part of \`history\`. Use \`get_album_of_the_day\` to retrieve it.
- **Treat similarity scores with low shared album counts cautiously.** A score based on
  2–3 shared albums is not meaningful. Always report \`sharedAlbumsCount\` alongside any
  similarity score.

`;

      return {
        contents: [
          {
            uri: "info://1001-albums/tool-guide",
            mimeType: "text/markdown",
            text,
          },
        ],
      };
    },
  );

  return server;
}

async function main() {
  const mode = process.env.MCP_MODE || "stdio";

  if (mode === "sse") {
    const app = express();
    const port = process.env.PORT || 3000;

    const transports = new Map<string, StreamableHTTPServerTransport>();

    app.all("/mcp", async (req, res, next) => {
      try {
        const sessionId = (req.query.sessionId ||
          req.headers["mcp-session-id"] ||
          req.headers["x-session-id"]) as string | undefined;

        console.error(
          `[HTTP] ${req.method} /mcp${sessionId ? ` (Session: ${sessionId})` : ""}`,
        );

        if (sessionId) {
          const transport = transports.get(sessionId);
          if (transport) {
            await transport.handleRequest(req, res);
          } else {
            console.error(`[HTTP] Session not found: ${sessionId}`);
            res.status(400).send("Session not found");
          }
        } else {
          const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
          });

          transport.onclose = () => {
            if (transport.sessionId) {
              console.error(`[HTTP] Session closed: ${transport.sessionId}`);
              transports.delete(transport.sessionId);
            }
          };

          const server = createMcpServer();
          await server.connect(transport);
          await transport.handleRequest(req, res);

          if (transport.sessionId) {
            console.error(`[HTTP] Session created: ${transport.sessionId}`);
            transports.set(transport.sessionId, transport);
          }
        }
      } catch (err) {
        console.error("[HTTP] Request error", err);
        next(err);
      }
    });

    app.listen(port, () => {
      console.error(
        `1001 Albums Generator MCP Server running on Streamable HTTP at http://localhost:${port}/mcp`,
      );
    });
  } else {
    const transport = new StdioServerTransport();
    const server = createMcpServer();
    await server.connect(transport);
    console.error("1001 Albums Generator MCP Server running on stdio");
  }
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
