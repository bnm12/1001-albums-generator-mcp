import { AxiosError } from "axios";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  assertToolError,
  assertToolSuccess,
  getToolResponseText,
  makeAxiosError,
} from "../test/assertions.js";
import { createTestClient, type TestClient } from "../test/create-test-client.js";
import { makeAlbumStat } from "../test/fixtures.js";
import { makeMockClient } from "../test/mock-client.js";

describe("community tools", () => {
  let testClient: TestClient;
  let mockClient: ReturnType<typeof makeMockClient>;

  beforeEach(async () => {
    mockClient = makeMockClient();
    testClient = await createTestClient(mockClient);
  });

  afterEach(async () => {
    await testClient.cleanup();
  });

  it("list_book_album_stats returns paginated envelope", async () => {
    mockClient.getGlobalStats.mockResolvedValue({ albums: [makeAlbumStat()] });
    const result = await testClient.client.callTool({ name: "list_book_album_stats", arguments: {} });
    const data = assertToolSuccess(result) as Record<string, unknown>;
    expect(data).toMatchObject({ totalCount: 1, returnedCount: 1, offset: 0, limit: null });
    expect((data.results as Array<Record<string, unknown>>)[0]).toHaveProperty("votesByGrade");
    expect(mockClient.getGlobalStats).toHaveBeenCalledTimes(1);
  });

  it("get_book_album_stat filters and validates query", async () => {
    mockClient.getGlobalStats.mockResolvedValue({
      albums: [
        makeAlbumStat({ name: "Blue Train", artist: "John Coltrane" }),
        makeAlbumStat({ name: "Nevermind", artist: "Nirvana" }),
      ],
    });

    const nameMatch = await testClient.client.callTool({ name: "get_book_album_stat", arguments: { query: "blue" } });
    expect((assertToolSuccess(nameMatch) as unknown[])).toHaveLength(1);
    const artistMatch = await testClient.client.callTool({ name: "get_book_album_stat", arguments: { query: "coltrane" } });
    expect((assertToolSuccess(artistMatch) as unknown[])).toHaveLength(1);

    const none = await testClient.client.callTool({ name: "get_book_album_stat", arguments: { query: "zzzz" } });
    expect(assertToolSuccess(none)).toEqual([]);

    assertToolError(await testClient.client.callTool({ name: "get_book_album_stat", arguments: { query: "" } }), "query");
  });

  it("list_user_submitted_album_stats returns paginated envelope", async () => {
    mockClient.getUserAlbumStats.mockResolvedValue({ albums: [makeAlbumStat({ name: "User Album" })] });
    const result = await testClient.client.callTool({ name: "list_user_submitted_album_stats", arguments: {} });
    const data = assertToolSuccess(result) as any;
    expect(data).toMatchObject({ totalCount: 1, returnedCount: 1, offset: 0, limit: null });
    expect(data.results[0]).toEqual(expect.objectContaining({ name: "User Album" }));
    expect(mockClient.getUserAlbumStats).toHaveBeenCalledTimes(1);
  });


  describe("list_book_album_stats — pagination and sorting", () => {
    it("defaults to highest_rated sort when omitted", async () => {
      mockClient.getGlobalStats.mockResolvedValue({
        albums: [
          makeAlbumStat({ name: "Lower", averageRating: 3.1 }),
          makeAlbumStat({ name: "Higher", averageRating: 4.8 }),
        ],
      });
      const result = await testClient.client.callTool({ name: "list_book_album_stats", arguments: {} });
      const data = assertToolSuccess(result) as any;
      expect(data.results[0].name).toBe("Higher");
    });

    it("returns envelope shape with limit", async () => {
      mockClient.getGlobalStats.mockResolvedValue({
        albums: Array.from({ length: 5 }, (_, i) => makeAlbumStat({ name: `Album ${i}` })),
      });
      const result = await testClient.client.callTool({ name: "list_book_album_stats", arguments: { limit: 2 } });
      const data = assertToolSuccess(result) as any;
      expect(data.totalCount).toBe(5);
      expect(data.returnedCount).toBe(2);
      expect(data.limit).toBe(2);
    });

    it("sorts by most_controversial", async () => {
      mockClient.getGlobalStats.mockResolvedValue({
        albums: [
          makeAlbumStat({ name: "Low", controversialScore: 1 }),
          makeAlbumStat({ name: "High", controversialScore: 5 }),
        ],
      });
      const result = await testClient.client.callTool({ name: "list_book_album_stats", arguments: { sortBy: "most_controversial" } });
      const data = assertToolSuccess(result) as any;
      expect(data.results[0].name).toBe("High");
    });

    it("sorts by most_voted", async () => {
      mockClient.getGlobalStats.mockResolvedValue({
        albums: [makeAlbumStat({ name: "Few", votes: 10 }), makeAlbumStat({ name: "Many", votes: 100 })],
      });
      const result = await testClient.client.callTool({ name: "list_book_album_stats", arguments: { sortBy: "most_voted" } });
      const data = assertToolSuccess(result) as any;
      expect(data.results[0].name).toBe("Many");
    });

    it("returns all with limit null when omitted", async () => {
      mockClient.getGlobalStats.mockResolvedValue({ albums: [makeAlbumStat({ name: "A" }), makeAlbumStat({ name: "B" })] });
      const result = await testClient.client.callTool({ name: "list_book_album_stats", arguments: {} });
      const data = assertToolSuccess(result) as any;
      expect(data.limit).toBeNull();
      expect(data.returnedCount).toBe(2);
    });
  });

  describe("list_user_submitted_album_stats — pagination and sorting", () => {
    it("defaults to highest_rated sort when omitted", async () => {
      mockClient.getUserAlbumStats.mockResolvedValue({
        albums: [
          makeAlbumStat({ name: "Lower", averageRating: 3.1 }),
          makeAlbumStat({ name: "Higher", averageRating: 4.8 }),
        ],
      });
      const result = await testClient.client.callTool({ name: "list_user_submitted_album_stats", arguments: {} });
      const data = assertToolSuccess(result) as any;
      expect(data.results[0].name).toBe("Higher");
    });

    it("returns envelope shape with limit", async () => {
      mockClient.getUserAlbumStats.mockResolvedValue({
        albums: Array.from({ length: 5 }, (_, i) => makeAlbumStat({ name: `Album ${i}` })),
      });
      const result = await testClient.client.callTool({ name: "list_user_submitted_album_stats", arguments: { limit: 2 } });
      const data = assertToolSuccess(result) as any;
      expect(data.totalCount).toBe(5);
      expect(data.returnedCount).toBe(2);
      expect(data.limit).toBe(2);
    });

    it("sorts by most_controversial", async () => {
      mockClient.getUserAlbumStats.mockResolvedValue({
        albums: [
          makeAlbumStat({ name: "Low", controversialScore: 1 }),
          makeAlbumStat({ name: "High", controversialScore: 5 }),
        ],
      });
      const result = await testClient.client.callTool({ name: "list_user_submitted_album_stats", arguments: { sortBy: "most_controversial" } });
      const data = assertToolSuccess(result) as any;
      expect(data.results[0].name).toBe("High");
    });

    it("sorts by most_voted", async () => {
      mockClient.getUserAlbumStats.mockResolvedValue({
        albums: [makeAlbumStat({ name: "Few", votes: 10 }), makeAlbumStat({ name: "Many", votes: 100 })],
      });
      const result = await testClient.client.callTool({ name: "list_user_submitted_album_stats", arguments: { sortBy: "most_voted" } });
      const data = assertToolSuccess(result) as any;
      expect(data.results[0].name).toBe("Many");
    });

    it("returns all with limit null when omitted", async () => {
      mockClient.getUserAlbumStats.mockResolvedValue({ albums: [makeAlbumStat({ name: "A" }), makeAlbumStat({ name: "B" })] });
      const result = await testClient.client.callTool({ name: "list_user_submitted_album_stats", arguments: {} });
      const data = assertToolSuccess(result) as any;
      expect(data.limit).toBeNull();
      expect(data.returnedCount).toBe(2);
    });
  });

  describe("get_book_album_stat — expanded search", () => {
    it("matches on genre", async () => {
      mockClient.getGlobalStats.mockResolvedValue({
        albums: [
          makeAlbumStat({ name: "Kind of Blue", artist: "Miles Davis", genres: ["Jazz"] }),
          makeAlbumStat({ name: "Rumours", artist: "Fleetwood Mac", genres: ["Rock"] }),
        ],
      });

      const result = await testClient.client.callTool({
        name: "get_book_album_stat",
        arguments: { query: "jazz" },
      });

      const data = assertToolSuccess(result) as any;
      expect(data).toHaveLength(1);
      expect(data[0].name).toBe("Kind of Blue");
    });

    it("matches on release year", async () => {
      mockClient.getGlobalStats.mockResolvedValue({
        albums: [
          makeAlbumStat({ name: "Abbey Road", releaseDate: "1969" }),
          makeAlbumStat({ name: "Rumours", releaseDate: "1977" }),
        ],
      });

      const result = await testClient.client.callTool({
        name: "get_book_album_stat",
        arguments: { query: "1969" },
      });

      const data = assertToolSuccess(result) as any;
      expect(data).toHaveLength(1);
      expect(data[0].name).toBe("Abbey Road");
    });

    it("matches genre case-insensitively", async () => {
      mockClient.getGlobalStats.mockResolvedValue({
        albums: [
          makeAlbumStat({ name: "One", genres: ["Rock"] }),
          makeAlbumStat({ name: "Two", genres: ["Punk Rock"] }),
        ],
      });
      const result = await testClient.client.callTool({
        name: "get_book_album_stat",
        arguments: { query: "rock" },
      });
      const data = assertToolSuccess(result) as any;
      expect(data).toHaveLength(2);
    });
  });

  describe("API error handling", () => {
    it("list_book_album_stats returns structured error on 500", async () => {
      mockClient.getGlobalStats.mockRejectedValue(makeAxiosError(500));
      const result = await testClient.client.callTool({ name: "list_book_album_stats", arguments: {} });
      expect(getToolResponseText(result)).toContain("Error:");
    });

    it("list_book_album_stats returns structured error on network failure", async () => {
      mockClient.getGlobalStats.mockRejectedValue(new AxiosError("Network Error"));
      const result = await testClient.client.callTool({ name: "list_book_album_stats", arguments: {} });
      expect(getToolResponseText(result)).toContain("Error:");
    });

    it("list_user_submitted_album_stats returns structured error on 500", async () => {
      mockClient.getUserAlbumStats.mockRejectedValue(makeAxiosError(500));
      const result = await testClient.client.callTool({ name: "list_user_submitted_album_stats", arguments: {} });
      expect(getToolResponseText(result)).toContain("Error:");
    });
  });

});
