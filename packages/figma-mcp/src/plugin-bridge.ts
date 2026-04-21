// ============================================================
// PluginBridge — Embedded WebSocket server that the Figma plugin
// connects to directly. Replaces the external relay entirely.
//
// The MCP server is the WebSocket *server*; the Figma plugin's ui.ts
// is the *client*. No broker, no channel IDs, no tokens.
//
// Message protocol (both directions are plain JSON, no envelope):
//   MCP → Plugin:  { id: string, command: string, params: unknown }
//   Plugin → MCP:  { id: string, result: unknown }
//                | { id: string, error: string }
//   Plugin → MCP:  { type: "progress", id: string, data: unknown }
// ============================================================

import { WebSocketServer, WebSocket } from "ws";
import { randomUUID } from "crypto";
import { FigmaMcpError, FigmaErrorCode } from "@figma-mcp/shared";
import type { ProgressData } from "@figma-mcp/shared";

const DEFAULT_COMMAND_TIMEOUT_MS = Number(
  process.env["COMMAND_TIMEOUT_MS"] ?? 30_000
);

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export type ProgressCallback = (data: ProgressData) => void;

export class PluginBridge {
  private readonly wss: WebSocketServer;
  private pluginSocket: WebSocket | null = null;
  private readonly pending = new Map<string, PendingRequest>();
  private _progressCallback: ProgressCallback | undefined;

  constructor(port: number) {
    this.wss = new WebSocketServer({ port, host: "127.0.0.1" });

    this.wss.on("connection", (ws) => {
      process.stderr.write("[figma-mcp] Figma plugin connected\n");

      // Replace any stale socket with the new one
      if (this.pluginSocket?.readyState === WebSocket.OPEN) {
        this.pluginSocket.close();
      }
      this.pluginSocket = ws;

      // Acknowledge connection so the plugin can show "Connected" immediately
      ws.send(JSON.stringify({ type: "connected" }));

      ws.on("message", (data) => {
        this.handleMessage(data.toString());
      });

      ws.on("close", () => {
        process.stderr.write("[figma-mcp] Figma plugin disconnected\n");
        if (this.pluginSocket === ws) this.pluginSocket = null;
        this.rejectAllPending(
          new FigmaMcpError(
            "Figma plugin disconnected.",
            FigmaErrorCode.RELAY_DISCONNECTED
          )
        );
      });

      ws.on("error", (err) => {
        process.stderr.write(`[figma-mcp] Plugin socket error: ${err.message}\n`);
      });
    });

    this.wss.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        process.stderr.write(
          `[figma-mcp] Port ${port} already in use. ` +
            `Set FIGMA_MCP_PORT to a different port and restart.\n`
        );
      } else {
        process.stderr.write(`[figma-mcp] WebSocket server error: ${err.message}\n`);
      }
    });
  }

  get isConnected(): boolean {
    return this.pluginSocket?.readyState === WebSocket.OPEN;
  }

  /**
   * Send a command to the connected Figma plugin and wait for its response.
   * Throws FigmaMcpError(NO_CHANNEL) if no plugin is connected.
   * Throws FigmaMcpError(PLUGIN_TIMEOUT) if the plugin doesn't respond in time.
   */
  sendCommand(
    command: string,
    params: unknown,
    timeoutMs = DEFAULT_COMMAND_TIMEOUT_MS
  ): Promise<unknown> {
    if (!this.isConnected) {
      throw new FigmaMcpError(
        "No Figma plugin connected. Open the Figma plugin in Figma Desktop — it connects automatically.",
        FigmaErrorCode.NO_CHANNEL
      );
    }

    const id = randomUUID();

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(
          new FigmaMcpError(
            `Command '${command}' timed out after ${timeoutMs}ms. Ensure the Figma plugin is open.`,
            FigmaErrorCode.PLUGIN_TIMEOUT
          )
        );
      }, timeoutMs);

      this.pending.set(id, { resolve, reject, timer });
      this.pluginSocket!.send(JSON.stringify({ id, command, params }));
    });
  }

  onProgress(callback: ProgressCallback): void {
    this._progressCallback = callback;
  }

  close(): void {
    this.rejectAllPending(
      new FigmaMcpError("Server shutting down.", FigmaErrorCode.RELAY_DISCONNECTED)
    );
    this.wss.close();
  }

  // ── Private ──────────────────────────────────────────────────

  private handleMessage(raw: string): void {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return;
    }

    // Progress notification — no pending request involved
    if (msg["type"] === "progress" && this._progressCallback) {
      this._progressCallback(msg["data"] as ProgressData);
      return;
    }

    const id = msg["id"] as string | undefined;
    if (!id) return;

    const pending = this.pending.get(id);
    if (!pending) return;

    clearTimeout(pending.timer);
    this.pending.delete(id);

    if ("error" in msg) {
      pending.reject(new Error(msg["error"] as string));
    } else {
      pending.resolve(msg["result"]);
    }
  }

  private rejectAllPending(error: Error): void {
    for (const [id, req] of this.pending) {
      clearTimeout(req.timer);
      req.reject(error);
      this.pending.delete(id);
    }
  }
}
