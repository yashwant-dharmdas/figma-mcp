// ============================================================
// figma-mcp — Single-process entry point for npx distribution.
//
// Supports two MCP transport modes:
//
//   STDIO mode (default — Claude Desktop spawns the process):
//     claude_desktop_config.json:
//     { "mcpServers": { "figma": { "command": "npx",
//       "args": ["-y", "@yashwant.dharmdas/figma-mcp"] } } }
//
//     In stdio mode a sidecar HTTP server ALSO starts on port 3002
//     so Claude Code can connect via URL without spawning a second
//     process (which would conflict on the WebSocket port).
//
//   HTTP-only mode (standalone server — no Claude Desktop needed):
//     npx @yashwant.dharmdas/figma-mcp --http
//     .mcp.json:
//     { "mcpServers": { "figma": {
//       "url": "http://localhost:3002/mcp" } } }
//
// In all modes the Figma plugin connects to ws://localhost:3001.
//
// Port summary:
//   3001 — WebSocket server (Figma plugin)
//   3002 — HTTP MCP server  (Claude Code)  [different port — no conflict]
//
// All diagnostic output goes to stderr so it never interferes
// with the stdio MCP transport on stdout.
// ============================================================

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { createServer } from "http";
import { randomUUID } from "crypto";
import { COMMAND_REGISTRY } from "@figma-mcp/shared";
import { PluginBridge } from "./plugin-bridge.js";
import { SessionStore } from "./session-store.js";
import { ToolFactory } from "./tool-factory.js";

const PLUGIN_WS_PORT = Number(process.env["FIGMA_MCP_PORT"]      ?? 3001);
const HTTP_PORT      = Number(process.env["FIGMA_MCP_HTTP_PORT"] ?? 3002);
const HTTP_ONLY_MODE = process.argv.includes("--http") ||
                       process.env["FIGMA_MCP_HTTP"] === "1";

// ── Start the WebSocket server for the Figma plugin ──────────

const bridge = new PluginBridge(PLUGIN_WS_PORT);

process.stderr.write(
  `[figma-mcp] Plugin WebSocket server on ws://localhost:${PLUGIN_WS_PORT}\n`
);
process.stderr.write(
  `[figma-mcp] Open the Figma plugin — it will connect automatically\n`
);

// ── Shared tool registration helper ──────────────────────────

function createMcpServer(): McpServer {
  const sessionStore = new SessionStore(bridge);
  const server       = new McpServer({ name: "figma-mcp", version: "3.0.3" });
  const factory      = new ToolFactory(server, sessionStore);
  factory.registerAll(COMMAND_REGISTRY);
  return server;
}

// ── HTTP server factory (used in both modes) ─────────────────
//
// Creates a Node HTTP server that exposes:
//   GET  /health  — liveness + plugin status
//   POST /mcp     — MCP StreamableHTTP endpoint
//
// Each POST /mcp initialize request creates an isolated MCP session.

function startHttpServer(
  port: number,
  sessions: Map<string, StreamableHTTPServerTransport>
): void {
  const httpServer = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost`);

    // ── CORS ──────────────────────────────────────────────────
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers",
      "Content-Type, Mcp-Session-Id, MCP-Protocol-Version");
    res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");

    if (req.method === "OPTIONS") {
      res.writeHead(204); res.end(); return;
    }

    // ── Health ────────────────────────────────────────────────
    if (url.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        status: "ok",
        pluginConnected: bridge.isConnected,
        sessions: sessions.size,
        uptime: Math.round(process.uptime()),
      }));
      return;
    }

    // ── MCP endpoint ──────────────────────────────────────────
    if (url.pathname === "/mcp") {
      const sessionId = req.headers["mcp-session-id"] as string | undefined;

      // Resume existing session
      if (sessionId && sessions.has(sessionId)) {
        await sessions.get(sessionId)!.handleRequest(req, res);
        return;
      }

      // Read body to detect Initialize request
      const body = await new Promise<Buffer>((resolve) => {
        const chunks: Buffer[] = [];
        req.on("data", (c: Buffer) => chunks.push(c));
        req.on("end", () => resolve(Buffer.concat(chunks)));
      });

      let parsed: unknown;
      try { parsed = JSON.parse(body.toString()); } catch { parsed = null; }

      if (!isInitializeRequest(parsed)) {
        res.writeHead(400); res.end("Expected initialize request"); return;
      }

      // New session
      const newId    = randomUUID();
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => newId,
        onsessioninitialized: (sid) => {
          sessions.set(sid, transport);
          process.stderr.write(`[figma-mcp] HTTP session opened: ${sid.slice(0,8)}\n`);
        },
      });

      transport.onclose = () => {
        sessions.delete(newId);
        process.stderr.write(`[figma-mcp] HTTP session closed: ${newId.slice(0,8)}\n`);
      };

      const mcpServer = createMcpServer();
      await mcpServer.connect(transport);
      await transport.handleRequest(Object.assign(req, { _body: body }), res, parsed);
      return;
    }

    res.writeHead(404); res.end("Not found");
  });

  httpServer.listen(port, "127.0.0.1", () => {
    process.stderr.write(
      `[figma-mcp] HTTP MCP server on http://localhost:${port}/mcp\n`
    );
    process.stderr.write(
      `[figma-mcp] Health:           http://localhost:${port}/health\n`
    );
    process.stderr.write(
      `[figma-mcp] Claude Code .mcp.json entry:\n` +
      `[figma-mcp]   { "mcpServers": { "figma": { "url": "http://localhost:${port}/mcp" } } }\n`
    );
  });

  httpServer.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      process.stderr.write(
        `[figma-mcp] Port ${port} already in use — HTTP sidecar skipped\n`
      );
    } else {
      process.stderr.write(`[figma-mcp] HTTP server error: ${err.message}\n`);
    }
  });
}

// ── HTTP-only mode ────────────────────────────────────────────

if (HTTP_ONLY_MODE) {
  const sessions = new Map<string, StreamableHTTPServerTransport>();
  startHttpServer(HTTP_PORT, sessions);
  process.stderr.write(`[figma-mcp] HTTP-only mode — no stdio transport\n`);

} else {
  // ── Stdio mode — Claude Desktop spawns this process ──────────
  // Also starts an HTTP sidecar on port 3002 so Claude Code can
  // connect via URL without spawning a second conflicting process.

  const mcpServer = createMcpServer();
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);

  process.stderr.write(`[figma-mcp] stdio mode — ready\n`);

  // HTTP sidecar (port 3002) — for Claude Code
  const sessions = new Map<string, StreamableHTTPServerTransport>();
  startHttpServer(HTTP_PORT, sessions);
}

// ── Graceful shutdown ─────────────────────────────────────────

process.on("SIGINT",  () => { bridge.close(); process.exit(0); });
process.on("SIGTERM", () => { bridge.close(); process.exit(0); });
