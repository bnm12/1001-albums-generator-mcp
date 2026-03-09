# Instructions for AI Agents

This repository contains an MCP server for the 1001 Albums Generator API.

## Core Directives

1. **Respect Rate Limits**: The API is strictly limited to 3 requests per minute.
   - The `AlbumsGeneratorClient` in `src/api.ts` implements a `throttle()` method that enforces a 20-second delay between requests. **Do not remove or reduce this delay.**
   - Responses are cached for 4 hours via a swappable `CacheStore` (see **Cache Layer** below).
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

## Write Endpoints

The 1001 Albums Generator API does not expose publicly documented write endpoints for
submitting ratings, writing reviews, or advancing the album queue. This has been
confirmed by reviewing:

- The official community API documentation (linked in Documentation Links below)
- All known open-source third-party clients (including `michaelherger/1001Albums`,
  `francisconroy/1001_albums_push`, and `bnm12/1001-albums-js-api`)
- The upstream API behaviour of this MCP server over its development history

One undocumented endpoint exists in the wild —
`POST /api/project/{username}/paused` — which can unpause a project. It is not
implemented here because it requires authentication credentials this server does not
hold, and its usefulness as an MCP tool is minimal.

**Do not spend time investigating write endpoints.** If the upstream API adds
authenticated write support in future, it will appear in the official documentation.
Until then, this server is intentionally read-only with respect to user data.

## Code Structure

- `src/api.ts`: Contains the `AlbumsGeneratorClient` with throttling and data types.
- `src/cache.ts`: Contains the `CacheStore` interface and `InMemoryCache`/`RedisCache` implementations.
- `src/index.ts`: The MCP server entry point. Contains:
  - `createMcpServer()` — factory function that creates a new `McpServer` instance and registers all tools, prompts, and resources on it. Must be called once per session in HTTP mode, and once in stdio mode.
  - `main()` — starts the server in either `stdio` or `sse` (Streamable HTTP) mode based on the `MCP_MODE` environment variable.
- `src/test-api.ts` & `src/test-cache.ts`: Utility scripts for verifying API connectivity and caching logic.
- `src/dto.ts`: Defines slim interfaces and transform functions for all API types. Any tool that returns a list or aggregate must use these functions. Summary/orientation tools (`get_project_stats`, `get_group`) slim their nested album fields but otherwise return full responses. Full-response detail tools return raw API types directly. Always include IDs (`uuid`, `slug`, `generatedAlbumId`) on slim objects to enable downstream tool lookups.

## When Adding New Tools

When adding a new tool, you **must** also update all of the following:

1. **`README.md`** — add the tool to the appropriate table in the MCP Tools Reference section.
2. **`AGENTS.md`** — add the tool to the tool-to-dataset mapping table below.
3. **`src/content/resources/tool-guide.md`** — add the tool to the orientation table and, if relevant, to the recommended workflows section. This file is the source for both the `info://1001-albums/tool-guide` resource and the `get_tool_guide` tool. Keeping it current is as important as updating the README. When adding a new tool, update `tool-guide.md` and the content will be automatically available via `get_tool_guide`. There is no need to update the tool list in `get_tool_guide` itself — it reads the file directly.

4. **`src/tools/*.test.ts`** — add a `describe` block for the new tool in the relevant
   test file. Every new tool must have at minimum:
   - A happy-path test asserting the correct response shape
   - A test for each required parameter being empty or missing, asserting an error
     response (not a thrown exception)
   - Any edge cases specific to the tool's logic (empty results, null fields, boundary
     values)

   Follow the `beforeEach` / `afterEach` pattern from existing tests. See the Testing
   section for the full conventions.

## MCP Resources

Two static resources are registered inside `createMcpServer()` in `src/index.ts`. They
provide background context for AI agents using the server:

- **`info://1001-albums/about`** — explains what the 1001 Albums book and Generator are,
  how projects and groups work, and key concepts like random assignment and rating-based
  affinity. Update this if the fundamental data model or concepts change.
