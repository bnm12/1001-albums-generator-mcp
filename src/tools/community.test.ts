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

  it("list_book_album_stats returns slim stat list", async () => {
    mockClient.getGlobalStats.mockResolvedValue({ albums: [makeAlbumStat()] });
    const result = await testClient.client.callTool({ name: "list_book_album_stats", arguments: {} });
    const data = assertToolSuccess(result) as Array<Record<string, unknown>>;
    expect(data).toHaveLength(1);
    expect(data[0]).toHaveProperty("votesByGrade");
    expect(mockClient.getGlobalStats).toHaveBeenCalledTimes(1);

    mockClient.getGlobalStats.mockResolvedValueOnce({ albums: [] });
    const empty = await testClient.client.callTool({ name: "list_book_album_stats", arguments: {} });
    expect(assertToolSuccess(empty)).toEqual([]);
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

  it("list_user_submitted_album_stats returns slim list", async () => {
    mockClient.getUserAlbumStats.mockResolvedValue({ albums: [makeAlbumStat({ name: "User Album" })] });
    const result = await testClient.client.callTool({ name: "list_user_submitted_album_stats", arguments: {} });
    expect(assertToolSuccess(result)).toEqual([
      expect.objectContaining({ name: "User Album" }),
    ]);
    expect(mockClient.getUserAlbumStats).toHaveBeenCalledTimes(1);
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
