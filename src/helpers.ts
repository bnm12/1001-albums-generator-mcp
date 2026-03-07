import axios from "axios";
import { UserAlbumHistoryEntry } from "./api.js";
import type { SlimAlbumStat, SlimHistoryEntry } from "./dto.js";

export type HistorySortBy =
  | "recent"
  | "oldest"
  | "highest_rated"
  | "lowest_rated";

export type StatSortBy =
  | "highest_rated"
  | "lowest_rated"
  | "most_voted"
  | "most_controversial";

export interface PaginatedResponse<T> {
  totalCount: number;
  returnedCount: number;
  offset: number;
  limit: number | null;
  results: T[];
}

export interface ApiErrorInfo {
  type:
    | "not_found"
    | "rate_limited"
    | "upstream_error"
    | "network_error"
    | "unexpected";
  statusCode: number | null;
  message: string;
}

export interface PairSimilarity {
  memberA: string;
  memberB: string;
  sharedAlbumsCount: number;
  meanAbsoluteDivergence: number | null;
  similarityScore: number | null;
}

export interface CompatibilityMatrix {
  pairs: PairSimilarity[];
  mostCompatible: PairSimilarity | null;
  leastCompatible: PairSimilarity | null;
  memberAverages: { member: string; averageSimilarity: number | null }[];
}

export interface ReviewEntry {
  generatedAlbumId: string;
  albumName: string;
  artist: string;
  releaseDate: string;
  genres: string[];
  styles: string[];
  userRating: number;
  globalRating: number | null;
  communityDivergence: number | null;
  review: string;
}


export function paginateAndSort<T>(
  items: T[],
  options: {
    offset?: number;
    limit?: number;
  },
): PaginatedResponse<T> {
  const offset = options.offset ?? 0;
  const totalCount = items.length;

  const sliced =
    options.limit !== undefined
      ? items.slice(offset, offset + options.limit)
      : items.slice(offset);

  return {
    totalCount,
    returnedCount: sliced.length,
    offset,
    limit: options.limit ?? null,
    results: sliced,
  };
}

export function sortHistory(
  entries: SlimHistoryEntry[],
  sortBy: HistorySortBy,
): SlimHistoryEntry[] {
  const sorted = [...entries];
  switch (sortBy) {
    case "recent":
      return sorted.sort((a, b) =>
        (b.generatedAt ?? "").localeCompare(a.generatedAt ?? ""),
      );
    case "oldest":
      return sorted.sort((a, b) =>
        (a.generatedAt ?? "").localeCompare(b.generatedAt ?? ""),
      );
    case "highest_rated":
      return sorted.sort((a, b) => {
        if (a.rating === null) return 1;
        if (b.rating === null) return -1;
        return b.rating - a.rating;
      });
    case "lowest_rated":
      return sorted.sort((a, b) => {
        if (a.rating === null) return 1;
        if (b.rating === null) return -1;
        return a.rating - b.rating;
      });
  }
}

export function sortStats(
  stats: SlimAlbumStat[],
  sortBy: StatSortBy,
): SlimAlbumStat[] {
  const sorted = [...stats];
  switch (sortBy) {
    case "highest_rated":
      return sorted.sort((a, b) => b.averageRating - a.averageRating);
    case "lowest_rated":
      return sorted.sort((a, b) => a.averageRating - b.averageRating);
    case "most_voted":
      return sorted.sort((a, b) => b.votes - a.votes);
    case "most_controversial":
      return sorted.sort((a, b) => b.controversialScore - a.controversialScore);
  }
}

export interface ReviewInsightsContext {
  selectedReviews: ReviewEntry[];
  totalReviewedEntries: number;
  matchingEntries: number;
  wasCapped: boolean;
}

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

export function getYear(dateStr: string): number {
  return parseInt(dateStr);
}

export function getDecade(year: number): string {
  return `${Math.floor(year / 10) * 10}s`;
}

