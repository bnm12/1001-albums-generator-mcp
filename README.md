# 1001-albums-generator-mcp

An MCP server for interacting with the [1001 Albums Generator](https://1001albumsgenerator.com/) API.

## Features

- **Global Stats**: Access to all global album stats, including average ratings and genres.
- **User History**: Read and search the entire history of any 1001 Albums project.
- **Project Summaries**: Get general information about a project, including progress stats.
- **In-memory Caching**: Data is cached for 4 hours to respect the API's strict rate limits.
- **Throttling**: Automatic 20-second delay between requests to avoid being blocked by the API.

## Installation

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or later)
- npm

### Setup

1. Clone the repository.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Build the project:
   ```bash
   npm run build
   ```

## Usage

This server is designed to be used with an MCP client (like Claude Desktop).

### One-Click Installation (Claude Desktop)

This server is available as a [Claude Desktop Extension (DXT)](https://github.com/t54-labs/dxt). You can find the `.dxt` files in the [GitHub Releases](https://github.com/bnm12/1001-albums-generator-mcp/releases) page.

To install:
1. Download either the local (`1001-albums-generator-mcp.dxt`) or remote (`1001-albums-generator-mcp-remote.dxt`) extension.
2. Drag the `.dxt` file into your Claude Desktop settings.

- **Local version**: Runs the server directly on your machine. Requires Node.js.
- **Remote version**: Connects to the hosted version of this MCP server at `https://1001-albums-mcp.bnm12.dk/mcp`. Does not require local Node.js or setup.

### Running on Stdio

```bash
node dist/index.js
```

### Running on SSE (HTTP)

```bash
MCP_MODE=sse PORT=3000 node dist/index.js
```

The server will be available at `http://localhost:3000/mcp`.

### Tools

- `get_global_stats`: Get all global album stats.
- `get_global_album_stat`: Search for a specific album in global stats.
- `get_project_info`: Get general project info and summaries.
- `get_user_history`: Read the user's entire album history.
- `get_user_stats`: Get user album stats.
- `search_user_history`: Search a user's history by artist, name, year, or genre.
- `lookup_album`: Precise search for an album in history by name, UUID, or `generatedAlbumId`.
- `get_album_of_the_day`: Get the current album of the day and its notes for a project.
- `get_album_context`: Explore relationships between an album and others in the history (same artist, year, genre influence, style, collaborations).
- `refresh_data`: Force a refresh of cached data.

## API Limits

The 1001 Albums Generator API has a strict limit of **3 requests per minute** for non-tokenized users. This server implements a 20-second throttle between requests and caches responses for 4 hours to ensure these limits are respected.
