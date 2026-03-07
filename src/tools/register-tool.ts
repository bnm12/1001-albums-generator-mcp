import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function makeRegisterTool(server: McpServer) {
  return function registerTool<T extends z.ZodRawShape>(
    name: string,
    description: string,
    schema: T,
    handler: (args: z.output<z.ZodObject<T>>) => Promise<unknown>,
    readOnlyHint: boolean = false,
  ): void {
    const callback = async (args: z.output<z.ZodObject<T>>) => {
      console.error(`[Tool Call] ${name}`, JSON.stringify(args));
      try {
        const result = await handler(args);
        console.error(`[Tool Success] ${name}`);
        return result;
      } catch (error) {
        console.error(`[Tool Error] ${name}`, error);
        throw error;
      }
    };

    const tool = server.tool.bind(server) as unknown as (
      ...args: unknown[]
    ) => unknown;

    if (readOnlyHint) {
      tool(name, description, schema, { readOnlyHint: true }, callback);
    } else {
      tool(name, description, schema, callback);
    }
  };
}