export function getRatedEntries(history: UserAlbumHistoryEntry[]) {
  return history.filter(
    (h) => typeof h.rating === "number" && h.rating > 0,
  ) as (UserAlbumHistoryEntry & {
    rating: number;
  })[];
}

export function frequencyMap<T>(items: T[]): Map<T, number> {
  const map = new Map<T, number>();
  for (const item of items) {
    map.set(item, (map.get(item) ?? 0) + 1);
  }
  return map;
}

export function topN<T>(
  map: Map<T, number>,
  n: number,
): { value: T; count: number }[] {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([value, count]) => ({ value, count }));
}

export function ratingAffinityMap(
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

export function computeRatingTendencies(
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

export function computePairSimilarity(
  memberA: string,
  historyA: UserAlbumHistoryEntry[],
  memberB: string,
  historyB: UserAlbumHistoryEntry[],
): PairSimilarity {
  const ratedA = getRatedEntries(historyA);
  const ratedB = getRatedEntries(historyB);

  const mapA = new Map(ratedA.map((h) => [h.album.uuid, h.rating]));
  const mapB = new Map(ratedB.map((h) => [h.album.uuid, h.rating]));
  const sharedUuids = [...mapA.keys()].filter((uuid) => mapB.has(uuid));

  if (sharedUuids.length === 0) {
    return {
      memberA,
      memberB,
      sharedAlbumsCount: 0,
      meanAbsoluteDivergence: null,
      similarityScore: null,
    };
  }

  const meanAbsoluteDivergence =
    sharedUuids.reduce((sum, uuid) => {
      return sum + Math.abs((mapA.get(uuid) ?? 0) - (mapB.get(uuid) ?? 0));
    }, 0) / sharedUuids.length;

  const similarityScore = Math.round(((4 - meanAbsoluteDivergence) / 4) * 100);

  return {
    memberA,
    memberB,
    sharedAlbumsCount: sharedUuids.length,
    meanAbsoluteDivergence: Math.round(meanAbsoluteDivergence * 100) / 100,
    similarityScore,
  };
}

export function computeCompatibilityMatrix(
  members: string[],
  histories: Map<string, UserAlbumHistoryEntry[]>,
): CompatibilityMatrix {
  const pairs: PairSimilarity[] = [];

  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      const memberA = members[i];
      const memberB = members[j];
      const historyA = histories.get(memberA) ?? [];
      const historyB = histories.get(memberB) ?? [];
      pairs.push(computePairSimilarity(memberA, historyA, memberB, historyB));
    }
  }

  const scoredPairs = pairs.filter((p) => p.similarityScore !== null);

  const mostCompatible =
    scoredPairs.length > 0
      ? scoredPairs.reduce((best, p) =>
          (p.similarityScore ?? 0) > (best.similarityScore ?? 0) ? p : best,
        )
      : null;

  const leastCompatible =
    scoredPairs.length > 0
      ? scoredPairs.reduce((worst, p) =>
          (p.similarityScore ?? Infinity) < (worst.similarityScore ?? Infinity)
            ? p
            : worst,
        )
      : null;

  const memberAverages = members.map((member) => {
    const relevantPairs = scoredPairs.filter(
      (p) => p.memberA === member || p.memberB === member,
    );
    const averageSimilarity =
      relevantPairs.length > 0
        ? Math.round(
            (relevantPairs.reduce((sum, p) => sum + (p.similarityScore ?? 0), 0) /
              relevantPairs.length) *
              100,
          ) / 100
        : null;
    return { member, averageSimilarity };
  });

  memberAverages.sort((a, b) => {
    if (a.averageSimilarity === null) return 1;
    if (b.averageSimilarity === null) return -1;
    return b.averageSimilarity - a.averageSimilarity;
  });

  return { pairs, mostCompatible, leastCompatible, memberAverages };
}

