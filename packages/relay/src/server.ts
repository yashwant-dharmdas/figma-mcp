// ============================================================
// Relay Server — Bun WebSocket relay for figma-mcp
//
// Responsibilities:
//   - Accept WebSocket connections from MCP server clients and Figma plugins
//   - Route messages within channels (each channel = one Figma session)
//   - Authenticate channel joins with HMAC tokens (disabled in dev)
//   - Expose /health and /metrics endpoints
//
// Env vars:
//   RELAY_PORT       - Port to listen on (default: 3055)
//   RELAY_HOST       - Host to bind to (default: 0.0.0.0)
//   RELAY_SECRET     - HMAC secret for channel auth (required in prod)
//   RELAY_AUTH       - Set to "disabled" to skip auth (local dev only)
//   TLS_CERT_PATH    - Path to TLS cert (enables WSS)
//   TLS_KEY_PATH     - Path to TLS private key
// ============================================================

import { ChannelManager } from "./channel-manager.js";
import { metrics } from "./metrics.js";
import type { ClientConnection } from "./connection.js";

const PORT = Number(process.env["PORT"] ?? process.env["RELAY_PORT"] ?? 3055);
const HOST = process.env["RELAY_HOST"] ?? "0.0.0.0";

// TLS config (optional — enables WSS)
const tlsConfig =
  process.env["TLS_CERT_PATH"] && process.env["TLS_KEY_PATH"]
    ? {
        tls: {
          cert: Bun.file(process.env["TLS_CERT_PATH"]),
          key: Bun.file(process.env["TLS_KEY_PATH"]),
        },
      }
    : {};

const channelManager = new ChannelManager();

const server = Bun.serve<ClientConnection>({
  port: PORT,
  hostname: HOST,
  ...tlsConfig,

  // ── HTTP handler (for /health, /metrics, and WS upgrade) ──

  fetch(req, server) {
    const url = new URL(req.url);

    // CORS preflight
    if (req.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    // Health check endpoint (for Docker healthcheck, load balancers)
    if (url.pathname === "/health") {
      return new Response(
        JSON.stringify({
          status: "ok",
          channels: channelManager.getChannelCount(),
          clients: channelManager.getClientCount(),
          uptime: metrics.uptimeSeconds(),
        }),
        {
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    // Prometheus metrics endpoint
    if (url.pathname === "/metrics") {
      metrics.set("channels_active", channelManager.getChannelCount());
      metrics.set("connections_active", channelManager.getClientCount());
      return new Response(metrics.toPrometheusText(), {
        headers: { "Content-Type": "text/plain; version=0.0.4" },
      });
    }

    // WebSocket upgrade — supply `data` for Bun's typed WS context.
    // The ChannelManager.onConnect() fills in the real values on open.
    const upgraded = server.upgrade(req, {
      headers: { "Access-Control-Allow-Origin": "*" },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: {} as any,
    });

    if (upgraded) return undefined;

    return new Response(
      "figma-mcp relay v2 — connect via WebSocket\nEndpoints: /health /metrics",
      {
        headers: {
          "Content-Type": "text/plain",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  },

  // ── WebSocket handlers ──────────────────────────────────

  websocket: {
    /**
     * New connection established.
     * ws.data is initialized by ChannelManager.onConnect().
     */
    open(ws) {
      channelManager.onConnect(ws);
    },

    /**
     * Message received from client.
     */
    message(ws, message) {
      channelManager.onMessage(ws, message);
    },

    /**
     * Connection closed.
     * NOTE: This is the correct Bun close event handler.
     * NEVER use ws.close = () => {} — that overwrites the method.
     */
    close(ws, code, reason) {
      channelManager.onDisconnect(ws, code, reason ?? "");
    },

    /**
     * Backpressure relieved — the send buffer has drained.
     */
    drain(ws) {
      console.log(`[relay] drain clientId=${ws.data.clientId}`);
    },

    // Bun WS server settings
    maxPayloadLength: 16 * 1024 * 1024, // 16MB max message size
    idleTimeout: 120,                   // 120s idle timeout
    backpressureLimit: 1024 * 1024,     // 1MB backpressure limit
    closeOnBackpressureLimit: false,    // Don't close on backpressure, drain instead
  },
});

console.log(
  `[relay] started port=${server.port} host=${HOST} ` +
    `tls=${!!process.env["TLS_CERT_PATH"]} auth=${process.env["RELAY_AUTH"] === "disabled" ? "disabled" : "enabled"}`
);
console.log(`[relay] health    http://localhost:${server.port}/health`);
console.log(`[relay] metrics   http://localhost:${server.port}/metrics`);

// Periodic stats logging (every 5 minutes)
setInterval(() => {
  console.log(
    `[relay] stats channels=${channelManager.getChannelCount()} ` +
      `clients=${channelManager.getClientCount()} ` +
      `uptime=${metrics.uptimeSeconds()}s`
  );
}, 5 * 60 * 1000);

export { server };
