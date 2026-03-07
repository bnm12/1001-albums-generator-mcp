import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AlbumsGeneratorClient } from "./api.js";
import { registerPrompts } from "./prompts/index.js";
import { registerResources } from "./resources/index.js";
import { registerAnalysisTools } from "./tools/analysis.js";
import { registerCommunityTools } from "./tools/community.js";
import { registerComparisonTools } from "./tools/comparison.js";
import { registerGroupTools } from "./tools/group.js";
import { registerProjectTools } from "./tools/project.js";

const defaultClient = new AlbumsGeneratorClient();

export function createMcpServer(client?: AlbumsGeneratorClient): McpServer {
  const resolvedClient = client ?? defaultClient;
  const server = new McpServer({ name: "1001-albums-generator", version: "1.0.0" });

  registerProjectTools(server, resolvedClient);
  registerCommunityTools(server, resolvedClient);
  registerGroupTools(server, resolvedClient);
  registerAnalysisTools(server, resolvedClient);
  registerComparisonTools(server, resolvedClient);
  registerPrompts(server);
  registerResources(server);

  return server;
}
