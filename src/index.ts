import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { AlbumsGeneratorClient, UserAlbumHistoryEntry } from './api.js';
import { randomUUID } from 'node:crypto';
import express from 'express';

const client = new AlbumsGeneratorClient();

export function calculateProjectStats(history: UserAlbumHistoryEntry[]) {
  const albumsGenerated = history.length;
  const albumsRated = history.filter((h) => typeof h.rating === 'number' && h.rating > 0).length;
  const albumsUnrated = albumsGenerated - albumsRated;

  return {
    albumsGenerated,
    albumsRated,
    albumsUnrated,
  };
}

function createMcpServer() {
  const server = new McpServer({
    name: '1001-albums-generator',
    version: '1.0.0',
  });

  const registerTool = <T extends z.ZodRawShape>(
    name: string,
    description: string,
    schema: T,
    handler: (args: any) => Promise<any>,
    readOnlyHint: boolean = false
  ) => {
    const callback = (async (args: any) => {
      console.error(`[Tool Call] ${name}`, JSON.stringify(args));
      try {
        const result = await handler(args);
        console.error(`[Tool Success] ${name}`);
        return result;
      } catch (error) {
        console.error(`[Tool Error] ${name}`, error);
        throw error;
      }
    }) as any;

    if (readOnlyHint) {
      server.tool(name, description, schema, { readOnlyHint: true }, callback);
    } else {
      server.tool(name, description, schema, callback);
    }
  };

  registerTool(
    'list_book_album_stats',
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
        content: [{ type: 'text', text: JSON.stringify(slim, null, 2) }],
      };
    },
    true
  );

  registerTool(
    'get_group',
    `Returns a summary of a 1001 Albums Generator group. Use this as the entry point for any group-related conversation — it gives you the group's name, full member list (with their project identifiers), current album, all-time highest rated album, and all-time lowest rated album.

The member list is particularly important: the projectIdentifier for each member is what you pass to get_project_stats, list_project_history, get_taste_profile, get_rating_outliers, and get_group_member_comparison to analyse individual members.

The allTimeHighscore and allTimeLowscore include the album and all member votes — use these to open discussions like "your group's most beloved album of all time is..." or "this is the one album everyone agreed was bad".

Does not include the latest album with votes — use get_group_latest_album for that. The groupSlug is the group name in lowercase with hyphens instead of spaces (find it in the group page URL). Data is cached for 4 hours.`,
    {
      groupSlug: z.string().describe('The group slug (lowercase, hyphenated) from the group page URL'),
    },
    async ({ groupSlug }) => {
      const group = await client.getGroup(groupSlug);
      // Strip latestAlbumWithVotes — that belongs to get_group_latest_album
      const { latestAlbumWithVotes, ...summary } = group;
      return {
        content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }],
      };
    },
    true
  );

  registerTool(
    'get_group_latest_album',
    `Returns the most recently assigned group album along with every member's rating for it. Use this to discuss how the group responded to their latest shared listening experience — who rated it highest, who was coldest on it, and how the group average compares to the community rating.

This is the right starting point for "what did everyone think of the last album?" conversations. For the all-time most divisive albums across the group's full history, use get_group_album_insights instead.

The groupSlug is the group name in lowercase with hyphens instead of spaces. Data is cached for 4 hours.`,
    {
      groupSlug: z.string().describe('The group slug (lowercase, hyphenated) from the group page URL'),
    },
    async ({ groupSlug }) => {
      const group = await client.getGroup(groupSlug);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(group.latestAlbumWithVotes ?? null, null, 2),
          },
        ],
      };
    },
    true
  );

  registerTool(
    'get_group_album_reviews',
    'Returns all member reviews and ratings for a specific album within a group. Accepts either the album UUID or album name as the albumIdentifier — if a name is given, it is resolved to a UUID via the global book stats. For best results, prefer passing the UUID directly (available from get_group or get_group_latest_album). The groupSlug is the group name in lowercase with hyphens instead of spaces. Data is cached for 4 hours.',
    {
      groupSlug: z.string().describe('The group slug (lowercase, hyphenated) from the group page URL'),
      albumIdentifier: z.string().describe('The album UUID, or album name to resolve against the book list'),
    },
    async ({ groupSlug, albumIdentifier }) => {
      // Determine if albumIdentifier looks like a UUID
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      let albumUuid = albumIdentifier;

      if (!uuidRegex.test(albumIdentifier)) {
        // Attempt name resolution via global book stats
        // Global stats albums do not carry UUIDs — we need to find the UUID from the group data
        // Best-effort: search the group's highscore, lowscore, currentAlbum, and latestAlbumWithVotes
        const group = await client.getGroup(groupSlug);
        const candidates = [
          group.currentAlbum,
          group.allTimeHighscore?.album,
          group.allTimeLowscore?.album,
          group.latestAlbumWithVotes?.album,
        ].filter((a): a is NonNullable<typeof a> => a != null);

        const lowerIdentifier = albumIdentifier.toLowerCase();
        const match = candidates.find(
          (a) => a.name.toLowerCase() === lowerIdentifier
        );

        if (!match) {
          return {
            content: [
              {
                type: 'text',
                text: `Could not resolve album name "${albumIdentifier}" to a UUID. Try passing the UUID directly instead.`,
              },
            ],
          };
        }
        albumUuid = match.uuid;
      }

      const reviews = await client.getGroupAlbumReviews(groupSlug, albumUuid);
      return {
        content: [{ type: 'text', text: JSON.stringify(reviews, null, 2) }],
      };
    },
    true
  );

  registerTool(
    'get_book_album_stat',
    'Search the canonical book list by album name or artist. Returns matching entries with community voting stats (votes, average rating, controversial score, vote breakdown). Only searches the ~1001 albums from the original book — for user-submitted albums outside the book list, use list_user_submitted_album_stats. Data is cached for 4 hours.',
    {
      query: z.string().describe('Search query for album name or artist'),
    },
    async ({ query }) => {
      const allStats = await client.getGlobalStats();
      const lowerQuery = query.toLowerCase();
      const filtered = allStats.albums.filter(
        (s) =>
          s.name.toLowerCase().includes(lowerQuery) ||
          s.artist.toLowerCase().includes(lowerQuery)
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
        content: [{ type: 'text', text: JSON.stringify(slim, null, 2) }],
      };
    },
    true
  );

  registerTool(
    'get_album_of_the_day',
    'Returns the current album assigned to a project for today, including full album metadata and any notes added by the project owner. This is the album the user is currently listening to and has not yet rated. Requires a projectIdentifier. Data is cached for 4 hours.',
    {
      projectIdentifier: z.string().describe('The name of the project or the sharerId'),
    },
    async ({ projectIdentifier }) => {
      const project = await client.getProject(projectIdentifier);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                currentAlbum: project.currentAlbum,
                currentAlbumNotes: project.currentAlbumNotes,
              },
              null,
              2
            ),
          },
        ],
      };
    },
    true
  );

  registerTool(
    'get_project_stats',
    'Returns summary statistics for a specific project: total albums generated, number rated, number unrated, current album of the day (with full detail), update frequency, and group membership. Use this when asked about a user\'s progress — e.g. "how many albums has the user rated?" or "what is the user\'s current album?". For the full rated/unrated history, use list_project_history. Requires a projectIdentifier (project name or sharerId). Data is cached for 4 hours.',
    {
      projectIdentifier: z.string().describe('The name of the project or the sharerId'),
    },
    async ({ projectIdentifier }) => {
      const project = await client.getProject(projectIdentifier);
      // Remove history to keep summary small
      const { history, ...summary } = project;
      const stats = calculateProjectStats(history);
      const currentAlbum = project.currentAlbum
        ? (({ images, slug, ...rest }: any) => rest)(project.currentAlbum)
        : null;
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                ...summary,
                currentAlbum,
                ...stats,
              },
              null,
              2
            ),
          },
        ],
      };
    },
    true
  );

  registerTool(
    'list_project_history',
    "Returns the full generated history for a project. Each entry includes: generatedAlbumId, album name, artist, release year, genres, the user's rating (1–5, or null if unrated), global community rating, and date generated. Reviews and full album detail (streaming IDs, images, Wikipedia, subgenres) are intentionally omitted to keep the response manageable — use get_album_detail to retrieve complete information for a specific album. Use this to browse, filter, or analyse the user's listening history. Requires a projectIdentifier. Data is cached for 4 hours.",
    {
      projectIdentifier: z.string().describe('The name of the project or the sharerId'),
    },
    async ({ projectIdentifier }) => {
      const project = await client.getProject(projectIdentifier);
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
      return {
        content: [{ type: 'text', text: JSON.stringify(slim, null, 2) }],
      };
    },
    true
  );

  registerTool(
    'list_user_submitted_album_stats',
    'Returns community voting statistics for albums that users have submitted to 1001 Albums Generator projects which are NOT in the original book list. Each entry includes: name, artist, release year, genres, votes, average rating, controversial score, and vote breakdown. Contains no data specific to any individual project — for a project\'s own history and ratings, use get_project_stats or list_project_history instead. Data is cached for 4 hours.',
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
        content: [{ type: 'text', text: JSON.stringify(slim, null, 2) }],
      };
    },
    true
  );

  registerTool(
    'get_album_detail',
    'Returns complete information for a single album from a project\'s history. Includes full album metadata (name, artist, release year, genres, styles, subgenres, Wikipedia URL, all streaming IDs: Spotify, Apple Music, Tidal, Amazon Music, YouTube Music, Qobuz, Deezer), the user\'s rating and full written review, global community rating, reveal status, and date generated. Use this when you need to read a review, find a streaming link, or prepare a detailed presentation for a specific album. Identify the album using its name, UUID, or generatedAlbumId (available from list_project_history or search_project_history). Requires a projectIdentifier. Data is cached for 4 hours.',
    {
      projectIdentifier: z.string().describe('The name of the project or the sharerId'),
      albumIdentifier: z.string().describe('The name, UUID, or generatedAlbumId of the album'),
    },
    async ({ projectIdentifier, albumIdentifier }) => {
      const project = await client.getProject(projectIdentifier);
      const lowerId = albumIdentifier.toLowerCase();
      const result = project.history.find((h) => {
        return (
          h.album.name.toLowerCase() === lowerId ||
          h.album.uuid === albumIdentifier ||
          h.generatedAlbumId === albumIdentifier
        );
      });
      return {
        content: [{ type: 'text', text: JSON.stringify(result || null, null, 2) }],
      };
    },
    true
  );

  registerTool(
    'get_album_context',
    "Returns relationship data for a specific album within a project's history: other albums by the same artist, albums from the same year, potential influences (same genre, earlier release), potentially influenced works (same genre, later release), albums sharing styles, and albums with overlapping artists. Useful for understanding an album's place in the user's listening journey. Identify the album by name, UUID, or generatedAlbumId. Requires a projectIdentifier. Data is cached for 4 hours.",
    {
      projectIdentifier: z.string().describe('The name of the project or the sharerId'),
      albumIdentifier:
        z.string().describe('The name, UUID, or generatedAlbumId of the album to contextualize'),
    },
    async ({ projectIdentifier, albumIdentifier }) => {
      const project = await client.getProject(projectIdentifier);
      const lowerId = albumIdentifier.toLowerCase();
      const targetEntry = project.history.find((h) => {
        return (
          h.album.name.toLowerCase() === lowerId ||
          h.album.uuid === albumIdentifier ||
          h.generatedAlbumId === albumIdentifier
        );
      });

      if (!targetEntry) {
        return {
          content: [
            {
              type: 'text',
              text: `Album "${albumIdentifier}" not found in project history.`,
            },
          ],
        };
      }

      const targetAlbum = targetEntry.album;
      const history = project.history;

      const getArtists = (artistStr: string) => {
        return artistStr
          .split(/&|,|and|with/i)
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
      };

      const targetArtists = getArtists(targetAlbum.artist);
      const getYear = (dateStr: string) => parseInt(dateStr);
      const targetYear = getYear(targetAlbum.releaseDate);

      const context = {
        targetAlbum: {
          name: targetAlbum.name,
          artist: targetAlbum.artist,
          releaseDate: targetAlbum.releaseDate,
          genres: targetAlbum.genres,
          styles: targetAlbum.styles,
        },
        sameArtist: history
          .filter((h) => h.album.artist === targetAlbum.artist && h.album.uuid !== targetAlbum.uuid)
          .map((h) => ({ name: h.album.name, releaseDate: h.album.releaseDate })),

        sameYear: history
          .filter((h) => getYear(h.album.releaseDate) === targetYear && h.album.uuid !== targetAlbum.uuid)
          .map((h) => ({ name: h.album.name, artist: h.album.artist }))
          .slice(0, 50),

        // Potential influences (same genre, earlier year)
        potentialInfluences: history
          .filter(
            (h) =>
              h.album.uuid !== targetAlbum.uuid &&
              getYear(h.album.releaseDate) < targetYear &&
              h.album.genres.some((g) => targetAlbum.genres.includes(g))
          )
          .sort((a, b) => getYear(b.album.releaseDate) - getYear(a.album.releaseDate)) // Most recent first
          .slice(0, 20)
          .map((h) => ({
            name: h.album.name,
            artist: h.album.artist,
            releaseDate: h.album.releaseDate,
            sharedGenres: h.album.genres.filter((g) => targetAlbum.genres.includes(g)),
          })),

        // Potentially influenced (same genre, later year)
        potentiallyInfluenced: history
          .filter(
            (h) =>
              h.album.uuid !== targetAlbum.uuid &&
              getYear(h.album.releaseDate) > targetYear &&
              h.album.genres.some((g) => targetAlbum.genres.includes(g))
          )
          .sort((a, b) => getYear(a.album.releaseDate) - getYear(b.album.releaseDate)) // Closest in time first
          .slice(0, 20)
          .map((h) => ({
            name: h.album.name,
            artist: h.album.artist,
            releaseDate: h.album.releaseDate,
            sharedGenres: h.album.genres.filter((g) => targetAlbum.genres.includes(g)),
          })),

        // Same style
        relatedByStyle: history
          .filter(
            (h) =>
              h.album.uuid !== targetAlbum.uuid &&
              h.album.styles?.some((s) => targetAlbum.styles?.includes(s))
          )
          .slice(0, 20)
          .map((h) => ({
            name: h.album.name,
            artist: h.album.artist,
            sharedStyles: h.album.styles?.filter((s) => targetAlbum.styles?.includes(s)),
          })),

        // Participating artists
        relatedByParticipatingArtists: history
          .filter((h) => {
            if (h.album.uuid === targetAlbum.uuid) return false;
            const otherArtists = getArtists(h.album.artist);
            return targetArtists.some((ta) => otherArtists.includes(ta));
          })
          .map((h) => ({ name: h.album.name, artist: h.album.artist })),
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(context, null, 2) }],
      };
    }
  );

  registerTool(
    'search_project_history',
    'Searches a project\'s history by album name, artist, release year, or genre. Returns matching entries in the same slim format as list_project_history (generatedAlbumId, name, artist, year, genres, rating, globalRating, generatedAt — no reviews or streaming links). Use get_album_detail for full information on any result. Requires a projectIdentifier and a query string. Data is cached for 4 hours.',
    {
      projectIdentifier: z.string().describe('The name of the project or the sharerId'),
      query: z.string().describe('Search query for artist, name, year, or genre'),
    },
    async ({ projectIdentifier, query }) => {
      const project = await client.getProject(projectIdentifier);
      const lowerQuery = query.toLowerCase();
      const filtered = project.history.filter((h) => {
        return (
          h.album.name.toLowerCase().includes(lowerQuery) ||
          h.album.artist.toLowerCase().includes(lowerQuery) ||
          h.album.releaseDate.includes(lowerQuery) ||
          h.album.genres.some((g: string) => g.toLowerCase().includes(lowerQuery))
        );
      });
      const slim = filtered.map((h) => ({
        generatedAlbumId: h.generatedAlbumId,
        name: h.album.name,
        artist: h.album.artist,
        releaseDate: h.album.releaseDate,
        genres: h.album.genres,
        rating: h.rating ?? null,
        globalRating: h.globalRating,
        generatedAt: h.generatedAt,
      }));
      return {
        content: [{ type: 'text', text: JSON.stringify(slim, null, 2) }],
      };
    },
    true
  );

  registerTool(
    'refresh_data',
    'Force a refresh of cached data from the API. Use type "group" with a groupSlug to refresh a specific group\'s cached data.',
    {
      type: z.enum(['global', 'user', 'project', 'group', 'all']).describe('Type of data to refresh'),
      projectIdentifier: z.string().optional().describe('Required if type is "project"'),
      groupSlug: z.string().optional().describe('Required if type is "group"'),
    },
    async ({ type, projectIdentifier, groupSlug }) => {
      // "global" clears the book list cache (/albums/stats)
      // "user" clears the user-submitted albums cache (/user-albums/stats)
      // "project" clears a specific project cache (/projects/:id)
      if (type === 'global') {
        await client.getGlobalStats(true);
      } else if (type === 'user') {
        await client.getUserAlbumStats(true);
      } else if (type === 'project') {
        if (!projectIdentifier) {
          throw new Error('projectIdentifier is required when type is "project"');
        }
        await client.getProject(projectIdentifier, true);
      } else if (type === 'group') {
        if (!groupSlug) {
          throw new Error('groupSlug is required when type is "group"');
        }
        await client.getGroup(groupSlug, true);
      } else if (type === 'all') {
        client.clearCache();
      }

      return {
        content: [{ type: 'text', text: `Successfully refreshed ${type} data.` }],
      };
    }
  );

  return server;
}

