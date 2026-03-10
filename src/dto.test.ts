import { describe, expect, it } from "vitest";
import {
  slimAlbum,
  slimAlbumStat,
  slimGroupInfo,
  slimHistoryEntry,
} from "./dto.js";
import { makeAlbum, makeAlbumStat, makeGroupInfo, makeHistoryEntry } from "./test/fixtures.js";

describe("dto", () => {
  it("slimAlbum strips heavy fields and preserves key fields", () => {
    const source = makeAlbum({
      artistOrigin: "UK",
      styles: ["Art Rock"],
      spotifyId: "sp",
      wikipediaUrl: "wiki",
      subGenres: ["Prog"],
      images: [{ url: "x", width: 1, height: 1 }],
    });
    const slim = slimAlbum(source);
    expect(slim).toMatchObject({
      uuid: source.uuid,
      slug: source.slug,
      name: source.name,
      artist: source.artist,
      releaseDate: source.releaseDate,
      genres: source.genres,
      styles: source.styles,
      artistOrigin: "UK",
    });
    expect(slim).not.toHaveProperty("images");
    expect(slim).not.toHaveProperty("spotifyId");
    expect(slim).not.toHaveProperty("wikipediaUrl");
    expect(slim).not.toHaveProperty("subGenres");

    const noOptional = slimAlbum(makeAlbum({ styles: undefined, artistOrigin: undefined }));
    expect(noOptional).not.toHaveProperty("styles");
    expect(noOptional).not.toHaveProperty("artistOrigin");
  });

  it("slimHistoryEntry strips review/revealedAlbum and normalizes rating", () => {
    const s1 = slimHistoryEntry(makeHistoryEntry({ review: "abc", revealedAlbum: true, rating: "4" }));
    expect(s1).toMatchObject({ generatedAlbumId: "entry-001", rating: null });
    expect(s1).not.toHaveProperty("review");
    expect(s1).not.toHaveProperty("revealedAlbum");
    expect(s1.album).not.toHaveProperty("images");

    const s2 = slimHistoryEntry(makeHistoryEntry({ rating: undefined }));
    expect(s2.rating).toBeNull();
  });

  it("slimAlbumStat preserves expected fields", () => {
    const stat = makeAlbumStat();
    expect(slimAlbumStat(stat)).toMatchObject(stat);
    const noDate = slimAlbumStat(makeAlbumStat({ releaseDate: undefined }));
    expect(noDate).not.toHaveProperty("releaseDate");
  });

  it("slimGroupInfo shape", () => {
    const group = makeGroupInfo({
      currentAlbum: makeAlbum(),
      allTimeHighscore: makeAlbum({ uuid: "bbbbbbbbbbbbbbbbbbbbbbbb" }),
      allTimeLowscore: makeAlbum({ uuid: "cccccccccccccccccccccccc" }),
      latestAlbum: makeAlbum({ uuid: "dddddddddddddddddddddddd" }),
    });

    const slim = slimGroupInfo(group);
    expect(slim.members).toEqual(group.members);
    expect(slim.currentAlbum).not.toBeNull();
    expect(slim.allTimeHighscore?.uuid).toBe("bbbbbbbbbbbbbbbbbbbbbbbb");
    expect(slim.allTimeLowscore?.uuid).toBe("cccccccccccccccccccccccc");
    expect(slim.latestAlbum?.uuid).toBe("dddddddddddddddddddddddd");
    expect(slim).not.toHaveProperty("latestAlbumWithVotes");
  });
});
