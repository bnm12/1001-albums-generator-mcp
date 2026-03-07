import axios, { AxiosError } from "axios";
import { describe, expect, it } from "vitest";
import {
  calculateProjectStats,
  computeCompatibilityMatrix,
  computePairSimilarity,
  computeRatingTendencies,
  formatApiError,
  frequencyMap,
  getDecade,
  getRatedEntries,
  getYear,
  ratingAffinityMap,
  requireParam,
  topN,
} from "./helpers.js";
import { makeAlbum, makeHistoryEntry } from "./test/fixtures.js";

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


  describe("computeCompatibilityMatrix", () => {
    it("returns empty structure for empty member list", () => {
      const matrix = computeCompatibilityMatrix([], new Map());
      expect(matrix).toEqual({
        pairs: [],
        mostCompatible: null,
        leastCompatible: null,
        memberAverages: [],
      });
    });

    it("handles two members with no shared albums", () => {
      const members = ["a", "b"];
      const histories = new Map([
        [
          "a",
          [
            makeHistoryEntry({ album: makeAlbum({ uuid: "uuid-1" }), rating: 4 }),
            makeHistoryEntry({ generatedAlbumId: "2", album: makeAlbum({ uuid: "uuid-2" }), rating: 3 }),
          ],
        ],
        [
          "b",
          [
            makeHistoryEntry({ album: makeAlbum({ uuid: "uuid-3" }), rating: 2 }),
            makeHistoryEntry({ generatedAlbumId: "2", album: makeAlbum({ uuid: "uuid-4" }), rating: 5 }),
          ],
        ],
      ]);

      const matrix = computeCompatibilityMatrix(members, histories);
      expect(matrix.pairs).toHaveLength(1);
      expect(matrix.pairs[0]).toMatchObject({ sharedAlbumsCount: 0, similarityScore: null });
      expect(matrix.mostCompatible).toBeNull();
      expect(matrix.leastCompatible).toBeNull();
    });

    it("handles two members with identical ratings on shared albums", () => {
      const shared = ["uuid-1", "uuid-2", "uuid-3"];
      const historyA = shared.map((uuid, i) =>
        makeHistoryEntry({ generatedAlbumId: `${i + 1}`, album: makeAlbum({ uuid }), rating: 4 }),
      );
      const historyB = shared.map((uuid, i) =>
        makeHistoryEntry({ generatedAlbumId: `${i + 1}`, album: makeAlbum({ uuid }), rating: 4 }),
      );

      const matrix = computeCompatibilityMatrix(
        ["a", "b"],
        new Map([
          ["a", historyA],
          ["b", historyB],
        ]),
      );

      expect(matrix.pairs[0]).toMatchObject({ similarityScore: 100, meanAbsoluteDivergence: 0 });
      expect(matrix.mostCompatible).toEqual(matrix.pairs[0]);
      expect(matrix.leastCompatible).toEqual(matrix.pairs[0]);
      expect(matrix.memberAverages).toEqual([
        { member: "a", averageSimilarity: 100 },
        { member: "b", averageSimilarity: 100 },
      ]);
    });

    it("handles maximum divergence", () => {
      const shared = ["uuid-1", "uuid-2", "uuid-3"];
      const historyA = shared.map((uuid, i) =>
        makeHistoryEntry({ generatedAlbumId: `${i + 1}`, album: makeAlbum({ uuid }), rating: 1 }),
      );
      const historyB = shared.map((uuid, i) =>
        makeHistoryEntry({ generatedAlbumId: `${i + 1}`, album: makeAlbum({ uuid }), rating: 5 }),
      );

      const matrix = computeCompatibilityMatrix(
        ["a", "b"],
        new Map([
          ["a", historyA],
          ["b", historyB],
        ]),
      );

      expect(matrix.pairs[0]).toMatchObject({ meanAbsoluteDivergence: 4, similarityScore: 0 });
    });

    it("computes compatibility ordering for three members", () => {
      const alice = [
        makeHistoryEntry({ album: makeAlbum({ uuid: "u1" }), rating: 5 }),
        makeHistoryEntry({ generatedAlbumId: "2", album: makeAlbum({ uuid: "u2" }), rating: 5 }),
        makeHistoryEntry({ generatedAlbumId: "3", album: makeAlbum({ uuid: "u3" }), rating: 5 }),
        makeHistoryEntry({ generatedAlbumId: "4", album: makeAlbum({ uuid: "u4" }), rating: 5 }),
      ];
      const bob = [
        makeHistoryEntry({ album: makeAlbum({ uuid: "u1" }), rating: 5 }),
        makeHistoryEntry({ generatedAlbumId: "2", album: makeAlbum({ uuid: "u2" }), rating: 4 }),
        makeHistoryEntry({ generatedAlbumId: "3", album: makeAlbum({ uuid: "u3" }), rating: 4 }),
        makeHistoryEntry({ generatedAlbumId: "4", album: makeAlbum({ uuid: "u4" }), rating: 3 }),
      ];
      const carol = [
        makeHistoryEntry({ album: makeAlbum({ uuid: "u1" }), rating: 1 }),
        makeHistoryEntry({ generatedAlbumId: "2", album: makeAlbum({ uuid: "u2" }), rating: 1 }),
        makeHistoryEntry({ generatedAlbumId: "3", album: makeAlbum({ uuid: "u3" }), rating: 4 }),
        makeHistoryEntry({ generatedAlbumId: "4", album: makeAlbum({ uuid: "u4" }), rating: 3 }),
      ];

      const matrix = computeCompatibilityMatrix(
        ["alice", "bob", "carol"],
        new Map([
          ["alice", alice],
          ["bob", bob],
          ["carol", carol],
        ]),
      );

      expect(matrix.pairs).toHaveLength(3);
      expect([matrix.mostCompatible?.memberA, matrix.mostCompatible?.memberB]).toEqual(["alice", "bob"]);
      expect([matrix.leastCompatible?.memberA, matrix.leastCompatible?.memberB]).toEqual(["alice", "carol"]);
      expect(matrix.memberAverages[0].member).toBe("bob");
      expect(matrix.memberAverages[2].member).toBe("carol");
    });

    it("sorts member averages descending with nulls last", () => {
      const matrix = computeCompatibilityMatrix(
        ["alice", "bob", "carol"],
        new Map([
          ["alice", [makeHistoryEntry({ album: makeAlbum({ uuid: "u1" }), rating: 4 })]],
          ["bob", [makeHistoryEntry({ album: makeAlbum({ uuid: "u1" }), rating: 5 })]],
          ["carol", [makeHistoryEntry({ album: makeAlbum({ uuid: "u2" }), rating: 3 })]],
        ]),
      );

      expect(matrix.memberAverages[0]).toEqual({ member: "alice", averageSimilarity: 75 });
      expect(matrix.memberAverages[1]).toEqual({ member: "bob", averageSimilarity: 75 });
      expect(matrix.memberAverages[2]).toEqual({ member: "carol", averageSimilarity: null });
    });

    it("rounds member average similarity to 2 decimals", () => {
      const matrix = computeCompatibilityMatrix(
        ["alice", "bob", "carol", "dave"],
        new Map([
          ["alice", [makeHistoryEntry({ album: makeAlbum({ uuid: "u1" }), rating: 4 })]],
          ["bob", [makeHistoryEntry({ album: makeAlbum({ uuid: "u1" }), rating: 4 })]],
          ["carol", [makeHistoryEntry({ album: makeAlbum({ uuid: "u1" }), rating: 2 })]],
          ["dave", [makeHistoryEntry({ album: makeAlbum({ uuid: "u1" }), rating: 2 })]],
        ]),
      );

      const aliceAverage = matrix.memberAverages.find((m) => m.member === "alice");
      expect(aliceAverage?.averageSimilarity).toBe(66.67);

      const abPair = computePairSimilarity(
        "alice",
        [makeHistoryEntry({ album: makeAlbum({ uuid: "u1" }), rating: 4 })],
        "bob",
        [makeHistoryEntry({ album: makeAlbum({ uuid: "u1" }), rating: 4 })],
      );
      const acPair = computePairSimilarity(
        "alice",
        [makeHistoryEntry({ album: makeAlbum({ uuid: "u1" }), rating: 4 })],
        "carol",
        [makeHistoryEntry({ album: makeAlbum({ uuid: "u1" }), rating: 2 })],
      );
      const adPair = computePairSimilarity(
        "alice",
        [makeHistoryEntry({ album: makeAlbum({ uuid: "u1" }), rating: 4 })],
        "dave",
        [makeHistoryEntry({ album: makeAlbum({ uuid: "u1" }), rating: 2 })],
      );
      expect(
        Math.round(
          (((abPair.similarityScore ?? 0) + (acPair.similarityScore ?? 0) + (adPair.similarityScore ?? 0)) / 3) * 100,
        ) / 100,
      ).toBe(66.67);
    });
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


describe("formatApiError", () => {
  function makeAxiosError(status: number | null, message = "Request failed"): AxiosError {
    const error = new AxiosError(message);
    if (status !== null) {
      error.response = {
        status,
        statusText: String(status),
        data: {},
        headers: {},
        config: error.config ?? ({} as never),
      };
    }
    return error;
  }

  it("maps 404 responses to not_found with context", () => {
    const result = formatApiError(makeAxiosError(404), 'Project "foo"');
    expect(result.type).toBe("not_found");
    expect(result.statusCode).toBe(404);
    expect(result.message).toContain("foo");
    expect(result.message).toContain("404");
  });

  it("maps 429 responses to rate_limited", () => {
    const result = formatApiError(makeAxiosError(429), "Project");
    expect(result.type).toBe("rate_limited");
    expect(result.statusCode).toBe(429);
    expect(result.message.toLowerCase()).toContain("rate limit");
  });

  it("maps 500 responses to upstream_error", () => {
    const result = formatApiError(makeAxiosError(500), "Project");
    expect(result.type).toBe("upstream_error");
    expect(result.statusCode).toBe(500);
    expect(result.message).toContain("500");
  });

  it("maps 503 responses to upstream_error", () => {
    const result = formatApiError(makeAxiosError(503), "Project");
    expect(result.type).toBe("upstream_error");
    expect(result.statusCode).toBe(503);
  });

  it("maps axios errors without response to network_error", () => {
    const result = formatApiError(makeAxiosError(null, "Network Error"), "Project");
    expect(result.type).toBe("network_error");
    expect(result.statusCode).toBeNull();
    expect(result.message).toContain("Network Error");
  });

  it("maps other HTTP errors to unexpected", () => {
    const result = formatApiError(makeAxiosError(400), "Project");
    expect(result.type).toBe("unexpected");
    expect(result.statusCode).toBe(400);
  });

  it("maps non-axios Error instances to unexpected", () => {
    const result = formatApiError(new Error("something exploded"), "anything");
    expect(result.type).toBe("unexpected");
    expect(result.statusCode).toBeNull();
    expect(result.message).toContain("something exploded");
  });

  it("maps unknown thrown values to unexpected", () => {
    const result = formatApiError("oops", "anything");
    expect(result.type).toBe("unexpected");
    expect(result.statusCode).toBeNull();
    expect(result.message).toContain("oops");
  });

  it("interpolates context into 404 message", () => {
    const result = formatApiError(makeAxiosError(404), 'Group "test-group"');
    expect(result.message).toContain("test-group");
  });

  it("treats axios-like errors from axios constructor as axios errors", () => {
    const e = new AxiosError("Network Error");
    expect(axios.isAxiosError(e)).toBe(true);
  });
});
