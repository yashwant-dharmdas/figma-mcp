// ============================================================
// Channel Manager — manages channel lifecycle, client membership,
// and message broadcasting for the relay server.
//
// Key fixes vs v1:
//   1. Close handler is called by Bun.serve websocket.close() — not ws.close = ()=>{}
//   2. Channel cleanup properly notifies peers on disconnect
//   3. Auth validation before joining
//   4. Active connections tracked per-channel for metrics
// ============================================================

import type { ServerWebSocket } from "bun";
import { validateChannelToken } from "./auth.js";
import { metrics } from "./metrics.js";
import type { ClientConnection } from "./connection.js";
import { createConnection } from "./connection.js";
import {
  FigmaErrorCode,
  FigmaMcpError,
  toErrorMessage,
} from "@figma-mcp/shared";

type WS = ServerWebSocket<ClientConnection>;

/** A channel holds a set of connected WebSocket clients */
interface Channel {
  readonly id: string;
  readonly clients: Set<WS>;
  readonly createdAt: number;
}

export class ChannelManager {
  private readonly channels = new Map<string, Channel>();

  // ── Connection lifecycle ────────────────────────────────

  /**
   * Called by Bun.serve websocket.open().
   * Initializes per-connection state but does NOT add to any channel yet.
   */
  onConnect(ws: WS): void {
    ws.data = createConnection();
    metrics.increment("connections_total");
    metrics.increment("connections_active");
    console.log(`[relay] connect  clientId=${ws.data.clientId}`);

    this.sendToClient(ws, {
      type: "system",
      message: "Connected. Send { type: 'join', channel: '<id>', token: '<token>' } to join a channel.",
    });
  }

  /**
   * Called by Bun.serve websocket.close().
   * NOTE: In Bun, this IS the close event handler.
   * Do NOT assign ws.close = () => {} — that overwrites the method.
   */
  onDisconnect(ws: WS, code: number, reason: string): void {
    const { clientId, channelId } = ws.data;
    console.log(`[relay] disconnect clientId=${clientId} code=${code} reason=${reason || "none"}`);

    // Remove from channel and notify peers
    if (channelId) {
      const channel = this.channels.get(channelId);
      if (channel) {
        channel.clients.delete(ws);
        ws.data.channelId = null;

        // Notify remaining peers
        this.broadcast(channel, {
          type: "system",
          channel: channelId,
          message: `A client has left channel ${channelId}`,
        }, /* excludeSender */ null);

        // Clean up empty channels
        if (channel.clients.size === 0) {
          this.channels.delete(channelId);
          metrics.decrement("channels_active");
          console.log(`[relay] channel_removed id=${channelId}`);
        }
      }
    }

    metrics.decrement("connections_active");
  }

  /**
   * Called by Bun.serve websocket.message().
   */
  onMessage(ws: WS, raw: string | Buffer): void {
    ws.data.lastActivity = Date.now();
    metrics.increment("messages_received");

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(typeof raw === "string" ? raw : raw.toString()) as Record<string, unknown>;
    } catch {
      this.sendError(ws, FigmaErrorCode.INVALID_PARAMS, "Invalid JSON");
      metrics.increment("errors_total");
      return;
    }

