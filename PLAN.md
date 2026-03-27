# Figma MCP v2 — Rebuild from Scratch
**Plan for a multi-user, server-deployable, schema-first Figma MCP system**

**Project Location:** `D:\Projects\figma-mcp` ← new project root (created fresh)
**Reference Codebase:** `D:\Projects\claude-talk-to-figma-mcp` ← read-only reference

---

## Context

The existing `claude-talk-to-figma-mcp` (v0.9.0) is a solid single-user tool, but has fundamental architectural limits that prevent it from scaling:
- `stdio` MCP transport = one user, one machine, not deployable to a server
- Manual sync between 3 files for every command (type union, MCP tool, plugin switch-case)
- Errors silently pass as successes at the MCP protocol level (`isError` never set)
- 50 color changes = 50 separate round-trips (no batching)
- Hardcoded ws:// (no WSS), hardcoded port, no auth on channel access
- Global singleton WebSocket shared across all sessions in a process

This rebuild starts from scratch in a new folder, using the current codebase only as a reference for Figma API patterns. The goal: a production-grade, multi-user, server-deployable system built with modern approaches.

---

## Architecture Overview

```
 MCP Client A          MCP Client B          MCP Client C
(Claude Desktop)      (Cursor / Custom)      (Windsurf)
      |                     |                     |
      | HTTP POST            | HTTP POST           |
      | Mcp-Session-Id: AAA  | Mcp-Session-Id: BBB |
      v                     v                     v
┌──────────────────────────────────────────────────────┐
│            MCP SERVER  (StreamableHTTP)              │
│  Session AAA → RelayClient → chan: abc123            │
│  Session BBB → RelayClient → chan: xyz789            │
│  ToolFactory (auto-registers all tools from registry)│
│  TTL Cache (for read-only Figma ops)                 │
│  Optional: Figma REST API for cacheable reads        │
└────────────┬─────────────────────────┬───────────────┘
             │ WSS/WS                  │ WSS/WS
             v                         v
┌────────────────────────────────────────────────────────┐
│                 RELAY SERVER  (Bun WS)                  │
│  Channel abc123: [MCPconn, PluginConn]                 │
│  Channel xyz789: [MCPconn, PluginConn]                 │
│  /health   /metrics  (Prometheus-compatible)           │
└──────────────┬──────────────────┬─────────────────────┘
               │ WSS               │ WSS
               v                   v
       ┌───────────────┐   ┌───────────────┐
       │ PLUGIN User A │   │ PLUGIN User B │
       │  ui.html      │   │  ui.html      │
       │  (thin relay) │   │  (thin relay) │
       │  ↕ postMsg    │   │  ↕ postMsg    │
       │  code.ts      │   │  code.ts      │
       │  dispatcher   │   │  dispatcher   │
       │  Figma API    │   │  Figma API    │
       └───────────────┘   └───────────────┘
```

**Key differences from current system:**
- MCP transport: **StreamableHTTP** (not stdio) → multi-user, server-deployable
- Command definitions: **CommandRegistry** (not 3 separate files) → single source of truth
- Plugin dispatch: **Map-based dispatcher** (not 65-case switch)
- Error handling: **`isError: true`** (not text-formatted errors)
- Bulk ops: **`batch_execute` tool** (not 50 sequential round-trips)
- Auth: **HMAC channel tokens** (not open relay)
- Deploy: **Docker + docker-compose** with both local and server configs

---

## Technology Stack

| Concern | Technology | Notes |
|---|---|---|
| Package manager | **Bun 1.2+** | Workspaces, native WS, build |
| Language | **TypeScript 5.8+** strict | Shared across all packages |
| MCP SDK | **@modelcontextprotocol/sdk latest** | Current install is 1.9.0 (no StreamableHTTP); upgrade to latest (1.11+) which includes it |
| Validation | **Zod 3.x** | Shared between MCP server AND plugin |
| WS Server | **Bun native (`Bun.serve`)** | Relay server — no external WS library |
| WS Client | **`ws` npm package** | MCP server's relay client only |
| Cache | **Custom TTL Map** | Start in-memory; swap to Redis later if needed |
| Testing | **Vitest 2.x** | Native ESM, faster than Jest, same API |
| Plugin build | **Bun build `--target browser`** | Single-file Figma-compatible bundle |
| Server build | **tsup** | CJS+ESM output for npm distribution |
| Container | **Docker + docker-compose** | VPS/cloud VM deployment |
| Future DB | **Qdrant** (self-hosted Docker) | Vector similarity for design library |

