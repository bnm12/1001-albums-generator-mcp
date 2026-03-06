import axios, { AxiosInstance } from 'axios';

export interface Album {
  name: string;
  artist: string;
  images: { url: string; width: number; height: number }[];
  releaseDate: string;
  spotifyId: string;
  wikipediaUrl: string;
  genres: string[];
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
  album: Album;
  rating: number;
  review: string;
  votedAt: string;
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

export class AlbumsGeneratorClient {
  private axiosInstance: AxiosInstance;
  private lastRequestTime: number = 0;
  private readonly MIN_REQUEST_INTERVAL = 20000; // 3 requests per minute = 1 request every 20 seconds

  constructor(baseURL: string = 'https://1001albumsgenerator.com/api/v1') {
    this.axiosInstance = axios.create({
      baseURL,
    });
  }

  private async throttle() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.MIN_REQUEST_INTERVAL) {
      const waitTime = this.MIN_REQUEST_INTERVAL - timeSinceLastRequest;
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
    this.lastRequestTime = Date.now();
  }

  async getGlobalStats(): Promise<GlobalStats> {
    await this.throttle();
    const response = await this.axiosInstance.get('/albums/stats');
    return response.data;
  }

  async getUserAlbumStats(): Promise<UserAlbumStats> {
    await this.throttle();
    const response = await this.axiosInstance.get('/user-albums/stats');
    return response.data;
  }

  async getProject(projectIdentifier: string): Promise<ProjectInfo> {
    await this.throttle();
    const response = await this.axiosInstance.get(`/projects/${projectIdentifier}`);
    return response.data;
  }
}
