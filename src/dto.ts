import type {
  Album,
  AlbumStat,
  GroupAlbumWithVotes,
  GroupInfo,
  UserAlbumHistoryEntry,
} from "./api.js";

export interface SlimAlbum {
  uuid: string;
  slug: string;
  name: string;
  artist: string;
  artistOrigin?: string;
  releaseDate: string;
  genres: string[];
  styles?: string[];
}

export function slimAlbum(album: Album): SlimAlbum {
  return {
    uuid: album.uuid,
    slug: album.slug,
    name: album.name,
    artist: album.artist,
    ...(album.artistOrigin !== undefined && { artistOrigin: album.artistOrigin }),
    releaseDate: album.releaseDate,
    genres: album.genres,
    ...(album.styles !== undefined && { styles: album.styles }),
  };
}

export interface SlimHistoryEntry {
  generatedAlbumId: string;
  album: SlimAlbum;
  rating: number | null;
  globalRating?: number;
  generatedAt?: string;
  votedAt?: string;
}

export function slimHistoryEntry(entry: UserAlbumHistoryEntry): SlimHistoryEntry {
  return {
    generatedAlbumId: entry.generatedAlbumId,
    album: slimAlbum(entry.album),
    rating: typeof entry.rating === "number" ? entry.rating : null,
    ...(entry.globalRating !== undefined && { globalRating: entry.globalRating }),
    ...(entry.generatedAt !== undefined && { generatedAt: entry.generatedAt }),
    ...(entry.votedAt !== undefined && { votedAt: entry.votedAt }),
  };
}

export interface SlimAlbumStat {
  name: string;
  artist: string;
  releaseDate?: string;
  genres: string[];
  votes: number;
  averageRating: number;
  controversialScore: number;
  votesByGrade?: { [key: string]: number };
}

export function slimAlbumStat(stat: AlbumStat): SlimAlbumStat {
  return {
    name: stat.name,
    artist: stat.artist,
    ...(stat.releaseDate !== undefined && { releaseDate: stat.releaseDate }),
    genres: stat.genres,
    votes: stat.votes,
    averageRating: stat.averageRating,
    controversialScore: stat.controversialScore,
    ...(stat.votesByGrade !== undefined && { votesByGrade: stat.votesByGrade }),
  };
}

export interface SlimGroupAlbumWithVotes {
  album: SlimAlbum;
  votes: { projectIdentifier: string; rating: number | null }[];
}

export function slimGroupAlbumWithVotes(
  entry: GroupAlbumWithVotes,
): SlimGroupAlbumWithVotes {
  return {
    album: slimAlbum(entry.album),
    votes: entry.votes,
  };
}

export interface SlimGroupScoreAlbum {
  album: SlimAlbum;
  averageRating: number;
}

export function slimGroupScoreAlbum(entry: GroupAlbumWithVotes): SlimGroupScoreAlbum {
  const ratedVotes = entry.votes.filter((v) => v.rating !== null);
  const averageRating =
    ratedVotes.length > 0
      ? Math.round(
          (ratedVotes.reduce((sum, v) => sum + (v.rating as number), 0) /
            ratedVotes.length) *
            100,
        ) / 100
      : 0;

  return {
    album: slimAlbum(entry.album),
    averageRating,
  };
}

export interface SlimGroupInfo {
  name: string;
  slug: string;
  members: { name: string; projectIdentifier: string }[];
  currentAlbum: SlimAlbum | null;
  allTimeHighscore: SlimGroupScoreAlbum | null;
  allTimeLowscore: SlimGroupScoreAlbum | null;
}

export function slimGroupInfo(group: GroupInfo): SlimGroupInfo {
  return {
    name: group.name,
    slug: group.slug,
    members: group.members,
    currentAlbum: group.currentAlbum ? slimAlbum(group.currentAlbum) : null,
    allTimeHighscore: group.allTimeHighscore
      ? slimGroupScoreAlbum(group.allTimeHighscore)
      : null,
    allTimeLowscore: group.allTimeLowscore
      ? slimGroupScoreAlbum(group.allTimeLowscore)
      : null,
  };
}

export interface ArcSegment {
  label: string;
  character: string;
  start_index: number;
  end_index: number;
  album_count: number;
  rated_count: number;
  avg_rating: number | null;
  avg_community_delta: number | null;
  top_genres: string[];
  date_range: { from: string; to: string };
}

export interface ArcMilestone {
  type:
    | "first_five_star"
    | "first_one_star"
    | "highest_rated"
    | "lowest_rated"
    | "biggest_community_agree"
    | "biggest_community_disagree"
    | "longest_rated_streak"
    | "rating_peak"
    | "rating_trough";
  album: { name: string; artist: string; generatedAlbumId: string };
  position: number;
  value: number;
}

export interface ListeningArcPayload {
  metadata: {
    total_albums: number;
    rated_albums: number;
    history_span_days: number;
    window: "recent" | "full";
    too_short_for_arc: boolean;
  };
  arc_segments: ArcSegment[];
  milestones: ArcMilestone[];
  trend_data: {
    rating_rolling_avg: { position: number; avg: number; label: string }[];
    community_alignment: { position: number; avg_delta: number }[];
  };
}
