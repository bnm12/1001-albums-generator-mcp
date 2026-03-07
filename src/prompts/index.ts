import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

function loadPrompt(filename: string): string {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  return readFileSync(join(__dirname, "..", "content", "prompts", filename), "utf-8");
}

function interpolate(template: string, vars: Record<string, string>): string {
  const result = Object.entries(vars).reduce(
    (text, [key, value]) => text.replaceAll(`\${${key}}`, value),
    template,
  );
  const unresolved = result.match(/\$\{[^}]+\}/g);
  if (unresolved) {
    throw new Error(
      `Prompt template has unresolved placeholders: ${unresolved.join(", ")}`,
    );
  }
  return result;
}

export function registerPrompts(server: McpServer): void {
  server.prompt("todays-album", "Get background and context on today's assigned album", { projectIdentifier: z.string().describe("Your project name or sharerId") }, ({ projectIdentifier }) => ({ messages: [{ role: "user", content: { type: "text", text: interpolate(loadPrompt("todays-album.txt"), { projectIdentifier }) } }] }));
  server.prompt("predict-my-rating", "Predict how you'll rate today's album based on your history and past reviews", { projectIdentifier: z.string().describe("Your project name or sharerId") }, ({ projectIdentifier }) => ({ messages: [{ role: "user", content: { type: "text", text: interpolate(loadPrompt("predict-my-rating.txt"), { projectIdentifier }) } }] }));
  server.prompt("taste-profile", "Get a full analysis of your music taste based on your listening history", { projectIdentifier: z.string().describe("Your project name or sharerId") }, ({ projectIdentifier }) => ({ messages: [{ role: "user", content: { type: "text", text: interpolate(loadPrompt("taste-profile.txt"), { projectIdentifier }) } }] }));
  server.prompt("album-deep-dive", "Get a deep contextual analysis of a specific album in your history", { projectIdentifier: z.string().describe("Your project name or sharerId"), albumName: z.string().describe("The name of the album to analyse") }, ({ projectIdentifier, albumName }) => ({ messages: [{ role: "user", content: { type: "text", text: interpolate(loadPrompt("album-deep-dive.txt"), { projectIdentifier, albumName }) } }] }));
  server.prompt("rating-outliers", "Find the albums where your taste diverges most from the community", { projectIdentifier: z.string().describe("Your project name or sharerId") }, ({ projectIdentifier }) => ({ messages: [{ role: "user", content: { type: "text", text: interpolate(loadPrompt("rating-outliers.txt"), { projectIdentifier }) } }] }));
  server.prompt("genre-journey", "Explore how your genre exposure has evolved over your listening history", { projectIdentifier: z.string().describe("Your project name or sharerId") }, ({ projectIdentifier }) => ({ messages: [{ role: "user", content: { type: "text", text: interpolate(loadPrompt("genre-journey.txt"), { projectIdentifier }) } }] }));
  server.prompt("group-latest-album", "See how your group rated their latest album and spark a discussion", { groupSlug: z.string().describe("Your group slug from the group page URL") }, ({ groupSlug }) => ({ messages: [{ role: "user", content: { type: "text", text: interpolate(loadPrompt("group-latest-album.txt"), { groupSlug }) } }] }));
  server.prompt("group-compatibility", "Find out who in your group has the most similar and most different taste", { groupSlug: z.string().describe("Your group slug from the group page URL") }, ({ groupSlug }) => ({ messages: [{ role: "user", content: { type: "text", text: interpolate(loadPrompt("group-compatibility.txt"), { groupSlug }) } }] }));
  server.prompt("group-divisive-albums", "Find the albums that divided your group most — and the ones you all agreed on", { groupSlug: z.string().describe("Your group slug from the group page URL") }, ({ groupSlug }) => ({ messages: [{ role: "user", content: { type: "text", text: interpolate(loadPrompt("group-divisive-albums.txt"), { groupSlug }) } }] }));
  server.prompt("compare-members", "Get a detailed taste comparison between two group members", { projectIdentifierA: z.string().describe("First member's project name or sharerId"), projectIdentifierB: z.string().describe("Second member's project name or sharerId") }, ({ projectIdentifierA, projectIdentifierB }) => ({ messages: [{ role: "user", content: { type: "text", text: interpolate(loadPrompt("compare-members.txt"), { projectIdentifierA, projectIdentifierB }) } }] }));
  server.prompt("listening-wrapped", "Get a Spotify Wrapped-style summary of your listening history", { projectIdentifier: z.string().describe("Your project name or sharerId") }, ({ projectIdentifier }) => ({ messages: [{ role: "user", content: { type: "text", text: interpolate(loadPrompt("listening-wrapped.txt"), { projectIdentifier }) } }] }));
  server.prompt("personalized-pitch", "Generate a persuasive, personal case for why you specifically should care about an album — grounded in your taste history, not generic background info. Defaults to today's album if no album is specified.", { projectIdentifier: z.string().describe("Your project slug or username."), albumIdentifier: z.string().optional().describe("The generatedAlbumId of a specific album in your history. Omit to use today's assigned album.") }, ({ projectIdentifier, albumIdentifier }) => ({ messages: [{ role: "user", content: { type: "text", text: interpolate(loadPrompt("personalized-pitch.txt"), { projectIdentifier, albumIdentifier: albumIdentifier ?? "__TODAY__" }) } }] }));
}