---

## Project Structure

```
figma-mcp/                               ← new project root
├── packages/
│   ├── shared/                          # @figma-mcp/shared  ← CORE
│   │   └── src/
│   │       ├── registry.ts              # CommandRegistry - single source of truth
│   │       ├── schemas/
│   │       │   ├── commands/
│   │       │   │   ├── document.ts      # get_document_info, get_selection, etc.
│   │       │   │   ├── creation.ts      # create_rectangle, create_frame, etc.
│   │       │   │   ├── modification.ts  # set_fill_color, move_node, etc.
│   │       │   │   ├── text.ts          # set_text_content, set_font_*, etc.
│   │       │   │   ├── component.ts     # create_component_instance, etc.
│   │       │   │   ├── svg.ts           # set_svg, get_svg
│   │       │   │   ├── variable.ts      # get_variables, set_variable, etc.
│   │       │   │   └── batch.ts         # batch_execute
│   │       ├── protocol/
│   │       │   ├── messages.ts          # All wire message types
│   │       │   ├── errors.ts            # FigmaMcpError + FigmaErrorCode enum
│   │       │   └── progress.ts          # CommandProgressUpdate type
│   │       └── extensions/
│   │           └── design-library.ts    # Future interfaces (no impl yet)
│   │
│   ├── relay/                           # @figma-mcp/relay
│   │   └── src/
│   │       ├── server.ts                # Bun.serve entry, WSS support
│   │       ├── channel-manager.ts       # Channel lifecycle (fixed close bug)
│   │       ├── connection.ts            # Per-connection state machine
│   │       ├── auth.ts                  # HMAC-SHA256 token gen/validation
│   │       ├── metrics.ts               # Prometheus-format /metrics endpoint
│   │       └── backoff.ts               # True exponential backoff utility
│   │
│   ├── mcp-server/                      # @figma-mcp/mcp-server
│   │   └── src/
│   │       ├── server.ts                # StreamableHTTP entry + session management
│   │       ├── session-store.ts         # sessionId → { channelId, relayClient }
│   │       ├── tool-factory.ts          # Reads registry, auto-registers all tools
│   │       ├── relay-client.ts          # Per-session WS client to relay
│   │       ├── cache.ts                 # TTL cache for read-only commands
│   │       ├── figma-rest.ts            # Optional Figma REST API client (reads)
│   │       └── tools/
│   │           ├── batch.ts             # batch_execute handler
│   │           └── channel.ts           # join_channel handler (special case)
│   │
│   └── plugin/                          # Figma plugin
│       ├── src/
│       │   ├── code.ts                  # Plugin entry + dispatcher registration
│       │   ├── dispatcher.ts            # Map-based command dispatcher
│       │   ├── ui.ts                    # Thin WS relay (compiled into ui.html)
│       │   ├── handlers/
│       │   │   ├── document.ts
│       │   │   ├── creation.ts
│       │   │   ├── modification.ts
│       │   │   ├── text.ts
│       │   │   ├── component.ts
│       │   │   ├── svg.ts
│       │   │   ├── variable.ts
│       │   │   └── batch.ts             # Executes batch in single Figma context
│       │   └── utils/
│       │       ├── node-helpers.ts
│       │       ├── progress.ts
│       │       └── color.ts             # Preserves a=0 (critical fix from v1)
│       ├── manifest.json
│       ├── tsconfig.json
│       └── build.ts                     # Bun build script → code.js + ui.html
│
├── docker/
│   ├── Dockerfile.relay
│   ├── Dockerfile.mcp-server
│   ├── docker-compose.yml               # Production (with WSS)
│   └── docker-compose.local.yml         # Local dev (no auth, ws://)
├── .env.example
├── package.json                         # Bun workspace root
└── tsconfig.base.json
```

---

## Critical Design Decisions

### 1. CommandRegistry — The Central Innovation

Every command is defined **once** in `packages/shared/src/registry.ts`. The system derives everything else from that one definition automatically:

