import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assertToolError, assertToolSuccess } from "../test/assertions.js";
import { createTestClient, type TestClient } from "../test/create-test-client.js";
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
});
