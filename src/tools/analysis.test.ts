import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  assertToolError,
  assertToolSuccess,
  getToolResponseText,
  makeAxiosError,
} from "../test/assertions.js";
import { createTestClient, setupSamplingHandler, type TestClient } from "../test/create-test-client.js";
import { makeAlbum, makeHistoryEntry, makeProjectInfo } from "../test/fixtures.js";
import { makeMockClient } from "../test/mock-client.js";

function makeRichProject() {
  const history = [
    makeHistoryEntry({ album: makeAlbum({ uuid: "u1", genres: ["Rock"], releaseDate: "1975" }), rating: 5, globalRating: 4 }),
    makeHistoryEntry({ generatedAlbumId: "2", album: makeAlbum({ uuid: "u2", genres: ["Jazz"], releaseDate: "1960" }), rating: 2, globalRating: 3.5 }),
    makeHistoryEntry({ generatedAlbumId: "3", album: makeAlbum({ uuid: "u3", genres: ["Rock", "Blues"], releaseDate: "1988" }), rating: 4, globalRating: 4.2 }),
    makeHistoryEntry({ generatedAlbumId: "4", album: makeAlbum({ uuid: "u4", genres: ["Electronic"], releaseDate: "2001" }), rating: 3, globalRating: undefined }),
    makeHistoryEntry({ generatedAlbumId: "5", album: makeAlbum({ uuid: "u5", genres: ["Rock"], releaseDate: "1994" }), rating: 4, globalRating: 2.5 }),
    makeHistoryEntry({ generatedAlbumId: "6", album: makeAlbum({ uuid: "u6", genres: ["Jazz"], releaseDate: "2010" }), rating: null, globalRating: 4 }),
    makeHistoryEntry({ generatedAlbumId: "7", album: makeAlbum({ uuid: "u7", genres: ["Pop"], releaseDate: "1999" }), rating: 4, globalRating: 3.8 }),
    makeHistoryEntry({ generatedAlbumId: "8", album: makeAlbum({ uuid: "u8", genres: ["Blues"], releaseDate: "1971" }), rating: 1, globalRating: 3 }),
    makeHistoryEntry({ generatedAlbumId: "9", album: makeAlbum({ uuid: "u9", genres: ["Rock"], releaseDate: "1977" }), rating: 5, globalRating: 4.6 }),
    makeHistoryEntry({ generatedAlbumId: "10", album: makeAlbum({ uuid: "u10", genres: ["Jazz"], releaseDate: "1982" }), rating: 4, globalRating: 3.9 }),
  ];
  return makeProjectInfo({ history });
}

