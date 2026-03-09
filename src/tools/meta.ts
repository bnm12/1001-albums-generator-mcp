import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { makeRegisterTool } from "./register-tool.js";
import { AlbumsGeneratorClient } from "../api.js";

function loadContent(relativePath: string): string {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  return readFileSync(join(__dirname, "..", "content", relativePath), "utf-8");
}

export function registerMetaTools(
  server: McpServer,
  _client: AlbumsGeneratorClient,
): void {
  const registerTool = makeRegisterTool(server);

  registerTool(
    "get_tool_guide",
    "Returns the full tool usage guide for this MCP server — recommended workflow " +
    "sequences, signal weighting guidance, common mistakes to avoid, and descriptions " +
    "of how to combine tools effectively. Call this at the start of any complex " +
    "multi-step task (rating prediction, taste analysis, group comparison) to orient " +
    "yourself on the correct approach before selecting tools.",
    {},
    async () => {
      const guide = loadContent("resources/tool-guide.md");
      return {
        content: [{ type: "text", text: guide }],
      };
    },
    true,
  );
}
