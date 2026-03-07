import type {
  Album,
  AlbumStat,
  GroupInfo,
  GroupMember,
  ProjectInfo,
  UserAlbumHistoryEntry,
} from "../api.js";

export function makeAlbum(overrides: Partial<Album> = {}): Album {
  return {
    uuid: "aaaaaaaaaaaaaaaaaaaaaaaa",
    slug: "test-album",
    name: "Test Album",
    artist: "Test Artist",
    releaseDate: "1975",
    genres: ["Rock"],
    styles: ["Classic Rock"],
    images: [],
    wikipediaUrl: "",
    spotifyId: undefined,
    appleMusicId: undefined,
    tidalId: undefined,
    amazonMusicId: undefined,
    youtubeMusicId: undefined,
    qobuzId: undefined,
    deezerId: undefined,
    ...overrides,
  };
}

export function makeHistoryEntry(
  overrides: Partial<UserAlbumHistoryEntry> = {},
): UserAlbumHistoryEntry {
  return {
    generatedAlbumId: "entry-001",
    album: makeAlbum(),
    rating: 4,
    review: "",
    globalRating: 3.8,
    generatedAt: "2024-01-01T00:00:00.000Z",
    votedAt: "2024-01-02T00:00:00.000Z",
    ...overrides,
  };
}

export function makeProjectInfo(overrides: Partial<ProjectInfo> = {}): ProjectInfo {
  return {
    name: "test-project",
    history: [],
    currentAlbum: null,
    currentAlbumNotes: "",
    ...overrides,
  };
}

export function makeAlbumStat(overrides: Partial<AlbumStat> = {}): AlbumStat {
  return {
    name: "Test Album",
    artist: "Test Artist",
    averageRating: 4.0,
    votes: 1000,
    genres: ["Rock"],
    controversialScore: 0.1,
    releaseDate: "1975",
    votesByGrade: { "1": 10, "2": 20, "3": 100, "4": 400, "5": 470 },
    ...overrides,
  };
}

export function makeGroupMember(name: string): GroupMember {
  return {
    name,
    projectIdentifier: name,
  };
}

export function makeGroupInfo(overrides: Partial<GroupInfo> = {}): GroupInfo {
  return {
    name: "test-group",
    slug: "test-group",
    members: [makeGroupMember("alice"), makeGroupMember("bob")],
    currentAlbum: null,
    allTimeHighscore: null,
    allTimeLowscore: null,
    latestAlbumWithVotes: null,
    ...overrides,
  };
}
