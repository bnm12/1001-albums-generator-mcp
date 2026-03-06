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

    let transport: SSEServerTransport | null = null;

    app.get('/sse', async (req, res) => {
      transport = new SSEServerTransport('/message', res);
      await server.connect(transport);
    });

    app.post('/message', async (req, res) => {
      if (transport) {
        await transport.handlePostMessage(req, res);
      } else {
        res.status(400).send('No active SSE session');
      }
    });

    app.listen(port, () => {
      console.error(`1001 Albums Generator MCP Server running on SSE at http://localhost:${port}/sse`);
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
