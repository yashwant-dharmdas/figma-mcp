// ============================================================
// Per-connection state for the relay server.
// Each WebSocket connection has a ClientConnection instance.
// ============================================================

import { randomUUID } from "crypto";

export type ConnectionRole = "mcp_server" | "figma_plugin" | "unknown";

export interface ClientConnection {
  /** Unique ID for this connection (for logging) */
  readonly clientId: string;
  /** Channel this client has joined, or null if not yet joined */
  channelId: string | null;
  /** Role: who is this connection? */
  role: ConnectionRole;
  /** Unix timestamp (ms) of when the connection was established */
  readonly connectedAt: number;
  /** Unix timestamp (ms) of the last message received */
  lastActivity: number;
}

export function createConnection(): ClientConnection {
  return {
    clientId: `conn_${randomUUID().slice(0, 8)}`,
    channelId: null,
    role: "unknown",
    connectedAt: Date.now(),
    lastActivity: Date.now(),
  };
}
