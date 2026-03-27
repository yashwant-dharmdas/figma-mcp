// ============================================================
// Wire protocol message types for the WebSocket relay.
// All messages between MCP server, relay, and plugin use these types.
// ============================================================

import type { ProgressData } from "./progress.js";

// ── Client → Relay ──────────────────────────────────────────

/** Join a channel (first message after connecting) */
export interface JoinMessage {
  type: "join";
  channel: string;
  /** HMAC token for channel authentication. Optional in dev mode. */
  token?: string;
}

/** Send a command or response through a channel */
export interface ChannelMessage {
  type: "message";
  channel: string;
  message: CommandPayload | ResponsePayload;
}

/** Keepalive ping */
export interface PingMessage {
  type: "ping";
  id: string;
}

// ── Relay → Client ──────────────────────────────────────────

/** System notification from the relay (join confirmation, peer joins/leaves) */
export interface SystemMessage {
  type: "system";
  channel?: string;
  message: string | { id: string; result: string };
}

/** A message broadcast to all members of a channel */
export interface BroadcastMessage {
  type: "broadcast";
  channel: string;
  message: CommandPayload | ResponsePayload;
}

/** Error from the relay layer (auth failure, invalid channel, etc.) */
export interface RelayErrorMessage {
  type: "error";
  code: string;
  message: string;
}

/** Pong response to a ping */
export interface PongMessage {
  type: "pong";
  id: string;
}

// ── Shared payload shapes ────────────────────────────────────

/** A command sent from MCP server → plugin */
export interface CommandPayload {
  /** UUID correlating this command to its response */
  id: string;
  command: string;
  params: Record<string, unknown>;
}

/** A response sent from plugin → MCP server */
export interface ResponsePayload {
  /** Matches the id from the CommandPayload */
  id: string;
  result?: unknown;
  error?: string;
}

/** Progress update from plugin → MCP server (sent as relay message) */
export interface ProgressRelayMessage {
  type: "progress";
  channel: string;
  /** Matches the id from the CommandPayload */
  id: string;
  data: ProgressData;
}

// ── Union type for incoming relay messages ───────────────────

export type InboundRelayMessage =
  | JoinMessage
  | ChannelMessage
  | PingMessage
  | ProgressRelayMessage;

export type OutboundRelayMessage =
  | SystemMessage
  | BroadcastMessage
  | RelayErrorMessage
  | PongMessage
  | ProgressRelayMessage;
