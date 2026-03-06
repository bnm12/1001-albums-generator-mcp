<p align="center">

<img src="assets/logo.svg" width="180" alt="1001 Albums MCP Logo"/>

</p>

<h1 align="center">1001 Albums Generator MCP</h1>

<p align="center">
AI-powered exploration of the <b>1001 Albums You Must Hear Before You Die</b> journey
</p>

<p align="center">

![Node](https://img.shields.io/badge/node-18%2B-green)
![MCP](https://img.shields.io/badge/MCP-compatible-blue)
![License](https://img.shields.io/badge/license-ISC-lightgrey)
![Claude](https://img.shields.io/badge/Claude-Desktop-purple)
![API](https://img.shields.io/badge/API-1001AlbumGenerator-orange)

</p>

---

# 🎧 What This Project Does

**1001 Albums Generator MCP** is a **Model Context Protocol server** that lets AI assistants interact with your **1001 Albums Generator listening history**.

Instead of manually browsing the website, your AI can:

🎵 Retrieve today's album
📚 Explore your listening history
🔍 Search artists, years, or genres
📊 Analyze ratings and progress
🌍 Compare your taste with the global community
🧠 Discover musical relationships between albums

It turns your **1001 albums challenge into an AI-powered music exploration tool.**

---

# ✨ Features

### 🎵 Personal Listening Insights

- Today's album
- Listening history
- Search by artist/year/genre
- Progress tracking

### 📊 Data & Analytics

- Rating averages
- Listening streaks
- Completion stats
- Album relationships

### 🌍 Community Data

- Global ratings
- Popular albums
- Controversial albums
- Community submitted albums

### ⚡ Smart API Handling

- **20 second throttling**
- **4 hour caching**
- API-safe request handling

---

# 🎬 Demo

<p align="center">
<img src="assets/demo.gif" width="850"/>
</p>

Example interaction with an AI assistant connected to the MCP server.

```
User:
What's today's album from my 1001 albums project?

Claude:
Today's album is:

Miles Davis — Kind of Blue (1959)

This is one of the most influential jazz albums ever recorded.
It features John Coltrane, Cannonball Adderley, and Bill Evans.

Community rating: ★ 4.63 / 5
```

---

# 📈 Example Insights

With MCP connected, AI can generate insights like:

### Taste Profile

```
Your most common genres:

1. Rock
2. Jazz
3. Art Rock
4. Folk
5. Psychedelic Rock
```

---

### Decade Distribution

```
1960s  ████████████
1970s  ███████████████████
1980s  ███████
1990s  █████
2000s  ███
```

---

### Rating Bias vs Community

```
Albums you rated higher than average:

• London Calling
• Blue Train
• The Velvet Underground & Nico
```

---

### Artist Clusters

```
David Bowie
   ├─ Lou Reed
   ├─ Iggy Pop
   └─ Brian Eno
```

---

# 🔬 Possible AI Analyses

AI assistants can analyze your project in ways the website can't:

### Taste fingerprint

```
Your taste leans toward:

• Experimental rock
• Jazz fusion
• Concept albums
```

---

### Hidden patterns

```
You consistently rate albums from 1971 above average.
```

---

### Musical lineage

```
The album you listened to today connects to:

Miles Davis
  → Herbie Hancock
  → Weather Report
  → Jaco Pastorius
```

---

# 📊 Architecture

```
                ┌───────────────────────────────┐
                │        AI Assistant            │
                │  (Claude / MCP Clients)       │
                └───────────────┬───────────────┘
                                │
                                │ MCP Tools
                                ▼
                ┌───────────────────────────────┐
                │      1001 Albums MCP Server   │
                │                               │
                │  • Tool Handlers              │
                │  • Cache Layer                │
                │  • Rate Limiter               │
                │  • API Client                 │
                └───────────────┬───────────────┘
                                │
                                ▼
                ┌───────────────────────────────┐
                │ 1001 Albums Generator API     │
                │ https://1001albumsgenerator.com │
                └───────────────────────────────┘
```

---

# 🛠 MCP Tools

## 💿 Album Tools

### `get_album_of_the_day`

Returns today's assigned album.

Useful for:

- daily listening prompts
- AI reviews
- album analysis

---

### `get_album_detail`

Fetch detailed metadata:

- artist
- year
- genre
- streaming links
- community ratings
- reviews

---

## 📚 History Tools

### `list_project_history`

Retrieve your entire listening history.

Data returned:

- album
- artist
- rating
- date listened
- notes

---

### `search_project_history`

Search history by:

- artist
- album
- year
- genre

Example searches:

```
albums from 1977
jazz albums
David Bowie
```

---

## 📊 Statistics

### `get_project_stats`

Provides:

- albums completed
- total progress
- average rating
- listening streak

---

### `get_album_context`

Discovers relationships between albums:

Examples:

- shared genres
- same producer
- related artists
- historical music movements

---

## 🌍 Community Data Tools

### `list_book_album_stats`

Community statistics for albums in the original **1001 Albums book**.

Includes:

- average rating
- popularity
- rating distribution

---

### `list_user_submitted_album_stats`

Statistics for albums submitted by the community.

---

### `get_book_album_stat`

Detailed stats for a specific canonical album.

---

# 💬 Example AI Prompts

## See [prompts.md](./prompts.md)

# 🚀 Installation

## Option 1 — Claude Desktop Extension (Recommended)

1. Visit the releases page:

https://github.com/bnm12/1001-albums-generator-mcp/releases

2. Download:

| File           | Description                   |
| -------------- | ----------------------------- |
| `*-remote.dxt` | Connects to hosted MCP server |
| `*.dxt`        | Runs locally                  |

3. Open **Claude Desktop → Settings → Extensions**

4. Drag the `.dxt` file into the window.

---

# Option 2 — Local Installation

## Requirements

- Node.js 18+
- npm

### Clone

```bash
git clone https://github.com/bnm12/1001-albums-generator-mcp.git
cd 1001-albums-generator-mcp
```

### Install

```bash
npm install
```

### Build

```bash
npm run build
```

### Run

```bash
node dist/index.js
```

---

# 🔌 Claude Desktop Configuration

Add to:

`claude_desktop_config.json`

```json
{
  "mcpServers": {
    "1001-albums": {
      "command": "node",
      "args": ["/absolute/path/to/dist/index.js"],
      "env": {
        "MCP_MODE": "stdio"
      }
    }
  }
}
```

Restart Claude Desktop.

---

# 🤝 Contributing

Contributions are welcome.

Ideas:

- new MCP tools
- deeper album analysis
- recommendation engine
- genre clustering
- visual listening stats

Workflow:

```
fork
branch
commit
pull request
```

---

# 📜 License

ISC License

---

# ❤️ Credits

1001 Albums Generator
https://1001albumsgenerator.com

Model Context Protocol
https://modelcontextprotocol.io

---

# 🎧 Built for Music Nerds

If you're doing the **1001 Albums challenge**, this server lets AI become your:

🎼 music historian
🧠 critic
🎧 curator
🔎 discovery engine