- **`info://1001-albums/tool-guide`** — a practical orientation guide: which tool to use
  for which question, how tools relate to each other, recommended multi-step workflows, and
  common mistakes to avoid. **Always update this when adding, removing, or renaming tools.**

## 1001 Albums Generator Data Model

The upstream API has three distinct datasets. Understanding which is which is essential for
choosing the correct tool:

| Dataset                   | API endpoint                     | What it contains                                                                                                         |
| ------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **Book list**             | `GET /albums/stats`              | The ~1001 canonical albums from the _1001 Albums You Must Hear Before You Die_ book, with community ratings              |
| **User-submitted albums** | `GET /user-albums/stats`         | Albums added by users across all projects worldwide that are **not** in the original book list, with community ratings   |
| **Project**               | `GET /projects/:id`              | A specific user's project: their generated history, personal ratings, written reviews, current album, and progress stats |
| **Group**                 | `GET /groups/:slug`              | A group summary: member list, current album, all-time high/low scoring albums, latest album with votes                   |
| **Group album reviews**   | `GET /groups/:slug/albums/:uuid` | All member reviews and ratings for a specific album within a group                                                       |

The book list and user-submitted datasets contain **no per-project data** — no individual
ratings, no reviews, no history. They are community-wide aggregates only.

### Tool-to-dataset mapping

| Tool                              | Dataset             | Use for                                                                        |
| --------------------------------- | ------------------- | ------------------------------------------------------------------------------ |
| `list_book_album_stats`           | Book list           | Browsing/ranking the canonical 1001 albums                                     |
| `get_book_album_stat`             | Book list           | Looking up a specific book album's community stats                             |
| `list_user_submitted_album_stats` | User-submitted      | Browsing albums added by the community outside the book                        |
| `get_project_stats`               | Project             | A user's progress: how many rated, current album (slim), group info. Use `get_album_of_the_day` for full current album detail. |
| `list_project_history`            | Project             | Browsing a user's history with sort and pagination — use analysis tools first; unlimited form is a heavy escape hatch |
| `search_project_history`          | Project             | Searching a user's history by name, artist, year, genre, or character. Multi-word queries use OR matching — any entry containing at least one term qualifies, ranked by term count. |
| `get_album_detail`                | Project             | Full detail for one album: review, streaming links, metadata                   |
| `get_album_of_the_day`            | Project             | The album currently assigned to a project                                      |
| `get_album_context`               | Project             | Artist arc, musical connections, community divergence, listening journey       |
| `get_taste_profile`               | Project             | Overall taste summary: genres, decades, rating tendencies, community alignment |
| `get_rating_outliers`             | Project             | Albums where the user most diverges from community consensus                   |
| `get_review_insights`             | Project             | Qualitative synthesis of written reviews — album-anchored or open query. Uses MCP Sampling when available; falls back to raw reviews with synthesis instructions. |
| `get_tool_guide`                  | Static file (`tool-guide.md`) | Returns full workflow guide as text. No parameters. Prefer this over the MCP resource URI — most clients do not surface resources. |
| `get_listening_arc`               | Project             | Chronological arc analysis: segments, trends, and milestones for narrative generation |
| `get_group`                       | Group               | Group summary: members, slim current album, all-time high/low with computed averageRating. Use `get_group_latest_album` for full latest album with votes. |
| `get_group_latest_album`          | Group               | Latest group album with all member votes attached                              |
| `get_group_album_reviews`         | Group album reviews | All member reviews and ratings for a specific group album                      |
| `get_group_album_insights`        | Project (multiple)  | Most divisive and consensus albums across a group, ranked by rating variance   |
| `get_group_member_comparison`     | Project (multiple)  | Taste similarity and rating divergence between two specific members            |
| `get_group_compatibility_matrix`  | Project (multiple)  | Group-wide pairwise taste compatibility — who agrees with whom                 |
| `compare_projects`                | Project (multiple)  | High-level taste comparison between any two projects                           |
| `refresh_data`                    | All                 | Force-refresh any cached dataset                                               |

### List vs. detail pattern

List tools (`list_project_history`, `list_book_album_stats`, `list_user_submitted_album_stats`,
`search_project_history`) return a **slim format** intentionally — images, streaming IDs,
Wikipedia URLs, subgenres, and written reviews are stripped to keep responses in context.

