import { UserAlbumHistoryEntry } from "./api.js";

export interface PairSimilarity {
  memberA: string;
  memberB: string;
  sharedAlbumsCount: number;
  meanAbsoluteDivergence: number | null;
  similarityScore: number | null;
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
