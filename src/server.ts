import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AlbumsGeneratorClient } from "./api.js";
import { registerPrompts } from "./prompts/index.js";
import { registerResources } from "./resources/index.js";
import { registerAnalysisTools } from "./tools/analysis.js";
import { registerCommunityTools } from "./tools/community.js";
import { registerComparisonTools } from "./tools/comparison.js";
import { registerGroupTools } from "./tools/group.js";
import { registerProjectTools } from "./tools/project.js";
import { registerMetaTools } from "./tools/meta.js";

export function createMcpServer(client?: AlbumsGeneratorClient): McpServer {
  const resolvedClient = client ?? new AlbumsGeneratorClient();
  const server = new McpServer({
    name: "1001-albums-generator",
    version: "1.0.0",
    description:
      "MCP server for the 1001 Albums Generator challenge. Provides tools to explore " +
      "your listening history, analyse taste from ratings and reviews, compare group " +
      "members, and get context on today's assigned album. Before calling any tools, " +
      "read the tool guide resource at info://1001-albums/tool-guide.",
  });

  registerProjectTools(server, resolvedClient);
  registerCommunityTools(server, resolvedClient);
  registerGroupTools(server, resolvedClient);
  registerAnalysisTools(server, resolvedClient);
  registerComparisonTools(server, resolvedClient);
  registerMetaTools(server, resolvedClient);
  registerPrompts(server);
  registerResources(server);

  return server;
}
