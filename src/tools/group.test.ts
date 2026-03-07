import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assertToolError, assertToolSuccess } from "../test/assertions.js";
import { createTestClient, type TestClient } from "../test/create-test-client.js";
import { makeAlbum, makeGroupInfo } from "../test/fixtures.js";
import { makeMockClient } from "../test/mock-client.js";

describe("group tools", () => {
  let testClient: TestClient;
  let mockClient: ReturnType<typeof makeMockClient>;

  beforeEach(async () => {
    mockClient = makeMockClient();
    testClient = await createTestClient(mockClient);
  });

  afterEach(async () => {
    await testClient.cleanup();
  });

  it("get_group returns slim info and validates slug", async () => {
    mockClient.getGroup.mockResolvedValue(
      makeGroupInfo({
        latestAlbumWithVotes: {
          album: makeAlbum({ uuid: "eeeeeeeeeeeeeeeeeeeeeeee" }),
          votes: [{ projectIdentifier: "a", rating: 4 }],
        },
        allTimeHighscore: {
          album: makeAlbum({ uuid: "bbbbbbbbbbbbbbbbbbbbbbbb" }),
          votes: [
            { projectIdentifier: "a", rating: 5 },
            { projectIdentifier: "b", rating: 4 },
          ],
        },
        allTimeLowscore: {
          album: makeAlbum({ uuid: "cccccccccccccccccccccccc" }),
          votes: [{ projectIdentifier: "a", rating: 1 }],
        },
      }),
    );
    const result = await testClient.client.callTool({ name: "get_group", arguments: { groupSlug: "g1" } });
    const data = assertToolSuccess(result) as Record<string, unknown>;
    expect((data.allTimeHighscore as { averageRating: number }).averageRating).toBe(4.5);
    expect((data.allTimeLowscore as { averageRating: number }).averageRating).toBe(1);
    expect(data).not.toHaveProperty("latestAlbumWithVotes");

    assertToolError(await testClient.client.callTool({ name: "get_group", arguments: { groupSlug: "" } }), "groupSlug");
  });

  it("get_group_latest_album returns latest or null", async () => {
    mockClient.getGroup.mockResolvedValue(makeGroupInfo({ latestAlbumWithVotes: { album: makeAlbum(), votes: [{ projectIdentifier: "a", rating: 3 }] } }));
    const result = await testClient.client.callTool({ name: "get_group_latest_album", arguments: { groupSlug: "g1" } });
    expect(assertToolSuccess(result)).toMatchObject({ votes: [{ projectIdentifier: "a", rating: 3 }] });

    mockClient.getGroup.mockResolvedValueOnce(makeGroupInfo({ latestAlbumWithVotes: null }));
    const none = await testClient.client.callTool({ name: "get_group_latest_album", arguments: { groupSlug: "g1" } });
    expect(assertToolSuccess(none)).toBeNull();

    assertToolError(await testClient.client.callTool({ name: "get_group_latest_album", arguments: { groupSlug: "" } }), "groupSlug");
  });

  it("get_group_album_reviews resolves uuid and name, validates params", async () => {
    mockClient.getGroupAlbumReviews.mockResolvedValue({ album: makeAlbum(), reviews: [{ projectIdentifier: "a", rating: 4, review: "great" }] });
    const byUuid = await testClient.client.callTool({ name: "get_group_album_reviews", arguments: { groupSlug: "g1", albumIdentifier: "aaaaaaaaaaaaaaaaaaaaaaaa" } });
    expect(assertToolSuccess(byUuid)).toMatchObject({ reviews: [{ projectIdentifier: "a" }] });

    mockClient.getGroup.mockResolvedValue(
      makeGroupInfo({ currentAlbum: makeAlbum({ uuid: "ffffffffffffffffffffffff", name: "Target Album" }) }),
    );
    const byName = await testClient.client.callTool({ name: "get_group_album_reviews", arguments: { groupSlug: "g1", albumIdentifier: "target album" } });
    expect(mockClient.getGroupAlbumReviews).toHaveBeenCalledWith("g1", "ffffffffffffffffffffffff");
    expect(assertToolSuccess(byName)).toMatchObject({ reviews: [{ projectIdentifier: "a" }] });

    mockClient.getGroup.mockResolvedValueOnce(makeGroupInfo());
    const unresolved = await testClient.client.callTool({ name: "get_group_album_reviews", arguments: { groupSlug: "g1", albumIdentifier: "missing" } });
    assertToolError(unresolved, "Could not resolve album name");

    assertToolError(await testClient.client.callTool({ name: "get_group_album_reviews", arguments: { groupSlug: "", albumIdentifier: "x" } }), "groupSlug");
    assertToolError(await testClient.client.callTool({ name: "get_group_album_reviews", arguments: { groupSlug: "g1", albumIdentifier: "" } }), "albumIdentifier");
  });

  it("refresh_data dispatches invalidation methods", async () => {
    expect(assertToolSuccess(await testClient.client.callTool({ name: "refresh_data", arguments: { type: "global" } }))).toContain("Successfully");
    expect(mockClient.invalidateGlobalStats).toHaveBeenCalled();

    await testClient.client.callTool({ name: "refresh_data", arguments: { type: "user" } });
    expect(mockClient.invalidateUserStats).toHaveBeenCalled();

    await testClient.client.callTool({ name: "refresh_data", arguments: { type: "project", projectIdentifier: "p1" } });
    expect(mockClient.invalidateProject).toHaveBeenCalledWith("p1");

    await testClient.client.callTool({ name: "refresh_data", arguments: { type: "group", groupSlug: "g1" } });
    expect(mockClient.invalidateGroup).toHaveBeenCalledWith("g1");

    await testClient.client.callTool({ name: "refresh_data", arguments: { type: "all" } });
    expect(mockClient.clearCache).toHaveBeenCalled();

    assertToolError(await testClient.client.callTool({ name: "refresh_data", arguments: { type: "project", projectIdentifier: "" } }), "projectIdentifier");
    assertToolError(await testClient.client.callTool({ name: "refresh_data", arguments: { type: "group", groupSlug: "" } }), "groupSlug");
  });
});