    try {
      switch (data["type"]) {
        case "join":
          this.handleJoin(ws, data);
          break;
        case "message":
          this.handleMessage(ws, data);
          break;
        case "progress":
          this.handleProgress(ws, data);
          break;
        case "ping":
          this.handlePing(ws, data);
          break;
        default:
          this.sendError(ws, FigmaErrorCode.INVALID_PARAMS, `Unknown message type: ${String(data["type"])}`);
      }
    } catch (err) {
      metrics.increment("errors_total");
      const msg = toErrorMessage(err);
      console.error(`[relay] error clientId=${ws.data.clientId} msg=${msg}`);
      this.sendError(ws, FigmaErrorCode.INTERNAL_ERROR, msg);
    }
  }

  // ── Message handlers ────────────────────────────────────

  private handleJoin(ws: WS, data: Record<string, unknown>): void {
    const channelId = data["channel"] as string | undefined;
    const token = data["token"] as string | undefined;

    if (!channelId || typeof channelId !== "string") {
      this.sendError(ws, FigmaErrorCode.INVALID_PARAMS, "channel is required");
      return;
    }

    // Auth validation
    if (!validateChannelToken(channelId, token)) {
      this.sendError(ws, FigmaErrorCode.AUTH_FAILED, "Invalid or missing channel token");
      metrics.increment("auth_failures");
      console.warn(`[relay] auth_fail clientId=${ws.data.clientId} channel=${channelId}`);
      return;
    }

    // Leave current channel if already in one
    if (ws.data.channelId) {
      this.leaveChannel(ws);
    }

    // Create channel if new
    if (!this.channels.has(channelId)) {
      this.channels.set(channelId, {
        id: channelId,
        clients: new Set(),
        createdAt: Date.now(),
      });
      metrics.increment("channels_active");
      console.log(`[relay] channel_created id=${channelId}`);
    }

    // Add client to channel
    const channel = this.channels.get(channelId)!;
    channel.clients.add(ws);
    ws.data.channelId = channelId;

    console.log(`[relay] join clientId=${ws.data.clientId} channel=${channelId} members=${channel.clients.size}`);

    // Confirm join to the joining client
    const messageId = (data["id"] as string | undefined) ?? undefined;
    this.sendToClient(ws, {
      type: "system",
      channel: channelId,
      message: messageId
        ? { id: messageId, result: `Connected to channel: ${channelId}` }
        : `Joined channel: ${channelId}`,
    });

    // Notify other channel members
    this.broadcast(channel, {
      type: "system",
      channel: channelId,
      message: "A new client has joined the channel",
    }, ws);

    metrics.increment("messages_sent");
  }

  private handleMessage(ws: WS, data: Record<string, unknown>): void {
    const channelId = data["channel"] as string | undefined;

    if (!channelId || typeof channelId !== "string") {
      this.sendError(ws, FigmaErrorCode.INVALID_PARAMS, "channel is required");
      return;
    }

    if (ws.data.channelId !== channelId) {
      this.sendError(ws, FigmaErrorCode.NO_CHANNEL, "You must join this channel first");
      return;
    }

    const channel = this.channels.get(channelId);
    if (!channel) {
      this.sendError(ws, FigmaErrorCode.NO_CHANNEL, `Channel ${channelId} not found`);
      return;
    }

    // Broadcast to ALL clients in the channel (including sender)
    // The plugin receives commands; the MCP server receives responses
    this.broadcast(channel, {
      type: "broadcast",
      channel: channelId,
      message: data["message"],
    }, null);
  }

  private handleProgress(ws: WS, data: Record<string, unknown>): void {
    const channelId = data["channel"] as string | undefined;
    if (!channelId || ws.data.channelId !== channelId) return;

    const channel = this.channels.get(channelId);
    if (!channel) return;

    // Forward progress update to all channel members
    this.broadcast(channel, data, null);
  }

  private handlePing(ws: WS, data: Record<string, unknown>): void {
    metrics.increment("ping_total");
    this.sendToClient(ws, { type: "pong", id: data["id"] as string });
  }

  // ── Helpers ────────────────────────────────────────────

  private leaveChannel(ws: WS): void {
    const channelId = ws.data.channelId;
    if (!channelId) return;

    const channel = this.channels.get(channelId);
    if (channel) {
      channel.clients.delete(ws);
      if (channel.clients.size === 0) {
        this.channels.delete(channelId);
        metrics.decrement("channels_active");
      }
    }
    ws.data.channelId = null;
  }

  /**
   * Broadcast a message to all clients in a channel.
   * @param excludeSender - Exclude this specific client from the broadcast.
   *   Pass null to broadcast to ALL clients (including sender).
   */
  private broadcast(
    channel: Channel,
    payload: unknown,
    excludeSender: WS | null
  ): void {
    const json = JSON.stringify(payload);
    for (const client of channel.clients) {
      if (client === excludeSender) continue;
      if (client.readyState === WebSocket.OPEN) {
        client.send(json);
        metrics.increment("messages_sent");
      }
    }
  }

  private sendToClient(ws: WS, payload: unknown): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
      metrics.increment("messages_sent");
    }
  }

  private sendError(ws: WS, code: string, message: string): void {
    this.sendToClient(ws, { type: "error", code, message });
    metrics.increment("errors_total");
  }

  // ── Status ────────────────────────────────────────────

  getChannelCount(): number {
    return this.channels.size;
  }

  getClientCount(): number {
    let total = 0;
    for (const channel of this.channels.values()) {
      total += channel.clients.size;
    }
    return total;
  }
}
