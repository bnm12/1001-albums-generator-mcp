# Instructions for AI Agents

This repository contains an MCP server for the 1001 Albums Generator API.

## Core Directives

1. **Respect Rate Limits**: The API is strictly limited to 3 requests per minute.
   - The `AlbumsGeneratorClient` in `src/api.ts` implements a `throttle()` method that enforces a 20-second delay between requests. **Do not remove or reduce this delay.**
   - Responses are cached in-memory for 4 hours.
   - The `AlbumsGeneratorClient` instance is shared across all sessions (module-level singleton). This is intentional — the shared cache and throttle queue benefit all concurrent sessions.
2. **ESM Implementation**: This is a Node.js ESM project.
   - Always use `.js` extensions in relative imports (e.g., `import { ... } from "./api.js"`).
   - The project is configured with `"type": "module"` in `package.json`.
3. **High-level MCP SDK**: This server uses the `McpServer` high-level API from `@modelcontextprotocol/sdk`.
4. **Per-session server instances**: In HTTP mode, a new `McpServer` instance must be created for each incoming connection. Use the `createMcpServer()` factory function. Never share a single `McpServer` instance across sessions.
5. **Always read SDK docs before touching transport code**: Before modifying anything related to `StreamableHTTPServerTransport`, `StdioServerTransport`, or any other transport class, fetch and read the current SDK README at https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/refs/heads/main/README.md. The SDK is actively developed and transport APIs change between versions. Do not rely on training data for transport-specific details.
6. **No type shortcuts**: This project uses `strict: true` TypeScript. Never use `// @ts-ignore`, `// @ts-expect-error`, or `as any` casts to paper over type errors. Fix the underlying type issue instead.
7. **Zod v4**: This project uses Zod v4 (`"zod": "^4.3.6"`). The MCP SDK documentation and most online examples use Zod v3 syntax — **do not copy them directly**. Key differences in v4: `z.object().extend()` is removed (use `z.object({ ...base.shape, ... })`), and some error APIs have changed. When in doubt, check the Zod v4 changelog.

## Do Not Modify

The following files must not be modified unless the task explicitly requires it:

- `src/api.ts` — specifically the `throttle()` method and `MIN_REQUEST_INTERVAL` constant
- `src/test-api.ts` and `src/test-cache.ts`
- `tsconfig.json`
- `package.json`

## Code Structure

- `src/api.ts`: Contains the `AlbumsGeneratorClient` with throttling, caching, and data types.
- `src/index.ts`: The MCP server entry point. Contains:
  - `createMcpServer()` — factory function that creates a new `McpServer` instance and registers all tools on it. Must be called once per session in HTTP mode, and once in stdio mode.
  - `main()` — starts the server in either `stdio` or `sse` (Streamable HTTP) mode based on the `MCP_MODE` environment variable.
- `src/test-api.ts` & `src/test-cache.ts`: Utility scripts for verifying API connectivity and caching logic.

## HTTP Transport Architecture

The server uses `StreamableHTTPServerTransport` (not the legacy `SSEServerTransport`). Key rules:

- All HTTP traffic is handled on a single `POST /mcp` endpoint.
- Each new session (no `Mcp-Session-Id` header) creates a new `StreamableHTTPServerTransport` and a new `McpServer` via `createMcpServer()`.
- **The session ID is only available after `transport.handleRequest()` resolves.** Always store the transport in the session map *after* `handleRequest` completes, not before.
- Existing sessions are looked up by `Mcp-Session-Id` header and routed to their transport's `handleRequest`.
- Sessions are removed from the map in `transport.onclose`.

## Error Handling

All Express route handlers that use `async` must accept `next` as a third parameter and call `next(err)` inside a `catch` block. This ensures errors propagate to Express's error handling middleware rather than becoming unhandled promise rejections.

```typescript
app.all('/mcp', async (req, res, next) => {
  try {
    // handler logic
  } catch (err) {
    next(err);
  }
});
```

Never let async errors go unhandled inside route handlers.

## Deployment

The server is deployed at `https://1001-albums-mcp.bnm12.dk` and runs behind a reverse proxy. Keep this in mind when:

- Configuring ports — the app binds to `process.env.PORT` internally; the proxy handles TLS and external routing.
- Trusting headers — forwarded IP or protocol headers (e.g. `X-Forwarded-For`) come from the proxy, not the client directly.
- Avoid hardcoding `localhost` or any specific port in application logic; always use environment variables.

## Development

- Run `npm run build` to compile the TypeScript code.
- Run `node dist/index.js` to start the server on stdio.
- Run `MCP_MODE=sse PORT=3000 node dist/index.js` to start on HTTP at `http://localhost:3000/mcp`.
- When adding new tools, add them inside `createMcpServer()` and ensure they benefit from the caching layer in `api.ts`.
- When adding new tools, you **must** also update `README.md` with their descriptions.
- The `get_album_context` tool implements logical limits (e.g., 20 items per category) on historical data to handle project histories of up to 2000 items while staying within LLM context limits.

## Documentation Links

- [MCP LLM Context](https://modelcontextprotocol.io/llms-full.txt)
- [MCP TypeScript SDK](https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/refs/heads/main/README.md)
- [1001 Albums API (Community JSON documentation)](https://www.reddit.com/r/1001AlbumsGenerator/comments/p6xw6y/json_api/)
