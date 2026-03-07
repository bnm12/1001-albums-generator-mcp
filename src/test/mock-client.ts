import type { AlbumsGeneratorClient } from "../api.js";
import { vi } from "vitest";
import type { Mocked } from "vitest";

export function makeMockClient(): Mocked<AlbumsGeneratorClient> {
  return {
    getProject: vi.fn(),
    getGlobalStats: vi.fn(),
    getUserAlbumStats: vi.fn(),
    getGroup: vi.fn(),
    getGroupAlbumReviews: vi.fn(),
    invalidateGlobalStats: vi.fn(),
    invalidateUserStats: vi.fn(),
    invalidateProject: vi.fn(),
    invalidateGroup: vi.fn(),
    clearCache: vi.fn(),
  } as unknown as Mocked<AlbumsGeneratorClient>;
}