describe("analysis tools", () => {
  let testClient: TestClient;
  let mockClient: ReturnType<typeof makeMockClient>;

  beforeEach(async () => {
    mockClient = makeMockClient();
    testClient = await createTestClient(mockClient);
  });

  afterEach(async () => {
    await testClient.cleanup();
  });

  it("get_taste_profile computes distributions/alignment and validates", async () => {
    mockClient.getProject.mockResolvedValue(makeRichProject());
    const result = await testClient.client.callTool({ name: "get_taste_profile", arguments: { projectIdentifier: "p1" } });
    const data = assertToolSuccess(result) as Record<string, unknown>;
    const completionStats = data.completionStats as { albumsGenerated: number; albumsRated: number };
    expect(completionStats.albumsGenerated).toBe(10);
    expect(completionStats.albumsRated).toBe(9);
    expect((data.decadeDistribution as unknown[]).length).toBeGreaterThan(0);
    const topGenres = data.topGenres as Array<{ averageRating: number }>;
    expect(topGenres[0].averageRating).toBeGreaterThanOrEqual(topGenres.at(-1)?.averageRating ?? 0);

    const alignment = (data.communityAlignment as { meanDivergence: number | null; label: string | null });
    expect(alignment.meanDivergence).not.toBeNull();
    expect(typeof alignment.label).toBe("string");

    mockClient.getProject.mockResolvedValueOnce(
      makeProjectInfo({ history: [makeHistoryEntry({ globalRating: undefined }), makeHistoryEntry({ generatedAlbumId: "2", globalRating: undefined })] }),
    );
    const noGlobal = await testClient.client.callTool({ name: "get_taste_profile", arguments: { projectIdentifier: "p1" } });
    expect((assertToolSuccess(noGlobal) as { communityAlignment: { meanDivergence: number | null } }).communityAlignment.meanDivergence).toBeNull();

    mockClient.getProject.mockResolvedValueOnce(makeProjectInfo({ history: [] }));
    const emptyHistory = await testClient.client.callTool({
      name: "get_taste_profile",
      arguments: { projectIdentifier: "p1" },
    });
    const emptyData = assertToolSuccess(emptyHistory) as {
      completionStats: { completionPercentage: number; albumsGenerated: number; albumsRated: number };
    };
    expect(emptyData.completionStats.albumsGenerated).toBe(0);
    expect(emptyData.completionStats.albumsRated).toBe(0);
    expect(emptyData.completionStats.completionPercentage).toBe(0);

    assertToolError(await testClient.client.callTool({ name: "get_taste_profile", arguments: { projectIdentifier: "" } }), "projectIdentifier");
  });

  it("get_rating_outliers supports directions/limit/sorting", async () => {
    mockClient.getProject.mockResolvedValue(makeRichProject());

    const under = assertToolSuccess(await testClient.client.callTool({ name: "get_rating_outliers", arguments: { projectIdentifier: "p1", direction: "underrated", limit: 2 } })) as Record<string, Array<{ divergence: number }>>;
    expect(under.underrated.every((a) => a.divergence < 0)).toBe(true);
    expect(under.underrated.length).toBeLessThanOrEqual(2);

    const over = assertToolSuccess(await testClient.client.callTool({ name: "get_rating_outliers", arguments: { projectIdentifier: "p1", direction: "overrated", limit: 2 } })) as Record<string, Array<{ divergence: number }>>;
    expect(over.overrated.every((a) => a.divergence > 0)).toBe(true);

    const both = assertToolSuccess(await testClient.client.callTool({ name: "get_rating_outliers", arguments: { projectIdentifier: "p1", direction: "both", limit: 3 } })) as Record<string, Array<{ divergence: number; globalRating?: number }>>;
    expect(both.underrated.length).toBeLessThanOrEqual(3);
    expect(both.overrated.length).toBeLessThanOrEqual(3);
    expect(both.overrated[0].divergence).toBeGreaterThanOrEqual(both.overrated.at(-1)?.divergence ?? -999);
    expect(both.underrated[0].divergence).toBeLessThanOrEqual(both.underrated.at(-1)?.divergence ?? 999);
    expect([...both.underrated, ...both.overrated].every((a) => a.globalRating !== undefined)).toBe(true);

    assertToolError(await testClient.client.callTool({ name: "get_rating_outliers", arguments: { projectIdentifier: "" } }), "projectIdentifier");
  });


  describe("get_listening_arc", () => {
    function makeArcHistory(count: number, opts: { includeUnrated?: boolean; sameGenre?: boolean; noGlobal?: boolean } = {}) {
      const history = Array.from({ length: count }, (_, i) => {
        const year = 2018 + Math.floor(i / 12);
        const month = (i % 12) + 1;
        const genre = opts.sameGenre ? "Rock" : i % 3 === 0 ? "Rock" : i % 3 === 1 ? "Jazz" : "Electronic";
        const rating = opts.includeUnrated && i % 11 === 0 ? null : (i % 5) + 1;
        return makeHistoryEntry({
          generatedAlbumId: `arc-${i + 1}`,
          generatedAt: `${year}-${String(month).padStart(2, "0")}-01T00:00:00.000Z`,
          album: makeAlbum({
            uuid: `arc-u-${i + 1}`,
            name: `Arc Album ${i + 1}`,
            artist: `Artist ${i % 7}`,
            genres: [genre],
            releaseDate: `${1970 + (i % 40)}`,
          }),
          rating,
          globalRating: opts.noGlobal ? undefined : 3 + ((i % 4) * 0.2),
        });
      });
      return makeProjectInfo({ history });
    }

    it("builds year-based segments for long histories", async () => {
      mockClient.getProject.mockResolvedValue(makeArcHistory(72));

      const result = await testClient.client.callTool({
        name: "get_listening_arc",
        arguments: { projectIdentifier: "p1" },
      });

      const data = assertToolSuccess(result) as {
        metadata: { too_short_for_arc: boolean; window: string };
        arc_segments: Array<{ label: string }>;
        milestones: Array<{ type: string }>;
        trend_data: { rating_rolling_avg: unknown[] };
      };

      expect(data.metadata.too_short_for_arc).toBe(false);
      expect(data.metadata.window).toBe("full");
      expect(data.arc_segments.every((s) => s.label.startsWith("Year "))).toBe(true);
      expect(data.trend_data.rating_rolling_avg.length).toBeGreaterThan(0);
      expect(data.milestones.some((m) => m.type === "first_five_star")).toBe(true);
      expect(data.milestones.some((m) => m.type === "rating_peak")).toBe(true);
      expect(data.milestones.some((m) => m.type === "rating_trough")).toBe(true);
    });

    it("returns a single segment and too_short_for_arc for short histories", async () => {
      mockClient.getProject.mockResolvedValue(makeArcHistory(8));
      const result = await testClient.client.callTool({
        name: "get_listening_arc",
        arguments: { projectIdentifier: "p1" },
      });
      const data = assertToolSuccess(result) as {
        metadata: { too_short_for_arc: boolean };
        arc_segments: unknown[];
      };
      expect(data.metadata.too_short_for_arc).toBe(true);
      expect(data.arc_segments.length).toBe(1);
    });

    it("honours recent hint by capping to last 30 albums", async () => {
      mockClient.getProject.mockResolvedValue(makeArcHistory(80));
      const result = await testClient.client.callTool({
        name: "get_listening_arc",
        arguments: { projectIdentifier: "p1", hint: "recent" },
      });
      const data = assertToolSuccess(result) as { metadata: { total_albums: number; window: string } };
      expect(data.metadata.window).toBe("recent");
      expect(data.metadata.total_albums).toBe(30);
    });

    it("returns an error for empty projectIdentifier", async () => {
      const result = await testClient.client.callTool({
        name: "get_listening_arc",
        arguments: { projectIdentifier: "" },
      });
      assertToolError(result, "projectIdentifier");
    });

    it("keeps unrated albums in segments but excludes them from rolling averages", async () => {
      mockClient.getProject.mockResolvedValue(makeArcHistory(30, { includeUnrated: true }));
      const result = await testClient.client.callTool({
        name: "get_listening_arc",
        arguments: { projectIdentifier: "p1", hint: "recent" },
      });
      const data = assertToolSuccess(result) as {
        metadata: { total_albums: number; rated_albums: number };
        arc_segments: Array<{ album_count: number; rated_count: number }>;
      };
      const segmentTotal = data.arc_segments.reduce((sum, seg) => sum + seg.album_count, 0);
      const segmentRated = data.arc_segments.reduce((sum, seg) => sum + seg.rated_count, 0);
      expect(segmentTotal).toBe(data.metadata.total_albums);
      expect(segmentRated).toBe(data.metadata.rated_albums);
      expect(data.metadata.rated_albums).toBeLessThan(data.metadata.total_albums);
    });

    it("returns null community deltas and empty alignment trend when global ratings are missing", async () => {
      mockClient.getProject.mockResolvedValue(makeArcHistory(25, { noGlobal: true }));
      const result = await testClient.client.callTool({
        name: "get_listening_arc",
        arguments: { projectIdentifier: "p1" },
      });
      const data = assertToolSuccess(result) as {
        arc_segments: Array<{ avg_community_delta: number | null }>;
        trend_data: { community_alignment: unknown[] };
      };
      expect(data.arc_segments.every((s) => s.avg_community_delta === null)).toBe(true);
      expect(data.trend_data.community_alignment.length).toBe(0);
    });

    it("keeps top_genres stable when all albums share same genre", async () => {
      mockClient.getProject.mockResolvedValue(makeArcHistory(30, { sameGenre: true }));
      const result = await testClient.client.callTool({
        name: "get_listening_arc",
        arguments: { projectIdentifier: "p1", hint: "recent" },
      });
      const data = assertToolSuccess(result) as { arc_segments: Array<{ top_genres: string[] }> };
      expect(data.arc_segments.every((s) => s.top_genres[0] === "Rock")).toBe(true);
    });
  });

  describe("API error handling", () => {
    it("get_taste_profile returns structured error on 404", async () => {
      mockClient.getProject.mockRejectedValue(makeAxiosError(404));
      const result = await testClient.client.callTool({
        name: "get_taste_profile",
        arguments: { projectIdentifier: "missing" },
      });
      const text = getToolResponseText(result);
      expect(text).toContain("Error:");
      expect(text).toContain("404");
    });

    it("get_rating_outliers returns structured error on 500", async () => {
      mockClient.getProject.mockRejectedValue(makeAxiosError(500));
      const result = await testClient.client.callTool({
        name: "get_rating_outliers",
        arguments: { projectIdentifier: "p1" },
      });
      expect(getToolResponseText(result)).toContain("Error:");
    });
  });


  describe("get_review_insights", () => {
    beforeEach(async () => {
      await testClient.cleanup();
      testClient = await createTestClient(mockClient, { sampling: {} });
      setupSamplingHandler(
        testClient.client,
        "This listener values atmospheric and emotionally resonant music.",
      );
    });

    it("returns synthesis text when sampling succeeds", async () => {
      const history = [
        makeHistoryEntry({
          review: "Beautiful and haunting.",
          rating: 5,
          album: makeAlbum({ genres: ["Jazz"] }),
        }),
      ];
      mockClient.getProject.mockResolvedValue(makeProjectInfo({ history }));

      const result = await testClient.client.callTool({
        name: "get_review_insights",
        arguments: { projectIdentifier: "my-project" },
      });

      const data = assertToolSuccess(result) as Record<string, unknown>;
      expect(String(data.synthesis)).toContain("atmospheric");
      expect((data.metadata as { samplingUsed: boolean }).samplingUsed).toBe(true);
      expect((data.metadata as { reviewsUsed: number }).reviewsUsed).toBe(1);
    });

    it("falls back with raw reviews when sampling unavailable", async () => {
      await testClient.cleanup();
      testClient = await createTestClient(mockClient, {});

      const history = [
        makeHistoryEntry({ review: "Loved the rhythm section.", rating: 4 }),
      ];
      mockClient.getProject.mockResolvedValue(makeProjectInfo({ history }));

      const result = await testClient.client.callTool({
        name: "get_review_insights",
        arguments: { projectIdentifier: "my-project" },
      });

      const data = assertToolSuccess(result) as Record<string, unknown>;
      expect((data.metadata as { samplingUsed: boolean }).samplingUsed).toBe(false);
      expect(String(data.synthesis)).toContain("Sampling is not available");
      expect(String(data.synthesis)).toContain("Loved the rhythm section");
    });

    it("returns null synthesis when no reviewed entries match", async () => {
      mockClient.getProject.mockResolvedValue(
        makeProjectInfo({ history: [makeHistoryEntry({ review: "" })] }),
      );

      const result = await testClient.client.callTool({
        name: "get_review_insights",
        arguments: { projectIdentifier: "my-project", query: "Jazz" },
      });

      const data = assertToolSuccess(result) as Record<string, unknown>;
      expect(data.synthesis).toBeNull();
      expect(data.reason).toBeDefined();
    });

    it("returns expected metadata fields", async () => {
      const history = [
        makeHistoryEntry({ review: "Gorgeous tone colors.", rating: 5 }),
        makeHistoryEntry({ generatedAlbumId: "2", review: "Too repetitive.", rating: 2 }),
      ];
      mockClient.getProject.mockResolvedValue(makeProjectInfo({ history }));

      const result = await testClient.client.callTool({
        name: "get_review_insights",
        arguments: { projectIdentifier: "my-project", limit: 1 },
      });

      const data = assertToolSuccess(result) as Record<string, unknown>;
      expect(data.metadata).toMatchObject({
        totalReviewedEntries: expect.any(Number),
        matchingEntries: expect.any(Number),
        reviewsUsed: expect.any(Number),
        wasCapped: expect.any(Boolean),
        samplingUsed: expect.any(Boolean),
      });
    });

    it("returns error for empty projectIdentifier", async () => {
      const result = await testClient.client.callTool({
        name: "get_review_insights",
        arguments: { projectIdentifier: "" },
      });
      assertToolError(result, "projectIdentifier");
    });
  });

});
