import { describe, expect, it } from "vitest";
import { AlbumsGeneratorClient } from "../api.js";

const RUN = process.env.TEST_LIVE_API === "true";
const maybeIt = RUN ? it : it.skip;

describe("AlbumsGeneratorClient live API", () => {
  const client = new AlbumsGeneratorClient();

  maybeIt(
    "getProject returns expected shape",
    async () => {
      const project = await client.getProject("test");
      expect(project).toHaveProperty("name");
      expect(project).toHaveProperty("history");
      expect(Array.isArray(project.history)).toBe(true);
    },
    60_000,
  );

  maybeIt(
    "getGroup returns expected shape",
    async () => {
      const group = await client.getGroup("test");
      expect(group).toHaveProperty("name");
      expect(group).toHaveProperty("members");
      expect(Array.isArray(group.members)).toBe(true);
    },
    60_000,
  );
});
