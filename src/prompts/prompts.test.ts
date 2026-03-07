import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { registerPrompts } from "../prompts/index.js";

function loadRawPrompt(filename: string): string {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  return readFileSync(
    join(__dirname, "..", "content", "prompts", filename),
    "utf-8",
  );
}

async function getPromptText(client: Client, name: string, args: Record<string, string>): Promise<string> {
  const response = await client.getPrompt({ name, arguments: args });
  const content = response.messages[0].content;
  if (content.type !== "text") {
    throw new Error("Expected text content");
  }
  return content.text;
}

describe("Prompts", () => {
  let server: McpServer;
  let client: Client;

  beforeEach(async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    server = new McpServer({ name: "test", version: "0.0.0" });
    registerPrompts(server);
    await server.connect(serverTransport);
    client = new Client({ name: "test-client", version: "0.0.0" }, { capabilities: {} });
    await client.connect(clientTransport);
  });

  afterEach(async () => {
    await client.close();
  });

  describe("todays-album", () => {
    it("contains projectIdentifier in output", async () => {
      const text = await getPromptText(client, "todays-album", { projectIdentifier: "my-test-project" });
      expect(text).toContain("my-test-project");
    });
    it("has no unresolved placeholders", async () => {
      const text = await getPromptText(client, "todays-album", { projectIdentifier: "my-test-project" });
      expect(text).not.toMatch(/\$\{[^}]+\}/);
    });
    it("does not contain args. prefix", async () => {
      const text = await getPromptText(client, "todays-album", { projectIdentifier: "my-test-project" });
      expect(text).not.toContain("args.");
    });
  });

  describe("predict-my-rating", () => {
    it("contains projectIdentifier in output", async () => {
      const text = await getPromptText(client, "predict-my-rating", { projectIdentifier: "my-test-project" });
      expect(text).toContain("my-test-project");
    });
    it("has no unresolved placeholders", async () => {
      const text = await getPromptText(client, "predict-my-rating", { projectIdentifier: "my-test-project" });
      expect(text).not.toMatch(/\$\{[^}]+\}/);
    });
    it("does not contain args. prefix", async () => {
      const text = await getPromptText(client, "predict-my-rating", { projectIdentifier: "my-test-project" });
      expect(text).not.toContain("args.");
    });
  });

  describe("taste-profile", () => {
    it("contains projectIdentifier in output", async () => {
      const text = await getPromptText(client, "taste-profile", { projectIdentifier: "my-test-project" });
      expect(text).toContain("my-test-project");
    });
    it("has no unresolved placeholders", async () => {
      const text = await getPromptText(client, "taste-profile", { projectIdentifier: "my-test-project" });
      expect(text).not.toMatch(/\$\{[^}]+\}/);
    });
    it("does not contain args. prefix", async () => {
      const text = await getPromptText(client, "taste-profile", { projectIdentifier: "my-test-project" });
      expect(text).not.toContain("args.");
    });
  });

  describe("album-deep-dive", () => {
    it("contains projectIdentifier in output", async () => {
      const text = await getPromptText(client, "album-deep-dive", { projectIdentifier: "my-test-project", albumName: "Kind of Blue" });
      expect(text).toContain("my-test-project");
    });
    it("contains albumName in output", async () => {
      const text = await getPromptText(client, "album-deep-dive", { projectIdentifier: "my-test-project", albumName: "Kind of Blue" });
      expect(text).toContain("Kind of Blue");
    });
    it("has no unresolved placeholders", async () => {
      const text = await getPromptText(client, "album-deep-dive", { projectIdentifier: "my-test-project", albumName: "Kind of Blue" });
      expect(text).not.toMatch(/\$\{[^}]+\}/);
    });
    it("does not contain args. prefix", async () => {
      const text = await getPromptText(client, "album-deep-dive", { projectIdentifier: "my-test-project", albumName: "Kind of Blue" });
      expect(text).not.toContain("args.");
    });
  });

  describe("rating-outliers", () => {
    it("contains projectIdentifier in output", async () => {
      const text = await getPromptText(client, "rating-outliers", { projectIdentifier: "my-test-project" });
      expect(text).toContain("my-test-project");
    });
    it("has no unresolved placeholders", async () => {
      const text = await getPromptText(client, "rating-outliers", { projectIdentifier: "my-test-project" });
      expect(text).not.toMatch(/\$\{[^}]+\}/);
    });
    it("does not contain args. prefix", async () => {
      const text = await getPromptText(client, "rating-outliers", { projectIdentifier: "my-test-project" });
      expect(text).not.toContain("args.");
    });
  });

  describe("genre-journey", () => {
    it("contains projectIdentifier in output", async () => {
      const text = await getPromptText(client, "genre-journey", { projectIdentifier: "my-test-project" });
      expect(text).toContain("my-test-project");
    });
    it("has no unresolved placeholders", async () => {
      const text = await getPromptText(client, "genre-journey", { projectIdentifier: "my-test-project" });
      expect(text).not.toMatch(/\$\{[^}]+\}/);
    });
    it("does not contain args. prefix", async () => {
      const text = await getPromptText(client, "genre-journey", { projectIdentifier: "my-test-project" });
      expect(text).not.toContain("args.");
    });
  });

  describe("group-latest-album", () => {
    it("contains groupSlug in output", async () => {
      const text = await getPromptText(client, "group-latest-album", { groupSlug: "test-group" });
      expect(text).toContain("test-group");
    });
    it("has no unresolved placeholders", async () => {
      const text = await getPromptText(client, "group-latest-album", { groupSlug: "test-group" });
      expect(text).not.toMatch(/\$\{[^}]+\}/);
    });
    it("does not contain args. prefix", async () => {
      const text = await getPromptText(client, "group-latest-album", { groupSlug: "test-group" });
      expect(text).not.toContain("args.");
    });
  });

  describe("group-compatibility", () => {
    it("contains groupSlug in output", async () => {
      const text = await getPromptText(client, "group-compatibility", { groupSlug: "test-group" });
      expect(text).toContain("test-group");
    });
    it("has no unresolved placeholders", async () => {
      const text = await getPromptText(client, "group-compatibility", { groupSlug: "test-group" });
      expect(text).not.toMatch(/\$\{[^}]+\}/);
    });
    it("does not contain args. prefix", async () => {
      const text = await getPromptText(client, "group-compatibility", { groupSlug: "test-group" });
      expect(text).not.toContain("args.");
    });
  });

  describe("group-divisive-albums", () => {
    it("contains groupSlug in output", async () => {
      const text = await getPromptText(client, "group-divisive-albums", { groupSlug: "test-group" });
      expect(text).toContain("test-group");
    });
    it("has no unresolved placeholders", async () => {
      const text = await getPromptText(client, "group-divisive-albums", { groupSlug: "test-group" });
      expect(text).not.toMatch(/\$\{[^}]+\}/);
    });
    it("does not contain args. prefix", async () => {
      const text = await getPromptText(client, "group-divisive-albums", { groupSlug: "test-group" });
      expect(text).not.toContain("args.");
    });
  });

  describe("compare-members", () => {
    it("contains projectIdentifierA in output", async () => {
      const text = await getPromptText(client, "compare-members", { projectIdentifierA: "member-one", projectIdentifierB: "member-two" });
      expect(text).toContain("member-one");
    });
    it("contains projectIdentifierB in output", async () => {
      const text = await getPromptText(client, "compare-members", { projectIdentifierA: "member-one", projectIdentifierB: "member-two" });
      expect(text).toContain("member-two");
    });
    it("has no unresolved placeholders", async () => {
      const text = await getPromptText(client, "compare-members", { projectIdentifierA: "member-one", projectIdentifierB: "member-two" });
      expect(text).not.toMatch(/\$\{[^}]+\}/);
    });
    it("does not contain args. prefix", async () => {
      const text = await getPromptText(client, "compare-members", { projectIdentifierA: "member-one", projectIdentifierB: "member-two" });
      expect(text).not.toContain("args.");
    });
  });

  describe("listening-wrapped", () => {
    it("contains projectIdentifier in output", async () => {
      const text = await getPromptText(client, "listening-wrapped", { projectIdentifier: "my-test-project" });
      expect(text).toContain("my-test-project");
    });
    it("has no unresolved placeholders", async () => {
      const text = await getPromptText(client, "listening-wrapped", { projectIdentifier: "my-test-project" });
      expect(text).not.toMatch(/\$\{[^}]+\}/);
    });
    it("does not contain args. prefix", async () => {
      const text = await getPromptText(client, "listening-wrapped", { projectIdentifier: "my-test-project" });
      expect(text).not.toContain("args.");
    });
  });

  describe("personalized-pitch", () => {
    it("contains projectIdentifier in output", async () => {
      const text = await getPromptText(client, "personalized-pitch", { projectIdentifier: "my-test-project", albumIdentifier: "some-album-id" });
      expect(text).toContain("my-test-project");
    });
    it("contains albumIdentifier in output", async () => {
      const text = await getPromptText(client, "personalized-pitch", { projectIdentifier: "my-test-project", albumIdentifier: "some-album-id" });
      expect(text).toContain("some-album-id");
    });
    it("has no unresolved placeholders", async () => {
      const text = await getPromptText(client, "personalized-pitch", { projectIdentifier: "my-test-project", albumIdentifier: "some-album-id" });
      expect(text).not.toMatch(/\$\{[^}]+\}/);
    });
    it("does not contain args. prefix", async () => {
      const text = await getPromptText(client, "personalized-pitch", { projectIdentifier: "my-test-project", albumIdentifier: "some-album-id" });
      expect(text).not.toContain("args.");
    });
    it("uses __TODAY__ sentinel when albumIdentifier is omitted", async () => {
      const text = await getPromptText(client, "personalized-pitch", { projectIdentifier: "my-test-project" });
      expect(text).toContain("__TODAY__");
      expect(text).not.toContain("undefined");
    });
  });

  describe("raw template files", () => {
    const files = [
      "todays-album.txt",
      "predict-my-rating.txt",
      "taste-profile.txt",
      "album-deep-dive.txt",
      "rating-outliers.txt",
      "genre-journey.txt",
      "group-latest-album.txt",
      "group-compatibility.txt",
      "group-divisive-albums.txt",
      "compare-members.txt",
      "listening-wrapped.txt",
      "personalized-pitch.txt",
    ];

    for (const file of files) {
      it(`${file} does not use args. prefix syntax`, () => {
        const content = loadRawPrompt(file);
        expect(content).not.toContain("args.");
      });
    }
  });
});
