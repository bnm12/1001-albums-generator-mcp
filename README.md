# 1001 Albums Generator MCP

```text
    ┌─────────────────────────┐
    │    _  ___   ___  _      │
    │   / |/ _ \ / _ \/ |     │
    │   | | | | | | | | |     │
    │   | | |_| | |_| | |     │
    │   |_|\___/ \___/|_|     │
    │    ALBUMS GENERATOR     │
    └─────────────────────────┘
```

Transform your "1001 Albums You Must Hear Before You Die" journey with AI. This [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server connects your favorite AI assistant to the [1001 Albums Generator](https://1001albumsgenerator.com/) API, letting you explore, search, and analyze your musical history with ease.

---

## 🚀 Quick Start

### One-Click Installation (Claude Desktop)

This server is available as a **Claude Desktop Extension (DXT)** for the easiest setup.

1. Visit the [GitHub Releases](https://github.com/bnm12/1001-albums-generator-mcp/releases) page.
2. Download the `.dxt` file:
   - **Remote (`...remote.dxt`)**: *Recommended.* Connects to our hosted instance. No local setup required.
   - **Local (`...mcp.dxt`)**: Runs directly on your machine. Requires Node.js.
3. Drag and drop the `.dxt` file into your Claude Desktop settings.

### Manual Setup (Stdio)

```bash
# Clone and install
git clone https://github.com/bnm12/1001-albums-generator-mcp.git
cd 1001-albums-generator-mcp
npm install

# Build and run
npm run build
node dist/index.js
```

---

## ✨ Key Features

- **🎵 Full History Access**: Search and browse your entire project history.
- **📊 Community Insights**: Access global stats and rankings for over 1,000 canonical albums.
- **🧠 Smart Context**: Analyze relationships between albums, genres, and artists in your list.
- **🛡️ API Friendly**: Built-in 20-second throttling and 4-hour caching to respect strict API limits.

---

## 🛠️ Available Tools

| Tool | Description |
| :--- | :--- |
| `get_album_of_the_day` | Get today's assigned album for your project. |
| `list_project_history` | Browse your complete listening history. |
| `get_album_detail` | Fetch full metadata, reviews, and streaming links for any album. |
| `search_project_history` | Search your history by artist, year, or genre. |
| `get_project_stats` | View your progress, average ratings, and streaks. |
| `get_album_context` | Discover musical connections within your history. |
| `list_book_album_stats` | Explore community rankings for the original 1001 book list. |
| `list_user_submitted_album_stats` | View stats for community-submitted albums outside the book. |
| `get_book_album_stat` | Look up global stats for a specific canonical album. |
| `refresh_data` | Force a refresh of cached data. |

---

## ⚙️ Configuration

### Claude Desktop Configuration

If you're not using the DXT, add this to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "1001-albums": {
      "command": "node",
      "args": ["/path/to/1001-albums-generator-mcp/dist/index.js"],
      "env": {
        "MCP_MODE": "stdio"
      }
    }
  }
}
```

---

## 📝 License

ISC License. See [LICENSE](LICENSE) for details. Built with ❤️ for music lovers.
