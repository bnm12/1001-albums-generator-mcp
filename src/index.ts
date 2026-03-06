import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { z } from 'zod';
import { AlbumsGeneratorClient } from './api.js';
import express from 'express';

const server = new McpServer({
  name: '1001-albums-generator',
  version: '1.0.0',
});

const client = new AlbumsGeneratorClient();

server.tool(
  'get_global_stats',
  'Get all global album stats including votes, average rating, genres, and controversial score. Data is cached for 4 hours.',
  {},
  async () => {
    const stats = await client.getGlobalStats();
    return {
      content: [{ type: 'text', text: JSON.stringify(stats, null, 2) }],
    };
  }
);

server.tool(
  'get_global_album_stat',
  'Get statistics for a specific album from global stats by name or artist. Data is cached for 4 hours.',
  {
    query: z.string().describe('Search query for album name or artist'),
  },
  async ({ query }) => {
    const allStats = await client.getGlobalStats();
    const lowerQuery = query.toLowerCase();
    const filtered = allStats.stats.filter(
      (s) =>
        s.albumName.toLowerCase().includes(lowerQuery) ||
        s.albumArtist.toLowerCase().includes(lowerQuery)
    );
    return {
      content: [{ type: 'text', text: JSON.stringify(filtered, null, 2) }],
    };
  }
);

server.tool(
  'get_album_of_the_day',
  'Get the current album of the day for a given project. Data is cached for 4 hours.',
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
  }
);

server.tool(
  'get_project_info',
  'Get general project information including history and current album. Data is cached for 4 hours.',
  {
    projectIdentifier: z.string().describe('The name of the project or the sharerId'),
  },
  async ({ projectIdentifier }) => {
    const project = await client.getProject(projectIdentifier);
    // Remove history to keep summary small
    const { history, ...summary } = project;
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              ...summary,
              albumsGenerated: history.length,
              albumsRated: history.filter((h) => h.rating > 0).length,
              albumsUnrated: history.filter((h) => !h.rating).length,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

server.tool(
  'get_user_history',
  "Read the user's entire album history. Data is cached for 4 hours.",
  {
    projectIdentifier: z.string().describe('The name of the project or the sharerId'),
  },
  async ({ projectIdentifier }) => {
    const project = await client.getProject(projectIdentifier);
    return {
      content: [{ type: 'text', text: JSON.stringify(project.history, null, 2) }],
    };
  }
);

server.tool(
  'get_user_stats',
  'Get user album stats (votes, average score, genres, etc.). Data is cached for 4 hours.',
  {},
  async () => {
    const stats = await client.getUserAlbumStats();
    return {
      content: [{ type: 'text', text: JSON.stringify(stats, null, 2) }],
    };
  }
);

server.tool(
  'lookup_album',
  "Look up a specific album in a project's history by its name or ID (uuid or generatedAlbumId). Only returns one precise result. Data is cached for 4 hours.",
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
  }
);

server.tool(
  'get_album_context',
  "Provide a graph-like context for an album from a user's history, showing relationships with other albums (same artist, year, genre/style influence).",
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

server.tool(
  'search_user_history',
  "Search the user's history for related albums (artist, year, genre, fuzzy search). Data is cached for 4 hours.",
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
    return {
      content: [{ type: 'text', text: JSON.stringify(filtered, null, 2) }],
    };
  }
);

server.tool(
  'refresh_data',
  'Force a refresh of cached data from the API.',
  {
    type: z.enum(['global', 'user', 'project', 'all']).describe('Type of data to refresh'),
    projectIdentifier: z.string().optional().describe('Required if type is "project"'),
  },
  async ({ type, projectIdentifier }) => {
    if (type === 'global') {
      await client.getGlobalStats(true);
    } else if (type === 'user') {
      await client.getUserAlbumStats(true);
    } else if (type === 'project') {
      if (!projectIdentifier) {
        throw new Error('projectIdentifier is required when type is "project"');
      }
      await client.getProject(projectIdentifier, true);
    } else if (type === 'all') {
      client.clearCache();
    }

    return {
      content: [{ type: 'text', text: `Successfully refreshed ${type} data.` }],
    };
  }
);

async function main() {
  const mode = process.env.MCP_MODE || 'stdio';

  if (mode === 'sse') {
    const app = express();
    const port = process.env.PORT || 3000;

    const transports = new Map<string, SSEServerTransport>();

    app.get('/sse', async (req, res) => {
      const transport = new SSEServerTransport('/message', res);
      transports.set(transport.sessionId, transport);

      transport.onclose = () => {
        transports.delete(transport.sessionId);
      };

      await server.connect(transport);
    });

    app.post('/message', async (req, res) => {
      const sessionId = req.query.sessionId as string;
      const transport = transports.get(sessionId);

      if (transport) {
        await transport.handlePostMessage(req, res);
      } else {
        res.status(400).send('Session not found');
      }
    });

    app.listen(port, () => {
      console.error(
        `1001 Albums Generator MCP Server running on SSE at http://localhost:${port}/sse`
      );
    });
  } else {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('1001 Albums Generator MCP Server running on stdio');
  }
}

main().catch((error) => {
  console.error('Fatal error in main():', error);
  process.exit(1);
});
