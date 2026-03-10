import axios, { AxiosInstance } from 'axios';
import { CacheStore, InMemoryCache, CacheKeys } from './cache.js';

export interface Album {
  uuid: string;
  name: string;
  artist: string;
  artistOrigin?: string;
  slug: string;
  images: { url: string; width: number; height: number }[];
  releaseDate: string;
  genres: string[];
  styles?: string[];
  subGenres?: string[];
  spotifyId?: string;
  appleMusicId?: string;
  tidalId?: number;
  amazonMusicId?: string;
  youtubeMusicId?: string;
  qobuzId?: string;
  deezerId?: string;
  wikipediaUrl: string;
  globalReviewsUrl?: string;
}

export interface AlbumStat {
  name: string;
  artist: string;
  averageRating: number;
  votes: number;
  genres: string[];
  controversialScore: number;
  releaseDate?: string;
  votesByGrade?: { [key: string]: number };
}

export interface GlobalStats {
  albums: AlbumStat[];
}

export interface UserAlbumHistoryEntry {
  generatedAlbumId: string;
  album: Album;
  rating: number | string | undefined | null;
  review: string;
  votedAt?: string;
  generatedAt?: string;
  revealedAlbum?: boolean;
  globalRating?: number;
}

export interface UserAlbumStats {
  albums: AlbumStat[];
}

export interface ProjectInfo {
  name: string;
  history: UserAlbumHistoryEntry[];
  currentAlbum: Album | null;
  currentAlbumNotes: string;
}

export interface GroupMember {
  name: string;
  projectIdentifier: string;
}

export interface GroupInfo {
  name: string;
  slug: string;
  members: GroupMember[];
  currentAlbum: Album | null;
  allTimeHighscore: Album | null;
  allTimeLowscore: Album | null;
  latestAlbum: Album | null;
}

export interface GroupAlbumReview {
  projectIdentifier: string;
  rating: number | null;
  review: string;
}

export interface GroupAlbumReviews {
  album: Album;
  reviews: GroupAlbumReview[];
}

export class AlbumsGeneratorClient {
  private axiosInstance: AxiosInstance;
  private throttlePromise: Promise<void> = Promise.resolve();
  private readonly MIN_REQUEST_INTERVAL = 20000; // 3 requests per minute = 1 request every 20 seconds
  private readonly CACHE_TTL = 4 * 60 * 60 * 1000; // 4 hours
  private cache: CacheStore;

  constructor(
    baseURL: string = 'https://1001albumsgenerator.com/api/v1',
    cache?: CacheStore,
  ) {
    this.axiosInstance = axios.create({
      baseURL,
    });
    this.cache = cache ?? new InMemoryCache();
  }

  private async throttle() {
    const nextThrottle = this.throttlePromise.then(async () => {
      await new Promise((resolve) => setTimeout(resolve, this.MIN_REQUEST_INTERVAL));
    });

    const currentThrottle = this.throttlePromise;
    this.throttlePromise = nextThrottle;
    await currentThrottle;
  }

  async getGlobalStats(forceRefresh = false): Promise<GlobalStats> {
    if (!forceRefresh) {
      try {
        const cached = await this.cache.get<GlobalStats>(CacheKeys.global);
        if (cached) return cached;
      } catch (err) {
        console.error('[cache] get error for global stats, falling through to API:', err);
      }
    }

    await this.throttle();
    const response = await this.axiosInstance.get('/albums/stats');
    const result = response.data;

    try {
      await this.cache.set(CacheKeys.global, result, this.CACHE_TTL);
    } catch (err) {
      console.error('[cache] set error for global stats, continuing without caching:', err);
    }

    return result;
  }

  async getUserAlbumStats(forceRefresh = false): Promise<UserAlbumStats> {
    if (!forceRefresh) {
      try {
        const cached = await this.cache.get<UserAlbumStats>(CacheKeys.user);
        if (cached) return cached;
      } catch (err) {
        console.error('[cache] get error for user stats, falling through to API:', err);
      }
    }

    await this.throttle();
    const response = await this.axiosInstance.get('/user-albums/stats');
    const result = response.data;

    try {
      await this.cache.set(CacheKeys.user, result, this.CACHE_TTL);
    } catch (err) {
      console.error('[cache] set error for user stats, continuing without caching:', err);
    }

    return result;
  }

