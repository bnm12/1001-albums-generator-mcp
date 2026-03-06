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
  albumName: string;
  albumArtist: string;
  averageRating: number;
  votes: number;
  genres: string[];
  controversialScore: number;
}

export interface GlobalStats {
  stats: AlbumStat[];
}

export interface UserAlbumHistoryEntry {
  generatedAlbumId: string;
  album: Album;
  rating: number;
  review: string;
  votedAt?: string;
  generatedAt?: string;
  revealedAlbum?: boolean;
  globalRating?: number;
}

export interface UserAlbumStats {
  name: string;
  totalVotes: number;
  stats: UserAlbumHistoryEntry[];
}

export interface ProjectInfo {
  name: string;
  history: UserAlbumHistoryEntry[];
  currentAlbum: Album | null;
  currentAlbumNotes: string;
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

  clearCache() {
    this.globalStatsCache = null;
    this.userStatsCache = null;
    this.projectsCache.clear();
  }
}
