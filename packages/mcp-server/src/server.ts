// ============================================================
// MCP Server — StreamableHTTP entry point.
//
// Transport: WebStandardStreamableHTTPServerTransport (Bun / web-standard API)
// Protocol:  MCP 2025-11-25 (Streamable HTTP)
//
// Each HTTP session is fully isolated:
//   • Its own McpServer instance
//   • Its own SessionStore (relay client + cache)
//   • Its own WebStandardStreamableHTTPServerTransport
//
// Session lifecycle:
//   1. Client POSTs /mcp with no Mcp-Session-Id → new session created.
//   2. Server returns Mcp-Session-Id in the response header.
//   3. Client sends subsequent requests with that header → routed to the
//      existing transport, which resumes the MCP JSON-RPC stream.
//   4. Client DELETEs /mcp (or transport closes) → session cleaned up.
//
// Endpoints:
//   POST/GET/DELETE  /mcp     — MCP Streamable HTTP
//   GET              /health  — JSON health check
// ============================================================

import { randomUUID } from "crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { COMMAND_REGISTRY } from "@figma-mcp/shared";
import { SessionStore } from "./session-store.js";
import { ToolFactory } from "./tool-factory.js";

// ── Config ───────────────────────────────────────────────────

const MCP_PORT = Number(process.env["PORT"] ?? process.env["MCP_PORT"] ?? 3001);
const MCP_HOST = process.env["MCP_HOST"] ?? "0.0.0.0";

// ── Session registry ─────────────────────────────────────────

interface SessionEntry {
  transport: WebStandardStreamableHTTPServerTransport;
  sessionStore: SessionStore;
}

const sessions = new Map<string, SessionEntry>();

// ── Session factory ──────────────────────────────────────────

function createSession(): { entry: SessionEntry; sessionId: string } {
  const sessionId = randomUUID();
  const sessionStore = new SessionStore(sessionId);

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: () => sessionId,

    onsessioninitialized: (sid) => {
      console.log(`[mcp-server] Session initialized: ${sid} | total=${sessions.size}`);
    },

    onsessionclosed: (sid) => {
      const entry = sessions.get(sid);
      if (entry) {
        entry.sessionStore.cleanup();
        sessions.delete(sid);
        console.log(`[mcp-server] Session closed: ${sid} | remaining=${sessions.size}`);
      }
    },
  });

  const mcpServer = new McpServer({
    name: "figma-mcp",
    version: "2.0.0",
  });

  const toolFactory = new ToolFactory(mcpServer, sessionStore);
  toolFactory.registerAll(COMMAND_REGISTRY);

  const entry: SessionEntry = { transport, sessionStore };
  // Store before connect so onsessioninitialized can log correctly.
  sessions.set(sessionId, entry);

  // Connect MCP server to transport (non-blocking; request handled below).
  void mcpServer.connect(transport);

  return { entry, sessionId };
}

// ── CORS helper ──────────────────────────────────────────────

function corsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Mcp-Session-Id, MCP-Protocol-Version",
    "Access-Control-Expose-Headers": "Mcp-Session-Id",
  };
}

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(corsHeaders())) {
    headers.set(k, v);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

// ── Bun HTTP server ──────────────────────────────────────────

const bunServer = Bun.serve({
  port: MCP_PORT,
  hostname: MCP_HOST,

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);

    // ── CORS preflight ─────────────────────────────────────
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    // ── Health check ───────────────────────────────────────
    if (url.pathname === "/health") {
      return new Response(
        JSON.stringify({
          status: "ok",
          sessions: sessions.size,
          uptime: Math.round(process.uptime()),
        }),
        {
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders(),
          },
        }
      );
    }

    // ── MCP endpoint ───────────────────────────────────────
    if (url.pathname === "/mcp") {
      const existingSessionId = req.headers.get("mcp-session-id");

      if (existingSessionId) {
        const session = sessions.get(existingSessionId);
        if (session) {
          return withCors(await session.transport.handleRequest(req));
        }
        // Unknown session ID — client may have been routed to a different
        // instance or the session expired.
        return new Response("Session not found or expired", {
          status: 404,
          headers: corsHeaders(),
        });
      }

      // ── New session ──────────────────────────────────────
      const { entry } = createSession();
      const response = await entry.transport.handleRequest(req);
      return withCors(response);
    }

    return new Response("Not Found", {
      status: 404,
      headers: corsHeaders(),
    });
  },
});

console.log(`[mcp-server] Listening on http://${MCP_HOST}:${MCP_PORT}`);
console.log(`[mcp-server] MCP endpoint: http://${MCP_HOST}:${MCP_PORT}/mcp`);
console.log(`[mcp-server] Health:       http://${MCP_HOST}:${MCP_PORT}/health`);
console.log(`[mcp-server] Relay URL:    ${process.env["RELAY_URL"] ?? "ws://localhost:3055"}`);
console.log(`[mcp-server] Tools registered: ${COMMAND_REGISTRY.length}`);

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n[mcp-server] Shutting down...");
  for (const [sid, entry] of sessions) {
    entry.sessionStore.cleanup();
    sessions.delete(sid);
  }
  bunServer.stop();
  process.exit(0);
});

export { bunServer as server };
