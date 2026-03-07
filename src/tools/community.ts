import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { AlbumsGeneratorClient } from "../api.js";
import { slimAlbumStat } from "../dto.js";
import { paginateAndSort, requireParam, sortStats } from "../helpers.js";
import { makeRegisterTool } from "./register-tool.js";

export function registerCommunityTools(
  server: McpServer,
  client: AlbumsGeneratorClient,
): void {
  const registerTool = makeRegisterTool(server);

  registerTool(
    "list_book_album_stats",
    `Returns community voting statistics for all albums from the canonical "1001 Albums You
Must Hear Before You Die" book list. Each entry includes: name, artist, release year,
genres, total votes, average rating, controversial score, and vote distribution by grade.

Results are wrapped in a pagination envelope:
  totalCount    — total book albums in the dataset (~1001)
  returnedCount — number of entries in this response
  offset        — starting position used
  limit         — limit applied (null if no limit was set)
  results       — the album stat entries

Default sort is "highest_rated" (community average descending).

Use limit and sortBy together for focused queries:
  - Top 10 highest rated book albums       → sortBy: "highest_rated", limit: 10
  - Most divisive albums                   → sortBy: "most_controversial", limit: 20
  - Most listened-to albums globally       → sortBy: "most_voted", limit: 20

For searching by name, artist, genre, or year, use get_book_album_stat instead.
For user-submitted albums not in the book list, use list_user_submitted_album_stats.
Data is cached for 4 hours.`,
    {
      sortBy: z
        .enum([
          "highest_rated",
          "lowest_rated",
          "most_voted",
          "most_controversial",
        ])
        .default("highest_rated")
        .describe(
          "Sort order. 'highest_rated' = community average descending (default). " +
            "'lowest_rated' = community average ascending. " +
            "'most_voted' = most community votes first. " +
            "'most_controversial' = highest controversialScore first.",
        ),
      limit: z.number().int().min(1).optional().describe(
        "Maximum number of entries to return. Omit to return all ~1001 book albums.",
      ),
      offset: z.number().int().min(0).default(0).describe(
        "Number of entries to skip. Use with limit for pagination. Default 0.",
      ),
    },
    async ({ sortBy, limit, offset }) => {
      const stats = await client.getGlobalStats();
      const slim = stats.albums.map(slimAlbumStat);
      const sorted = sortStats(slim, sortBy);
      const paginated = paginateAndSort(sorted, { limit, offset });

      return {
        content: [{ type: "text", text: JSON.stringify(paginated, null, 2) }],
      };
    },
    true,
  );

  registerTool(
    "get_book_album_stat",
    `Searches the canonical book list by album name, artist, genre, or release year. Returns
matching entries with community voting stats (votes, average rating, controversial score,
vote breakdown).

Matching is case-insensitive and partial — "pink" matches "Pink Floyd", "punk" matches
"Punk Rock", "197" matches any album from the 1970s.

Only searches the ~1001 albums from the original book list. For user-submitted albums
outside the book list, use list_user_submitted_album_stats. To browse or sort the full
book list, use list_book_album_stats. Data is cached for 4 hours.`,
    {
      query: z.string().describe("Search query for album name, artist, genre, or release year"),
    },
    async ({ query }) => {
      const q = requireParam(query, "query");
      if (typeof q === "object" && "error" in q) return q.response;
      const allStats = await client.getGlobalStats();
      const lowerQuery = q.toLowerCase();
      const filtered = allStats.albums.filter(
        (s) =>
          s.name.toLowerCase().includes(lowerQuery) ||
          s.artist.toLowerCase().includes(lowerQuery) ||
          s.genres.some((g) => g.toLowerCase().includes(lowerQuery)) ||
          (s.releaseDate ?? "").includes(lowerQuery),
      );
      const slim = filtered.map(slimAlbumStat);
      return {
        content: [{ type: "text", text: JSON.stringify(slim, null, 2) }],
      };
    },
    true,
  );

  registerTool(
    "list_user_submitted_album_stats",
    `Returns community voting statistics for albums submitted by users to 1001 Albums Generator
projects that are NOT in the original book list. Each entry includes: name, artist, release
year, genres, total votes, average rating, controversial score, and vote distribution.

Results are wrapped in a pagination envelope:
  totalCount    — total user-submitted albums in the dataset
  returnedCount — number of entries in this response
  offset        — starting position used
  limit         — limit applied (null if no limit was set)
  results       — the album stat entries

Default sort is "highest_rated" (community average descending).

Contains no per-project data — no individual ratings or reviews. For a project's own
history and ratings, use get_project_stats or list_project_history. Data is cached for
4 hours.`,
    {
      sortBy: z
        .enum([
          "highest_rated",
          "lowest_rated",
          "most_voted",
          "most_controversial",
        ])
        .default("highest_rated")
        .describe(
          "Sort order. 'highest_rated' = community average descending (default). " +
            "'lowest_rated' = community average ascending. " +
            "'most_voted' = most community votes first. " +
            "'most_controversial' = highest controversialScore first.",
        ),
      limit: z.number().int().min(1).optional().describe(
        "Maximum number of entries to return. Omit to return all ~1001 book albums.",
      ),
      offset: z.number().int().min(0).default(0).describe(
        "Number of entries to skip. Use with limit for pagination. Default 0.",
      ),
    },
    async ({ sortBy, limit, offset }) => {
      const stats = await client.getUserAlbumStats();
      const slim = stats.albums.map(slimAlbumStat);
      const sorted = sortStats(slim, sortBy);
      const paginated = paginateAndSort(sorted, { limit, offset });

      return {
        content: [{ type: "text", text: JSON.stringify(paginated, null, 2) }],
      };
    },
    true,
  );
}
