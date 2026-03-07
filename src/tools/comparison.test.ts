import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assertToolError, assertToolSuccess } from "../test/assertions.js";
import { createTestClient, type TestClient } from "../test/create-test-client.js";
import type { ProjectInfo } from "../api.js";
import { makeAlbum, makeGroupInfo, makeGroupMember, makeHistoryEntry, makeProjectInfo } from "../test/fixtures.js";
import { makeMockClient } from "../test/mock-client.js";

describe("comparison tools", () => {
  let testClient: TestClient;
  let mockClient: ReturnType<typeof makeMockClient>;

  beforeEach(async () => {
    mockClient = makeMockClient();
    testClient = await createTestClient(mockClient);
  });

  afterEach(async () => {
    await testClient.cleanup();
  });

  it("get_group_album_insights sorts/filters/limits and validates slug", async () => {
    mockClient.getGroup.mockResolvedValue(makeGroupInfo({ members: [{ name: "alice", projectIdentifier: "alice" }, { name: "bob", projectIdentifier: "bob" }] }));
    mockClient.getProject.mockImplementation(async (id: string) => {
      if (id === "alice") {
        return makeProjectInfo({ history: [makeHistoryEntry({ album: makeAlbum({ uuid: "u1", name: "A" }), rating: 1 }), makeHistoryEntry({ generatedAlbumId: "2", album: makeAlbum({ uuid: "u2", name: "B" }), rating: 4 })] });
      }
      return makeProjectInfo({ history: [makeHistoryEntry({ album: makeAlbum({ uuid: "u1", name: "A" }), rating: 5 }), makeHistoryEntry({ generatedAlbumId: "2", album: makeAlbum({ uuid: "u2", name: "B" }), rating: 4 })] });
    });
    const result = await testClient.client.callTool({ name: "get_group_album_insights", arguments: { groupSlug: "g1", limit: 1 } });
    const data = assertToolSuccess(result) as { mostDivisive: Array<{ variance: number }>; mostConsensus: Array<{ variance: number }>; };
    expect(data.mostDivisive).toHaveLength(1);
    expect(data.mostConsensus).toHaveLength(1);
    expect(data.mostDivisive[0].variance).toBeGreaterThanOrEqual(data.mostConsensus[0].variance);

    assertToolError(await testClient.client.callTool({ name: "get_group_album_insights", arguments: { groupSlug: "" } }), "groupSlug");
  });

  it("get_group_member_comparison computes stats and validates params", async () => {
    mockClient.getProject.mockImplementation(async (id: string) => {
      if (id === "a") {
        return makeProjectInfo({ history: [
          makeHistoryEntry({ album: makeAlbum({ uuid: "u1", genres: ["Rock"] }), rating: 5 }),
          makeHistoryEntry({ generatedAlbumId: "2", album: makeAlbum({ uuid: "u2", genres: ["Jazz"] }), rating: 1 }),
        ] });
      }
      return makeProjectInfo({ history: [
        makeHistoryEntry({ album: makeAlbum({ uuid: "u1", genres: ["Rock"] }), rating: 5 }),
        makeHistoryEntry({ generatedAlbumId: "2", album: makeAlbum({ uuid: "u2", genres: ["Jazz"] }), rating: 5 }),
      ] });
    });

    const same = assertToolSuccess(await testClient.client.callTool({ name: "get_group_member_comparison", arguments: { projectIdentifierA: "a", projectIdentifierB: "a" } })) as { summaryStats: { sharedAlbumsCount: number; tasteSimilarityScore: number }; sharedAlbums: Array<{ divergence: number }>; genreOverlap: unknown[] };
    expect(same.summaryStats.sharedAlbumsCount).toBe(2);
    expect(same.summaryStats.tasteSimilarityScore).toBe(100);

    const diff = assertToolSuccess(await testClient.client.callTool({ name: "get_group_member_comparison", arguments: { projectIdentifierA: "a", projectIdentifierB: "b" } })) as { summaryStats: { tasteSimilarityScore: number; higherRater: string }; sharedAlbums: Array<{ divergence: number }> };
    expect(diff.summaryStats.tasteSimilarityScore).toBe(50);
    expect(Math.abs(diff.sharedAlbums[0].divergence)).toBeGreaterThanOrEqual(Math.abs(diff.sharedAlbums[1].divergence));
    expect(diff.summaryStats.higherRater).toBe("b");

    assertToolError(await testClient.client.callTool({ name: "get_group_member_comparison", arguments: { projectIdentifierA: "", projectIdentifierB: "b" } }), "projectIdentifierA");
    assertToolError(await testClient.client.callTool({ name: "get_group_member_comparison", arguments: { projectIdentifierA: "a", projectIdentifierB: "" } }), "projectIdentifierB");
  });


  describe("get_group_compatibility_matrix", () => {
    it("returns correct number of pairs for group sizes", async () => {
      const aliceHistory = [makeHistoryEntry({ album: makeAlbum({ uuid: "u1" }), rating: 5 })];
      const bobHistory = [makeHistoryEntry({ album: makeAlbum({ uuid: "u1" }), rating: 4 })];
      const carolHistory = [makeHistoryEntry({ album: makeAlbum({ uuid: "u1" }), rating: 1 })];

      mockClient.getProject.mockImplementation(async (id: string) => {
        const projects: Record<string, ProjectInfo> = {
          alice: makeProjectInfo({ name: "alice", history: aliceHistory }),
          bob: makeProjectInfo({ name: "bob", history: bobHistory }),
          carol: makeProjectInfo({ name: "carol", history: carolHistory }),
        };
        return projects[id] ?? makeProjectInfo({ name: id });
      });

      mockClient.getGroup.mockResolvedValue(
        makeGroupInfo({
          members: [makeGroupMember("alice"), makeGroupMember("bob"), makeGroupMember("carol")],
        }),
      );

      const three = assertToolSuccess(
        await testClient.client.callTool({
          name: "get_group_compatibility_matrix",
          arguments: { groupSlug: "g1" },
        }),
      ) as { pairs: unknown[] };
      expect(three.pairs.length).toBe((3 * (3 - 1)) / 2);

      mockClient.getGroup.mockResolvedValue(
        makeGroupInfo({ members: [makeGroupMember("alice"), makeGroupMember("bob")] }),
      );
      const two = assertToolSuccess(
        await testClient.client.callTool({
          name: "get_group_compatibility_matrix",
          arguments: { groupSlug: "g2" },
        }),
      ) as { pairs: unknown[] };
      expect(two.pairs.length).toBe((2 * (2 - 1)) / 2);
    });

    it("returns mostCompatible/leastCompatible and sorted member averages", async () => {
      const aliceHistory = [
        makeHistoryEntry({ album: makeAlbum({ uuid: "u1" }), rating: 5 }),
        makeHistoryEntry({ generatedAlbumId: "2", album: makeAlbum({ uuid: "u2" }), rating: 4 }),
      ];
      const bobHistory = [
        makeHistoryEntry({ album: makeAlbum({ uuid: "u1" }), rating: 5 }),
        makeHistoryEntry({ generatedAlbumId: "2", album: makeAlbum({ uuid: "u2" }), rating: 4 }),
      ];
      const carolHistory = [
        makeHistoryEntry({ album: makeAlbum({ uuid: "u1" }), rating: 1 }),
        makeHistoryEntry({ generatedAlbumId: "2", album: makeAlbum({ uuid: "u2" }), rating: 1 }),
      ];

      mockClient.getProject.mockImplementation(async (id: string) => {
        const projects: Record<string, ProjectInfo> = {
          alice: makeProjectInfo({ name: "alice", history: aliceHistory }),
          bob: makeProjectInfo({ name: "bob", history: bobHistory }),
          carol: makeProjectInfo({ name: "carol", history: carolHistory }),
        };
        return projects[id] ?? makeProjectInfo({ name: id });
      });
      mockClient.getGroup.mockResolvedValue(
        makeGroupInfo({
          members: [makeGroupMember("alice"), makeGroupMember("bob"), makeGroupMember("carol")],
        }),
      );

      const data = assertToolSuccess(
        await testClient.client.callTool({
          name: "get_group_compatibility_matrix",
          arguments: { groupSlug: "g1" },
        }),
      ) as {
        mostCompatible: { memberA: string; memberB: string } | null;
        leastCompatible: { memberA: string; memberB: string } | null;
        memberAverages: Array<{ averageSimilarity: number | null }>;
      };

      expect(data.mostCompatible).toMatchObject({ memberA: "alice", memberB: "bob" });
      expect(data.leastCompatible).toMatchObject({ memberA: "alice", memberB: "carol" });
      expect((data.memberAverages[0].averageSimilarity ?? -1) >= (data.memberAverages[1].averageSimilarity ?? -1)).toBe(true);
    });

    it("returns error for empty groupSlug", async () => {
      const result = await testClient.client.callTool({
        name: "get_group_compatibility_matrix",
        arguments: { groupSlug: "" },
      });
      assertToolError(result, "groupSlug");
    });

    it("handles group with no shared albums", async () => {
      const aliceHistory = [makeHistoryEntry({ album: makeAlbum({ uuid: "u1" }), rating: 5 })];
      const bobHistory = [makeHistoryEntry({ album: makeAlbum({ uuid: "u2" }), rating: 4 })];
      const carolHistory = [makeHistoryEntry({ album: makeAlbum({ uuid: "u3" }), rating: 1 })];

      mockClient.getProject.mockImplementation(async (id: string) => {
        const projects: Record<string, ProjectInfo> = {
          alice: makeProjectInfo({ name: "alice", history: aliceHistory }),
          bob: makeProjectInfo({ name: "bob", history: bobHistory }),
          carol: makeProjectInfo({ name: "carol", history: carolHistory }),
        };
        return projects[id] ?? makeProjectInfo({ name: id });
      });
      mockClient.getGroup.mockResolvedValue(
        makeGroupInfo({
          members: [makeGroupMember("alice"), makeGroupMember("bob"), makeGroupMember("carol")],
        }),
      );

      const data = assertToolSuccess(
        await testClient.client.callTool({
          name: "get_group_compatibility_matrix",
          arguments: { groupSlug: "g1" },
        }),
      ) as {
        pairs: Array<{ similarityScore: number | null }>;
        mostCompatible: unknown;
        leastCompatible: unknown;
      };

      expect(data.pairs.every((pair) => pair.similarityScore === null)).toBe(true);
      expect(data.mostCompatible).toBeNull();
      expect(data.leastCompatible).toBeNull();
    });

    it("returns a valid JSON response shape", async () => {
      mockClient.getProject.mockResolvedValue(makeProjectInfo({ history: [] }));
      mockClient.getGroup.mockResolvedValue(
        makeGroupInfo({ members: [makeGroupMember("alice"), makeGroupMember("bob")] }),
      );

      const result = await testClient.client.callTool({
        name: "get_group_compatibility_matrix",
        arguments: { groupSlug: "g1" },
      });

      const data = assertToolSuccess(result) as Record<string, unknown>;
      expect(data).toHaveProperty("pairs");
      expect(data).toHaveProperty("mostCompatible");
      expect(data).toHaveProperty("leastCompatible");
      expect(data).toHaveProperty("memberAverages");
    });
  });

  it("compare_projects computes overlap/highlights and validates params", async () => {
    mockClient.getProject.mockImplementation(async (id: string) => {
      if (id === "a") {
        return makeProjectInfo({ history: [
          makeHistoryEntry({ album: makeAlbum({ uuid: "u1", genres: ["Rock"] }), rating: 4, globalRating: 4.5 }),
          makeHistoryEntry({ generatedAlbumId: "2", album: makeAlbum({ uuid: "u2", genres: ["Jazz"] }), rating: null }),
        ] });
      }
      if (id === "b") {
        return makeProjectInfo({ history: [
          makeHistoryEntry({ album: makeAlbum({ uuid: "u1", genres: ["Rock"] }), rating: 5, globalRating: 4.5 }),
          makeHistoryEntry({ generatedAlbumId: "2", album: makeAlbum({ uuid: "u3", genres: ["Pop"] }), rating: 4 }),
        ] });
      }
      return makeProjectInfo({ history: [] });
    });

    const result = assertToolSuccess(await testClient.client.callTool({ name: "compare_projects", arguments: { projectIdentifierA: "a", projectIdentifierB: "b" } })) as {
      overlapSummary: { sharedAlbumsCount: number; overlapPercentageA: number };
      genreAffinity: { projectA: Array<{ averageRating: number }> };
      sharedAlbumHighlights: Array<{ globalRating: number | null }>;
    };
    expect(result.overlapSummary.sharedAlbumsCount).toBe(1);
    expect(result.overlapSummary.overlapPercentageA).toBe(50);
    expect(result.genreAffinity.projectA[0].averageRating).toBeGreaterThanOrEqual(result.genreAffinity.projectA.at(-1)?.averageRating ?? 0);
    expect(result.sharedAlbumHighlights.length).toBeLessThanOrEqual(10);

    const noOverlap = assertToolSuccess(await testClient.client.callTool({ name: "compare_projects", arguments: { projectIdentifierA: "a", projectIdentifierB: "none" } })) as { overlapSummary: { sharedAlbumsCount: number } };
    expect(noOverlap.overlapSummary.sharedAlbumsCount).toBe(0);

    assertToolError(await testClient.client.callTool({ name: "compare_projects", arguments: { projectIdentifierA: "", projectIdentifierB: "b" } }), "projectIdentifierA");
    assertToolError(await testClient.client.callTool({ name: "compare_projects", arguments: { projectIdentifierA: "a", projectIdentifierB: "" } }), "projectIdentifierB");
  });
});
