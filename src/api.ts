import axios, { AxiosInstance } from 'axios';

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

export interface GroupAlbumWithVotes {
  album: Album;
  votes: { projectIdentifier: string; rating: number | null }[];
}

export interface GroupInfo {
  name: string;
  slug: string;
  members: GroupMember[];
  currentAlbum: Album | null;
  allTimeHighscore: GroupAlbumWithVotes | null;
  allTimeLowscore: GroupAlbumWithVotes | null;
  latestAlbumWithVotes: GroupAlbumWithVotes | null;
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

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

export class AlbumsGeneratorClient {
  private axiosInstance: AxiosInstance;
  private throttlePromise: Promise<void> = Promise.resolve();
  private readonly MIN_REQUEST_INTERVAL = 20000; // 3 requests per minute = 1 request every 20 seconds
  private readonly CACHE_TTL = 4 * 60 * 60 * 1000; // 4 hours

  private globalStatsCache: CacheEntry<GlobalStats> | null = null;
  private userStatsCache: CacheEntry<UserAlbumStats> | null = null;
  private projectsCache: Map<string, CacheEntry<ProjectInfo>> = new Map();
  private groupsCache: Map<string, CacheEntry<GroupInfo>> = new Map();
  private groupAlbumReviewsCache: Map<string, CacheEntry<GroupAlbumReviews>> = new Map();

  constructor(baseURL: string = 'https://1001albumsgenerator.com/api/v1') {
    this.axiosInstance = axios.create({
      baseURL,
    });
  }

  private async throttle() {
    const nextThrottle = this.throttlePromise.then(async () => {
      await new Promise((resolve) => setTimeout(resolve, this.MIN_REQUEST_INTERVAL));
    });

    const currentThrottle = this.throttlePromise;
    this.throttlePromise = nextThrottle;
    await currentThrottle;
  }

  private isCacheValid<T>(entry: CacheEntry<T> | null | undefined): entry is CacheEntry<T> {
    if (!entry) return false;
    return Date.now() - entry.timestamp < this.CACHE_TTL;
  }

  async getGlobalStats(forceRefresh = false): Promise<GlobalStats> {
    if (!forceRefresh && this.isCacheValid(this.globalStatsCache)) {
      return this.globalStatsCache.data;
    }
    await this.throttle();
    const response = await this.axiosInstance.get('/albums/stats');
    this.globalStatsCache = {
      data: response.data,
      timestamp: Date.now(),
    };
    return response.data;
  }

  async getUserAlbumStats(forceRefresh = false): Promise<UserAlbumStats> {
    if (!forceRefresh && this.isCacheValid(this.userStatsCache)) {
      return this.userStatsCache.data;
    }
    await this.throttle();
    const response = await this.axiosInstance.get('/user-albums/stats');
    this.userStatsCache = {
      data: response.data,
      timestamp: Date.now(),
    };
    return response.data;
  }

  async getProject(projectIdentifier: string, forceRefresh = false): Promise<ProjectInfo> {
    const cached = this.projectsCache.get(projectIdentifier);
    if (!forceRefresh && this.isCacheValid(cached)) {
      return cached.data;
    }
    await this.throttle();
    const response = await this.axiosInstance.get(`/projects/${projectIdentifier}`);
    this.projectsCache.set(projectIdentifier, {
      data: response.data,
      timestamp: Date.now(),
    });
    return response.data;
  }

  async getGroup(groupSlug: string, forceRefresh = false): Promise<GroupInfo> {
    const cached = this.groupsCache.get(groupSlug);
    if (!forceRefresh && this.isCacheValid(cached)) {
      return cached.data;
    }
    await this.throttle();
    const response = await this.axiosInstance.get(`/groups/${groupSlug}`);
    const data = response.data;

    // Map API fields to GroupInfo
    const groupInfo: GroupInfo = {
      name: data.name,
      slug: data.slug,
      members: (data.members || []).map((m: any) => ({
        name: m.name,
        projectIdentifier: m.name, // The API doesn't seem to provide a separate identifier, use name
      })),
      currentAlbum: data.currentAlbum || null,
      allTimeHighscore: data.highestRatedAlbums?.[0]
        ? {
            album: data.highestRatedAlbums[0],
            votes: [], // Group endpoint doesn't return member-specific votes for high/low scores
          }
        : null,
      allTimeLowscore: data.lowestRatedAlbums?.[0]
        ? {
            album: data.lowestRatedAlbums[0],
            votes: [],
          }
        : null,
      latestAlbumWithVotes: data.latestAlbum
        ? {
            album: data.latestAlbum,
            votes: [], // To be populated if needed, or left empty if not provided by this endpoint
          }
        : null,
    };

    this.groupsCache.set(groupSlug, {
      data: groupInfo,
      timestamp: Date.now(),
    });
    return groupInfo;
  }

  async getGroupAlbumReviews(
    groupSlug: string,
    albumUuid: string,
    forceRefresh = false
  ): Promise<GroupAlbumReviews> {
    const cacheKey = `${groupSlug}:${albumUuid}`;
    const cached = this.groupAlbumReviewsCache.get(cacheKey);
    if (!forceRefresh && this.isCacheValid(cached)) {
      return cached.data;
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

    this.groupAlbumReviewsCache.set(cacheKey, {
      data: albumReviews,
      timestamp: Date.now(),
    });
    return albumReviews;
  }

  clearCache() {
    this.globalStatsCache = null;
    this.userStatsCache = null;
    this.projectsCache.clear();
    this.groupsCache.clear();
    this.groupAlbumReviewsCache.clear();
  }
}