```typescript
// packages/shared/src/registry.ts
export interface CommandDefinition<TParams, TResult> {
  name: string;                  // e.g. "set_fill_color"
  description: string;           // used as MCP tool description
  category: CommandCategory;
  params: z.ZodObject<TParams>;  // validates both MCP input AND plugin input
  result: z.ZodObject<TResult>;  // validates plugin response
  requiresChannel: boolean;
  cacheable?: boolean;           // true = TTL cache on reads
  cacheTtlMs?: number;
  examples?: Array<{ input: TParams; description: string }>;  // boosts AI accuracy
}

export const COMMAND_REGISTRY: CommandDefinition[] = [
  {
    name: "set_fill_color",
    description: "Set the fill color of a node. Color components 0-1 floats. Alpha defaults to 1 (opaque).",
    category: "modification",
    params: z.object({
      nodeId: z.string().describe("Figma node ID e.g. '1:23'"),
      r: z.number().min(0).max(1),
      g: z.number().min(0).max(1),
      b: z.number().min(0).max(1),
      a: z.number().min(0).max(1).optional().describe("Alpha, default: 1"),
    }),
    result: z.object({ name: z.string(), id: z.string() }),
    requiresChannel: true,
    cacheable: false,
    examples: [
      { input: { nodeId: "1:23", r: 1, g: 0, b: 0 }, description: "Set to opaque red" },
    ],
  },
  // ... all 80+ commands defined here
];
```

This eliminates:
- The manual `FigmaCommand` type union in `types/index.ts`
- The 65-case switch in `code.js`
- The per-tool boilerplate try/catch in every tool file

### 2. ToolFactory — Zero Boilerplate MCP Registration

```typescript
// packages/mcp-server/src/tool-factory.ts
export class ToolFactory {
  registerAll(registry: CommandDefinition[]) {
    for (const def of registry) {
      this.server.tool(def.name, def.description, def.params, async (params) => {
        const session = this.sessions.get(this.sessionId);
        if (def.requiresChannel && !session?.channelId) {
          return { isError: true, content: [{ type: "text", text: "Call join_channel first." }] };
        }
        // Check TTL cache for reads
        if (def.cacheable) { /* cache lookup */ }
        try {
          const result = await session!.relayClient.sendCommand(def.name, params);
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        } catch (error) {
          return { isError: true, content: [{ type: "text", text: error.message }] };
        }
      });
    }
  }
}
```

### 3. StreamableHTTP Transport (MCP 2025-11-25 spec)

```typescript
// packages/mcp-server/src/server.ts
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

Bun.serve({
  port: Number(process.env.MCP_PORT ?? 3001),
  async fetch(req) {
    const sessionId = req.headers.get("mcp-session-id") ?? randomUUID();
    const transport = new StreamableHTTPServerTransport({ sessionId });
    const server = new McpServer({ name: "figma-mcp", version: "2.0.0" });
    new ToolFactory(server, sessions, sessionId).registerAll(COMMAND_REGISTRY);
    await server.connect(transport);
    return transport.handleRequest(req);
  }
});
```

Each HTTP request = one MCP session with its own relay client. Multiple simultaneous users naturally isolated.

### 4. Map-Based Dispatcher in Plugin (replaces 65-case switch)

```typescript
// packages/plugin/src/dispatcher.ts
class CommandDispatcher {
  private handlers = new Map<string, (params: unknown) => Promise<unknown>>();
  register(name: string, fn: (p: unknown) => Promise<unknown>) { this.handlers.set(name, fn); }
  async dispatch(command: string, params: unknown) {
    const handler = this.handlers.get(command);
    if (!handler) throw new Error(`Unknown command: ${command}`);
    return handler(params);
  }
}

// In code.ts — registration is one line per command
dispatcher.register("set_fill_color", handlers.document.setFillColor);
dispatcher.register("get_document_info", handlers.document.getDocumentInfo);
// ...all others
```

### 5. Proper MCP Error Handling

**Current (wrong):**
```typescript
return { content: [{ type: "text", text: `Error setting fill color: ${err}` }] }
// AI cannot distinguish success from failure at protocol level
```

**New (correct):**
```typescript
return { isError: true, content: [{ type: "text", text: err.message }] }
// MCP protocol signals error; AI can retry/self-correct
```

This is implemented **once** in `ToolFactory`, not repeated per tool.

### 6. Batch Execution (biggest performance win)

```typescript
// 50 color changes: BEFORE = 50 round-trips, AFTER = 1 round-trip
await mcp.call("batch_execute", {
  operations: [
    { command: "set_fill_color", params: { nodeId: "1:1", r: 1, g: 0, b: 0 } },
    { command: "set_fill_color", params: { nodeId: "1:2", r: 0, g: 1, b: 0 } },
    // ...48 more
  ],
  stopOnError: false  // collect all results
});
```

The batch runs inside the plugin in a single Figma context — zero extra round-trips for each operation.

### 7. HMAC Channel Authentication

