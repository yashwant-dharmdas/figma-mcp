// ============================================================
// RelayClient — Per-session WebSocket client to the relay server.
//
// Each MCP session owns one RelayClient.  The client:
//   1. Connects to the relay via WebSocket (ws:// or wss://).
//   2. Sends { type: "join", channel, token } to enter a channel.
//   3. Forwards commands:  { type: "message", channel, message: { id, command, params } }
//   4. Awaits responses:   { type: "message", channel, message: { id, result | error } }
//   5. Forwards progress notifications to an optional callback.
//   6. Rejects all pending commands if the connection drops.
//
// The relay URL is read from RELAY_URL env var (default: ws://localhost:3055).
// ============================================================

import { randomUUID } from "crypto";
import { FigmaMcpError, FigmaErrorCode } from "@figma-mcp/shared";
import type { ProgressData } from "@figma-mcp/shared";

const RELAY_URL = process.env["RELAY_URL"] ?? "ws://localhost:3055";
const DEFAULT_COMMAND_TIMEOUT_MS = Number(
  process.env["COMMAND_TIMEOUT_MS"] ?? 30_000
);
const JOIN_TIMEOUT_MS = 10_000;

// ── Types ────────────────────────────────────────────────────

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export type ProgressCallback = (data: ProgressData) => void;

// ── RelayClient ──────────────────────────────────────────────

export class RelayClient {
  private ws: WebSocket | null = null;
  private pending = new Map<string, PendingRequest>();
  private _channelId: string | null = null;
  private _progressCallback: ProgressCallback | undefined;
  private _relayUrl: string;
  private _connectPromise: Promise<void> | null = null;
  private _keepaliveTimer: ReturnType<typeof setInterval> | undefined;

  constructor(relayUrl: string = RELAY_URL) {
    this._relayUrl = relayUrl;
  }

  // ── Connection ───────────────────────────────────────────

  /**
   * Open the WebSocket connection to the relay.
   * Resolves when the socket is open.
   */
  connect(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }
    if (this._connectPromise) {
      return this._connectPromise;
    }

    this._connectPromise = new Promise<void>((resolve, reject) => {
      let settled = false;
      const settle = (err?: Error) => {
        if (settled) return;
        settled = true;
        if (err) {
          this._connectPromise = null;
          reject(err);
        } else {
          resolve();
        }
      };

      const ws = new WebSocket(this._relayUrl);

      ws.onopen = () => {
        this.ws = ws;
        settle();
      };

      ws.onerror = () => {
        settle(
          new FigmaMcpError(
            `Cannot connect to relay at ${this._relayUrl}. ` +
              "Make sure the relay server is running.",
            FigmaErrorCode.RELAY_DISCONNECTED
          )
        );
      };

      ws.onmessage = (event: MessageEvent) => {
        this.handleMessage(event.data as string);
      };

      ws.onclose = () => {
        this.handleClose();
        settle(
          new FigmaMcpError(
            "Relay connection closed before it could be established.",
            FigmaErrorCode.RELAY_DISCONNECTED
          )
        );
      };
    });