async function main() {
  const mode = process.env.MCP_MODE || 'stdio';

  if (mode === 'sse') {
    const app = express();
    const port = process.env.PORT || 3000;

    const transports = new Map<string, StreamableHTTPServerTransport>();

    app.all('/mcp', async (req, res, next) => {
      try {
        const sessionId = (req.query.sessionId ||
          req.headers['mcp-session-id'] ||
          req.headers['x-session-id']) as string | undefined;

        console.error(`[HTTP] ${req.method} /mcp${sessionId ? ` (Session: ${sessionId})` : ''}`);

        if (sessionId) {
          const transport = transports.get(sessionId);
          if (transport) {
            await transport.handleRequest(req, res);
          } else {
            console.error(`[HTTP] Session not found: ${sessionId}`);
            res.status(400).send('Session not found');
          }
        } else {
          const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
          });

          transport.onclose = () => {
            if (transport.sessionId) {
              console.error(`[HTTP] Session closed: ${transport.sessionId}`);
              transports.delete(transport.sessionId);
            }
          };

          const server = createMcpServer();
          await server.connect(transport);
          await transport.handleRequest(req, res);

          if (transport.sessionId) {
            console.error(`[HTTP] Session created: ${transport.sessionId}`);
            transports.set(transport.sessionId, transport);
          }
        }
      } catch (err) {
        console.error('[HTTP] Request error', err);
        next(err);
      }
    });

    app.listen(port, () => {
      console.error(
        `1001 Albums Generator MCP Server running on Streamable HTTP at http://localhost:${port}/mcp`
      );
    });
  } else {
    const transport = new StdioServerTransport();
    const server = createMcpServer();
    await server.connect(transport);
    console.error('1001 Albums Generator MCP Server running on stdio');
  }
}

main().catch((error) => {
  console.error('Fatal error in main():', error);
  process.exit(1);
});