```typescript
// packages/relay/src/auth.ts
export function generateChannelToken(channelId: string): string {
  return createHmac("sha256", process.env.RELAY_SECRET!).update(channelId).digest("hex");
}
// Plugin joins with: { type: "join", channel: "abc123", token: "deadbeef..." }
// Relay validates before admitting. Set RELAY_AUTH=disabled for local dev.
```

### 8. True Exponential Backoff

```typescript
// packages/relay/src/backoff.ts
export class ExponentialBackoff {
  private attempt = 0;
  next(): number {
    const base = Math.min(1000 * Math.pow(2, this.attempt++), 30000);
    return base + base * 0.2 * (Math.random() * 2 - 1); // ±20% jitter
  }
  reset() { this.attempt = 0; }
}
// Produces: ~1s, ~2s, ~4s, ~8s, ~16s, ~30s, ~30s ... (monotonically increasing)
```

### 9. Fixed Close Handler Bug

The current code does `ws.close = () => { ... }` (dead code — overwrites the close *method* instead of listening to the close *event*). In Bun, the correct pattern is:

```typescript
// Bun.serve websocket handlers
websocket: {
  close(ws, code, reason) {      // ← THIS is the close event handler in Bun
    channelManager.onDisconnect(ws, code, reason);  // peer notify, cleanup
  }
}
// Never assign ws.close = () => {...}
```

### 10. WSS Support for Remote Deployment

```typescript
// packages/relay/src/server.ts
const tlsConfig = process.env.TLS_CERT_PATH ? {
  tls: {
    cert: Bun.file(process.env.TLS_CERT_PATH),
    key: Bun.file(process.env.TLS_KEY_PATH!),
  }
} : {};

Bun.serve({ port: 3055, hostname: "0.0.0.0", ...tlsConfig, ... });
```

The plugin UI builds the connection URL from user input (`ws://localhost:3055` for local, `wss://your-server.com:3055` for remote). Figma requires WSS when loading from HTTPS context.

---

## Key Protocol Types

```typescript
// packages/shared/src/protocol/messages.ts
export type JoinMessage     = { type: "join"; channel: string; token?: string };
export type CommandMessage  = { type: "message"; channel: string; message: { id: string; command: string; params: unknown } };
export type ResponseMessage = { type: "message"; channel: string; message: { id: string; result?: unknown; error?: string } };
export type ProgressMessage = { type: "progress"; channel: string; id: string; data: ProgressData };

// packages/shared/src/protocol/errors.ts
export enum FigmaErrorCode {
  NO_CHANNEL = "NO_CHANNEL",
  NODE_NOT_FOUND = "NODE_NOT_FOUND",
  INVALID_PARAMS = "INVALID_PARAMS",
  PLUGIN_TIMEOUT = "PLUGIN_TIMEOUT",
  RELAY_DISCONNECTED = "RELAY_DISCONNECTED",
  UNKNOWN_COMMAND = "UNKNOWN_COMMAND",
  BATCH_PARTIAL_FAILURE = "BATCH_PARTIAL_FAILURE",
  AUTH_FAILED = "AUTH_FAILED",
}
```

---

## Deployment Configuration

### Local Development
```yaml
# docker/docker-compose.local.yml
services:
  relay:
    ports: ["3055:3055"]
    environment:
      - RELAY_AUTH=disabled    # no tokens needed locally
  mcp-server:
    ports: ["3001:3001"]
    environment:
      - RELAY_URL=ws://relay:3055
```

### Production (VPS / Cloud VM)
```yaml
# docker/docker-compose.yml
services:
  relay:
    environment:
      - RELAY_SECRET=${RELAY_SECRET}  # required in prod
      - TLS_CERT_PATH=/certs/cert.pem # optional (can use nginx reverse proxy instead)
  mcp-server:
    environment:
      - RELAY_URL=wss://relay.yourdomain.com:3055
      - FIGMA_REST_TOKEN=${FIGMA_REST_TOKEN}  # optional: enables REST-based reads
```

### MCP Client Configuration (Streamable HTTP)
```json
{
  "mcpServers": {
    "figma-mcp": {
      "url": "https://your-server.com:3001/mcp"
    }
  }
}
```
No `command` or `args` needed — pure HTTP, works from any machine.

---

## Future Design Library Extension Points

The following interfaces are defined in Phase 1 but **not implemented until a future phase**. The architecture supports adding them without touching existing code:

