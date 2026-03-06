import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { AlbumsGeneratorClient } from './api.js';

const server = new McpServer({
  name: '1001-albums-generator',
  version: '1.0.0',
});

const client = new AlbumsGeneratorClient();

server.tool(
  'get_global_stats',
  'Get all global album stats including votes, average rating, genres, and controversial score.',
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
  'Get statistics for a specific album from global stats by name or artist.',
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
  'Get general project information including history and current album.',
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
  "Read the user's entire album history.",
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
  'Get user album stats (votes, average score, genres, etc.).',
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
  "Search the user's history for related albums (artist, year, genre, fuzzy search).",
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

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('1001 Albums Generator MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error in main():', error);
  process.exit(1);
});
