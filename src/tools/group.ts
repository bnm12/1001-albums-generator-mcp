import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { AlbumsGeneratorClient } from "../api.js";
import { requireParam } from "../helpers.js";
import { makeRegisterTool } from "./register-tool.js";

export function registerGroupTools(
  server: McpServer,
  client: AlbumsGeneratorClient,
): void {
  const registerTool = makeRegisterTool(server);

  registerTool(
    "get_group",
    `Returns a summary of a 1001 Albums Generator group. Use this as the entry point for any group-related conversation — it gives you the group's name, full member list (with their project identifiers), current album, all-time highest rated album, and all-time lowest rated album.

The member list is particularly important: the projectIdentifier for each member is what you pass to get_project_stats, list_project_history, get_taste_profile, get_rating_outliers, and get_group_member_comparison to analyse individual members.

The allTimeHighscore and allTimeLowscore include the album and all member votes — use these to open discussions like "your group's most beloved album of all time is..." or "this is the one album everyone agreed was bad".

Does not include the latest album with votes — use get_group_latest_album for that. The groupSlug is the group name in lowercase with hyphens instead of spaces (find it in the group page URL). Data is cached for 4 hours.`,
    {
      groupSlug: z.string().describe("The group slug (lowercase, hyphenated) from the group page URL"),
    },
    async ({ groupSlug }) => {
      const gs = requireParam(groupSlug, "groupSlug");
      if (typeof gs === "object" && "error" in gs) return gs.response;
      const group = await client.getGroup(gs);
      const { latestAlbumWithVotes, ...summary } = group;
      return { content: [{ type: "text", text: JSON.stringify(summary, null, 2) }] };
    },
    true,
  );

  registerTool(
    "get_group_latest_album",
    `Returns the most recently assigned group album along with every member's rating for it. Use this to discuss how the group responded to their latest shared listening experience — who rated it highest, who was coldest on it, and how the group average compares to the community rating.

This is the right starting point for "what did everyone think of the last album?" conversations. For the all-time most divisive albums across the group's full history, use get_group_album_insights instead.

The groupSlug is the group name in lowercase with hyphens instead of spaces. Data is cached for 4 hours.`,
    {
      groupSlug: z.string().describe("The group slug (lowercase, hyphenated) from the group page URL"),
    },
    async ({ groupSlug }) => {
      const gs = requireParam(groupSlug, "groupSlug");
      if (typeof gs === "object" && "error" in gs) return gs.response;
      const group = await client.getGroup(gs);
      return { content: [{ type: "text", text: JSON.stringify(group.latestAlbumWithVotes ?? null, null, 2) }] };
    },
    true,
  );

  registerTool(
    "get_group_album_reviews",
    "Returns all member reviews and ratings for a specific album within a group. Accepts either the album UUID or album name as the albumIdentifier — if a name is given, it is resolved to a UUID via the global book stats. For best results, prefer passing the UUID directly (available from get_group or get_group_latest_album). The groupSlug is the group name in lowercase with hyphens instead of spaces. Data is cached for 4 hours.",
    {
      groupSlug: z.string().describe("The group slug (lowercase, hyphenated) from the group page URL"),
      albumIdentifier: z.string().describe("The album UUID, or album name to resolve against the book list"),
    },
    async ({ groupSlug, albumIdentifier }) => {
      const gs = requireParam(groupSlug, "groupSlug");
      if (typeof gs === "object" && "error" in gs) return gs.response;
      const aid = requireParam(albumIdentifier, "albumIdentifier");
      if (typeof aid === "object" && "error" in aid) return aid.response;
      const uuidRegex = /^[0-9a-f]{24}$/i;
      let albumUuid = aid;

      if (!uuidRegex.test(aid)) {
        const group = await client.getGroup(gs);
        const candidates = [group.currentAlbum, group.allTimeHighscore?.album, group.allTimeLowscore?.album, group.latestAlbumWithVotes?.album].filter((a): a is NonNullable<typeof a> => a != null);
        const lowerIdentifier = aid.toLowerCase();
        const match = candidates.find((a) => a.name.toLowerCase() === lowerIdentifier);

        if (!match) {
          return { content: [{ type: "text", text: `Could not resolve album name "${aid}" to a UUID. Try passing the UUID directly instead.` }] };
        }
        albumUuid = match.uuid;
      }

      const reviews = await client.getGroupAlbumReviews(gs, albumUuid);
      return { content: [{ type: "text", text: JSON.stringify(reviews, null, 2) }] };
    },
    true,
  );

  registerTool(
    "refresh_data",
    'Invalidates cached data. The next time the data is requested, it will be fetched fresh from the API. Use type "group" with a groupSlug or "project" with a projectIdentifier to refresh specific datasets.',
    {
      type: z.enum(["global", "user", "project", "group", "all"]).describe("Type of data to refresh"),
      projectIdentifier: z.string().optional().describe('Required if type is "project"'),
      groupSlug: z.string().optional().describe('Required if type is "group"'),
    },
    async ({ type, projectIdentifier, groupSlug }) => {
      if (type === "global") {
        client.invalidateGlobalStats();
      } else if (type === "user") {
        client.invalidateUserStats();
      } else if (type === "project") {
        const pid = requireParam(projectIdentifier ?? "", "projectIdentifier");
        if (typeof pid === "object" && "error" in pid) return pid.response;
        client.invalidateProject(pid);
      } else if (type === "group") {
        const gs = requireParam(groupSlug ?? "", "groupSlug");
        if (typeof gs === "object" && "error" in gs) return gs.response;
        client.invalidateGroup(gs);
      } else if (type === "all") {
        client.clearCache();
      }

      return { content: [{ type: "text", text: `Successfully invalidated ${type} cache.` }] };
    },
  );
}
