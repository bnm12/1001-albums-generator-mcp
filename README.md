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

| Tool                     | Description                                                                  |
| ------------------------ | ---------------------------------------------------------------------------- |
| `get_album_of_the_day`   | Today's assigned album with full metadata and project notes                  |
| `get_project_stats`      | Progress summary: albums generated, rated, unrated, current streak           |
| `list_project_history`   | Full listening history in slim format (name, artist, year, genres, ratings)  |
| `search_project_history` | Search history by artist, album, year, or genre                              |
| `get_album_detail`       | Complete detail for one album: review, streaming links, Wikipedia, subgenres |
| `get_album_context`      | Relationships: same artist, same year, influences, styles, collaborators     |

### Group Tools

| Tool                     | Description                                                                  |
| ------------------------ | ---------------------------------------------------------------------------- |
| `get_group`              | Group summary: members, current album, all-time high and low scoring albums  |
| `get_group_latest_album` | Latest group album with all member votes attached                            |
| `get_group_album_reviews`| All member reviews and ratings for a specific group album                   |

### Analysis Tools

| Tool | Description |
|---|---|
| `get_taste_profile` | Comprehensive taste profile: decade distribution, top genres/styles/artists, rating tendencies, community alignment |
| `get_rating_outliers` | Albums where the user diverges most from community consensus, in either direction |
| `get_album_context` | Rich contextual data: artist arc, musical connections, community divergence, listening journey |

### Group Analysis Tools

| Tool | Description |
|---|---|
| `get_group_album_insights` | Most divisive and most consensus albums across a group, ranked by rating variance |
| `get_group_member_comparison` | Side-by-side taste comparison between two members: similarity score, shared albums, rating divergence |
| `compare_projects` | High-level comparison of two projects: genre affinity, decade preferences, overlap, rating tendencies |

### Community Tools

| Tool                              | Description                                               |
| --------------------------------- | --------------------------------------------------------- |
| `list_book_album_stats`           | Community ratings for all ~1001 canonical book albums     |
| `get_book_album_stat`             | Look up a specific book album's community stats           |
| `list_user_submitted_album_stats` | Stats for albums submitted by users outside the book list |

### Utility

| Tool           | Description                                                                    |
| -------------- | ------------------------------------------------------------------------------ |
| `refresh_data` | Force-refresh cached data (`global`, `user`, `project`, `group`, or `all`)     |

> **Note on detail vs. list tools:** List and search tools return a slim format — no reviews, streaming IDs, or images — to keep responses concise. Call `get_album_detail` when you need a written review, a Spotify/Apple Music link, or full genre breakdown.

---

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