  async getProject(projectIdentifier: string, forceRefresh = false): Promise<ProjectInfo> {
    if (!forceRefresh) {
      try {
        const cached = await this.cache.get<ProjectInfo>(CacheKeys.project(projectIdentifier));
        if (cached) return cached;
      } catch (err) {
        console.error(`[cache] get error for project ${projectIdentifier}, falling through to API:`, err);
      }
    }

    await this.throttle();
    const response = await this.axiosInstance.get(`/projects/${projectIdentifier}`);
    const result = response.data;

    try {
      await this.cache.set(CacheKeys.project(projectIdentifier), result, this.CACHE_TTL);
    } catch (err) {
      console.error(`[cache] set error for project ${projectIdentifier}, continuing without caching:`, err);
    }

    return result;
  }

  async getGroup(groupSlug: string, forceRefresh = false): Promise<GroupInfo> {
    if (!forceRefresh) {
      try {
        const cached = await this.cache.get<GroupInfo>(CacheKeys.group(groupSlug));
        if (cached) return cached;
      } catch (err) {
        console.error(`[cache] get error for group ${groupSlug}, falling through to API:`, err);
      }
    }

    await this.throttle();
    const response = await this.axiosInstance.get(`/groups/${groupSlug}`);
    const data = response.data;

    // Map API fields to GroupInfo
    const groupInfo: GroupInfo = {
      name: data.name,
      slug: data.slug,
      members: (data.members || []).map((m: any) => {
        const name = typeof m === "string" ? m : m.name;
        return { name, projectIdentifier: name };
      }),
      currentAlbum: data.currentAlbum ?? null,
      allTimeHighscore: data.highestRatedAlbums?.[0] ?? null,
      allTimeLowscore: data.lowestRatedAlbums?.[0] ?? null,
      latestAlbum: data.latestAlbum ?? null,
    };

    try {
      await this.cache.set(CacheKeys.group(groupSlug), groupInfo, this.CACHE_TTL);
    } catch (err) {
      console.error(`[cache] set error for group ${groupSlug}, continuing without caching:`, err);
    }

    return groupInfo;
  }

  async getGroupAlbumReviews(
    groupSlug: string,
    albumUuid: string,
    forceRefresh = false
  ): Promise<GroupAlbumReviews> {
    const cacheKey = CacheKeys.groupAlbum(groupSlug, albumUuid);
    if (!forceRefresh) {
      try {
        const cached = await this.cache.get<GroupAlbumReviews>(cacheKey);
        if (cached) return cached;
      } catch (err) {
        console.error(`[cache] get error for group album reviews ${cacheKey}, falling through to API:`, err);
      }
    }

    await this.throttle();
    const response = await this.axiosInstance.get(`/groups/${groupSlug}/albums/${albumUuid}`);
    const data = response.data;

    const albumReviews: GroupAlbumReviews = {
      album: {
        uuid: albumUuid,
        name: data.albumName,
        artist: data.albumArtist,
        // The endpoint doesn't return full metadata, so we fill what we have
        slug: '',
        images: [],
        releaseDate: '',
        genres: [],
        wikipediaUrl: '',
      },
      reviews: (data.reviews || []).map((r: any) => ({
        projectIdentifier: r.projectName,
        rating: r.rating,
        review: r.review,
      })),
    };

    try {
      await this.cache.set(cacheKey, albumReviews, this.CACHE_TTL);
    } catch (err) {
      console.error(`[cache] set error for group album reviews ${cacheKey}, continuing without caching:`, err);
    }

    return albumReviews;
  }

  async invalidateGlobalStats(): Promise<void> {
    try {
      await this.cache.delete(CacheKeys.global);
    } catch (err) {
      console.error('[cache] delete error for global stats:', err);
    }
  }

  async invalidateUserStats(): Promise<void> {
    try {
      await this.cache.delete(CacheKeys.user);
    } catch (err) {
      console.error('[cache] delete error for user stats:', err);
    }
  }

  async invalidateProject(projectIdentifier: string): Promise<void> {
    try {
      await this.cache.delete(CacheKeys.project(projectIdentifier));
    } catch (err) {
      console.error(`[cache] delete error for project ${projectIdentifier}:`, err);
    }
  }

  async invalidateGroup(groupSlug: string): Promise<void> {
    try {
      await this.cache.delete(CacheKeys.group(groupSlug));
      await this.cache.deleteByPrefix(CacheKeys.groupAlbumPrefix(groupSlug));
    } catch (err) {
      console.error(`[cache] delete error for group ${groupSlug}:`, err);
    }
  }

  async clearCache(): Promise<void> {
    try {
      await this.cache.clearAll();
    } catch (err) {
      console.error('[cache] clear error:', err);
    }
  }
}
