import { AxiosError } from "axios";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  assertToolError,
  assertToolSuccess,
  getToolResponseText,
  makeAxiosError,
} from "../test/assertions.js";
import { createTestClient, type TestClient } from "../test/create-test-client.js";
import { makeAlbum, makeHistoryEntry, makeProjectInfo } from "../test/fixtures.js";
import { makeMockClient } from "../test/mock-client.js";

describe("project tools", () => {
  let testClient: TestClient;
  let mockClient: ReturnType<typeof makeMockClient>;

  beforeEach(async () => {
    mockClient = makeMockClient();
    testClient = await createTestClient(mockClient);
  });

  afterEach(async () => {
    await testClient.cleanup();
  });

  it("get_album_of_the_day handles present/null albums and validates input", async () => {
    mockClient.getProject.mockResolvedValueOnce(
      makeProjectInfo({ currentAlbum: makeAlbum({ spotifyId: "spotify" }), currentAlbumNotes: "note" }),
    );
    const ok = await testClient.client.callTool({ name: "get_album_of_the_day", arguments: { projectIdentifier: "p1" } });
    expect(assertToolSuccess(ok)).toMatchObject({ currentAlbumNotes: "note", currentAlbum: { spotifyId: "spotify" } });
    expect(mockClient.getProject).toHaveBeenCalledWith("p1");

    mockClient.getProject.mockResolvedValueOnce(makeProjectInfo({ currentAlbum: null }));
    const none = await testClient.client.callTool({ name: "get_album_of_the_day", arguments: { projectIdentifier: "p1" } });
    expect(assertToolSuccess(none)).toMatchObject({ currentAlbum: null });

    const bad = await testClient.client.callTool({ name: "get_album_of_the_day", arguments: { projectIdentifier: "" } });
    assertToolError(bad, "projectIdentifier");
  });

  it("get_project_stats returns counts and slim currentAlbum", async () => {
    mockClient.getProject.mockResolvedValue(
      makeProjectInfo({
        history: [
          makeHistoryEntry({ rating: 5 }),
          makeHistoryEntry({ generatedAlbumId: "2", rating: "did-not-listen" }),
        ],
        currentAlbum: makeAlbum({ images: [{ url: "x", width: 1, height: 1 }], spotifyId: "sp" }),
      }),
    );
    const result = await testClient.client.callTool({ name: "get_project_stats", arguments: { projectIdentifier: "p1" } });
    const data = assertToolSuccess(result) as Record<string, unknown>;
    expect(data).toMatchObject({ albumsGenerated: 2, albumsRated: 1, albumsUnrated: 1 });
    expect(data).not.toHaveProperty("history");
    expect((data.currentAlbum as Record<string, unknown>)).not.toHaveProperty("images");
    expect((data.currentAlbum as Record<string, unknown>)).not.toHaveProperty("spotifyId");

    const bad = await testClient.client.callTool({ name: "get_project_stats", arguments: { projectIdentifier: "" } });
    assertToolError(bad, "projectIdentifier");
  });

  it("list_project_history returns slim history", async () => {
    mockClient.getProject.mockResolvedValue(
      makeProjectInfo({
        history: [
          makeHistoryEntry({ rating: 4, review: "review", album: makeAlbum({ spotifyId: "sp" }) }),
          makeHistoryEntry({ generatedAlbumId: "2", rating: "did-not-listen" }),
        ],
      }),
    );
    const result = await testClient.client.callTool({ name: "list_project_history", arguments: { projectIdentifier: "p1" } });
    const data = assertToolSuccess(result) as Array<Record<string, unknown>>;
    expect(data).toHaveLength(2);
    expect(data[0].rating).toBe(4);
    expect(data[1].rating).toBeNull();
    expect(data[0]).not.toHaveProperty("review");
    expect((data[0].album as Record<string, unknown>)).not.toHaveProperty("spotifyId");

    mockClient.getProject.mockResolvedValueOnce(makeProjectInfo({ history: [] }));
    const empty = await testClient.client.callTool({ name: "list_project_history", arguments: { projectIdentifier: "p1" } });
    expect(assertToolSuccess(empty)).toEqual([]);

    const bad = await testClient.client.callTool({ name: "list_project_history", arguments: { projectIdentifier: "" } });
    assertToolError(bad, "projectIdentifier");
  });

  it("search_project_history matches expected fields and validates params", async () => {
    mockClient.getProject.mockResolvedValue(
      makeProjectInfo({
        history: [
          makeHistoryEntry({ album: makeAlbum({ name: "Blue Train", artist: "John Coltrane", releaseDate: "1957", genres: ["Jazz"] }) }),
          makeHistoryEntry({ generatedAlbumId: "2", album: makeAlbum({ name: "Nevermind", artist: "Nirvana", releaseDate: "1991", genres: ["Grunge"] }) }),
        ],
      }),
    );
    for (const query of ["blue", "coltrane", "1991", "jazz"]) {
      const result = await testClient.client.callTool({ name: "search_project_history", arguments: { projectIdentifier: "p1", query } });
      expect((assertToolSuccess(result) as unknown[]).length).toBeGreaterThan(0);
    }
    const none = await testClient.client.callTool({ name: "search_project_history", arguments: { projectIdentifier: "p1", query: "zzzz" } });
    expect(assertToolSuccess(none)).toEqual([]);

    assertToolError(await testClient.client.callTool({ name: "search_project_history", arguments: { projectIdentifier: "", query: "x" } }), "projectIdentifier");
    assertToolError(await testClient.client.callTool({ name: "search_project_history", arguments: { projectIdentifier: "p1", query: "" } }), "query");
  });

  it("get_album_detail finds by name/uuid/generatedAlbumId and validates params", async () => {
    const target = makeHistoryEntry({ generatedAlbumId: "gen-1", album: makeAlbum({ uuid: "bbbbbbbbbbbbbbbbbbbbbbbb", name: "Kind of Blue", spotifyId: "sp" }), review: "great" });
    mockClient.getProject.mockResolvedValue(makeProjectInfo({ history: [target] }));

    for (const albumIdentifier of ["kind of blue", "bbbbbbbbbbbbbbbbbbbbbbbb", "gen-1"]) {
      const result = await testClient.client.callTool({ name: "get_album_detail", arguments: { projectIdentifier: "p1", albumIdentifier } });
      expect(assertToolSuccess(result)).toMatchObject({ review: "great", album: { spotifyId: "sp" } });
    }

    const missing = await testClient.client.callTool({ name: "get_album_detail", arguments: { projectIdentifier: "p1", albumIdentifier: "missing" } });
    expect(assertToolSuccess(missing)).toBeNull();

    assertToolError(await testClient.client.callTool({ name: "get_album_detail", arguments: { projectIdentifier: "", albumIdentifier: "x" } }), "projectIdentifier");
    assertToolError(await testClient.client.callTool({ name: "get_album_detail", arguments: { projectIdentifier: "p1", albumIdentifier: "" } }), "albumIdentifier");
  });

  it("get_album_context includes expected slices/caps and errors", async () => {
    const target = makeHistoryEntry({
      generatedAlbumId: "target",
      album: makeAlbum({ uuid: "cccccccccccccccccccccccc", name: "Target", artist: "Same Artist", genres: ["Rock"], styles: ["Alt"] }),
      rating: 4,
      globalRating: 3.5,
      generatedAt: "2024-01-04T00:00:00.000Z",
    });
    const history = [
      target,
      makeHistoryEntry({ generatedAlbumId: "a1", album: makeAlbum({ uuid: "a1a1a1a1a1a1a1a1a1a1a1a1", name: "Earlier", artist: "Same Artist", releaseDate: "1970" }), generatedAt: "2024-01-01T00:00:00.000Z" }),
      ...Array.from({ length: 25 }).map((_, i) =>
        makeHistoryEntry({
          generatedAlbumId: `m${i}`,
          album: makeAlbum({ uuid: `d${`${i}`.padStart(23, "0")}`, name: `Conn ${i}`, genres: ["Rock"], styles: ["Alt"] }),
          generatedAt: `2024-01-${String((i % 9) + 10).padStart(2, "0")}T00:00:00.000Z`,
          rating: null,
          globalRating: undefined,
        }),
      ),
    ];
    mockClient.getProject.mockResolvedValue(makeProjectInfo({ history }));

    const ok = await testClient.client.callTool({ name: "get_album_context", arguments: { projectIdentifier: "p1", albumIdentifier: "target" } });
    const data = assertToolSuccess(ok) as Record<string, unknown>;
    expect((data.artistArc as unknown[]).length).toBeGreaterThan(0);
    expect((data.artistArc as Array<{ album: { name: string } }>)[0].album.name).not.toBe("Target");
    expect((data.musicalConnections as unknown[]).length).toBeLessThanOrEqual(20);
    const journey = data.listeningJourney as Array<{ position: string }>;
    expect(journey.length).toBeLessThanOrEqual(6);
    expect((data.communityDivergence as { albumDivergence: number | null }).albumDivergence).toBe(0.5);

    mockClient.getProject.mockResolvedValueOnce(makeProjectInfo({ history: [makeHistoryEntry({ generatedAlbumId: "x", rating: null, globalRating: undefined })] }));
    const nullDiv = await testClient.client.callTool({ name: "get_album_context", arguments: { projectIdentifier: "p1", albumIdentifier: "x" } });
    expect((assertToolSuccess(nullDiv) as { communityDivergence: { albumDivergence: number | null } }).communityDivergence.albumDivergence).toBeNull();

    assertToolError(await testClient.client.callTool({ name: "get_album_context", arguments: { projectIdentifier: "", albumIdentifier: "x" } }), "projectIdentifier");
    assertToolError(await testClient.client.callTool({ name: "get_album_context", arguments: { projectIdentifier: "p1", albumIdentifier: "" } }), "albumIdentifier");

    const notFound = await testClient.client.callTool({ name: "get_album_context", arguments: { projectIdentifier: "p1", albumIdentifier: "not-found" } });
    assertToolError(notFound, "not found");
  });

  describe("API error handling", () => {
    it("returns structured error when project not found (404)", async () => {
      mockClient.getProject.mockRejectedValue(makeAxiosError(404));
      const result = await testClient.client.callTool({
        name: "get_album_of_the_day",
        arguments: { projectIdentifier: "nonexistent" },
      });
      const text = getToolResponseText(result);
      expect(text).toContain("Error:");
      expect(text).toContain("404");
    });

    it("returns structured error on network failure", async () => {
      mockClient.getProject.mockRejectedValue(new AxiosError("Network Error"));
      const result = await testClient.client.callTool({
        name: "get_album_of_the_day",
        arguments: { projectIdentifier: "my-project" },
      });
      const text = getToolResponseText(result);
      expect(text).toContain("Error:");
    });

    it("returns structured error on upstream 500", async () => {
      mockClient.getProject.mockRejectedValue(makeAxiosError(500));
      const result = await testClient.client.callTool({
        name: "get_project_stats",
        arguments: { projectIdentifier: "my-project" },
      });
      const text = getToolResponseText(result);
      expect(text).toContain("Error:");
      expect(text).toContain("500");
    });

    it("never throws — always returns a content response", async () => {
      mockClient.getProject.mockRejectedValue(new Error("unexpected internal error"));
      const result = await testClient.client.callTool({
        name: "get_project_stats",
        arguments: { projectIdentifier: "my-project" },
      });
      expect(result).toHaveProperty("content");
    });
  });

});
