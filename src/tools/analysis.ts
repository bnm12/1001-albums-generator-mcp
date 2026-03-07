import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { AlbumsGeneratorClient } from "../api.js";
import {
  computeRatingTendencies,
  getDecade,
  getRatedEntries,
  getYear,
  ratingAffinityMap,
  requireParam,
} from "../helpers.js";
import { slimHistoryEntry } from "../dto.js";
import { makeRegisterTool } from "./register-tool.js";

export function registerAnalysisTools(
  server: McpServer,
  client: AlbumsGeneratorClient,
): void {
  const registerTool = makeRegisterTool(server);

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
    { projectIdentifier: z.string().describe("The name of the project or the sharerId") },
    async ({ projectIdentifier }) => {
      const pid = requireParam(projectIdentifier, "projectIdentifier");
      if (typeof pid === "object" && "error" in pid) return pid.response;
      const project = await client.getProject(pid);
      const history = project.history;
      const rated = getRatedEntries(history);

      const ratedForAffinity = rated.map((h) => ({ genres: h.album.genres, styles: h.album.styles ?? [], decade: getDecade(getYear(h.album.releaseDate)), rating: h.rating }));
      const topGenres = ratingAffinityMap(ratedForAffinity, (e) => e.genres).slice(0, 10);
      const topStyles = ratingAffinityMap(ratedForAffinity.map((e) => ({ genres: e.styles, rating: e.rating })), (e) => e.genres).slice(0, 10);
      const decadeDistribution = ratingAffinityMap(ratedForAffinity.map((e) => ({ genres: [e.decade], rating: e.rating })), (e) => e.genres).slice(0, 10);
      const topArtists = ratingAffinityMap(rated.map((h) => ({ genres: [h.album.artist], rating: h.rating })), (e) => e.genres).filter((a) => a.albumCount > 1).slice(0, 10);

      const tendencies = computeRatingTendencies(rated);
      const ratedWithGlobal = rated.filter((h) => typeof h.globalRating === "number");
      const meanDivergence = ratedWithGlobal.length > 0 ? Math.round((ratedWithGlobal.reduce((s, h) => s + (h.rating - (h.globalRating as number)), 0) / ratedWithGlobal.length) * 100) / 100 : null;
      const meanAbsoluteDivergence = ratedWithGlobal.length > 0 ? Math.round((ratedWithGlobal.reduce((s, h) => s + Math.abs(h.rating - (h.globalRating as number)), 0) / ratedWithGlobal.length) * 100) / 100 : null;
      const communityAlignmentLabel =
        meanAbsoluteDivergence === null
          ? null
          : meanAbsoluteDivergence < 0.5
            ? "consensus listener — ratings closely match the community"
            : meanAbsoluteDivergence < 1.0
              ? "mild contrarian — some divergence from community norms"
              : "strong contrarian — frequently disagrees with the community";

      const albumsGenerated = history.length;
      const albumsRated = rated.length;

      const profile = {
        completionStats: { albumsGenerated, albumsRated, albumsUnrated: albumsGenerated - albumsRated, completionPercentage: Math.round((albumsRated / albumsGenerated) * 100) },
        decadeDistribution,
        topGenres,
        topStyles,
        topArtists,
        ratingTendencies: tendencies,
        communityAlignment: { meanDivergence, meanAbsoluteDivergence, label: communityAlignmentLabel },
      };

      return { content: [{ type: "text", text: JSON.stringify(profile, null, 2) }] };
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
      projectIdentifier: z.string().describe("The name of the project or the sharerId"),
      limit: z.number().int().min(1).max(25).default(10).describe("Number of outliers to return per direction (default 10)"),
      direction: z.enum(["both", "underrated", "overrated"]).default("both").describe('"underrated" = user rated lower than community, "overrated" = user rated higher, "both" = return both lists'),
    },
    async ({ projectIdentifier, limit, direction }) => {
      const pid = requireParam(projectIdentifier, "projectIdentifier");
      if (typeof pid === "object" && "error" in pid) return pid.response;
      const project = await client.getProject(pid);
      const ratedWithGlobal = getRatedEntries(project.history).filter((h) => typeof h.globalRating === "number");

      const withDivergence = ratedWithGlobal.map((h) => ({
        ...slimHistoryEntry(h),
        divergence: Math.round((h.rating - (h.globalRating as number)) * 100) / 100,
      }));

      const result: { underrated?: typeof withDivergence; overrated?: typeof withDivergence } = {};
      if (direction === "both" || direction === "underrated") {
        result.underrated = withDivergence.filter((a) => a.divergence < 0).sort((a, b) => a.divergence - b.divergence).slice(0, limit);
      }
      if (direction === "both" || direction === "overrated") {
        result.overrated = withDivergence.filter((a) => a.divergence > 0).sort((a, b) => b.divergence - a.divergence).slice(0, limit);
      }

      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
    true,
  );
}