export function buildReviewInsightsContext(
  history: UserAlbumHistoryEntry[],
  query: string | undefined,
  albumIdentifier: string | undefined,
  limit: number,
): ReviewInsightsContext {
  const reviewed = history.filter(
    (h) =>
      typeof h.review === "string" &&
      h.review.trim().length > 0 &&
      typeof h.rating === "number" &&
      h.rating > 0,
  ) as (UserAlbumHistoryEntry & { rating: number; review: string })[];

  const totalReviewedEntries = reviewed.length;
  let filtered = reviewed;

  if (albumIdentifier) {
    const lowerIdentifier = albumIdentifier.toLowerCase();
    const targetEntry = history.find(
      (h) =>
        h.album.name.toLowerCase() === lowerIdentifier ||
        h.album.uuid === albumIdentifier ||
        h.generatedAlbumId === albumIdentifier,
    );

    if (targetEntry) {
      const targetGenres = new Set(targetEntry.album.genres);
      const targetStyles = new Set(targetEntry.album.styles ?? []);
      const targetArtist = targetEntry.album.artist.toLowerCase();

      filtered = reviewed.filter((h) => {
        if (h.album.uuid === targetEntry.album.uuid) return false;
        if (h.album.artist.toLowerCase() === targetArtist) return true;
        if (h.album.genres.some((g) => targetGenres.has(g))) return true;
        if ((h.album.styles ?? []).some((s) => targetStyles.has(s))) return true;
        return false;
      });
    }
  } else if (query) {
    const lowerQuery = query.toLowerCase();
    filtered = reviewed.filter(
      (h) =>
        h.album.name.toLowerCase().includes(lowerQuery) ||
        h.album.artist.toLowerCase().includes(lowerQuery) ||
        h.album.genres.some((g) => g.toLowerCase().includes(lowerQuery)) ||
        (h.album.styles ?? []).some((s) => s.toLowerCase().includes(lowerQuery)),
    );
  }

  const matchingEntries = filtered.length;

  const ranked = [...filtered].sort((a, b) => {
    const divA =
      typeof a.globalRating === "number"
        ? Math.abs(a.rating - a.globalRating)
        : -1;
    const divB =
      typeof b.globalRating === "number"
        ? Math.abs(b.rating - b.globalRating)
        : -1;
    return divB - divA;
  });

  const selected = ranked.slice(0, limit);
  const wasCapped = matchingEntries > limit;

  const selectedReviews: ReviewEntry[] = selected.map((h) => ({
    generatedAlbumId: h.generatedAlbumId,
    albumName: h.album.name,
    artist: h.album.artist,
    releaseDate: h.album.releaseDate,
    genres: h.album.genres,
    styles: h.album.styles ?? [],
    userRating: h.rating,
    globalRating: typeof h.globalRating === "number" ? h.globalRating : null,
    communityDivergence:
      typeof h.globalRating === "number"
        ? Math.round(Math.abs(h.rating - h.globalRating) * 100) / 100
        : null,
    review: h.review,
  }));

  return { selectedReviews, totalReviewedEntries, matchingEntries, wasCapped };
}

export function requireParam(
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

export function formatApiError(error: unknown, context: string): ApiErrorInfo {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status ?? null;

    if (status === 404) {
      return {
        type: "not_found",
        statusCode: 404,
        message: `${context} was not found (404). Check that the identifier is correct.`,
      };
    }

    if (status === 429) {
      return {
        type: "rate_limited",
        statusCode: 429,
        message:
          "The upstream API rate limit was reached. Wait a moment and try again.",
      };
    }

    if (status !== null && status >= 500) {
      return {
        type: "upstream_error",
        statusCode: status,
        message: `The 1001 Albums Generator API returned an error (${status}). The service may be temporarily unavailable. Try again shortly.`,
      };
    }

    if (!error.response) {
      return {
        type: "network_error",
        statusCode: null,
        message: `Could not reach the 1001 Albums Generator API. Check your network connection and try again. (${error.message})`,
      };
    }

    return {
      type: "unexpected",
      statusCode: status,
      message: `Unexpected API response (${status ?? "unknown"}): ${error.message}`,
    };
  }

  const message = error instanceof Error ? error.message : String(error);
  return {
    type: "unexpected",
    statusCode: null,
    message: `An unexpected error occurred: ${message}`,
  };
}
