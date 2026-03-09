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

  it("list_project_history returns paginated slim history envelope", async () => {
    mockClient.getProject.mockResolvedValue(
      makeProjectInfo({
        history: [
          makeHistoryEntry({ rating: 4, review: "review", album: makeAlbum({ spotifyId: "sp" }), generatedAt: "2024-01-01T00:00:00.000Z" }),
          makeHistoryEntry({ generatedAlbumId: "2", rating: "did-not-listen", generatedAt: "2024-02-01T00:00:00.000Z" }),
        ],
      }),
    );
    const result = await testClient.client.callTool({ name: "list_project_history", arguments: { projectIdentifier: "p1" } });
    const data = assertToolSuccess(result) as Record<string, unknown>;
    expect(data).toMatchObject({ totalCount: 2, returnedCount: 2, offset: 0, limit: null });
    const results = data.results as Array<Record<string, unknown>>;
    expect(results).toHaveLength(2);
    expect(results[0].rating).toBeNull();
    expect(results[1].rating).toBe(4);
    expect(results[0]).not.toHaveProperty("review");
    expect((results[0].album as Record<string, unknown>)).not.toHaveProperty("spotifyId");

    const bad = await testClient.client.callTool({ name: "list_project_history", arguments: { projectIdentifier: "" } });
    assertToolError(bad, "projectIdentifier");
  });


  describe("list_project_history — pagination and sorting", () => {
    it("defaults to recent sort when sortBy is omitted", async () => {
      const history = [
        makeHistoryEntry({ generatedAt: "2024-01-01T00:00:00.000Z", album: makeAlbum({ name: "Older" }) }),
        makeHistoryEntry({ generatedAt: "2024-06-01T00:00:00.000Z", album: makeAlbum({ name: "Newer" }) }),
      ];
      mockClient.getProject.mockResolvedValue(makeProjectInfo({ history }));

      const result = await testClient.client.callTool({
        name: "list_project_history",
        arguments: { projectIdentifier: "my-project" },
      });

      const data = assertToolSuccess(result) as any;
      expect(data.results[0].album.name).toBe("Newer");
      expect(data.results[1].album.name).toBe("Older");
    });

    it("returns pagination envelope with correct fields", async () => {
      const history = Array.from({ length: 10 }, (_, i) =>
        makeHistoryEntry({ album: makeAlbum({ name: `Album ${i}` }) }),
      );
      mockClient.getProject.mockResolvedValue(makeProjectInfo({ history }));

      const result = await testClient.client.callTool({
        name: "list_project_history",
        arguments: { projectIdentifier: "my-project", limit: 3, offset: 0 },
      });

      const data = assertToolSuccess(result) as any;
      expect(data.totalCount).toBe(10);
      expect(data.returnedCount).toBe(3);
      expect(data.offset).toBe(0);
      expect(data.limit).toBe(3);
      expect(data.results).toHaveLength(3);
    });

    it("returns all entries and limit: null when no limit specified", async () => {
      const history = Array.from({ length: 5 }, (_, i) =>
        makeHistoryEntry({ album: makeAlbum({ name: `Album ${i}` }) }),
      );
      mockClient.getProject.mockResolvedValue(makeProjectInfo({ history }));

      const result = await testClient.client.callTool({
        name: "list_project_history",
        arguments: { projectIdentifier: "my-project" },
      });

      const data = assertToolSuccess(result) as any;
      expect(data.limit).toBeNull();
      expect(data.totalCount).toBe(5);
      expect(data.returnedCount).toBe(5);
    });

    it("respects offset parameter", async () => {
      const history = Array.from({ length: 5 }, (_, i) =>
        makeHistoryEntry({
          generatedAt: `2024-0${i + 1}-01T00:00:00.000Z`,
          album: makeAlbum({ name: `Album ${i}` }),
        }),
      );
      mockClient.getProject.mockResolvedValue(makeProjectInfo({ history }));

      const result = await testClient.client.callTool({
        name: "list_project_history",
        arguments: {
          projectIdentifier: "my-project",
          sortBy: "oldest",
          limit: 2,
          offset: 2,
        },
      });

      const data = assertToolSuccess(result) as any;
      expect(data.offset).toBe(2);
      expect(data.returnedCount).toBe(2);
      expect(data.totalCount).toBe(5);
    });

    it("returns empty results with totalCount 0 for empty history", async () => {
      mockClient.getProject.mockResolvedValue(makeProjectInfo({ history: [] }));

      const result = await testClient.client.callTool({
        name: "list_project_history",
        arguments: { projectIdentifier: "my-project" },
      });

      const data = assertToolSuccess(result) as any;
      expect(data.totalCount).toBe(0);
      expect(data.returnedCount).toBe(0);
      expect(data.results).toHaveLength(0);
    });
  });

  describe("search_project_history multi-term OR search", () => {
    beforeEach(() => {
      mockClient.getProject.mockResolvedValue(
        makeProjectInfo({
          history: [
            makeHistoryEntry({
              album: makeAlbum({
                name: "Blue Train",
                artist: "John Coltrane",
                releaseDate: "1957",
                genres: ["Jazz"],
                styles: ["Hard Bop"],
              }),
            }),
            makeHistoryEntry({
              generatedAlbumId: "2",
              album: makeAlbum({
                name: "Nevermind",
                artist: "Nirvana",
                releaseDate: "1991",
                genres: ["Grunge"],
                styles: ["Alternative Rock"],
              }),
            }),
            makeHistoryEntry({
              generatedAlbumId: "3",
              album: makeAlbum({
                name: "Kind of Blue",
                artist: "Miles Davis",
                releaseDate: "1959",
                genres: ["Jazz"],
                styles: ["Modal Jazz"],
              }),
            }),
          ],
        }),
      );
    });

    it("returns entries matching any term in a multi-word query", async () => {
      const result = await testClient.client.callTool({
        name: "search_project_history",
        arguments: { projectIdentifier: "p1", query: "jazz grunge" },
      });
      const data = assertToolSuccess(result) as any[];
      expect(data).toHaveLength(3); // All albums match either "jazz" or "grunge"
    });

    it("ranks entries matching more terms higher", async () => {
      const result = await testClient.client.callTool({
        name: "search_project_history",
        arguments: { projectIdentifier: "p1", query: "blue jazz" },
      });
      const data = assertToolSuccess(result) as any[];
      // "Blue Train" and "Kind of Blue" match both "blue" and "jazz"
      // "Miles Davis" (if it were in history) would match just "jazz" (wait, Kind of Blue IS jazz)
      // Actually:
      // "Blue Train": matches "blue" (name) and "jazz" (genre) -> 2
      // "Kind of Blue": matches "blue" (name) and "jazz" (genre) -> 2
      // "Nevermind": matches none -> filtered out
      expect(data).toHaveLength(2);
      expect(data[0].album.name).toMatch(/Blue/);
      expect(data[1].album.name).toMatch(/Blue/);
    });

    it("ranks entries correctly with specific overlap", async () => {
      mockClient.getProject.mockResolvedValue(
        makeProjectInfo({
          history: [
            makeHistoryEntry({
              album: makeAlbum({ name: "Jazz Funk", genres: ["Jazz", "Funk"] }),
            }),
            makeHistoryEntry({
              album: makeAlbum({ name: "Pure Jazz", genres: ["Jazz"] }),
            }),
          ],
        }),
      );
      const result = await testClient.client.callTool({
        name: "search_project_history",
        arguments: { projectIdentifier: "p1", query: "jazz funk" },
      });
      const data = assertToolSuccess(result) as any[];
      expect(data).toHaveLength(2);
      expect(data[0].album.name).toBe("Jazz Funk");
      expect(data[1].album.name).toBe("Pure Jazz");
    });

    it("single-term query behaviour is unchanged", async () => {
      const result = await testClient.client.callTool({
        name: "search_project_history",
        arguments: { projectIdentifier: "p1", query: "grunge" },
      });
      const data = assertToolSuccess(result) as any[];
      expect(data).toHaveLength(1);
      expect(data[0].album.name).toBe("Nevermind");
    });

    it("returns empty when no term matches anything", async () => {
      const result = await testClient.client.callTool({
        name: "search_project_history",
        arguments: { projectIdentifier: "p1", query: "xyzzy" },
      });
      const data = assertToolSuccess(result) as any[];
      expect(data).toEqual([]);
    });

    it("handles extra whitespace in query gracefully", async () => {
      const result = await testClient.client.callTool({
        name: "search_project_history",
        arguments: { projectIdentifier: "p1", query: "  jazz   grunge  " },
      });
      const data = assertToolSuccess(result) as any[];
      expect(data).toHaveLength(3);
    });

    it("validates parameters", async () => {
      assertToolError(
        await testClient.client.callTool({
          name: "search_project_history",
          arguments: { projectIdentifier: "", query: "x" },
        }),
        "projectIdentifier",
      );
      assertToolError(
        await testClient.client.callTool({
          name: "search_project_history",
          arguments: { projectIdentifier: "p1", query: "" },
        }),
        "query",
      );
    });
  });

  it("get_album_detail finds by name/uuid/generatedAlbumId and validates params", async () => {
    const target = makeHistoryEntry({ generatedAlbumId: "gen-1", album: makeAlbum({ uuid: "bbbbbbbbbbbbbbbbbbbbbbbb", name: "Kind of Blue", spotifyId: "sp" }), review: "great" });
    mockClient.getProject.mockResolvedValue(makeProjectInfo({ history: [target] }));

    for (const albumIdentifier of ["kind of blue", "bbbbbbbbbbbbbbbbbbbbbbbb", "gen-1"]) {
      const result = await testClient.client.callTool({ name: "get_album_detail", arguments: { projectIdentifier: "p1", albumIdentifier } });
      expect(assertToolSuccess(result)).toMatchObject({ review: "great", album: { spotifyId: "sp" } });
    }

    const missing = await testClient.client.callTool({ name: "get_album_detail", arguments: { projectIdentifier: "p1", albumIdentifier: "missing" } });
    expect(getToolResponseText(missing)).toContain("not found");

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

    mockClient.getGlobalStats.mockResolvedValueOnce({ albums: [] });
    const notFound = await testClient.client.callTool({
      name: "get_album_context",
      arguments: { projectIdentifier: "p1", albumIdentifier: "not-found" },
    });
    assertToolError(notFound, "not found");
  });

  it("resolves today's current album when not in history", async () => {
    const currentAlbum = makeAlbum({ uuid: "today-uuid", name: "Today's Album", artist: "Artist A" });
    mockClient.getProject.mockResolvedValue(
      makeProjectInfo({
        currentAlbum,
        history: [
          makeHistoryEntry({
            album: makeAlbum({ uuid: "old-uuid", artist: "Artist A", name: "Old Album" }),
          }),
        ],
      }),
    );

    const result = await testClient.client.callTool({
      name: "get_album_context",
      arguments: { projectIdentifier: "p1", albumIdentifier: "Today's Album" },
    });

    const data = assertToolSuccess(result) as any;
    expect(data.targetAlbum.name).toBe("Today's Album");
    expect(data.targetAlbum.userRating).toBeNull();
    expect(data.listeningJourney).toEqual([]);
    expect(data.communityDivergence.interpretation).toContain("today's current album");
    // Artist arc should contain the other album by Artist A
    expect(data.artistArc).toHaveLength(1);
    expect(data.artistArc[0].album.name).toBe("Old Album");
  });

  it("computes artistArc from history even when target is currentAlbum", async () => {
    const currentAlbum = makeAlbum({ uuid: "today-uuid", name: "Today", artist: "Same Artist" });
    mockClient.getProject.mockResolvedValue(
      makeProjectInfo({
        currentAlbum,
        history: [
          makeHistoryEntry({ album: makeAlbum({ uuid: "h1", artist: "Same Artist", name: "H1" }) }),
        ],
      }),
    );

    const result = await testClient.client.callTool({
      name: "get_album_context",
      arguments: { projectIdentifier: "p1", albumIdentifier: "today" },
    });
    const data = assertToolSuccess(result) as any;
    expect(data.artistArc).toHaveLength(1);
    expect(data.artistArc[0].album.name).toBe("H1");
  });

  it("falls back to global stats when album not in history or currentAlbum", async () => {
    mockClient.getProject.mockResolvedValue(makeProjectInfo({ history: [], currentAlbum: null }));
    mockClient.getGlobalStats.mockResolvedValue({
      albums: [
        {
          name: "Global Album",
          artist: "Global Artist",
          averageRating: 4.2,
          genres: ["Jazz"],
          votes: 100,
          controversialScore: 0,
        },
      ],
    });

    const result = await testClient.client.callTool({
      name: "get_album_context",
      arguments: { projectIdentifier: "p1", albumIdentifier: "Global Album" },
    });

    const data = assertToolSuccess(result) as any;
    expect(data.targetAlbum.name).toBe("Global Album");
    expect(data.targetAlbum.globalRating).toBe(4.2);
    expect(data.communityDivergence.interpretation).toContain("not in the project's history");
  });

  it("returns not-found error when album missing from history, currentAlbum, and global stats", async () => {
    mockClient.getProject.mockResolvedValue(makeProjectInfo({ history: [], currentAlbum: null }));
    mockClient.getGlobalStats.mockResolvedValue({ albums: [] });

    const result = await testClient.client.callTool({
      name: "get_album_context",
      arguments: { projectIdentifier: "p1", albumIdentifier: "Unknown" },
    });
    assertToolError(result, "not found");
    expect(getToolResponseText(result)).toContain(
      "not found in project history, current album, or global stats",
    );
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
