# Instructions for AI Agents

This repository contains an MCP server for the 1001 Albums Generator API.

## Core Directives

1. **Respect Rate Limits**: The API is strictly limited to 3 requests per minute.
   - The `AlbumsGeneratorClient` in `src/api.ts` implements a `throttle()` method that enforces a 20-second delay between requests. **Do not remove or reduce this delay.**
   - Responses are cached in-memory for 4 hours.
2. **ESM Implementation**: This is a Node.js ESM project.
   - Always use `.js` extensions in relative imports (e.g., `import { ... } from "./api.js"`).
   - The project is configured with `"type": "module"` in `package.json`.
3. **High-level MCP SDK**: This server uses the `McpServer` high-level API from `@modelcontextprotocol/sdk`.

## Code Structure

- `src/api.ts`: Contains the `AlbumsGeneratorClient` with throttling, caching, and data types.
- `src/index.ts`: The MCP server entry point and tool definitions.
- `src/test-api.ts` & `src/test-cache.ts`: Utility scripts for verifying API connectivity and caching logic.

## Development

- Run `npm run build` to compile the TypeScript code.
- Run `node dist/index.js` to start the server on stdio.
- When adding new tools, ensure they benefit from the caching layer in `api.ts`.
- When adding new tools, you **must** also update `README.md` with their descriptions.
- The `get_album_context` tool implements logical limits (e.g., 20 items per category) on historical data to handle project histories of up to 2000 items while staying within LLM context limits.

## Documentation Links

- [MCP LLM Context](https://modelcontextprotocol.io/llms-full.txt)
- [MCP TypeScript SDK](https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/refs/heads/main/README.md)
- [1001 Albums API (Community JSON documentation)](https://www.reddit.com/r/1001AlbumsGenerator/comments/p6xw6y/json_api/)
