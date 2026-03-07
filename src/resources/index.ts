import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

function loadContent(relativePath: string): string {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  return readFileSync(join(__dirname, "..", "content", relativePath), "utf-8");
}

export function registerResources(server: McpServer): void {
  server.resource(
    "1001-albums-about",
    "info://1001-albums/about",
    {
      description:
        "Background on the 1001 Albums You Must Hear Before You Die book and the 1001 Albums Generator web app — what they are, how they work, and key concepts needed to use this MCP server effectively.",
      mimeType: "text/markdown",
    },
    () => ({
      contents: [
        {
          uri: "info://1001-albums/about",
          mimeType: "text/markdown",
          text: loadContent("resources/about.md"),
        },
      ],
    }),
  );

  server.resource(
    "1001-albums-tool-guide",
    "info://1001-albums/tool-guide",
    {
      description:
        "A practical guide to the tools available in this MCP server — when to use each one, how they relate to each other, and recommended workflows for common questions.",
      mimeType: "text/markdown",
    },
    () => ({
      contents: [
        {
          uri: "info://1001-albums/tool-guide",
          mimeType: "text/markdown",
          text: loadContent("resources/tool-guide.md"),
        },
      ],
    }),
  );
}
