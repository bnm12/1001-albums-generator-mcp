import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { AlbumsGeneratorClient } from "../api.js";
import { requireParam } from "../helpers.js";
import { makeRegisterTool } from "./register-tool.js";

export function registerCommunityTools(
  server: McpServer,
  client: AlbumsGeneratorClient,
): void {
  const registerTool = makeRegisterTool(server);

  registerTool(
    "list_book_album_stats",
    'Returns community voting statistics for all albums from the canonical "1001 Albums You Must Hear Before You Die" book list. Each entry includes: name, artist, release year, genres, total votes, average rating, controversial score, and vote distribution by grade (1–5). Use this to answer questions about the book list — e.g. "what is the highest rated book album?" or "find book albums in the jazz genre". For albums submitted by users outside the book list, use list_user_submitted_album_stats. Data is cached for 4 hours.',
    {},
    async () => {
      const stats = await client.getGlobalStats();
      const slim = stats.albums.map((s) => ({
        name: s.name,
        artist: s.artist,
        releaseDate: s.releaseDate,
        genres: s.genres,
        votes: s.votes,
        averageRating: s.averageRating,
        controversialScore: s.controversialScore,
        votesByGrade: s.votesByGrade,
      }));
      return {
        content: [{ type: "text", text: JSON.stringify(slim, null, 2) }],
      };
    },
    true,
  );

  registerTool(
    "get_book_album_stat",
    "Search the canonical book list by album name or artist. Returns matching entries with community voting stats (votes, average rating, controversial score, vote breakdown). Only searches the ~1001 albums from the original book — for user-submitted albums outside the book list, use list_user_submitted_album_stats. Data is cached for 4 hours.",
    {
      query: z.string().describe("Search query for album name or artist"),
    },
    async ({ query }) => {
      const q = requireParam(query, "query");
      if (typeof q === "object" && "error" in q) return q.response;
      const allStats = await client.getGlobalStats();
      const lowerQuery = q.toLowerCase();
      const filtered = allStats.albums.filter(
        (s) =>
          s.name.toLowerCase().includes(lowerQuery) ||
          s.artist.toLowerCase().includes(lowerQuery),
      );
      const slim = filtered.map((s) => ({
        name: s.name,
        artist: s.artist,
        releaseDate: s.releaseDate,
        genres: s.genres,
        votes: s.votes,
        averageRating: s.averageRating,
        controversialScore: s.controversialScore,
        votesByGrade: s.votesByGrade,
      }));
      return {
        content: [{ type: "text", text: JSON.stringify(slim, null, 2) }],
      };
    },
    true,
  );

  registerTool(
    "list_user_submitted_album_stats",
    "Returns community voting statistics for albums that users have submitted to 1001 Albums Generator projects which are NOT in the original book list. Each entry includes: name, artist, release year, genres, votes, average rating, controversial score, and vote breakdown. Contains no data specific to any individual project — for a project's own history and ratings, use get_project_stats or list_project_history instead. Data is cached for 4 hours.",
    {},
    async () => {
      const stats = await client.getUserAlbumStats();
      const slim = stats.albums.map((a) => ({
        name: a.name,
        artist: a.artist,
        releaseDate: a.releaseDate,
        genres: a.genres,
        votes: a.votes,
        averageRating: a.averageRating,
        controversialScore: a.controversialScore,
        votesByGrade: a.votesByGrade,
      }));
      return {
        content: [{ type: "text", text: JSON.stringify(slim, null, 2) }],
      };
    },
    true,
  );
}
