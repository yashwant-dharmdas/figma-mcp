# Figma MCP v2

A **multi-user, server-deployable** Figma MCP system. Connects AI coding assistants (Claude, Cursor, Windsurf) to live Figma documents via a WebSocket relay and a StreamableHTTP MCP server.

**74 commands** — create, modify, query, export, batch-edit anything in Figma.

---

## Architecture

```
 MCP Client                    MCP Client
(Claude Desktop)               (Cursor)
      |                            |
      | HTTP POST /mcp             | HTTP POST /mcp
      | Mcp-Session-Id: AAA        | Mcp-Session-Id: BBB
      v                            v
┌──────────────────────────────────────────┐
│           MCP SERVER  :3001              │
│  Session AAA → RelayClient → chan: abc   │
│  Session BBB → RelayClient → chan: xyz   │
│  74 tools auto-registered from registry  │
│  TTL cache for read-only operations      │
└────────────┬──────────────────┬──────────┘
             │ WS/WSS           │ WS/WSS
             v                  v
┌────────────────────────────────────────────┐
│          RELAY SERVER  :3055               │
│  Channel abc: [MCP conn ↔ Plugin conn]     │
│  Channel xyz: [MCP conn ↔ Plugin conn]     │
│  HMAC auth, /health, /metrics              │
└──────────────┬────────────────┬────────────┘
               │ WS              │ WS
               v                 v
       ┌──────────────┐  ┌──────────────┐
       │ Plugin: UserA│  │ Plugin: UserB│
       │  code.ts     │  │  code.ts     │
       │  Figma API   │  │  Figma API   │
       └──────────────┘  └──────────────┘
```

---

## Quick Start (local, no Docker)

