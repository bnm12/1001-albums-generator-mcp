import { describe, expect, it } from "vitest";
import {
  calculateProjectStats,
  computePairSimilarity,
  computeRatingTendencies,
  frequencyMap,
  getDecade,
  getRatedEntries,
  getYear,
  ratingAffinityMap,
  requireParam,
  topN,
} from "./helpers.js";
import { makeHistoryEntry } from "./test/fixtures.js";

describe("helpers", () => {
  it("calculateProjectStats counts only numeric ratings > 0", () => {
    const history = [
      makeHistoryEntry({ rating: 4 }),
      makeHistoryEntry({ generatedAlbumId: "2", rating: 0 }),
      makeHistoryEntry({ generatedAlbumId: "3", rating: undefined }),
      makeHistoryEntry({ generatedAlbumId: "4", rating: null }),
      makeHistoryEntry({ generatedAlbumId: "5", rating: "did-not-listen" }),
    ];
    const stats = calculateProjectStats(history);
    expect(stats).toEqual({ albumsGenerated: 5, albumsRated: 1, albumsUnrated: 4 });
    expect(stats.albumsGenerated).toBe(stats.albumsRated + stats.albumsUnrated);
  });

  it("covers empty and all-rated project stats", () => {
    expect(calculateProjectStats([])).toEqual({ albumsGenerated: 0, albumsRated: 0, albumsUnrated: 0 });
    const all = calculateProjectStats([
      makeHistoryEntry({ rating: 1 }),
      makeHistoryEntry({ generatedAlbumId: "2", rating: 5 }),
    ]);
    expect(all.albumsUnrated).toBe(0);
  });

  it("getYear and getDecade work", () => {
    expect(getYear("1975")).toBe(1975);
    expect(getYear("2003")).toBe(2003);
    expect(getDecade(1975)).toBe("1970s");
    expect(getDecade(1980)).toBe("1980s");
    expect(getDecade(2003)).toBe("2000s");
  });

  it("getRatedEntries filters and narrows", () => {
    const entries = getRatedEntries([
      makeHistoryEntry({ rating: null }),
      makeHistoryEntry({ generatedAlbumId: "2", rating: undefined }),
      makeHistoryEntry({ generatedAlbumId: "3", rating: 0 }),
      makeHistoryEntry({ generatedAlbumId: "4", rating: "4" }),
      makeHistoryEntry({ generatedAlbumId: "5", rating: 4 }),
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0].rating + 1).toBe(5);
  });

  it("frequencyMap and topN work", () => {
    expect([...frequencyMap<string>([]).entries()]).toEqual([]);
    const map = frequencyMap(["rock", "jazz", "rock"]);
    expect(topN(map, 1)).toEqual([{ value: "rock", count: 2 }]);
    expect(topN(map, 5)).toHaveLength(2);
  });

  it("ratingAffinityMap averages and sorts", () => {
    const result = ratingAffinityMap(
      [
        { genres: ["Rock", "Punk"], rating: 5 },
        { genres: ["Rock"], rating: 3 },
        { genres: ["Jazz"], rating: 4 },
      ],
      (e) => e.genres,
    );
    expect(result[0]).toMatchObject({ value: "Punk", averageRating: 5, albumCount: 1 });
    expect(result.find((r) => r.value === "Rock")?.averageRating).toBe(4);
  });

  it("computeRatingTendencies labels", () => {
    expect(computeRatingTendencies([])).toEqual({ meanRating: null, standardDeviation: null, label: null });
    expect(computeRatingTendencies([makeHistoryEntry({ rating: 4 }) as never])).toMatchObject({
      meanRating: 4,
      standardDeviation: null,
    });
    expect(computeRatingTendencies([makeHistoryEntry({ rating: 4 }), makeHistoryEntry({ generatedAlbumId: "2", rating: 4.5 })] as never).label).toBe("generous and consistent rater");
    expect(computeRatingTendencies([makeHistoryEntry({ rating: 2 }), makeHistoryEntry({ generatedAlbumId: "2", rating: 2.5 })] as never).label).toBe("harsh and consistent rater");
    expect(computeRatingTendencies([makeHistoryEntry({ rating: 1 }), makeHistoryEntry({ generatedAlbumId: "2", rating: 5 })] as never).label).toContain("erratic");
    expect(computeRatingTendencies([makeHistoryEntry({ rating: 2 }), makeHistoryEntry({ generatedAlbumId: "2", rating: 4 }), makeHistoryEntry({ generatedAlbumId: "3", rating: 4 })] as never).label).toBe("average rater");
  });

  it("computePairSimilarity scenarios", () => {
    const a1 = [makeHistoryEntry({ album: { ...makeHistoryEntry().album, uuid: "u1" }, rating: 4 })];
    const b1 = [makeHistoryEntry({ album: { ...makeHistoryEntry().album, uuid: "u2" }, rating: 4 })];
    expect(computePairSimilarity("a", a1, "b", b1)).toMatchObject({ sharedAlbumsCount: 0, similarityScore: null });

    const idA = [makeHistoryEntry({ album: { ...makeHistoryEntry().album, uuid: "u1" }, rating: 5 })];
    const idB = [makeHistoryEntry({ album: { ...makeHistoryEntry().album, uuid: "u1" }, rating: 5 })];
    expect(computePairSimilarity("a", idA, "b", idB)).toMatchObject({ similarityScore: 100, meanAbsoluteDivergence: 0 });

    const maxA = [makeHistoryEntry({ album: { ...makeHistoryEntry().album, uuid: "u1" }, rating: 1 })];
    const maxB = [makeHistoryEntry({ album: { ...makeHistoryEntry().album, uuid: "u1" }, rating: 5 })];
    expect(computePairSimilarity("a", maxA, "b", maxB).similarityScore).toBe(0);

    const partial = computePairSimilarity(
      "a",
      [makeHistoryEntry({ album: { ...makeHistoryEntry().album, uuid: "u1" }, rating: 4 }), makeHistoryEntry({ generatedAlbumId: "2", album: { ...makeHistoryEntry().album, uuid: "u2" }, rating: 3 })],
      "b",
      [makeHistoryEntry({ album: { ...makeHistoryEntry().album, uuid: "u1" }, rating: 2 })],
    );
    expect(partial.sharedAlbumsCount).toBe(1);
    expect(partial.meanAbsoluteDivergence).toBe(2);
  });

  it("requireParam behavior", () => {
    expect(requireParam("  abc  ", "projectIdentifier")).toBe("abc");
    const empty = requireParam("", "projectIdentifier");
    expect(typeof empty).toBe("object");
    if (typeof empty === "object") {
      expect(empty.response.content[0].text).toContain("projectIdentifier");
      expect(empty.response.content[0].text).toContain("project name or the sharerId");
    }
    const ws = requireParam("   ", "groupSlug");
    if (typeof ws === "object") {
      expect(ws.response.content[0].text).toContain("group name in lowercase with hyphens");
    }
  });
});
