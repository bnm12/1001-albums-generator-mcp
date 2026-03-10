import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { AlbumsGeneratorClient } from "../api.js";
import { slimGroupInfo } from "../dto.js";
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

Album fields (currentAlbum, allTimeHighscore, allTimeLowscore) are returned in slim format.
Use get_album_of_the_day or get_group_latest_album for full album detail.

Does not include the latest album — use get_group_latest_album for that. The groupSlug is the group name in lowercase with hyphens instead of spaces (find it in the group page URL). Data is cached for 4 hours.`,
    {
      groupSlug: z.string().describe("The group slug (lowercase, hyphenated) from the group page URL"),
    },
    async ({ groupSlug }) => {
      const gs = requireParam(groupSlug, "groupSlug");
      if (typeof gs === "object" && "error" in gs) return gs.response;
      const group = await client.getGroup(gs);
      const slim = slimGroupInfo(group);
      return { content: [{ type: "text", text: JSON.stringify(slim, null, 2) }] };
    },
    true,
  );

  registerTool(
    "get_group_latest_album",
    `Returns the most recently assigned group album. If you need to see every member's rating for it, you should follow this up with a call to get_group_album_reviews using the album's UUID.

This is the right starting point for "what did everyone think of the last album?" conversations. For the all-time most divisive albums across the group's full history, use get_group_album_insights instead.

The groupSlug is the group name in lowercase with hyphens instead of spaces. Data is cached for 4 hours.`,
    {
      groupSlug: z.string().describe("The group slug (lowercase, hyphenated) from the group page URL"),
    },
    async ({ groupSlug }) => {
      const gs = requireParam(groupSlug, "groupSlug");
      if (typeof gs === "object" && "error" in gs) return gs.response;
      const group = await client.getGroup(gs);
      return { content: [{ type: "text", text: JSON.stringify(group.latestAlbum ?? null, null, 2) }] };
    },
    true,
  );

  registerTool(
    "get_group_album_reviews",
    `Returns all member reviews and ratings for a specific album within a group.

The albumIdentifier should be the album's UUID — this is the reliable, always-correct
way to identify an album. UUIDs are available from:
  - get_group → allTimeHighscore.uuid, allTimeLowscore.uuid,
                currentAlbum.uuid
  - get_group_latest_album → uuid
  - list_project_history or search_project_history → album.uuid on any history entry
  - get_album_detail → uuid

⚠ NAME RESOLUTION IS LIMITED: If you pass an album name instead of a UUID, the tool
will attempt to resolve it by searching only the group's currentAlbum, allTimeHighscore,
allTimeLowscore, and latestAlbum. Names from project history or any other
source will fail to resolve with a "Could not resolve" error. Always prefer passing
the UUID directly.

The groupSlug is the group name in lowercase with hyphens instead of spaces (visible
in the group page URL). Data is cached for 4 hours.`,
    {
      groupSlug: z.string().describe("The group slug (lowercase, hyphenated) from the group page URL"),
      albumIdentifier: z.string().describe(
        "Album identifier. Prefer UUID or generatedAlbumId when available — these are unambiguous and not affected by punctuation, casing, or subtitle differences. Fall back to the album name only when no stable identifier is available. UUIDs are returned by get_album_of_the_day, list and search tools, and get_album_context. The generatedAlbumId is available from list_project_history and search_project_history.",
      ),
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
        const candidates = [
          group.currentAlbum,
          group.allTimeHighscore,
          group.allTimeLowscore,
          group.latestAlbum,
        ].filter((a): a is NonNullable<typeof a> => a != null);
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
        await client.invalidateGlobalStats();
      } else if (type === "user") {
        await client.invalidateUserStats();
      } else if (type === "project") {
        const pid = requireParam(projectIdentifier ?? "", "projectIdentifier");
        if (typeof pid === "object" && "error" in pid) return pid.response;
        await client.invalidateProject(pid);
      } else if (type === "group") {
        const gs = requireParam(groupSlug ?? "", "groupSlug");
        if (typeof gs === "object" && "error" in gs) return gs.response;
        await client.invalidateGroup(gs);
      } else if (type === "all") {
        await client.clearCache();
      }

      return { content: [{ type: "text", text: `Successfully invalidated ${type} cache.` }] };
    },
  );
}