```typescript
// packages/shared/src/extensions/design-library.ts
export interface DesignComponent {
  id: string; key: string; name: string; description: string;
  category: string;
  embedding?: number[];    // vector for semantic search
  thumbnailUrl?: string;
  variants?: string[];
}
export interface DesignLibraryProvider {
  search(query: string, options?: SearchOptions): Promise<ComponentSearchResult[]>;
  getById(id: string): Promise<DesignComponent | null>;
  syncFromFigmaFile(fileKey: string): Promise<void>;
}
```

When implemented:
- Add `packages/design-library/` implementing `DesignLibraryProvider` with **Qdrant** (self-hosted Docker, real-time HNSW indexing, multimodal embeddings)
- Add `search_components` and `sync_library` to `COMMAND_REGISTRY` (with `requiresChannel: false` — hits vector DB directly, no plugin needed)
- `ToolFactory` picks them up automatically with zero changes to existing code

---

## Implementation Phases

### Phase 1 — Foundation & Relay (Week 1)
- Monorepo setup: `bun.workspace.toml`, root `package.json`, `tsconfig.base.json`
- `packages/shared`: `registry.ts` skeleton with 5 commands, all protocol types, error enum
- `packages/relay`: Full relay server with WSS, channel manager, HMAC auth, fixed close handler, backoff utility, metrics endpoint
- Tests: Vitest unit tests for auth, backoff, channel-manager

### Phase 2 — MCP Server (Week 2)
- Upgrade `@modelcontextprotocol/sdk` to latest (1.11+) for StreamableHTTP
- `packages/mcp-server`: StreamableHTTP server, session store, tool factory, relay client, TTL cache
- `join_channel` and `batch_execute` tool handlers
- Tests: tool-factory unit tests (isError behavior, caching, channel guards)
- Verify end-to-end with `mcp-inspector` CLI tool

### Phase 3 — Plugin Core (Week 3)
- `packages/plugin`: Dispatcher, code.ts, thin ui.ts, top 20 handler implementations
- Plugin build pipeline (Bun → single-file code.js + ui.html)
- Expand registry with those 20 commands
- Tests: Dispatcher unit tests, handler unit tests (mock Figma API)

### Phase 4 — Full Command Parity (Week 4)
- All 80+ commands in registry and handlers
- `batch_execute` plugin handler
- Full Vitest integration tests (real relay + real mcp-server, mock plugin)

### Phase 5 — Deployment & Polish (Week 5)
- Docker files, docker-compose (local + production)
- `.env.example`, deployment documentation
- `design-library.ts` interface definitions (no implementation)
- CI/CD config (GitHub Actions: test → build → Docker push)
- Final round of integration tests against actual Figma (manual)

---

## What NOT to Do (Anti-Patterns from v1)

| Anti-Pattern | Why | What to Do Instead |
|---|---|---|
| `ws.close = () => {}` | Overwrites close method, never fires | Use `Bun.serve websocket: { close(ws){} }` |
| Text-content errors | AI can't distinguish success/failure | Always `isError: true` on errors |
| Random exponent backoff | Non-monotonic, sometimes 0 delay | Counter-based `ExponentialBackoff` class |
| Manual `FigmaCommand` union | 3 files must stay in sync manually | `COMMAND_REGISTRY` is the only source |
| Global singleton WS | All sessions share one connection | `RelayClient` per MCP session |
| 65-case switch in plugin | Unmaintainable, error-prone | `dispatcher.register()` Map pattern |
| Hardcoded `ws://` in plugin | Fails in production Figma (HTTPS) | Configurable URL field in plugin UI |
| Per-tool try/catch boilerplate | ~240 lines of identical code | Single catch in `ToolFactory` |
| No result validation | `result as { name: string }` casts | `def.result.safeParse(result)` in factory |

---

## Verification Plan

1. **Unit tests**: `bun run test` — all packages pass
2. **Local end-to-end**: Start `docker-compose.local.yml`, load plugin in Figma Desktop, connect Claude Code, run 5 commands including `batch_execute`
3. **Multi-user test**: Two browser windows open, each with their own channel, both send commands simultaneously — verify isolation
4. **Remote deploy test**: Deploy to a VPS via `docker-compose.yml`, connect Claude Desktop via HTTP URL, verify WSS connection from Figma plugin
5. **MCP inspector**: Use `npx @modelcontextprotocol/inspector` against the StreamableHTTP endpoint to verify all tools are listed correctly with schemas
6. **Error propagation**: Send an invalid `nodeId`, verify `isError: true` is returned (not a text error)
7. **Batch performance**: Compare time to change 20 node colors via 20 individual calls vs 1 `batch_execute` call
