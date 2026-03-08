<p align="center">
  <img src="assets/logo.svg" width="140" alt="1001 Albums MCP Logo"/>
</p>

<h1 align="center">1001 Albums Generator MCP</h1>

<p align="center">
  <em>AI-powered exploration of your <strong>1001 Albums You Must Hear Before You Die</strong> journey</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/node-18%2B-brightgreen?style=flat-square"/>
  <img src="https://img.shields.io/badge/MCP-compatible-4A90D9?style=flat-square"/>
  <img src="https://img.shields.io/badge/Claude-Desktop-8B5CF6?style=flat-square"/>
  <img src="https://img.shields.io/badge/license-ISC-lightgrey?style=flat-square"/>
</p>

<p align="center">
  <a href="#-installation">Install</a> ·
  <a href="#-mcp-tools-reference">Tools</a> ·
  <a href="#-example-prompts">Prompts</a> ·
  <a href="#-contributing">Contributing</a>
</p>

---

<p align="center">
  <img src="assets/demo.gif" width="850" alt="Demo"/>
</p>

---

## What is this?

**1001 Albums Generator MCP** connects AI assistants to your [1001 Albums Generator](https://1001albumsgenerator.com) listening history via the [Model Context Protocol](https://modelcontextprotocol.io).

Instead of manually browsing the website, your AI can retrieve today's album, explore your history, analyze your taste, compare you to the global community, and discover musical relationships — all in natural conversation.

```
You:    What's today's album?
Claude: Today's album is Miles Davis — Kind of Blue (1959).
        One of the most influential jazz recordings ever made,
        featuring Coltrane, Cannonball Adderley, and Bill Evans.
        Community rating: ★ 4.63 / 5
```

---

## ✨ Capabilities

| Area                   | What the AI can do                                     |
| ---------------------- | ------------------------------------------------------ |
| 🎵 **Daily listening** | Retrieve today's album, get background & context       |
| 📚 **History**         | Browse, filter, and search your full listening history |
| 📊 **Analytics**       | Ratings, streaks, decade distributions, taste profiles |
| 🌍 **Community**       | Compare your ratings to global averages                |
| 🧠 **Discovery**       | Musical lineage, artist clusters, genre connections    |

---

## 🚀 Installation

### Option A — Claude Desktop Extension _(recommended)_

The easiest way. No Node.js required for the remote version.

1. Go to the [releases page](https://github.com/bnm12/1001-albums-generator-mcp/releases)
2. Download the right `.dxt` file:

| File           | Description                                      |
| -------------- | ------------------------------------------------ |
| `*-remote.dxt` | Connects to the hosted server — zero local setup |
| `*.dxt`        | Runs the MCP server locally on your machine      |

3. Open **Claude Desktop → Settings → Extensions**
4. Drag and drop the `.dxt` file into the window

---

### Option B — Remote HTTP Server _(no install)_

Point any MCP client directly at the hosted server:

```
https://1001-albums-mcp.bnm12.dk/mcp
```

**Claude Desktop (`claude_desktop_config.json`):**

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

**Claude Desktop (`claude_desktop_config.json`):**

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

**Run as an HTTP server** (for use with any MCP client over HTTP):

```bash
MCP_MODE=sse PORT=3000 node dist/index.js
# MCP endpoint: http://localhost:3000/mcp
```

Restart Claude Desktop after any config change.

---

## 🛠 MCP Tools Reference

### Project Tools

| Tool                     | Description                                                                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `get_album_of_the_day`   | Today's assigned album with full metadata and project notes                                                                           |
| `get_project_stats`      | Progress summary: albums generated, rated, unrated, current streak                                                                    |
| `list_project_history`   | Full listening history with sort (recent/oldest/rated), pagination (limit/offset), and total count — use focused analysis tools first |
| `search_project_history` | Search history by artist, album, year, or genre                                                                                       |
| `get_album_detail`       | Complete detail for one album: review, streaming links, Wikipedia, subgenres                                                          |
| `get_album_context`      | Relationships: same artist, same year, influences, styles, collaborators                                                              |

### Group Tools

| Tool                      | Description                                                                 |
| ------------------------- | --------------------------------------------------------------------------- |
| `get_group`               | Group summary: members, current album, all-time high and low scoring albums |
| `get_group_latest_album`  | Latest group album with all member votes attached                           |
| `get_group_album_reviews` | All member reviews and ratings for a specific group album                   |

### Analysis Tools

| Tool                  | Description                                                                                                                                       |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `get_taste_profile`   | Comprehensive taste profile: decade distribution, top genres/styles/artists, rating tendencies, community alignment                               |
| `get_rating_outliers` | Albums where the user diverges most from community consensus, in either direction                                                                 |
| `get_album_context`   | Rich contextual data: artist arc, musical connections, community divergence, listening journey                                                    |
| `get_review_insights` | Synthesises qualitative insight from written reviews via MCP Sampling — album-anchored or open query                                              |
| `get_listening_arc`   | Structured listening journey analysis: arc segments, rating trends, community alignment drift, and milestones — designed for narrative generation |

### Group Analysis Tools

| Tool                             | Description                                                                                                      |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `get_group_album_insights`       | Most divisive and most consensus albums across a group, ranked by rating variance                                |
| `get_group_member_comparison`    | Side-by-side taste comparison between two members: similarity score, shared albums, rating divergence            |
| `get_group_compatibility_matrix` | Group-wide pairwise taste compatibility — who agrees with whom, member averages, most and least compatible pairs |
| `compare_projects`               | High-level comparison of two projects: genre affinity, decade preferences, overlap, rating tendencies            |

### Community Tools

| Tool                              | Description                                                                    |
| --------------------------------- | ------------------------------------------------------------------------------ |
| `list_book_album_stats`           | Community ratings for all ~1001 canonical book albums with sort and pagination |
| `get_book_album_stat`             | Search book albums by name, artist, genre, or year                             |
| `list_user_submitted_album_stats` | Stats for user-submitted albums with sort and pagination                       |

### Utility

| Tool           | Description                                                                |
| -------------- | -------------------------------------------------------------------------- |
| `refresh_data` | Force-refresh cached data (`global`, `user`, `project`, `group`, or `all`) |

> **Note on `get_review_insights`:** This tool uses MCP Sampling and requires the
> connected client to declare sampling capability. Claude Desktop supports sampling.
> Clients that do not support sampling receive a fallback response with raw review text.

> **Note on detail vs. list tools:** List and search tools return a slim format — no reviews, streaming IDs, or images — to keep responses concise. Call `get_album_detail` when you need a written review, a Spotify/Apple Music link, or full genre breakdown.

---

## � MCP Resources

This server publishes static resources that agents should read for orientation and tool usage guidance. They are registered inside `createMcpServer()` and available at the following URIs:

| Resource URI                    | Purpose                                                                      |
| ------------------------------- | ---------------------------------------------------------------------------- |
| `info://1001-albums/about`      | Background and concept guide for the 1001 Albums book and Generator          |
| `info://1001-albums/tool-guide` | Practical tool usage guide: which tool to use when and recommended workflows |

## �💬 Prompt Templates

Compatible clients (e.g. Claude Desktop) surface these as one-click conversation starters.

| Prompt                  | Description                                                                         |
| ----------------------- | ----------------------------------------------------------------------------------- |
| `todays-album`          | Background and context on today's assigned album                                    |
| `predict-my-rating`     | Predict how you'll rate today's album based on your history                         |
| `taste-profile`         | Full analysis of your music taste and listener archetype                            |
| `album-deep-dive`       | Deep contextual analysis of a specific album in your history                        |
| `rating-outliers`       | Albums where your taste diverges most from the community                            |
| `genre-journey`         | How your genre exposure has evolved over time                                       |
| `group-latest-album`    | How your group rated their latest album                                             |
| `group-compatibility`   | Who in your group has the most similar and different taste                          |
| `group-divisive-albums` | Albums that divided your group most — and ones you all agreed on                    |
| `compare-members`       | Detailed taste comparison between two group members                                 |
| `listening-wrapped`     | Spotify Wrapped-style summary of your listening history                             |
| `personalized-pitch`    | Persuasive, taste-grounded pitch for a specific album (or today's album by default) |

## 💬 Example Prompts

**Daily**

```
What's today's album from my project?
Write a Pitchfork-style review of today's album.
```

**History & taste**

```
Which decade dominates my listening history?
Which albums did I rate way above the community average?
What genres appear most often in my history?
```

**Discovery**

```
Find connections between the last five albums I listened to.
Explain the musical lineage from my most recent jazz album.
Are there recurring producers or collaborators in my history?
```

**Fun**

```
If my listening history were a festival lineup, what would it look like?
Create a listener archetype based on my ratings.
```

See [prompts.md](./prompts.md) for the full prompt pack.

---

## 🏗 Architecture

```
┌─────────────────────────┐
│     AI Assistant        │  Claude / any MCP client
└────────────┬────────────┘
             │ MCP (stdio or HTTP)
             ▼
┌─────────────────────────┐
│  1001 Albums MCP Server │
│  · Tool handlers        │
│  · 4-hour cache         │
│  · 20s rate limiter     │
└────────────┬────────────┘
             │ HTTPS
             ▼
┌─────────────────────────┐
│  1001albumsgenerator.com│
│  API v1                 │
└─────────────────────────┘
```

The server enforces a **20-second minimum interval** between API requests and caches responses for **4 hours** to stay well within the upstream rate limit of 3 requests/minute.

---

## 🤝 Contributing

Contributions welcome. Some ideas:

- New MCP tools (recommendation engine, genre clustering)
- Deeper album analysis (mood inference, BPM/key data)
- Visual listening stats

### Quality requirements (lint + typecheck)

Before opening a PR, run these checks locally:

```bash
# Required: strict TypeScript checks
npx tsc --noEmit

# Required: ESLint (uses the repo's eslint.config.js)
npm run lint

# Existing project checks
npm run build
npm test
```

Requirements:

- Node.js 20+ (matches CI)
- npm 10+
- Internet access for one-off lint dependency install (`npm install --no-save ...`) unless already installed

```bash
# Standard workflow
git fork → branch → commit → pull request
```

When adding tools, register them inside `createMcpServer()` in `src/index.ts` and update this README.

---

## 📜 License

[ISC](./LICENSE) © 2025 bnm12

---

<p align="center">
  Built for music nerds doing the <a href="https://1001albumsgenerator.com">1001 Albums challenge</a>
  <br/>
  Powered by <a href="https://modelcontextprotocol.io">Model Context Protocol</a>
</p>
