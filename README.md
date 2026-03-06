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

- `list_book_album_stats`: Returns community voting statistics for all albums from the canonical "1001 Albums You Must Hear Before You Die" book list.
- `get_book_album_stat`: Search the canonical book list by album name or artist.
- `list_user_submitted_album_stats`: Returns community voting statistics for albums that users have submitted to 1001 Albums Generator projects which are NOT in the original book list.
- `get_project_stats`: Returns summary statistics for a specific project.
- `list_project_history`: Returns the full generated history for a project.
- `get_album_detail`: Returns complete information for a single album from a project's history.
- `search_project_history`: Searches a project's history by album name, artist, release year, or genre.
- `get_album_of_the_day`: Returns the current album assigned to a project for today, including full album metadata and any notes added by the project owner.
- `get_album_context`: Returns relationship data for a specific album within a project's history.
- `refresh_data`: Force a refresh of cached data from the API.

## API Limits

The 1001 Albums Generator API has a strict limit of **3 requests per minute** for non-tokenized users. This server implements a 20-second throttle between requests and caches responses for 4 hours to ensure these limits are respected.
