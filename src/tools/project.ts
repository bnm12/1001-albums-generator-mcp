import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { AlbumsGeneratorClient } from "../api.js";
import { calculateProjectStats, getRatedEntries, getYear, requireParam } from "../helpers.js";
import { makeRegisterTool } from "./register-tool.js";

export function registerProjectTools(
  server: McpServer,
  client: AlbumsGeneratorClient,
): void {
  const registerTool = makeRegisterTool(server);

  registerTool(
    "get_album_of_the_day",
    "Returns the current album assigned to a project for today, including full album metadata and any notes added by the project owner. This is the album the user is currently listening to and has not yet rated. Requires a projectIdentifier. Data is cached for 4 hours.",
    {
      projectIdentifier: z.string().describe("The name of the project or the sharerId"),
    },
    async ({ projectIdentifier }) => {
      const pid = requireParam(projectIdentifier, "projectIdentifier");
      if (typeof pid === "object" && "error" in pid) return pid.response;
      const project = await client.getProject(pid);
      return {
        content: [{ type: "text", text: JSON.stringify({ currentAlbum: project.currentAlbum, currentAlbumNotes: project.currentAlbumNotes }, null, 2) }],
      };
    },
    true,
  );

  registerTool(
    "get_project_stats",
    'Returns summary statistics for a specific project: total albums generated, number rated, number unrated, current album of the day (with full detail), update frequency, and group membership. Use this when asked about a user\'s progress — e.g. "how many albums has the user rated?" or "what is the user\'s current album?". For the full rated/unrated history, use list_project_history. Requires a projectIdentifier (project name or sharerId). Data is cached for 4 hours.',
    {
      projectIdentifier: z.string().describe("The name of the project or the sharerId"),
    },
    async ({ projectIdentifier }) => {
      const pid = requireParam(projectIdentifier, "projectIdentifier");
      if (typeof pid === "object" && "error" in pid) return pid.response;
      const project = await client.getProject(pid);
      const { history, ...summary } = project;
      const stats = calculateProjectStats(history);
      const currentAlbum = project.currentAlbum
        ? (() => {
            const { images, slug, ...rest } = project.currentAlbum;
            return rest;
          })()
        : null;
      return {
        content: [{ type: "text", text: JSON.stringify({ ...summary, currentAlbum, ...stats }, null, 2) }],
      };
    },
    true,
  );

  registerTool(
    "list_project_history",
    "Returns the full generated history for a project. Each entry includes: generatedAlbumId, album name, artist, release year, genres, the user's rating (1–5, or null if unrated), global community rating, and date generated. Reviews and full album detail (streaming IDs, images, Wikipedia, subgenres) are intentionally omitted to keep the response manageable — use get_album_detail to retrieve complete information for a specific album. Use this to browse, filter, or analyse the user's listening history. Requires a projectIdentifier. Data is cached for 4 hours.",
    {
      projectIdentifier: z.string().describe("The name of the project or the sharerId"),
    },
    async ({ projectIdentifier }) => {
      const pid = requireParam(projectIdentifier, "projectIdentifier");
      if (typeof pid === "object" && "error" in pid) return pid.response;
      const project = await client.getProject(pid);
      const slim = project.history.map((h) => ({
        generatedAlbumId: h.generatedAlbumId,
        name: h.album.name,
        artist: h.album.artist,
        releaseDate: h.album.releaseDate,
        genres: h.album.genres,
        rating: h.rating ?? null,
        globalRating: h.globalRating,
        generatedAt: h.generatedAt,
      }));
      return { content: [{ type: "text", text: JSON.stringify(slim, null, 2) }] };
    },
    true,
  );

  registerTool(
    "get_album_detail",
    "Returns complete information for a single album from a project's history. Includes full album metadata (name, artist, release year, genres, styles, subgenres, Wikipedia URL, all streaming IDs: Spotify, Apple Music, Tidal, Amazon Music, YouTube Music, Qobuz, Deezer), the user's rating and full written review, global community rating, reveal status, and date generated. Use this when you need to read a review, find a streaming link, or prepare a detailed presentation for a specific album. Identify the album using its name, UUID, or generatedAlbumId (available from list_project_history or search_project_history). Requires a projectIdentifier. Data is cached for 4 hours.",
    {
      projectIdentifier: z.string().describe("The name of the project or the sharerId"),
      albumIdentifier: z.string().describe("The name, UUID, or generatedAlbumId of the album"),
    },
    async ({ projectIdentifier, albumIdentifier }) => {
      const pid = requireParam(projectIdentifier, "projectIdentifier");
      if (typeof pid === "object" && "error" in pid) return pid.response;
      const aid = requireParam(albumIdentifier, "albumIdentifier");
      if (typeof aid === "object" && "error" in aid) return aid.response;
      const project = await client.getProject(pid);
      const lowerId = aid.toLowerCase();
      const result = project.history.find((h) => {
        return (
          h.album.name.toLowerCase() === lowerId ||
          h.album.uuid === albumIdentifier ||
          h.generatedAlbumId === albumIdentifier
        );
      });
      return { content: [{ type: "text", text: JSON.stringify(result || null, null, 2) }] };
    },
    true,
  );

  registerTool(
    "get_album_context",
    `Returns rich contextual data for a specific album within a project's history, across four dimensions:

1. ARTIST ARC: All other albums by the same artist in the user's history, sorted chronologically by release date, with the user's rating and global rating for each. Use this to discuss an artist's career trajectory as heard by this user — e.g. "you rated their earlier work higher" or "this was their most acclaimed album but you disagreed".

2. MUSICAL CONNECTIONS: Albums in the history sharing genres or styles with the target album, grouped by how many dimensions they share (both genre and style = stronger connection). Use this to identify clusters of related listening and discuss musical lineage or recurring taste patterns.

3. COMMUNITY DIVERGENCE: The difference between the user's rating and the global community average for this album. Also provides the user's mean divergence across all rated albums as a baseline, so you can say whether this album is unusually loved/hated relative to the user's typical behaviour. A positive divergence means the user rated it higher than the community; negative means lower.

4. LISTENING JOURNEY: The 3 albums generated immediately before and after this one in the user's history (by generatedAt date), with ratings. Use this to give a sense of what the user was experiencing around this album — e.g. "you were on a strong run of jazz albums" or "this came right after your lowest-rated album".

Identify the target album using its name, UUID, or generatedAlbumId (from list_project_history or search_project_history). Requires a projectIdentifier. Data is cached for 4 hours.`,
    {
      projectIdentifier: z.string().describe("The name of the project or the sharerId"),
      albumIdentifier: z.string().describe("The name, UUID, or generatedAlbumId of the album to contextualize"),
    },
    async ({ projectIdentifier, albumIdentifier }) => {
      const pid = requireParam(projectIdentifier, "projectIdentifier");
      if (typeof pid === "object" && "error" in pid) return pid.response;
      const aid = requireParam(albumIdentifier, "albumIdentifier");
      if (typeof aid === "object" && "error" in aid) return aid.response;
      const project = await client.getProject(pid);
      const lowerId = aid.toLowerCase();
      const targetEntry = project.history.find((h) => h.album.name.toLowerCase() === lowerId || h.album.uuid === albumIdentifier || h.generatedAlbumId === albumIdentifier);

      if (!targetEntry) {
        return { content: [{ type: "text", text: `Album "${albumIdentifier}" not found in project history.` }] };
      }

      const targetAlbum = targetEntry.album;
      const history = project.history;
      const userRating = typeof targetEntry.rating === "number" ? targetEntry.rating : null;
      const globalRating = targetEntry.globalRating ?? null;
      const albumDivergence = userRating !== null && globalRating !== null ? Math.round((userRating - globalRating) * 100) / 100 : null;
      const ratedWithGlobal = getRatedEntries(history).filter((h) => typeof h.globalRating === "number");
      const meanDivergence = ratedWithGlobal.length > 0 ? Math.round((ratedWithGlobal.reduce((sum, h) => sum + (h.rating - (h.globalRating as number)), 0) / ratedWithGlobal.length) * 100) / 100 : null;

      const artistArc = history
        .filter((h) => h.album.artist === targetAlbum.artist && h.album.uuid !== targetAlbum.uuid)
        .sort((a, b) => getYear(a.album.releaseDate) - getYear(b.album.releaseDate))
        .map((h) => ({ name: h.album.name, releaseDate: h.album.releaseDate, userRating: h.rating ?? null, globalRating: h.globalRating ?? null }));

      const musicalConnections = history
        .filter((h) => h.album.uuid !== targetAlbum.uuid)
        .map((h) => {
          const sharedGenres = h.album.genres.filter((g) => targetAlbum.genres.includes(g));
          const sharedStyles = (h.album.styles ?? []).filter((s) => (targetAlbum.styles ?? []).includes(s));
          return { name: h.album.name, artist: h.album.artist, releaseDate: h.album.releaseDate, sharedGenres, sharedStyles, connectionStrength: sharedGenres.length + sharedStyles.length };
        })
        .filter((h) => h.connectionStrength > 0)
        .sort((a, b) => b.connectionStrength - a.connectionStrength)
        .slice(0, 20);

      const sortedHistory = [...history].sort((a, b) => (a.generatedAt ?? "").localeCompare(b.generatedAt ?? ""));
      const targetIndex = sortedHistory.findIndex((h) => h.generatedAlbumId === targetEntry.generatedAlbumId);
      const journeyWindow = sortedHistory
        .slice(Math.max(0, targetIndex - 3), targetIndex + 4)
        .filter((h) => h.generatedAlbumId !== targetEntry.generatedAlbumId)
        .map((h) => ({ name: h.album.name, artist: h.album.artist, generatedAt: h.generatedAt, userRating: h.rating ?? null, position: sortedHistory.indexOf(h) < targetIndex ? "before" : "after" }));

      const context = {
        targetAlbum: { name: targetAlbum.name, artist: targetAlbum.artist, releaseDate: targetAlbum.releaseDate, genres: targetAlbum.genres, styles: targetAlbum.styles, userRating, globalRating },
        communityDivergence: {
          albumDivergence,
          userMeanDivergence: meanDivergence,
          interpretation:
            albumDivergence !== null && meanDivergence !== null
              ? albumDivergence > meanDivergence + 0.5
                ? "User rated this notably higher than their usual divergence from the community"
                : albumDivergence < meanDivergence - 0.5
                  ? "User rated this notably lower than their usual divergence from the community"
                  : "User divergence on this album is consistent with their typical pattern"
              : null,
        },
        artistArc,
        musicalConnections,
        listeningJourney: journeyWindow,
        sameArtist: artistArc,
        sameYear: history
          .filter((h) => getYear(h.album.releaseDate) === getYear(targetAlbum.releaseDate) && h.album.uuid !== targetAlbum.uuid)
          .map((h) => ({ name: h.album.name, artist: h.album.artist }))
          .slice(0, 50),
        relatedByParticipatingArtists: history
          .filter((h) => {
            if (h.album.uuid === targetAlbum.uuid) return false;
            const targetArtists = targetAlbum.artist.split(/&|,|and|with/i).map((s) => s.trim()).filter(Boolean);
            const otherArtists = h.album.artist.split(/&|,|and|with/i).map((s) => s.trim()).filter(Boolean);
            return targetArtists.some((ta) => otherArtists.includes(ta));
          })
          .map((h) => ({ name: h.album.name, artist: h.album.artist })),
      };

      return { content: [{ type: "text", text: JSON.stringify(context, null, 2) }] };
    },
  );

  registerTool(
    "search_project_history",
    "Searches a project's history by album name, artist, release year, or genre. Returns matching entries in the same slim format as list_project_history (generatedAlbumId, name, artist, year, genres, rating, globalRating, generatedAt — no reviews or streaming links). Use get_album_detail for full information on any result. Requires a projectIdentifier and a query string. Data is cached for 4 hours.",
    {
      projectIdentifier: z.string().describe("The name of the project or the sharerId"),
      query: z.string().describe("Search query for artist, name, year, or genre"),
    },
    async ({ projectIdentifier, query }) => {
      const pid = requireParam(projectIdentifier, "projectIdentifier");
      if (typeof pid === "object" && "error" in pid) return pid.response;
      const q = requireParam(query, "query");
      if (typeof q === "object" && "error" in q) return q.response;
      const project = await client.getProject(pid);
      const lowerQuery = q.toLowerCase();
      const filtered = project.history.filter((h) => h.album.name.toLowerCase().includes(lowerQuery) || h.album.artist.toLowerCase().includes(lowerQuery) || h.album.releaseDate.includes(lowerQuery) || h.album.genres.some((g: string) => g.toLowerCase().includes(lowerQuery)));
      const slim = filtered.map((h) => ({ generatedAlbumId: h.generatedAlbumId, name: h.album.name, artist: h.album.artist, releaseDate: h.album.releaseDate, genres: h.album.genres, rating: h.rating ?? null, globalRating: h.globalRating, generatedAt: h.generatedAt }));
      return { content: [{ type: "text", text: JSON.stringify(slim, null, 2) }] };
    },
    true,
  );
}