    return this._connectPromise;
  }

  disconnect(): void {
    this.stopKeepalive();
    this._connectPromise = null;
    if (this.ws) {
      this.ws.onclose = null; // prevent handleClose from running twice
      this.ws.close();
      this.ws = null;
    }
    this.rejectAllPending(
      new FigmaMcpError("RelayClient disconnected.", FigmaErrorCode.RELAY_DISCONNECTED)
    );
    this._channelId = null;
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  get channelId(): string | null {
    return this._channelId;
  }

  // ── Channel ──────────────────────────────────────────────

  /**
   * Send a join request and wait for the relay to confirm.
   * Throws FigmaMcpError(AUTH_FAILED) if the token is invalid.
   */
  join(channel: string, token?: string): Promise<void> {
    this.assertConnected();

    const id = randomUUID();

    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(
          new FigmaMcpError(
            `join_channel timed out after ${JOIN_TIMEOUT_MS}ms. ` +
              "Ensure the relay is reachable and the channel ID is correct.",
            FigmaErrorCode.RELAY_DISCONNECTED
          )
        );
      }, JOIN_TIMEOUT_MS);

      this.pending.set(id, {
        resolve: () => {
          this._channelId = channel;
          resolve();
        },
        reject,
        timer,
      });

      this.send({ type: "join", channel, token, id });
    });
  }

  // ── Commands ─────────────────────────────────────────────

  /**
   * Send a command to the Figma plugin via the relay and wait for a response.
   * Throws FigmaMcpError(PLUGIN_TIMEOUT) if the plugin doesn't respond in time.
   */
  sendCommand(
    command: string,
    params: unknown,
    timeoutMs = DEFAULT_COMMAND_TIMEOUT_MS
  ): Promise<unknown> {
    this.assertConnected();

    if (!this._channelId) {
      throw new FigmaMcpError(
        "No channel joined. Call join_channel first.",
        FigmaErrorCode.NO_CHANNEL
      );
    }

    const id = randomUUID();

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(
          new FigmaMcpError(
            `Command '${command}' timed out after ${timeoutMs}ms. ` +
              "Ensure the Figma plugin is open and connected to this channel.",
            FigmaErrorCode.PLUGIN_TIMEOUT
          )
        );
      }, timeoutMs);

      this.pending.set(id, { resolve, reject, timer });

      this.send({
        type: "message",
        channel: this._channelId,
        message: { id, command, params },
      });
    });
  }

  /** Register a callback for progress notifications from the plugin. */
  onProgress(callback: ProgressCallback): void {
    this._progressCallback = callback;
  }

  /** Send periodic pings to keep the relay connection alive. */
  startKeepalive(intervalMs = 30_000): void {
    this.stopKeepalive();
    this._keepaliveTimer = setInterval(() => {
      if (this.isConnected) {
        try {
          this.send({ type: "ping", id: randomUUID() });
        } catch {
          // ignore — handleClose will clean up
        }
      }
    }, intervalMs);
  }

  stopKeepalive(): void {
    if (this._keepaliveTimer !== undefined) {
      clearInterval(this._keepaliveTimer);
      this._keepaliveTimer = undefined;
    }
  }

  // ── Private helpers ──────────────────────────────────────

  private send(payload: unknown): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new FigmaMcpError(
        "WebSocket is not open.",
        FigmaErrorCode.RELAY_DISCONNECTED
      );
    }
    this.ws.send(JSON.stringify(payload));
  }

  private assertConnected(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new FigmaMcpError(
        `Not connected to relay at ${this._relayUrl}. Call connect() first.`,
        FigmaErrorCode.RELAY_DISCONNECTED
      );
    }
  }

  private handleMessage(raw: string): void {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return; // ignore non-JSON
    }

    const type = msg["type"];

    // ── Join confirmation (system message with id) ─────────
    if (type === "system") {
      const message = msg["message"];
      if (message && typeof message === "object" && !Array.isArray(message)) {
        const msgObj = message as Record<string, unknown>;
        const id = msgObj["id"] as string | undefined;
        if (id) {
          const pending = this.pending.get(id);
          if (pending) {
            clearTimeout(pending.timer);
            this.pending.delete(id);
            pending.resolve(msgObj["result"]);
          }
        }
      }
    }

    // ── Command response ───────────────────────────────────
    if (type === "message" || type === "broadcast") {
      const message = msg["message"];
      if (message && typeof message === "object" && !Array.isArray(message)) {
        const msgObj = message as Record<string, unknown>;
        const id = msgObj["id"] as string | undefined;
        if (id) {
          const pending = this.pending.get(id);
          if (pending) {
            // Only resolve if this is actually a response (has result or error).
            // Command requests (which don't have these) are ignored.
            if ("result" in msgObj || "error" in msgObj) {
              clearTimeout(pending.timer);
              this.pending.delete(id);
              const error = msgObj["error"] as string | undefined;
              if (error) {
                pending.reject(new Error(error));
              } else {
                pending.resolve(msgObj["result"]);
              }
            }
          }
        }
      }
    }

    // ── Relay error (no ID — affects all pending or is informational) ──
    if (type === "error") {
      const code = msg["code"] as string | undefined;
      const message = msg["message"] as string | undefined;
      console.error(
        `[relay-client] Relay error: code=${code ?? "unknown"} message=${message ?? "(none)"}`
      );
      // AUTH_FAILED on join — reject all pending (mainly the join promise)
      if (code === FigmaErrorCode.AUTH_FAILED) {
        this.rejectAllPending(
          new FigmaMcpError(
            message ?? "Authentication failed. Check RELAY_SECRET configuration.",
            FigmaErrorCode.AUTH_FAILED
          )
        );
      }
    }

    // ── Progress notification ──────────────────────────────
    if (type === "progress" && this._progressCallback) {
      const data = msg["data"] as ProgressData | undefined;
      if (data) this._progressCallback(data);
    }
  }

  private handleClose(): void {
    this.ws = null;
    this._connectPromise = null;
    this.stopKeepalive();
    this.rejectAllPending(
      new FigmaMcpError(
        "Relay WebSocket connection closed unexpectedly.",
        FigmaErrorCode.RELAY_DISCONNECTED
      )
    );
  }

  private rejectAllPending(error: Error): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(error);
      this.pending.delete(id);
    }
  }
}
