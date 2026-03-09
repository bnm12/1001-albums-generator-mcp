import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { makeRegisterTool } from "./register-tool.js";

async function loadContent(relativePath: string): Promise<string> {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  return readFile(join(__dirname, "..", "content", relativePath), "utf-8");
}

export function registerMetaTools(
  server: McpServer,
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
      const guide = await loadContent("resources/tool-guide.md");
      return {
        content: [{ type: "text", text: guide }],
      };
    },
    true,
  );
}
