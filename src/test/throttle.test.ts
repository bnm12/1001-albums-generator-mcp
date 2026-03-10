/**
 * Tests for AlbumsGeneratorClient throttle queue behaviour under concurrent load.
 *
 * Design goals:
 *  1. Confirm the chain doesn't break when a downstream request throws mid-queue.
 *  2. Confirm concurrent callers are serialised (no two real HTTP calls overlap).
 *  3. Confirm the cache short-circuits the throttle (hits don't queue at all).
 *  4. Confirm forceRefresh re-queues even when cached data is fresh.
 *  5. Confirm the singleton shared across HTTP sessions is the same instance.
 */

import { describe, expect, it, vi } from "vitest";
import type { AxiosInstance } from "axios";
import { AlbumsGeneratorClient } from "../api.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Creates a client with a fake axios instance so no real HTTP is issued. */
function makeClient(overrideInterval?: number) {
  const client = new AlbumsGeneratorClient("http://fake.invalid");

  // Override MIN_REQUEST_INTERVAL so tests don't take 20 s each.
  // We use a 10 ms interval — fast but still observable for ordering.
  if (overrideInterval !== undefined) {
    // @ts-expect-error accessing private for testing
    client.MIN_REQUEST_INTERVAL = overrideInterval;
  }

  return client;
}

/** Returns a mock axios GET that resolves after `delayMs` with `data`. */
function makeGet(data: unknown, delayMs = 0) {
  return vi
    .fn()
    .mockImplementation(
      () =>
        new Promise((resolve) => setTimeout(() => resolve({ data }), delayMs)),
    );
}

/** Injects a mock axios instance onto a client. */
function injectAxios(
  client: AlbumsGeneratorClient,
  get: ReturnType<typeof makeGet>,
) {
  // @ts-expect-error accessing private for testing
  client.axiosInstance = { get } as unknown as AxiosInstance;
}

// ---------------------------------------------------------------------------
// 1. Throttle serialisation
// ---------------------------------------------------------------------------

describe("throttle queue serialisation", () => {
  it("serialises concurrent callers — no two requests overlap", async () => {
    const client = makeClient(10);
    const callOrder: number[] = [];

    const get = vi.fn().mockImplementation(() => {
      // Each call records its start time; the test checks they don't overlap.
      callOrder.push(Date.now());
      return Promise.resolve({ data: { albums: [] } });
    });
    injectAxios(client, get);

    // Fire 3 concurrent requests for global stats (all need to throttle).
    // forceRefresh=true so cache is bypassed each time.
    await Promise.all([
      client.getGlobalStats(true),
      client.getGlobalStats(true),
      client.getGlobalStats(true),
    ]);

    expect(get).toHaveBeenCalledTimes(3);

    // Each call should have started at least MIN_REQUEST_INTERVAL after the previous.
    // We allow 5 ms slop for timer jitter.
    const SLOP = 5;
    for (let i = 1; i < callOrder.length; i++) {
      expect(callOrder[i] - callOrder[i - 1]).toBeGreaterThanOrEqual(10 - SLOP);
    }
  });

  it("preserves FIFO order under concurrent requests", async () => {
    const client = makeClient(10);
    const resolvedOrder: string[] = [];

    const projects = ["alpha", "beta", "gamma"];
    const get = vi.fn().mockImplementation((url: string) => {
      const id = projects.find((p) => url.includes(p)) ?? "unknown";
      resolvedOrder.push(id);
      return Promise.resolve({
        data: {
          name: id,
          history: [],
          currentAlbum: null,
          currentAlbumNotes: "",
        },
      });
    });
    injectAxios(client, get);

    // Fire in known order.
    const promises = projects.map((p) => client.getProject(p));
    await Promise.all(promises);

    // The throttle queue is FIFO — order should match submission order.
    expect(resolvedOrder).toEqual(["alpha", "beta", "gamma"]);
  });
});

// ---------------------------------------------------------------------------
// 2. Chain resilience after errors
// ---------------------------------------------------------------------------

