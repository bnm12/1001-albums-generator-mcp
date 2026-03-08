import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { AlbumsGeneratorClient } from "../api.js";
import { slimAlbum, slimHistoryEntry } from "../dto.js";
import {
  calculateProjectStats,
  getRatedEntries,
  getYear,
  paginateAndSort,
  requireParam,
  sortHistory,
} from "../helpers.js";
import { makeRegisterTool } from "./register-tool.js";

export function registerProjectTools(
  server: McpServer,
  client: AlbumsGeneratorClient,
): void {
  const registerTool = makeRegisterTool(server);

  registerTool(
    "get_album_of_the_day",
    "Returns the current album assigned to a project for today, including full album metadata and any notes added by the project owner. This is the album the user is currently listening to and has not yet rated. Requires a projectIdentifier. Data is cached for 4 hours.",
    {
      projectIdentifier: z.string().describe("The name of the project or the sharerId"),
    },
    async ({ projectIdentifier }) => {
      const pid = requireParam(projectIdentifier, "projectIdentifier");
      if (typeof pid === "object" && "error" in pid) return pid.response;
      const project = await client.getProject(pid);
      return {
        content: [{ type: "text", text: JSON.stringify({ currentAlbum: project.currentAlbum, currentAlbumNotes: project.currentAlbumNotes }, null, 2) }],
      };
    },
    true,
  );

  registerTool(
    "get_project_stats",
    'Returns summary statistics for a specific project: total albums generated, number rated, number unrated, current album of the day, update frequency, and group membership. Use this when asked about a user\'s progress — e.g. "how many albums has the user rated?" or "what is the user\'s current album?". For the full rated/unrated history, use list_project_history. Requires a projectIdentifier (project name or sharerId). Data is cached for 4 hours. The currentAlbum field returns a slim album object (name, artist, uuid, slug, releaseDate, genres) — use get_album_of_the_day for full album detail including streaming links.',
    {
      projectIdentifier: z.string().describe("The name of the project or the sharerId"),
    },
    async ({ projectIdentifier }) => {
      const pid = requireParam(projectIdentifier, "projectIdentifier");
      if (typeof pid === "object" && "error" in pid) return pid.response;
      const project = await client.getProject(pid);
      const { history, ...summary } = project;
      const stats = calculateProjectStats(history);
      const currentAlbum = project.currentAlbum ? slimAlbum(project.currentAlbum) : null;
      return {
        content: [{ type: "text", text: JSON.stringify({ ...summary, currentAlbum, ...stats }, null, 2) }],
      };
    },
    true,
  );

  registerTool(
    "list_project_history",
    `Returns a project's generated album history in slim format. Each entry includes:
generatedAlbumId, album name, artist, release year, genres, the user's rating (1–5 or
null if unrated), global community rating, and date generated. Reviews, streaming links,
images, and subgenres are intentionally omitted — use get_album_detail for those.

Results are wrapped in a pagination envelope:
  totalCount    — total entries in the full history (before limit/offset)
  returnedCount — number of entries in this response
  offset        — starting position used
  limit         — limit applied (null if no limit was set)
  results       — the album entries

Default sort is "recent" (most recently assigned first).

⚠ USAGE GUIDANCE — READ BEFORE CALLING WITHOUT A LIMIT:

Before calling this tool, consider whether a more focused tool already solves your need:
  - Taste analysis, genre/decade breakdown     → get_taste_profile
  - Find albums by artist, genre, year         → search_project_history
  - Album-level detail, reviews, streaming     → get_album_detail
  - Artist arc and musical connections         → get_album_context
  - Rating divergence from community           → get_rating_outliers
  - Qualitative insight from written reviews   → get_review_insights

Calling without a limit returns the FULL history — potentially hundreds or thousands of
entries — as a single response. This is very heavy on context window usage and will
consume a large portion of available tokens. It is NOT necessary for most analysis tasks
because the dedicated analysis tools above already operate on the full history server-side
and return compact, pre-processed results.

Use the unlimited form ONLY when:
  - No other tool covers the specific question (e.g. "what did I listen to on a
    specific date", chronological exploration, custom analysis not served by existing tools)
  - You have confirmed the project's totalCount (visible in any paginated response or
    from get_project_stats) is small enough to load safely
  - You genuinely need the raw entry data rather than a processed result

When in doubt, start with limit: 50 and offset: 0, check totalCount in the response,
and decide whether to fetch more.`,
    {
      projectIdentifier: z.string().describe(
        "The name of the project or the sharerId",
      ),
      sortBy: z
        .enum(["recent", "oldest", "highest_rated", "lowest_rated"])
        .default("recent")
        .describe(
          "Sort order. 'recent' = most recently assigned first (default). " +
            "'oldest' = earliest assigned first. " +
            "'highest_rated' = user's highest rated first, unrated entries last. " +
            "'lowest_rated' = user's lowest rated first, unrated entries last.",
        ),
      limit: z.number().int().min(1).optional().describe(
        "Maximum number of entries to return. Omit to return all entries. See usage note in tool description.",
      ),
      offset: z.number().int().min(0).default(0).describe(
        "Number of entries to skip before returning results. Use with limit for pagination. Default 0.",
      ),
    },
    async ({ projectIdentifier, sortBy, limit, offset }) => {
      const pid = requireParam(projectIdentifier, "projectIdentifier");
      if (typeof pid === "object" && "error" in pid) return pid.response;

      const project = await client.getProject(pid);
      const slim = project.history.map(slimHistoryEntry);
      const sorted = sortHistory(slim, sortBy);
      const paginated = paginateAndSort(sorted, { limit, offset });

      return {
        content: [{ type: "text", text: JSON.stringify(paginated, null, 2) }],
      };
    },
    true,
  );

  registerTool(
    "get_album_detail",
    "Returns complete information for a single album from a project's history. Includes full album metadata (name, artist, release year, genres, styles, subgenres, Wikipedia URL, all streaming IDs: Spotify, Apple Music, Tidal, Amazon Music, YouTube Music, Qobuz, Deezer), the user's rating and full written review, global community rating, reveal status, and date generated. Use this when you need to read a review, find a streaming link, or prepare a detailed presentation for a specific album. Identify the album using its name, UUID, or generatedAlbumId (available from list_project_history or search_project_history). Requires a projectIdentifier. Data is cached for 4 hours.",
    {
      projectIdentifier: z.string().describe("The name of the project or the sharerId"),
      albumIdentifier: z.string().describe("The name, UUID, or generatedAlbumId of the album"),
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
          h.album.slug === albumIdentifier ||
          h.generatedAlbumId === albumIdentifier
        );
      });
      
      if (!result) {
        return {
          content: [{
            type: "text",
            text: `Album "${albumIdentifier}" not found in project history. Try using the generatedAlbumId from list_project_history or search_project_history.`
          }]
        };
      }
      
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
    true,
  );

  registerTool(
    "get_album_context",
    `Identify the target album using its name, UUID, or generatedAlbumId. The tool searches in order: project history, today's current album, then the global book stats. This means it works for today's assigned album even before it has been rated — pass the album name or UUID from \`get_album_of_the_day\` directly. Artist arc and musical connections are always computed from history regardless of where the target album was found. Listening journey and community divergence are only available for albums in history.

When closely connected albums are returned — particularly same artist, same style, or same year — consider calling \`get_album_detail\` on the most relevant ones to read the user's actual review. This is especially valuable when the connection shares a format (e.g. both live albums), era, or style with today's album, as the review may confirm or contradict assumptions about the user's preferences in that area.`,
    {
      projectIdentifier: z.string().describe("The name of the project or the sharerId"),
      albumIdentifier: z.string().describe("The name, UUID, or generatedAlbumId of the album to contextualize"),
    },
    async ({ projectIdentifier, albumIdentifier }) => {
      const pid = requireParam(projectIdentifier, "projectIdentifier");
      if (typeof pid === "object" && "error" in pid) return pid.response;
      const aid = requireParam(albumIdentifier, "albumIdentifier");
      if (typeof aid === "object" && "error" in aid) return aid.response;
      const project = await client.getProject(pid);
      const lowerId = aid.toLowerCase();

      let targetAlbum: any = null;
      let targetUuid: string | null = null;
      let targetGeneratedAlbumId: string | null = null;
      let userRating: number | null = null;
      let globalRating: number | null = null;
      let albumDivergence: number | null = null;
      let listeningJourney: any[] = [];
      let interpretation: string | null = null;

      // 1. Project history lookup
      const targetEntry = project.history.find(
        (h) =>
          h.album.name.toLowerCase() === lowerId ||
          h.album.uuid === albumIdentifier ||
          h.generatedAlbumId === albumIdentifier,
      );

      if (targetEntry) {
        targetAlbum = targetEntry.album;
        targetUuid = targetAlbum.uuid;
        targetGeneratedAlbumId = targetEntry.generatedAlbumId;
        userRating = typeof targetEntry.rating === "number" ? targetEntry.rating : null;
        globalRating = targetEntry.globalRating ?? null;
        albumDivergence =
          userRating !== null && globalRating !== null
            ? Math.round((userRating - globalRating) * 100) / 100
            : null;

        const sortedHistory = [...project.history].sort((a, b) =>
          (a.generatedAt ?? "").localeCompare(b.generatedAt ?? ""),
        );
        const targetIndex = sortedHistory.findIndex(
          (h) => h.generatedAlbumId === targetGeneratedAlbumId,
        );
        listeningJourney = sortedHistory
          .slice(Math.max(0, targetIndex - 3), targetIndex + 4)
          .filter((h) => h.generatedAlbumId !== targetGeneratedAlbumId)
          .map((h) => ({
            ...slimHistoryEntry(h),
            position: sortedHistory.indexOf(h) < targetIndex ? "before" : "after",
          }));
      }
      // 2. Current album lookup
      else if (
        project.currentAlbum &&
        (project.currentAlbum.name.toLowerCase() === lowerId ||
          project.currentAlbum.uuid === albumIdentifier)
      ) {
        targetAlbum = project.currentAlbum;
        targetUuid = targetAlbum.uuid;
        interpretation = "This is today's current album — it has not been rated yet";
      }
      // 3. Global stats fallback
      else {
        const stats = await client.getGlobalStats();
        const isUuid =
          /^[0-9a-fA-F]{24}$/.test(albumIdentifier) ||
          /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
            albumIdentifier,
          );
        const statMatch = isUuid ? null : stats.albums.find((a) => a.name.toLowerCase() === lowerId);

        if (statMatch) {
          targetAlbum = {
            name: statMatch.name,
            artist: statMatch.artist,
            releaseDate: statMatch.releaseDate || "",
            genres: statMatch.genres,
            styles: [], // AlbumStat doesn't have styles
          };
          globalRating = statMatch.averageRating;
          interpretation =
            "This album is not in the project's history. Community rating is from global stats only.";
        }
      }

      if (!targetAlbum) {
        return {
          content: [
            {
              type: "text",
              text: `Album "${albumIdentifier}" not found in project history, current album, or global stats.`,
            },
          ],
        };
      }

      const history = project.history;
      const ratedWithGlobal = getRatedEntries(history).filter(
        (h) => typeof h.globalRating === "number",
      );
      const meanDivergence =
        ratedWithGlobal.length > 0
          ? Math.round(
              (ratedWithGlobal.reduce((sum, h) => sum + (h.rating - (h.globalRating as number)), 0) /
                ratedWithGlobal.length) *
                100,
            ) / 100
          : null;

      const artistArc = history
        .filter((h) => h.album.artist === targetAlbum.artist && h.album.uuid !== targetUuid)
        .sort((a, b) => getYear(a.album.releaseDate) - getYear(b.album.releaseDate))
        .map((h) => ({ ...slimHistoryEntry(h) }));

      const musicalConnections = history
        .filter((h) => h.album.uuid !== targetUuid)
        .map((h) => {
          const sharedGenres = h.album.genres.filter((g) => targetAlbum.genres.includes(g));
          const sharedStyles = (h.album.styles ?? []).filter((s: string) =>
            (targetAlbum.styles ?? []).includes(s),
          );
          return {
            ...slimAlbum(h.album),
            sharedGenres,
            sharedStyles,
            connectionStrength: sharedGenres.length + sharedStyles.length,
          };
        })
        .filter((h) => h.connectionStrength > 0)
        .sort((a, b) => b.connectionStrength - a.connectionStrength)
        .slice(0, 20);

      if (interpretation === null) {
        interpretation =
          albumDivergence !== null && meanDivergence !== null
            ? albumDivergence > meanDivergence + 0.5
              ? "User rated this notably higher than their usual divergence from the community"
              : albumDivergence < meanDivergence - 0.5
                ? "User rated this notably lower than their usual divergence from the community"
                : "User divergence on this album is consistent with their typical pattern"
            : null;
      }

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
          interpretation,
        },
        artistArc,
        musicalConnections,
        listeningJourney,
        sameArtist: artistArc,
        sameYear: history
          .filter(
            (h) =>
              getYear(h.album.releaseDate) === getYear(targetAlbum.releaseDate) &&
              h.album.uuid !== targetUuid,
          )
          .map((h) => slimAlbum(h.album))
          .slice(0, 50),
        relatedByParticipatingArtists: history
          .filter((h) => {
            if (h.album.uuid === targetUuid) return false;
            const targetArtists = targetAlbum.artist
              .split(/&|,|and|with/i)
              .map((s: string) => s.trim())
              .filter(Boolean);
            const otherArtists = h.album.artist
              .split(/&|,|and|with/i)
              .map((s: string) => s.trim())
              .filter(Boolean);
            return targetArtists.some((ta: string) => otherArtists.includes(ta));
          })
          .map((h) => slimAlbum(h.album)),
      };

      return { content: [{ type: "text", text: JSON.stringify(context, null, 2) }] };
    },
    true,
  );

  registerTool(
    "search_project_history",
    "Searches a project's history by album name, artist, release year, or genre. Returns matching entries in the same slim format as list_project_history (generatedAlbumId, name, artist, year, genres, rating, globalRating, generatedAt — no reviews or streaming links). Use get_album_detail for full information on any result. Requires a projectIdentifier and a query string. Data is cached for 4 hours.",
    {
      projectIdentifier: z.string().describe("The name of the project or the sharerId"),
      query: z.string().describe("Search query for artist, name, year, or genre"),
    },
    async ({ projectIdentifier, query }) => {
      const pid = requireParam(projectIdentifier, "projectIdentifier");
      if (typeof pid === "object" && "error" in pid) return pid.response;
      const q = requireParam(query, "query");
      if (typeof q === "object" && "error" in q) return q.response;
      const project = await client.getProject(pid);
      const lowerQuery = q.toLowerCase();
      const filtered = project.history.filter((h) => h.album.name.toLowerCase().includes(lowerQuery) || h.album.artist.toLowerCase().includes(lowerQuery) || h.album.releaseDate.includes(lowerQuery) || h.album.genres.some((g: string) => g.toLowerCase().includes(lowerQuery)));
      const slim = filtered.map(slimHistoryEntry);
      return { content: [{ type: "text", text: JSON.stringify(slim, null, 2) }] };
    },
    true,
  );
}