When you need any of the following, call `get_album_detail` first:

- The user's written review for an album
- Any streaming link (Spotify, Apple Music, Tidal, YouTube Music, etc.)
- Wikipedia URL
- Full genre/style/subgenre breakdown
- Album artwork image URLs

### Prefer specific identifiers

When an agent has a UUID or `generatedAlbumId` from a previous tool result, it must pass that identifier rather than re-deriving by name. Name-based lookup is a last resort, not the default. Agents should treat UUIDs as primary keys once obtained.

Identifier preference order: **UUID** > **generatedAlbumId** > **album name**

Use the UUID or `generatedAlbumId` from a list tool result to identify the album in `get_album_detail`, `get_album_context`, and other tools that accept an `albumIdentifier`.

### `refresh_data` cache key mapping

The `type` enum in `refresh_data` maps to internal caches as follows — do not rename these
values:

- `"global"` → book list cache (`/albums/stats`)
- `"user"` → user-submitted albums cache (`/user-albums/stats`)
- `"project"` → specific project cache (`/projects/:id`)
- `"group"` → specific group cache (`/groups/:slug`)
- `"all"` → clears all caches

## Cache Layer

The server uses a swappable cache layer defined in `src/cache.ts`:

- **`InMemoryCache`** (default): Stores data in an in-process Map. Used if `REDIS_URL` is not set.
- **`RedisCache`**: Used if `REDIS_URL` is configured. Connects via `ioredis`.

### Key Scheme
All keys are prefixed with `1001mcp:` to allow sharing a Redis instance:
- `1001mcp:global`
- `1001mcp:user`
- `1001mcp:project:{identifier}`
- `1001mcp:group:{slug}`
- `1001mcp:groupalbum:{slug}:{uuid}`

### Failure Mode
Redis operations are wrapped in try/catch. If Redis is down or slow, the client logs the error and falls through to the upstream API. The server degrades to uncached behavior rather than crashing.

### Health Check
In HTTP mode, `/healthz` includes a `redis` field when configured. It returns HTTP 503 `degraded` if Redis is unreachable.

### Throttle Queue
The throttle queue is intentionally **not** in Redis. It is a promise chain on the in-process singleton and does not need to be shared across server instances.

## HTTP Transport Architecture

The server uses `StreamableHTTPServerTransport` (not the legacy `SSEServerTransport`). Key rules:

- All HTTP traffic is handled on a single `POST /mcp` endpoint.
- Each new session (no `Mcp-Session-Id` header) creates a new `StreamableHTTPServerTransport` and a new `McpServer` via `createMcpServer()`.
- **The session ID is only available after `transport.handleRequest()` resolves.** Always store the transport in the session map _after_ `handleRequest` completes, not before.
- Existing sessions are looked up by `Mcp-Session-Id` header and routed to their transport's `handleRequest`.
- Sessions are removed from the map in `transport.onclose`.

## Error Handling

All Express route handlers that use `async` must accept `next` as a third parameter and call `next(err)` inside a `catch` block. This ensures errors propagate to Express's error handling middleware rather than becoming unhandled promise rejections.

```typescript
app.all("/mcp", async (req, res, next) => {
  try {
    // handler logic
  } catch (err) {
    next(err);
  }
});
```

Never let async errors go unhandled inside route handlers.

Tool handlers must not throw for invalid or empty parameters — return a descriptive error
message in the tool response instead:

```typescript
// Correct
return {
  content: [
    {
      type: "text",
      text: 'Error: "projectIdentifier" is required and cannot be empty.',
    },
  ],
};

// Wrong — do not throw from tool handlers for user input errors
throw new Error("projectIdentifier is required");
```

### API errors

Tool handlers must not let API errors (network failures, upstream 4xx/5xx responses)
propagate as thrown exceptions. The `makeRegisterTool` wrapper in
`src/tools/register-tool.ts` catches all thrown errors automatically and converts them
to structured tool response text using `formatApiError` from `src/helpers.ts`.

