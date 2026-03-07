import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { AlbumsGeneratorClient } from "../api.js";
import {
  computeRatingTendencies,
  frequencyMap,
  getDecade,
  getRatedEntries,
  getYear,
  ratingAffinityMap,
  requireParam,
} from "../helpers.js";
import { makeRegisterTool } from "./register-tool.js";

export function registerComparisonTools(
  server: McpServer,
  client: AlbumsGeneratorClient,
): void {
  const registerTool = makeRegisterTool(server);

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
      groupSlug: z.string().describe("The group slug (lowercase, hyphenated) from the group page URL"),
      limit: z.number().int().min(1).max(25).default(10).describe("Number of albums to return per category (default 10)"),
    },
    async ({ groupSlug, limit }) => {
      const gs = requireParam(groupSlug, "groupSlug");
      if (typeof gs === "object" && "error" in gs) return gs.response;
      const group = await client.getGroup(gs);
      const memberProjects = await Promise.all(group.members.map((m) => client.getProject(m.projectIdentifier)));

      const albumRatingsMap = new Map<string, { name: string; artist: string; releaseDate: string; ratings: { member: string; rating: number }[] }>();
      memberProjects.forEach((project, i) => {
        const memberName = group.members[i].projectIdentifier;
        getRatedEntries(project.history).forEach((h) => {
          const uuid = h.album.uuid;
          if (!albumRatingsMap.has(uuid)) {
            albumRatingsMap.set(uuid, { name: h.album.name, artist: h.album.artist, releaseDate: h.album.releaseDate, ratings: [] });
          }
          albumRatingsMap.get(uuid)?.ratings.push({ member: memberName, rating: h.rating });
        });
      });

      const albumStats = [...albumRatingsMap.values()]
        .filter((a) => a.ratings.length >= 2)
        .map((a) => {
          const mean = Math.round((a.ratings.reduce((s, r) => s + r.rating, 0) / a.ratings.length) * 100) / 100;
          const variance = Math.round((a.ratings.reduce((s, r) => s + Math.pow(r.rating - mean, 2), 0) / a.ratings.length) * 100) / 100;
          return { ...a, mean, variance };
        });

      const mostDivisive = [...albumStats].sort((a, b) => b.variance - a.variance).slice(0, limit);
      const mostConsensus = [...albumStats].sort((a, b) => a.variance - b.variance).slice(0, limit);
      return { content: [{ type: "text", text: JSON.stringify({ mostDivisive, mostConsensus }, null, 2) }] };
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
      projectIdentifierA: z.string().describe("Project identifier for the first member"),
      projectIdentifierB: z.string().describe("Project identifier for the second member"),
    },
    async ({ projectIdentifierA, projectIdentifierB }) => {
      const pidA = requireParam(projectIdentifierA, "projectIdentifierA");
      if (typeof pidA === "object" && "error" in pidA) return pidA.response;
      const pidB = requireParam(projectIdentifierB, "projectIdentifierB");
      if (typeof pidB === "object" && "error" in pidB) return pidB.response;
      const [projectA, projectB] = await Promise.all([client.getProject(pidA), client.getProject(pidB)]);

      const ratedA = getRatedEntries(projectA.history);
      const ratedB = getRatedEntries(projectB.history);
      const mapA = new Map(ratedA.map((h) => [h.album.uuid, h]));
      const mapB = new Map(ratedB.map((h) => [h.album.uuid, h]));
      const sharedUuids = [...mapA.keys()].filter((uuid) => mapB.has(uuid));

      const sharedAlbums = sharedUuids.map((uuid) => {
        const a = mapA.get(uuid);
        const b = mapB.get(uuid);
        if (!a || !b) {
          return null;
        }
        const divergence = Math.round((a.rating - b.rating) * 100) / 100;
        return { name: a.album.name, artist: a.album.artist, releaseDate: a.album.releaseDate, ratingA: a.rating, ratingB: b.rating, divergence };
      }).filter((a): a is NonNullable<typeof a> => a !== null);

      sharedAlbums.sort((a, b) => Math.abs(b.divergence) - Math.abs(a.divergence));

      const meanAbsDivergence = sharedAlbums.length > 0 ? sharedAlbums.reduce((s, a) => s + Math.abs(a.divergence), 0) / sharedAlbums.length : null;
      const similarityScore = meanAbsDivergence !== null ? Math.round(((4 - meanAbsDivergence) / 4) * 100) : null;

      const tendenciesA = computeRatingTendencies(ratedA);
      const tendenciesB = computeRatingTendencies(ratedB);
      const meanA = tendenciesA.meanRating;
      const meanB = tendenciesB.meanRating;
      const higherRater = meanA !== null && meanB !== null ? meanA > meanB ? projectIdentifierA : meanB > meanA ? projectIdentifierB : "equal" : null;

      const genresA = frequencyMap(ratedA.flatMap((h) => h.album.genres));
      const genresB = frequencyMap(ratedB.flatMap((h) => h.album.genres));
      const sharedGenres = [...genresA.keys()]
        .filter((g) => genresB.has(g))
        .map((g) => ({ genre: g, countA: genresA.get(g) ?? 0, countB: genresB.get(g) ?? 0 }))
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
          meanAbsoluteDivergence: meanAbsDivergence !== null ? Math.round(meanAbsDivergence * 100) / 100 : null,
        },
        genreOverlap: sharedGenres,
        sharedAlbums,
      };

      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
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
      projectIdentifierA: z.string().describe("Project identifier for the first project"),
      projectIdentifierB: z.string().describe("Project identifier for the second project"),
    },
    async ({ projectIdentifierA, projectIdentifierB }) => {
      const pidA = requireParam(projectIdentifierA, "projectIdentifierA");
      if (typeof pidA === "object" && "error" in pidA) return pidA.response;
      const pidB = requireParam(projectIdentifierB, "projectIdentifierB");
      if (typeof pidB === "object" && "error" in pidB) return pidB.response;
      const [projectA, projectB] = await Promise.all([client.getProject(pidA), client.getProject(pidB)]);

      const historyA = projectA.history;
      const historyB = projectB.history;
      const ratedA = getRatedEntries(historyA);
      const ratedB = getRatedEntries(historyB);
      const uuidsA = new Set(historyA.map((h) => h.album.uuid));
      const uuidsB = new Set(historyB.map((h) => h.album.uuid));
      const sharedUuids = [...uuidsA].filter((u) => uuidsB.has(u));
      const mapA = new Map(ratedA.map((h) => [h.album.uuid, h]));
      const mapB = new Map(ratedB.map((h) => [h.album.uuid, h]));
      const sharedRatedUuids = sharedUuids.filter((u) => mapA.has(u) && mapB.has(u));
      const sharedHighlights = sharedRatedUuids
        .map((uuid) => {
          const a = mapA.get(uuid);
          const b = mapB.get(uuid);
          if (!a || !b) return null;
          return { name: a.album.name, artist: a.album.artist, globalRating: a.globalRating ?? null, ratingA: a.rating, ratingB: b.rating };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null)
        .sort((a, b) => (b.globalRating ?? 0) - (a.globalRating ?? 0))
        .slice(0, 10);

      const topGenresA = ratingAffinityMap(ratedA.map((h) => ({ genres: h.album.genres, rating: h.rating })), (e) => e.genres).slice(0, 10);
      const topGenresB = ratingAffinityMap(ratedB.map((h) => ({ genres: h.album.genres, rating: h.rating })), (e) => e.genres).slice(0, 10);
      const decadesA = ratingAffinityMap(ratedA.map((h) => ({ genres: [getDecade(getYear(h.album.releaseDate))], rating: h.rating })), (e) => e.genres).slice(0, 8);
      const decadesB = ratingAffinityMap(ratedB.map((h) => ({ genres: [getDecade(getYear(h.album.releaseDate))], rating: h.rating })), (e) => e.genres).slice(0, 8);

      const result = {
        overlapSummary: {
          sharedAlbumsCount: sharedUuids.length,
          totalA: historyA.length,
          totalB: historyB.length,
          overlapPercentageA: Math.round((sharedUuids.length / historyA.length) * 100),
          overlapPercentageB: Math.round((sharedUuids.length / historyB.length) * 100),
        },
        ratingTendencies: {
          projectA: computeRatingTendencies(ratedA),
          projectB: computeRatingTendencies(ratedB),
        },
        genreAffinity: { projectA: topGenresA, projectB: topGenresB },
        decadePreferences: { projectA: decadesA, projectB: decadesB },
        sharedAlbumHighlights: sharedHighlights,
      };

      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
    true,
  );
}
