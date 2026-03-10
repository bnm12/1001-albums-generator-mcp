<p align="center">
  <img src="assets/logo.png" width="400" alt="1001 Albums MCP Logo"/>
</p>

<h1 align="center">1001 Albums Generator MCP</h1>

<p align="center">
  <em>AI-powered exploration of your <a href="https://1001albumsgenerator.com">1001 Albums</a> listening journey</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/node-18%2B-brightgreen?style=flat-square"/>
  <img src="https://img.shields.io/badge/MCP-compatible-4A90D9?style=flat-square"/>
  <img src="https://img.shields.io/badge/Claude-Desktop-8B5CF6?style=flat-square"/>
  <img src="https://img.shields.io/badge/license-ISC-lightgrey?style=flat-square"/>
</p>

<p align="center">
  <a href="#installation">Install</a> ·
  <a href="#mcp-tools-reference">Tools</a> ·
  <a href="#example-prompts">Prompts</a> ·
  <a href="#contributing">Contributing</a>
</p>

---

<p align="center">
  <img src="assets/demo.gif" width="850" alt="Demo"/>
</p>

---

## What is this?

[1001 Albums Generator](https://1001albumsgenerator.com) — built by [u/SidledsGunnar](https://www.reddit.com/user/SidledsGunnar) — is a web app that assigns you one album at a time from the canonical _1001 Albums You Must Hear Before You Die_ list, and asks you to listen and rate it. It's a brilliant way to systematically explore music history, and it quietly accumulates a rich personal dataset as you go: your ratings, your written reviews, your listening timeline.

**1001 Albums Generator MCP** connects that dataset to AI assistants via the [Model Context Protocol](https://modelcontextprotocol.io), so you can explore it through natural conversation instead of manually browsing the site.

```
You:    What's today's album?
Claude: Today's album is Miles Davis — Kind of Blue (1959).
        One of the most influential jazz recordings ever made, featuring
        Coltrane, Cannonball Adderley, and Bill Evans. Community rating: ★ 4.63
```

---

## Capabilities

| Area                       | What the AI can do                                                             |
| -------------------------- | ------------------------------------------------------------------------------ |
| 🎵 **Daily listening**     | Retrieve today's album with background, context, and personal pitch            |
| 📚 **History**             | Browse, search, and explore your full listening archive                        |
| 📊 **Taste analysis**      | Genre affinities, decade distributions, rating tendencies, community alignment |
| 🧠 **Pattern recognition** | Arc analysis, milestone detection, listening journey narrative                 |
| 🔍 **Review insights**     | Synthesise your written reviews to understand your own taste                   |
| 👥 **Groups**              | Compare members, find divisive albums, map taste compatibility                 |

---

## Installation

> **Note:** This server enforces a **20-second minimum interval** between upstream API calls and caches responses for **4 hours** to stay within the upstream rate limit of 3 requests/minute. First requests after a cache miss may be slow — this is a constraint of the [1001 Albums Generator API](https://www.reddit.com/r/1001AlbumsGenerator/comments/p6xw6y/json_api/), not the server.

### Option A — Claude MCP Bundle _(recommended)_

No Node.js required for the remote version.

1. Go to the [releases page](https://github.com/bnm12/1001-albums-generator-mcp/releases) and download a `.mcpb` file:

   | File           | What it does                                     |
   | -------------- | ------------------------------------------------ |
   | `*-remote.mcpb` | Connects to the hosted server — zero local setup |
   | `*-local.mcpb`  | Runs the MCP server locally on your machine      |

2. Open **Claude Desktop → Settings → Extensions**
3. Drag and drop the `.mcpb` file into the window

---

### Option B — Remote HTTP Server _(no install)_

Point any MCP client at the hosted server:

```
https://1001-albums-mcp.bnm12.dk/mcp
```

**Claude Desktop** (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "1001-albums": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://1001-albums-mcp.bnm12.dk/mcp"]
    }
  }
}
```

---

### Option C — Local Installation

**Requirements:** Node.js 18+

```bash
git clone https://github.com/bnm12/1001-albums-generator-mcp.git
cd 1001-albums-generator-mcp
npm install && npm run build
```

**Claude Desktop** (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "1001-albums": {
      "command": "node",
      "args": ["/absolute/path/to/dist/index.js"],
      "env": { "MCP_MODE": "stdio" }
    }
  }
}
```

**As an HTTP server** (for any MCP client over HTTP):

```bash
MCP_MODE=http PORT=3000 node dist/index.js
# Endpoint: http://localhost:3000/mcp
```

Restart Claude Desktop after any config change.

---

## MCP Tools Reference

### Project tools

| Tool                     | Description                                                              |
| ------------------------ | ------------------------------------------------------------------------ |
| `get_album_of_the_day`   | Today's assigned album with full metadata and project notes              |
| `get_project_stats`      | Progress summary: generated, rated, unrated, current album               |
| `list_project_history`¹  | Full history with sort and pagination                                    |
| `search_project_history` | Search history by artist, album, year, genre, or character — multi-word queries use OR matching |
| `get_album_detail`²      | Full detail for one album: review, streaming links, subgenres            |
| `get_album_context`      | Artist arc, musical connections, community divergence, listening journey |

### Meta tools

| Tool             | Description                                                                                    |
| ---------------- | ---------------------------------------------------------------------------------------------- |
| `get_tool_guide` | Returns the full workflow guide — recommended tool sequences, signal weighting, common mistakes |

### Analysis tools

| Tool                   | Description                                                    |
| ---------------------- | -------------------------------------------------------------- |
| `get_taste_profile`    | Genres, decades, rating tendencies, community alignment        |
| `get_rating_outliers`  | Albums where your ratings diverge most from the community      |
| `get_review_insights`³ | Synthesise your written reviews into qualitative taste insight |
| `get_listening_arc`    | Segmented journey analysis with trends and milestones          |

### Group tools

| Tool                             | Description                                                |
| -------------------------------- | ---------------------------------------------------------- |
| `get_group`                      | Summary: members, current album, all-time high/low         |
| `get_group_latest_album`         | Latest group album with all member votes                   |
| `get_group_album_reviews`        | Every member's rating and review for a specific album      |
| `get_group_album_insights`       | Most divisive and most consensus albums by rating variance |
| `get_group_member_comparison`    | Side-by-side taste comparison between two members          |
| `get_group_compatibility_matrix` | Group-wide pairwise compatibility — who agrees with whom   |
| `compare_projects`               | High-level comparison of any two projects                  |

### Community tools

| Tool                              | Description                                           |
| --------------------------------- | ----------------------------------------------------- |
| `list_book_album_stats`           | Community ratings for all ~1001 canonical book albums |
| `get_book_album_stat`             | Search book albums by name, artist, genre, or year    |
| `list_user_submitted_album_stats` | Stats for user-submitted albums outside the book list |
| `refresh_data`                    | Force-refresh cached data for any dataset             |

---

¹ List and search tools return a **slim format** — no reviews, streaming links, or images. Use `get_album_detail` when you need a written review, a Spotify/Apple Music link, or full genre breakdown.

² Identify albums by name, UUID, or `generatedAlbumId` (available from list/search results).

³ `get_review_insights` attempts to use **MCP Sampling** to synthesise reviews. Most clients including Claude Desktop do not currently support sampling — the tool automatically falls back to returning the raw reviews with synthesis instructions for the agent to complete directly. Output quality is equivalent either way.

---

## Prompt Templates

Compatible clients (e.g. Claude Desktop) surface these as one-click conversation starters.

| Prompt                  | Description                                                  |
| ----------------------- | ------------------------------------------------------------ |
| `todays-album`          | Background and context on today's assigned album             |
| `predict-my-rating`     | Predict how you'll rate today's album based on your history  |
| `taste-profile`         | Full taste analysis and listener archetype                   |
| `album-deep-dive`       | Deep contextual analysis of a specific album in your history |
| `rating-outliers`       | Where your taste diverges most from the community            |
| `genre-journey`         | How your genre exposure has evolved over time                |
| `listening-wrapped`     | Spotify Wrapped-style summary of your listening history      |
| `personalized-pitch`    | Persuasive, taste-grounded case for a specific album         |
| `group-latest-album`    | How your group rated their latest album                      |
| `group-compatibility`   | Who in your group has the most similar and different taste   |
| `group-divisive-albums` | Albums that split your group — and ones you all agreed on    |
| `compare-members`       | Detailed taste comparison between two group members          |

---

## Example Prompts

**Daily**

```
What's today's album from my project?
Give me a personalised pitch for why I should care about today's album.
Predict how I'll rate today's album and explain your reasoning.
```

**History & taste**

```
Build a full profile of my music taste.
Which decade dominates my listening history?
Which albums did I rate way above the community average?
How has my taste evolved over time?
```

**Discovery**

```
Give me a deep dive on Kind of Blue from my history.
Find connections between the last five albums I listened to.
What does my review history say about what I actually value in music?
```

**Group**

```
What did everyone in our group think of the latest album?
Who in our group has the most similar taste to me?
Which album has divided our group the most?
```

---

## Contributing

Contributions are welcome. Some ideas:

- New analysis tools (recommendation engine, mood inference, BPM/key data)
- Deeper genre clustering
- Visual listening stats

**Before opening a PR**, run the full check suite:

```bash
npx tsc --noEmit   # strict TypeScript
npm run lint       # ESLint
npm run build
npm test
```

When adding tools, register them in `createMcpServer()` in `src/index.ts` and update `README.md`, `AGENTS.md`, and `src/content/resources/tool-guide.md`. The updated tool-guide is automatically returned by `get_tool_guide` — no additional step needed. See [AGENTS.md](./AGENTS.md) for the full contribution guide.

---

## License

[ISC](./LICENSE) © 2026 bnm12

---

<p align="center">
  Built for music nerds doing the <a href="https://1001albumsgenerator.com">1001 Albums challenge</a><br/>
  Thanks to <a href="https://www.reddit.com/user/SidledsGunnar">u/SidledsGunnar</a> for building the generator that makes all of this possible<br/>
  Powered by <a href="https://modelcontextprotocol.io">Model Context Protocol</a>
</p>
