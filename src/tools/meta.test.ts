import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assertToolSuccess, getToolResponseText } from "../test/assertions.js";
import { createTestClient, type TestClient } from "../test/create-test-client.js";
import { makeMockClient } from "../test/mock-client.js";

describe("meta tools", () => {
  let testClient: TestClient;
  let mockClient: ReturnType<typeof makeMockClient>;

  beforeEach(async () => {
    mockClient = makeMockClient();
    testClient = await createTestClient(mockClient);
  });

  afterEach(async () => {
    await testClient.cleanup();
  });

  describe("get_tool_guide", () => {
    it("returns text content containing expected headings", async () => {
      const result = await testClient.client.callTool({
        name: "get_tool_guide",
        arguments: {},
      });

      const text = getToolResponseText(result);
      expect(text).toContain("# 1001 Albums MCP — Tool Usage Guide");
      expect(text).toContain("Predicting a rating for today's album");
      expect(text).toContain("Character search");
    });

    it("takes no parameters", async () => {
      const result = await testClient.client.callTool({
        name: "get_tool_guide",
        arguments: { someExtraArg: "should be ignored" } as any,
      });
      assertToolSuccess(result);
    });
  });
});