You do not need to add try/catch inside individual tool handlers for API call failures —
the wrapper handles this. However, if a tool makes multiple API calls and needs to handle
a partial failure differently (e.g. returning a degraded result rather than an error),
you may add a local try/catch inside the handler for that specific call.

`formatApiError(error, context)` is available for use in any code that catches errors
outside of a tool handler. The `context` string should identify what was being fetched,
e.g. `'Project "my-project"'`.

## Deployment

The server is deployed at `https://1001-albums-mcp.bnm12.dk` and runs behind a reverse proxy. Keep this in mind when:

- Configuring ports — the app binds to `process.env.PORT` internally; the proxy handles TLS and external routing.
- Trusting headers — forwarded IP or protocol headers (e.g. `X-Forwarded-For`) come from the proxy, not the client directly.
- Avoid hardcoding `localhost` or any specific port in application logic; always use environment variables.

## Testing

Tests are written with [Vitest](https://vitest.dev) and co-located with source files.

### Running tests

```bash
npm test              # Run all unit and integration tests once
npm run test:watch    # Watch mode
npm run test:coverage # Run with coverage report (output: coverage/)
```

### Test layers

| Layer | File pattern | What it tests | Runs in CI |
|---|---|---|---|
| Unit | `src/**/*.test.ts` | Pure logic: helpers, DTOs | Yes |
| Integration | `src/**/*.test.ts` | Every tool via real MCP protocol + mocked client | Yes |
| Smoke | `src/**/*.smoke.test.ts` | Live API connectivity | No — opt-in |

To run smoke tests: `TEST_LIVE_API=true npx vitest run --include="src/**/*.smoke.test.ts"`

### Test infrastructure (`src/test/`)

| File | Purpose |
|---|---|
| `fixtures.ts` | Factory functions for all API types (`makeAlbum`, `makeProjectInfo`, etc.) |
| `mock-client.ts` | `makeMockClient()` — returns a `vi.fn()`-stubbed `AlbumsGeneratorClient` |
| `create-test-client.ts` | `createTestClient(mockClient)` — wires `McpServer` + `Client` via `InMemoryTransport` |
| `assertions.ts` | `assertToolSuccess`, `assertToolError` — parse MCP tool responses cleanly |

### When adding new tools

Add a corresponding `describe` block in the relevant `src/tools/*.test.ts` file. Cover:
- Happy path: correct return shape and field values
- Empty/missing required parameters: verify error response (not a thrown exception)
- Edge cases specific to the tool's logic

Follow the `beforeEach` / `afterEach` pattern from existing tests to ensure transport
cleanup between tests.

## Development

- Run `npm run build` to compile the TypeScript code.
- Run `node dist/index.js` to start the server on stdio.
- Run `MCP_MODE=sse PORT=3000 node dist/index.js` to start on HTTP at `http://localhost:3000/mcp`.
- When adding new tools, add them inside `createMcpServer()` and ensure they benefit from the caching layer in `api.ts`.
- When adding new tools, you **must** update `README.md`, `AGENTS.md`, and the `info://1001-albums/tool-guide` resource in `src/index.ts`.
- When adding new tools, always use slim functions from `src/dto.ts` for list and aggregate responses. Never inline object slimming in tool handlers. If a new raw type needs slimming, add its interface and function to `src/dto.ts` first.
- The `get_album_context` tool implements logical limits (e.g., 20 items per category) on historical data to handle project histories of up to 2000 items while staying within LLM context limits. Apply the same philosophy to all new tools — return slim, ranked, and capped results rather than raw data dumps.
- Genre and decade affinity is always computed from **average ratings**, not listen counts. Albums are assigned randomly, so listen count carries no preference signal.
- All member project fetches in group tools must use `Promise.all()` for parallel execution — never fetch member projects sequentially.

## Documentation Links

- [MCP LLM Context](https://modelcontextprotocol.io/llms-full.txt)
- [MCP TypeScript SDK](https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/refs/heads/main/README.md)
- [1001 Albums API (Community JSON documentation)](https://www.reddit.com/r/1001AlbumsGenerator/comments/p6xw6y/json_api/)
