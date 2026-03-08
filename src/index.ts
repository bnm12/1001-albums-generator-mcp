import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { randomUUID } from "node:crypto";
import express from "express";
import { calculateProjectStats } from "./helpers.js";
import { createMcpServer } from "./server.js";

export { calculateProjectStats };

async function main() {
  const mode = process.env.MCP_MODE || "stdio";

  if (mode === "sse") {
    const app = express();
    const port = process.env.PORT || 3000;
    const transports = new Map<string, StreamableHTTPServerTransport>();

    app.get("/healthz", (_req, res) => {
      res.status(200).json({ status: "ok" });
    });

    app.all("/mcp", async (req, res, next) => {
      try {
        const sessionId = (req.query.sessionId || req.headers["mcp-session-id"] || req.headers["x-session-id"]) as string | undefined;

        console.error(`[HTTP] ${req.method} /mcp${sessionId ? ` (Session: ${sessionId})` : ""}`);

        if (sessionId) {
          const transport = transports.get(sessionId);
          if (transport) {
            await transport.handleRequest(req, res);
          } else {
            console.error(`[HTTP] Session not found: ${sessionId}`);
            res.status(400).send("Session not found");
          }
        } else {
          const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID() });

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
        console.error("[HTTP] Request error", err);
        next(err);
      }
    });

    app.listen(port, () => {
      console.error(`1001 Albums Generator MCP Server running on Streamable HTTP at http://localhost:${port}/mcp`);
    });
  } else {
    const transport = new StdioServerTransport();
    const server = createMcpServer();
    await server.connect(transport);
    console.error("1001 Albums Generator MCP Server running on stdio");
  }
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
