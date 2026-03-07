import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { AlbumsGeneratorClient, type UserAlbumHistoryEntry } from "../api.js";
import {
  buildReviewInsightsContext,
  computeRatingTendencies,
  getDecade,
  getRatedEntries,
  getYear,
  ratingAffinityMap,
  requireParam,
} from "../helpers.js";
import {
  type ArcMilestone,
  type ArcSegment,
  type ListeningArcPayload,
  slimHistoryEntry,
} from "../dto.js";
import { makeRegisterTool } from "./register-tool.js";



interface ArcPointSource {
  generatedAlbumId: string;
  albumName: string;
  albumArtist: string;
  rating: number | null;
  globalRating?: number;
  listenedAt: string;
  genres: string[];
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function toMs(dateText: string): number {
  return new Date(dateText).getTime();
}

function getSegmentLabel(kind: "single" | "phase" | "year", index: number, year?: string): string {
  if (kind === "single") return "Your Journey";
  if (kind === "year") return `Year ${year ?? "Unknown"}`;
  return `Phase ${index + 1}`;
}

function getTopGenresByAverageRating(entries: ArcPointSource[]): string[] {
  const rated = entries.filter((e): e is ArcPointSource & { rating: number } => typeof e.rating === "number");
  const genreStats = new Map<string, { total: number; count: number }>();

  for (const entry of rated) {
    for (const genre of entry.genres) {
      const prev = genreStats.get(genre) ?? { total: 0, count: 0 };
      genreStats.set(genre, { total: prev.total + entry.rating, count: prev.count + 1 });
    }
  }

  return [...genreStats.entries()]
    .map(([genre, stats]) => ({ genre, average: stats.total / stats.count }))
    .sort((a, b) => b.average - a.average)
    .slice(0, 3)
    .map((x) => x.genre);
}

function characterForSegment(avgRating: number | null, avgCommunityDelta: number | null): string {
  const labels: string[] = [];

  if (avgRating !== null) {
    if (avgRating > 3.8) labels.push("high enthusiasm");
    else if (avgRating < 2.5) labels.push("critical period");
  }

  if (avgCommunityDelta !== null) {
    if (avgCommunityDelta > 0.5) labels.push("above community consensus");
    else if (avgCommunityDelta < -0.5) labels.push("below community consensus");
  }

  return labels.length > 0 ? labels.slice(0, 2).join(", ") : "mixed";
}

function buildSegment(windowAlbums: ArcPointSource[], start: number, end: number, label: string): ArcSegment {
  const entries = windowAlbums.slice(start, end + 1);
  const rated = entries.filter((e): e is ArcPointSource & { rating: number } => typeof e.rating === "number");
  const ratedWithGlobal = rated.filter((e): e is ArcPointSource & { rating: number; globalRating: number } => typeof e.globalRating === "number");

  const avgRating = rated.length > 0 ? round2(rated.reduce((sum, e) => sum + e.rating, 0) / rated.length) : null;
  const avgCommunityDelta = ratedWithGlobal.length > 0
    ? round2(ratedWithGlobal.reduce((sum, e) => sum + (e.rating - e.globalRating), 0) / ratedWithGlobal.length)
    : null;

  return {
    label,
    character: characterForSegment(avgRating, avgCommunityDelta),
    start_index: start,
    end_index: end,
    album_count: entries.length,
    rated_count: rated.length,
    avg_rating: avgRating,
    avg_community_delta: avgCommunityDelta,
    top_genres: getTopGenresByAverageRating(entries),
    date_range: { from: entries[0].listenedAt, to: entries.at(-1)?.listenedAt ?? entries[0].listenedAt },
  };
}

function splitByCountWithGenreCheck(windowAlbums: ArcPointSource[]): Array<{ start: number; end: number }> {
  const n = windowAlbums.length;
  const base = Math.floor(n / 3);
  const rem = n % 3;
  const sizes = [base + (rem > 0 ? 1 : 0), base + (rem > 1 ? 1 : 0), base];

  const ranges: Array<{ start: number; end: number }> = [];
  let cursor = 0;
  for (const size of sizes) {
    if (size <= 0) continue;
    ranges.push({ start: cursor, end: cursor + size - 1 });
    cursor += size;
  }

  const sharesGenreShift = (left: { start: number; end: number }, right: { start: number; end: number }): boolean => {
    const leftTop = getTopGenresByAverageRating(windowAlbums.slice(left.start, left.end + 1));
    const rightTop = getTopGenresByAverageRating(windowAlbums.slice(right.start, right.end + 1));
    if (leftTop.length === 0 || rightTop.length === 0) return false;
    const overlap = leftTop.filter((g) => rightTop.includes(g)).length;
    const denom = Math.min(3, leftTop.length, rightTop.length);
    return overlap / denom < 0.5;
  };

  const merged: Array<{ start: number; end: number }> = [ranges[0]];
  for (let i = 1; i < ranges.length; i++) {
    const prev = merged.at(-1)!;
    const next = ranges[i];
    if (sharesGenreShift(prev, next)) merged.push(next);
    else prev.end = next.end;
  }

  if (merged.length === 1 && ranges.length > 1) {
    const midpoint = Math.floor((windowAlbums.length - 1) / 2);
    return [
      { start: 0, end: midpoint },
      { start: midpoint + 1, end: windowAlbums.length - 1 },
    ];
  }

  return merged;
}

function splitByYear(windowAlbums: ArcPointSource[]): Array<{ start: number; end: number; year: string }> {
  const yearSegments: Array<{ start: number; end: number; year: string }> = [];

  for (let i = 0; i < windowAlbums.length; i++) {
    const year = new Date(windowAlbums[i].listenedAt).getUTCFullYear().toString();
    const last = yearSegments.at(-1);
    if (!last || last.year !== year) {
      yearSegments.push({ start: i, end: i, year });
    } else {
      last.end = i;
    }
  }

  const mergedSmall: Array<{ start: number; end: number; year: string }> = [];
  for (const seg of yearSegments) {
    if (mergedSmall.length === 0) {
      mergedSmall.push({ ...seg });
      continue;
    }

    const current = { ...seg };
    const currentCount = current.end - current.start + 1;
    if (currentCount >= 5) {
      mergedSmall.push(current);
      continue;
    }

    const prev = mergedSmall.at(-1)!;
    const prevCount = prev.end - prev.start + 1;
    if (prevCount <= currentCount || mergedSmall.length === 1) {
      prev.end = current.end;
      prev.year = `${prev.year}-${current.year}`;
    } else {
      current.start = prev.start;
      current.year = `${prev.year}-${current.year}`;
      mergedSmall[mergedSmall.length - 1] = current;
    }
  }

  while (mergedSmall.length > 8) {
    const first = mergedSmall.shift()!;
    const second = mergedSmall.shift()!;
    mergedSmall.unshift({
      start: first.start,
      end: second.end,
      year: `${first.year}-${second.year}`,
    });
  }

  return mergedSmall;
}

function computeRollingRating(rated: ArcPointSource[]): { position: number; avg: number; label: string }[] {
  const windowSize = 10;
  const stepSize = 5;
  if (rated.length === 0) return [];
  if (rated.length < windowSize) {
    const mid = Math.floor(rated.length / 2);
    return [{
      position: mid,
      avg: round2(rated.reduce((s, e) => s + (e.rating as number), 0) / rated.length),
      label: rated[mid].albumName,
    }];
  }

  const points: { position: number; avg: number; label: string }[] = [];
  for (let i = 0; i <= rated.length - windowSize; i += stepSize) {
    const slice = rated.slice(i, i + windowSize);
    const mid = Math.floor(windowSize / 2);
    points.push({
      position: i + mid,
      avg: round2(slice.reduce((s, e) => s + (e.rating as number), 0) / slice.length),
      label: slice[mid].albumName,
    });
  }
  return points;
}

function computeRollingDelta(entries: Array<ArcPointSource & { rating: number; globalRating: number }>): { position: number; avg_delta: number }[] {
  const windowSize = 10;
  const stepSize = 5;
  if (entries.length === 0) return [];
  if (entries.length < windowSize) {
    return [{
      position: Math.floor(entries.length / 2),
      avg_delta: round2(entries.reduce((s, e) => s + (e.rating - e.globalRating), 0) / entries.length),
    }];
  }

  const points: { position: number; avg_delta: number }[] = [];
  for (let i = 0; i <= entries.length - windowSize; i += stepSize) {
    const slice = entries.slice(i, i + windowSize);
    points.push({
      position: i + Math.floor(windowSize / 2),
      avg_delta: round2(slice.reduce((s, e) => s + (e.rating - e.globalRating), 0) / slice.length),
    });
  }
  return points;
}

function toArcSource(history: UserAlbumHistoryEntry[]): ArcPointSource[] {
  return history
    .filter((entry) => typeof entry.generatedAt === "string" && entry.generatedAt.length > 0)
    .sort((a, b) => (a.generatedAt ?? "").localeCompare(b.generatedAt ?? ""))
    .map((entry) => ({
      generatedAlbumId: entry.generatedAlbumId,
      albumName: entry.album.name,
      albumArtist: entry.album.artist,
      rating: typeof entry.rating === "number" ? entry.rating : null,
      ...(typeof entry.globalRating === "number" && { globalRating: entry.globalRating }),
      listenedAt: entry.generatedAt as string,
      genres: entry.album.genres ?? [],
    }));
}
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
      const ratedWithGlobal = rated.filter(
        (h): h is typeof h & { globalRating: number } => typeof h.globalRating === "number",
      );
      const meanDivergence = ratedWithGlobal.length > 0
        ? Math.round((ratedWithGlobal.reduce((s, h) => s + (h.rating - h.globalRating), 0) / ratedWithGlobal.length) * 100) / 100
        : null;
      const meanAbsoluteDivergence = ratedWithGlobal.length > 0
        ? Math.round((ratedWithGlobal.reduce((s, h) => s + Math.abs(h.rating - h.globalRating), 0) / ratedWithGlobal.length) * 100) / 100
        : null;
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