**Prerequisites:** [Bun 1.2+](https://bun.sh)

```bash
git clone <repo-url>
cd figma-mcp
bun install

# Start relay + MCP server (hot-reload)
bun run dev
```

The relay runs at `ws://localhost:3055` and the MCP server at `http://localhost:3001`.

**Install the Figma plugin** (see [Plugin Setup](#plugin-setup) below), open it in Figma, and note the channel ID shown in the UI.

**Configure your MCP client** with the channel ID (see [MCP Client Setup](#mcp-client-setup) below).

---

## Quick Start (Docker)

```bash
cp .env.example .env
# Edit .env — set RELAY_SECRET to a random string

docker compose up -d
```

For hot-reload during development:

```bash
docker compose -f docker-compose.local.yml up
```

---

## Plugin Setup

The Figma plugin (`packages/plugin`) is the bridge between Figma's API and the relay.

### Build

```bash
cd packages/plugin
bun run build.ts
# Outputs: dist/code.js, dist/ui.html
```

### Install in Figma

1. In Figma, open **Plugins → Development → Import plugin from manifest**.
2. Select `packages/plugin/manifest.json`.
3. The plugin will appear under **Plugins → Development → Figma MCP**.
4. Run it — a channel ID (e.g. `a3f8b2c1`) will appear in the UI.

### Plugin UI

The plugin UI shows:
- **Channel ID** — share this with your MCP client (or copy with the button)
- **Status** — connecting / connected / disconnected
- **Relay URL** — defaults to `ws://localhost:3055`, editable for remote servers

---

## MCP Client Setup

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "figma": {
      "type": "http",
      "url": "http://localhost:3001/mcp"
    }
  }
}
```

### Cursor / Windsurf

Add to your MCP settings:

```json
{
  "figma-mcp": {
    "transport": "http",
    "url": "http://localhost:3001/mcp"
  }
}
```

### Connecting to a channel

Once the MCP client is connected, use the `join_channel` tool:

```
join_channel({ channel: "a3f8b2c1" })
```

Replace `a3f8b2c1` with the channel ID from the Figma plugin UI.

---

## Commands

All 74 commands are defined in [`packages/shared/src/registry.ts`](packages/shared/src/registry.ts).

| Category | Commands |
|----------|---------|
| **Channel** | `join_channel` |
| **Document** | `get_document_info`, `get_selection`, `get_node_info`, `get_nodes_info`, `get_styles`, `scan_text_nodes`, `export_node_as_image` |
| **Page** | `get_pages`, `create_page`, `delete_page`, `rename_page`, `set_current_page`, `duplicate_page` |
| **Creation** | `create_frame`, `create_rectangle`, `create_ellipse`, `create_text`, `create_polygon`, `create_star`, `clone_node`, `group_nodes`, `ungroup_nodes`, `flatten_node`, `boolean_operation`, `insert_child` |
| **Modification** | `set_fill_color`, `set_stroke_color`, `set_selection_colors`, `move_node`, `resize_node`, `rename_node`, `delete_node`, `set_corner_radius`, `set_auto_layout`, `set_effects`, `rotate_node`, `set_node_properties`, `set_gradient`, `set_image`, `reorder_node`, `convert_to_frame`, `set_grid`, `get_grid`, `set_annotation`, `get_annotation` |
| **Text** | `set_text_content`, `set_multiple_text_contents`, `set_font_name`, `set_font_size`, `set_font_weight`, `set_letter_spacing`, `set_line_height`, `set_text_align`, `set_text_case`, `set_text_decoration`, `set_paragraph_spacing`, `get_styled_text_segments`, `set_text_style_id`, `load_font_async` |
| **Component** | `get_local_components`, `get_remote_components`, `create_component_instance`, `create_component_from_node`, `create_component_set`, `set_instance_variant`, `set_effect_style_id` |
| **SVG** | `set_svg`, `get_svg` |
| **Variable** | `get_variables`, `set_variable`, `apply_variable_to_node`, `switch_variable_mode` |
| **Batch** | `batch_execute` |

### Batch execution

`batch_execute` runs multiple commands in a single round-trip — the most efficient way to make bulk changes:

```json
{
  "operations": [
    { "command": "set_fill_color", "params": { "nodeId": "1:1", "r": 0.2, "g": 0.4, "b": 1 } },
    { "command": "set_fill_color", "params": { "nodeId": "1:2", "r": 0.8, "g": 0.2, "b": 0.2 } },
    { "command": "rename_node",    "params": { "nodeId": "1:3", "name": "Updated" } }
  ],
  "stopOnError": false
}
```

---

## Configuration

All configuration is via environment variables. Copy `.env.example` to `.env`:

| Variable | Default | Description |
|----------|---------|-------------|
| `RELAY_PORT` | `3055` | Relay WebSocket port |
| `RELAY_SECRET` | — | **Required in prod.** HMAC secret for channel tokens. Generate: `openssl rand -hex 32` |
| `RELAY_AUTH` | `enabled` | Set to `disabled` for local dev (skips token validation) |
| `TLS_CERT_PATH` | — | Path to TLS cert (enables WSS) |
| `TLS_KEY_PATH` | — | Path to TLS key |
| `MCP_PORT` | `3001` | MCP server HTTP port |
| `RELAY_URL` | `ws://localhost:3055` | MCP server → relay connection URL |
| `FIGMA_TOKEN` | — | Optional Figma REST API token |

---

## Production Deployment

### VPS (e.g. DigitalOcean, Hetzner)

```bash
# On the server
git clone <repo-url> /opt/figma-mcp
cd /opt/figma-mcp
cp .env.example .env
# Edit .env: set RELAY_SECRET, change RELAY_AUTH=enabled

docker compose up -d
```

**Recommended:** Put nginx or Caddy in front for TLS termination:

```nginx
# nginx config for relay (WSS)
server {
    listen 443 ssl;
    server_name relay.your-domain.com;

    location / {
        proxy_pass http://localhost:3055;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

Update `.env` to match:
```
RELAY_URL=wss://relay.your-domain.com
```

---

## Development

```bash
# Install dependencies
bun install

# Run all tests
bun run test

# Run a specific package's tests
cd packages/relay && bun run test

# Type-check all packages
bunx tsc --noEmit -p packages/shared/tsconfig.json
bunx tsc --noEmit -p packages/relay/tsconfig.json
bunx tsc --noEmit -p packages/mcp-server/tsconfig.json
```

### Project structure

```
figma-mcp/
├── packages/
│   ├── shared/          # Registry, protocol types, Zod schemas
│   ├── relay/           # Bun WebSocket relay server
│   ├── mcp-server/      # StreamableHTTP MCP server
│   └── plugin/          # Figma plugin (sandbox + UI)
├── docker-compose.yml         # Production
├── docker-compose.local.yml   # Local dev with hot-reload
└── .env.example
```

---

## How it works

1. **Plugin** connects to the relay via WebSocket and joins a channel (auto-generated 8-char ID).
2. **MCP client** calls `join_channel` → the MCP server opens its own relay connection to the same channel.
3. **Commands** travel: MCP client → MCP server → relay → plugin → Figma API → relay → MCP server → MCP client.
4. **batch_execute** handles multiple operations in one round-trip, all within the same Figma undo frame.
5. **TTL cache** in the MCP server stores results of read-only commands (e.g. `get_styles`, `get_pages`) for a few seconds to avoid redundant relay round-trips.

---

## License

MIT