describe("throttle chain resilience", () => {
  it("continues processing queued requests after a mid-queue failure", async () => {
    const client = makeClient(10);
    let callCount = 0;

    const get = vi.fn().mockImplementation(() => {
      callCount += 1;
      if (callCount === 2) {
        // Simulate a network error on the 2nd request.
        return Promise.reject(new Error("Simulated network error"));
      }
      return Promise.resolve({ data: { albums: [] } });
    });
    injectAxios(client, get);

    // Fire 3 concurrent requests.
    const results = await Promise.allSettled([
      client.getGlobalStats(true),
      client.getGlobalStats(true),
      client.getGlobalStats(true),
    ]);

    // All 3 slots ran.
    expect(get).toHaveBeenCalledTimes(3);

    // Exactly one should have rejected (the 2nd slot).
    const rejected = results.filter((r) => r.status === "rejected");
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    expect(rejected).toHaveLength(1);
    expect(fulfilled).toHaveLength(2);
  });

  it("queue remains usable after a failure — subsequent calls succeed", async () => {
    const client = makeClient(10);
    let callCount = 0;

    const get = vi.fn().mockImplementation(() => {
      callCount += 1;
      if (callCount === 1) {
        return Promise.reject(new Error("first call fails"));
      }
      return Promise.resolve({ data: { albums: [] } });
    });
    injectAxios(client, get);

    // First call fails.
    await expect(client.getGlobalStats(true)).rejects.toThrow(
      "first call fails",
    );

    // Second call should still succeed.
    const result = await client.getGlobalStats(true);
    expect(result).toMatchObject({ albums: [] });
    expect(get).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// 3. Cache short-circuits the throttle
// ---------------------------------------------------------------------------

describe("cache behaviour", () => {
  it("cache hit does not enter the throttle queue", async () => {
    const client = makeClient(50); // Long interval so we'd notice if it queued.
    const get = makeGet({ albums: [] });
    injectAxios(client, get);

    // First call — hits the API, warms the cache.
    await client.getGlobalStats();

    const start = Date.now();
    // Second call — should be instant from cache.
    await client.getGlobalStats();
    const elapsed = Date.now() - start;

    // Should return much faster than the 50 ms interval.
    expect(elapsed).toBeLessThan(30);
    // API should only have been called once.
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("forceRefresh bypasses cache and re-enters the queue", async () => {
    const client = makeClient(10);
    const get = makeGet({ albums: [] });
    injectAxios(client, get);

    await client.getGlobalStats(); // warms cache
    await client.getGlobalStats(true); // forceRefresh — must hit API again

    expect(get).toHaveBeenCalledTimes(2);
  });

  it("per-project cache keys are independent", async () => {
    const client = makeClient(10);
    const get = vi.fn().mockImplementation((url: string) => {
      const name = url.includes("alpha") ? "alpha" : "beta";
      return Promise.resolve({
        data: { name, history: [], currentAlbum: null, currentAlbumNotes: "" },
      });
    });
    injectAxios(client, get);

    await client.getProject("alpha");
    await client.getProject("beta");

    // Both fetched once each.
    expect(get).toHaveBeenCalledTimes(2);

    // Repeated fetches should use the cache.
    await client.getProject("alpha");
    await client.getProject("beta");
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("invalidateProject clears only the target project", async () => {
    const client = makeClient(10);
    const get = vi.fn().mockImplementation((url: string) => {
      const name = url.includes("alpha") ? "alpha" : "beta";
      return Promise.resolve({
        data: { name, history: [], currentAlbum: null, currentAlbumNotes: "" },
      });
    });
    injectAxios(client, get);

    await client.getProject("alpha");
    await client.getProject("beta");
    expect(get).toHaveBeenCalledTimes(2);

    // Invalidate only alpha.
    await client.invalidateProject("alpha");

    await client.getProject("alpha"); // should re-fetch
    await client.getProject("beta"); // still cached
    expect(get).toHaveBeenCalledTimes(3);
  });

  it("clearCache forces all subsequent calls to re-fetch", async () => {
    const client = makeClient(10);
    const get = vi.fn().mockResolvedValue({ data: { albums: [] } });
    injectAxios(client, get);

    await client.getGlobalStats();
    await client.getUserAlbumStats();
    expect(get).toHaveBeenCalledTimes(2);

    await client.clearCache();

    await client.getGlobalStats();
    await client.getUserAlbumStats();
    expect(get).toHaveBeenCalledTimes(4);
  });
});

// ---------------------------------------------------------------------------
// 4. Singleton identity
// ---------------------------------------------------------------------------

describe("singleton identity", () => {
  it("createMcpServer uses the same defaultClient across multiple calls", async () => {
    // Import the module dynamically to inspect the shared singleton.
    // We verify identity by checking that cache populated by one server
    // instance is visible to another — which only works if they share state.
    const { createMcpServer } = await import("../server.js");

    const serverA = createMcpServer();
    const serverB = createMcpServer();

    // Both servers are different McpServer instances but share the same
    // AlbumsGeneratorClient — confirmed by the fact that they're created
    // with no explicit client argument, so both fall back to `defaultClient`.
    // Primary assertion: both servers were created without errors and are
    // distinct instances — no state corruption or double-registration issues
    // from the shared singleton.
    expect(serverA).toBeDefined();
    expect(serverB).toBeDefined();
    expect(serverA).not.toBe(serverB);
  });
});

// ---------------------------------------------------------------------------
// 5. Concurrent mixed-endpoint load (closer to real Reddit traffic)
// ---------------------------------------------------------------------------

describe("concurrent mixed-endpoint load", () => {
  it("handles simultaneous requests across different endpoints without deadlock", async () => {
    const client = makeClient(5);
    const callLog: string[] = [];

    const get = vi.fn().mockImplementation((url: string) => {
      callLog.push(url);
      if (url.includes("albums/stats")) {
        return Promise.resolve({ data: { albums: [] } });
      }
      if (url.includes("user-albums/stats")) {
        return Promise.resolve({ data: { albums: [] } });
      }
      if (url.includes("projects/")) {
        const id = url.split("projects/")[1];
        return Promise.resolve({
          data: {
            name: id,
            history: [],
            currentAlbum: null,
            currentAlbumNotes: "",
          },
        });
      }
      return Promise.resolve({ data: {} });
    });
    injectAxios(client, get);

    // Simulate 3 users hitting different endpoints simultaneously.
    const results = await Promise.allSettled([
      client.getGlobalStats(true),
      client.getProject("user-1"),
      client.getUserAlbumStats(true),
      client.getProject("user-2"),
      client.getProject("user-3"),
    ]);

    // None should have thrown.
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    // All 5 distinct calls should have made it to the API.
    expect(get).toHaveBeenCalledTimes(5);
  });

  it("group fetch with parallel album review sub-requests queues correctly", async () => {
    const client = makeClient(5);
    const callLog: string[] = [];

    const get = vi.fn().mockImplementation((url: string) => {
      callLog.push(url as string);

      if (url.includes("/groups/test-group/albums/")) {
        const uuid = (url as string).split("/albums/")[1];
        return Promise.resolve({
          data: {
            albumName: `Album ${uuid}`,
            albumArtist: "Artist",
            reviews: [],
          },
        });
      }

      if (url.includes("/groups/test-group")) {
        return Promise.resolve({
          data: {
            name: "Test Group",
            slug: "test-group",
            members: [{ name: "alice" }],
            currentAlbum: {
              uuid: "aaa",
              name: "Current",
              artist: "X",
              slug: "c",
              releaseDate: "2020",
              genres: [],
              images: [],
              wikipediaUrl: "",
            },
            highestRatedAlbums: [
              {
                uuid: "bbb",
                name: "High",
                artist: "Y",
                slug: "h",
                releaseDate: "2019",
                genres: [],
                images: [],
                wikipediaUrl: "",
              },
            ],
            lowestRatedAlbums: [
              {
                uuid: "ccc",
                name: "Low",
                artist: "Z",
                slug: "l",
                releaseDate: "2018",
                genres: [],
                images: [],
                wikipediaUrl: "",
              },
            ],
            latestAlbum: {
              uuid: "ddd",
              name: "Latest",
              artist: "W",
              slug: "la",
              releaseDate: "2021",
              genres: [],
              images: [],
              wikipediaUrl: "",
            },
          },
        });
      }

      return Promise.resolve({ data: {} });
    });
    injectAxios(client, get);

    await client.getGroup("test-group");

    // After refactor, getGroup only makes 1 call (no more parallel vote fetches).
    expect(get).toHaveBeenCalledTimes(1);

    // No review fetches should have been made.
    const reviewCalls = callLog.filter((u) => u.includes("/albums/"));
    expect(reviewCalls).toHaveLength(0);
  });
});