      const completionPercentage = albumsGenerated > 0
        ? Math.round((albumsRated / albumsGenerated) * 100)
        : 0;

      const profile = {
        completionStats: {
          albumsGenerated,
          albumsRated,
          albumsUnrated: albumsGenerated - albumsRated,
          completionPercentage,
        },
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

  registerTool(
    "get_listening_arc",
    `Returns a structured, pre-segmented analysis of the user's full listening journey, designed for narrative generation. The server computes segment boundaries, rolling rating trends, community alignment drift, and notable milestones. Use this when the user asks how taste evolved over time or wants the story arc of their listening journey.`,
    {
      projectIdentifier: z.string().describe("The project slug or username. Required."),
      hint: z.enum(["recent", "full"]).optional().describe(
        "Optional bias hint. 'recent' = last ~30 albums. 'full' = entire history. Omit to let the tool choose based on history length.",
      ),
    },
    async ({ projectIdentifier, hint }) => {
      const pid = requireParam(projectIdentifier, "projectIdentifier");
      if (typeof pid === "object" && "error" in pid) return pid.response;

      const project = await client.getProject(pid);
      const chronological = toArcSource(project.history);
      const useRecent = hint === "recent" || (!hint && chronological.length < 20);
      const windowAlbums = useRecent ? chronological.slice(-30) : chronological;
      const windowLabel: "recent" | "full" = useRecent ? "recent" : "full";

      const ratedAlbums = windowAlbums.filter((e): e is ArcPointSource & { rating: number } => typeof e.rating === "number");
      const ratedWithGlobal = ratedAlbums.filter((e): e is ArcPointSource & { rating: number; globalRating: number } => typeof e.globalRating === "number");

      const ratingRollingAvg = computeRollingRating(ratedAlbums);
      const communityAlignment = computeRollingDelta(ratedWithGlobal);

      let arcSegments: ArcSegment[] = [];
      if (windowAlbums.length > 0) {
        if (windowAlbums.length < 20) {
          arcSegments = [buildSegment(windowAlbums, 0, windowAlbums.length - 1, getSegmentLabel("single", 0))];
        } else if (windowAlbums.length < 60) {
          const ranges = splitByCountWithGenreCheck(windowAlbums);
          arcSegments = ranges.map((range, index) => buildSegment(windowAlbums, range.start, range.end, getSegmentLabel("phase", index)));
        } else {
          const ranges = splitByYear(windowAlbums);
          arcSegments = ranges.map((range, index) => buildSegment(windowAlbums, range.start, range.end, getSegmentLabel("year", index, range.year)));
        }
      }

      const milestones: ArcMilestone[] = [];
      const pushMilestone = (
        type: ArcMilestone["type"],
        entry: ArcPointSource | undefined,
        position: number,
        value: number,
      ) => {
        if (!entry) return;
        milestones.push({
          type,
          album: {
            name: entry.albumName,
            artist: entry.albumArtist,
            generatedAlbumId: entry.generatedAlbumId,
          },
          position,
          value,
        });
      };

      const firstFiveIndex = windowAlbums.findIndex((a) => a.rating === 5);
      if (firstFiveIndex >= 0) pushMilestone("first_five_star", windowAlbums[firstFiveIndex], firstFiveIndex, 5);

      const firstOneIndex = windowAlbums.findIndex((a) => a.rating === 1);
      if (firstOneIndex >= 0) pushMilestone("first_one_star", windowAlbums[firstOneIndex], firstOneIndex, 1);

      const ratedWithIndex = windowAlbums
        .map((a, idx) => ({ a, idx }))
        .filter((x): x is { a: ArcPointSource & { rating: number }; idx: number } => typeof x.a.rating === "number");
      if (ratedWithIndex.length > 0) {
        const highest = ratedWithIndex.reduce((best, cur) => (cur.a.rating > best.a.rating ? cur : best));
        const lowest = ratedWithIndex.reduce((best, cur) => (cur.a.rating < best.a.rating ? cur : best));
        pushMilestone("highest_rated", highest.a, highest.idx, highest.a.rating);
        pushMilestone("lowest_rated", lowest.a, lowest.idx, lowest.a.rating);
      }

      const withDelta = windowAlbums
        .map((a, idx) => ({ a, idx }))
        .filter((x): x is { a: ArcPointSource & { rating: number; globalRating: number }; idx: number } => typeof x.a.rating === "number" && typeof x.a.globalRating === "number");
      if (withDelta.length > 0) {
        const biggestAgree = withDelta.reduce((best, cur) => ((cur.a.rating - cur.a.globalRating) > (best.a.rating - best.a.globalRating) ? cur : best));
        const biggestDisagree = withDelta.reduce((best, cur) => ((cur.a.rating - cur.a.globalRating) < (best.a.rating - best.a.globalRating) ? cur : best));
        pushMilestone("biggest_community_agree", biggestAgree.a, biggestAgree.idx, round2(biggestAgree.a.rating - biggestAgree.a.globalRating));
        pushMilestone("biggest_community_disagree", biggestDisagree.a, biggestDisagree.idx, round2(biggestDisagree.a.rating - biggestDisagree.a.globalRating));
      }

      let bestStreakStart = -1;
      let bestStreakLen = 0;
      let curStart = -1;
      let curLen = 0;
      for (let i = 0; i < windowAlbums.length; i++) {
        if (typeof windowAlbums[i].rating === "number") {
          if (curStart < 0) curStart = i;
          curLen += 1;
          if (curLen > bestStreakLen) {
            bestStreakLen = curLen;
            bestStreakStart = curStart;
          }
        } else {
          curStart = -1;
          curLen = 0;
        }
      }
      if (bestStreakLen > 0 && bestStreakStart >= 0) {
        pushMilestone("longest_rated_streak", windowAlbums[bestStreakStart], bestStreakStart, bestStreakLen);
      }

      if (ratingRollingAvg.length > 0) {
        const peak = ratingRollingAvg.reduce((best, cur) => (cur.avg > best.avg ? cur : best));
        const trough = ratingRollingAvg.reduce((best, cur) => (cur.avg < best.avg ? cur : best));
        const peakAlbum = ratedAlbums[peak.position];
        const troughAlbum = ratedAlbums[trough.position];
        pushMilestone("rating_peak", peakAlbum, peak.position, peak.avg);
        pushMilestone("rating_trough", troughAlbum, trough.position, trough.avg);
      }

      const historySpanDays = windowAlbums.length > 1
        ? Math.max(0, Math.round((toMs(windowAlbums.at(-1)!.listenedAt) - toMs(windowAlbums[0].listenedAt)) / (1000 * 60 * 60 * 24)))
        : 0;

      const payload: ListeningArcPayload = {
        metadata: {
          total_albums: windowAlbums.length,
          rated_albums: ratedAlbums.length,
          history_span_days: historySpanDays,
          window: windowLabel,
          too_short_for_arc: windowAlbums.length < 10,
        },
        arc_segments: arcSegments,
        milestones,
        trend_data: {
          rating_rolling_avg: ratingRollingAvg,
          community_alignment: communityAlignment,
        },
      };

      return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
    },
    true,
  );

  registerTool(
    "get_review_insights",
    `Synthesises qualitative insight from a user's written album reviews using MCP Sampling.
Where rating-based tools give you numbers, this tool gives you reasoning — what the user
actually says about what they value, dislike, and notice in music.

Use this tool when:
- Predicting how a user will respond to a specific album (pass albumIdentifier)
- Understanding what a user thinks of a particular artist, genre, or style (pass query)
- Building a richer taste profile than ratings alone can provide

HOW IT WORKS: The tool fetches the project history (no extra API calls — uses cached
data), filters to entries with written reviews that match the query or album context,
prioritises reviews where the user diverged most from the community (these tend to be the
most informationally dense), then uses MCP Sampling to ask the connected LLM to synthesise
those reviews into a concise qualitative insight. The synthesis is done by the LLM, not
by an algorithm, because LLMs are far better at extracting nuanced reasoning from text.

TWO CALL PATTERNS:

1. ALBUM-ANCHORED — pass albumIdentifier (name, UUID, or generatedAlbumId):
   Reviews are filtered to entries sharing genre, style, or artist with that album.
   Best for: "How will this user respond to today's album?"
   Example: get_review_insights({ projectIdentifier: "x", albumIdentifier: "Kind of Blue" })

2. OPEN QUERY — pass query (freetext string):
   Reviews are filtered by matching artist name, album name, genre, or style.
   Best for: "What does this user think of David Bowie / jazz / experimental music?"
   Example: get_review_insights({ projectIdentifier: "x", query: "David Bowie" })

If neither albumIdentifier nor query is provided, the tool synthesises across the user's
most opinionated reviews overall (highest divergence from community).

PARAMETERS:
- projectIdentifier: required
- albumIdentifier: optional — name, UUID, or generatedAlbumId from list_project_history
- query: optional — freetext matched against artist, album name, genre, or style
- limit: optional (default 15, max 30) — max reviews fed to sampling. Higher values give
  richer synthesis but increase sampling token usage. Reviews are prioritised by community
  divergence before the limit is applied, so the most informative reviews are always
  included first.

REQUIRES SAMPLING: This tool uses MCP Sampling to synthesise reviews. If the connected
client does not support sampling, a fallback response is returned containing the raw
review entries instead of a synthesis — still useful, but less concise.

Returns a qualitative synthesis as plain text, plus metadata (how many reviews were found,
how many were used, whether results were capped).`,
    {
      projectIdentifier: z.string().describe("The name of the project or the sharerId"),
      albumIdentifier: z.string().optional().describe(
        "Album name, UUID, or generatedAlbumId to anchor the review search by genre/style/artist connections",
      ),
      query: z.string().optional().describe(
        "Freetext query matched against artist name, album name, genre, or style",
      ),
      limit: z.number().int().min(1).max(30).default(15).describe(
        "Maximum number of reviews to synthesise (default 15). Reviews are prioritised by community divergence before this limit is applied.",
      ),
    },
    async ({ projectIdentifier, albumIdentifier, query, limit }) => {
      const pid = requireParam(projectIdentifier, "projectIdentifier");
      if (typeof pid === "object" && "error" in pid) return pid.response;

      const project = await client.getProject(pid);

      const context = buildReviewInsightsContext(
        project.history,
        query,
        albumIdentifier,
        limit,
      );

      if (context.selectedReviews.length === 0) {
        const reason =
          albumIdentifier || query
            ? `No reviewed entries found matching "${albumIdentifier ?? query}".`
            : "No reviewed entries found in this project's history.";
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              synthesis: null,
              reason,
              metadata: {
                totalReviewedEntries: context.totalReviewedEntries,
                matchingEntries: 0,
                reviewsUsed: 0,
                wasCapped: false,
                samplingUsed: false,
              },
            }, null, 2),
          }],
        };
      }

      const reviewBlock = context.selectedReviews
        .map(
          (r) =>
            `---\nAlbum: ${r.albumName} by ${r.artist} (${r.releaseDate})\n` +
            `Genres: ${r.genres.join(", ")}${r.styles.length > 0 ? `\nStyles: ${r.styles.join(", ")}` : ""}\n` +
            `User rating: ${r.userRating}/5${r.globalRating !== null ? ` (community: ${r.globalRating}/5)` : ""}\n` +
            `Review: ${r.review}`,
        )
        .join("\n\n");

      let contextLine: string;
      let targetAlbumName: string | undefined;
      if (albumIdentifier) {
        const lowerIdentifier = albumIdentifier.toLowerCase();
        const targetEntry = project.history.find(
          (h) =>
            h.album.name.toLowerCase() === lowerIdentifier ||
            h.album.uuid === albumIdentifier ||
            h.generatedAlbumId === albumIdentifier,
        );
        targetAlbumName = targetEntry?.album.name ?? albumIdentifier;
        contextLine = `Context: these reviews were selected because they share genre, style, or artist connections with the album "${targetAlbumName}".`;
      } else if (query) {
        contextLine = `Context: these reviews were selected by searching for "${query}".`;
      } else {
        contextLine = "Context: these are the listener's most opinionated reviews (highest divergence from community consensus).";
      }

      const cappedNote = context.wasCapped
        ? ` (showing top ${limit} by community divergence)`
        : "";

      const userMessageText =
        `${contextLine}\n\n` +
        `Here are ${context.selectedReviews.length} reviews from this listener's history${cappedNote}:\n\n` +
        `${reviewBlock}\n\n` +
        "Synthesise these into a concise qualitative insight about this listener's taste in the relevant area. " +
        "Focus on what the reviews reveal about their preferences and reasoning, not just what they liked or disliked numerically.";

      const systemPrompt =
        "You are a music taste analyst. You have been given a set of album reviews written by a single listener. " +
        "Your job is to synthesise these reviews into a concise qualitative insight that will help predict how " +
        "this listener will respond to new music.\n\n" +
        "Focus on:\n" +
        "- What qualities, sounds, or characteristics the listener explicitly values or praises\n" +
        "- What they dislike, find tedious, or criticise — be specific, not generic\n" +
        "- Any patterns in what makes them rate something higher or lower than the community\n" +
        "- Contradictions or nuances (e.g. \"loves jazz but dislikes free jazz\")\n" +
        "- The listener's own language and framing where it reveals taste clearly\n\n" +
        "Do NOT:\n" +
        "- Summarise each album individually — synthesise across all of them\n" +
        "- Repeat the ratings — the insight is about reasoning, not scores\n" +
        "- Make generic statements like \"the listener enjoys good music\" that carry no signal\n" +
        "- Exceed 250 words\n\n" +
        "Return only the insight text. No preamble, no headings, no bullet points unless the insight genuinely requires them to be clear.";

      const samplingPromptText = `${systemPrompt}\n\n${userMessageText}`;

      let synthesis: string;
      let samplingUsed: boolean;

      try {
        const samplingResponse = await server.server.createMessage({
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: samplingPromptText,
              },
            },
          ],
          maxTokens: 600,
        });

        synthesis =
          samplingResponse.content.type === "text"
            ? samplingResponse.content.text
            : "Sampling returned a non-text response.";
        samplingUsed = true;
      } catch (samplingError) {
        console.error("[get_review_insights] Sampling unavailable or failed:", samplingError);

        synthesis =
          "Sampling is not available with the current client. " +
          `Here are the ${context.selectedReviews.length} most relevant reviews for you to interpret directly:\n\n` +
          reviewBlock;
        samplingUsed = false;
      }

      const result = {
        synthesis,
        metadata: {
          totalReviewedEntries: context.totalReviewedEntries,
          matchingEntries: context.matchingEntries,
          reviewsUsed: context.selectedReviews.length,
          wasCapped: context.wasCapped,
          samplingUsed,
        },
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    },
    true,
  );

}
