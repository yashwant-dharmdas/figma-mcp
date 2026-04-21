// ============================================================
// ui.ts — Plugin UI (runs in an iframe, has network access).
//
// In local npx mode the plugin connects directly to the figma-mcp
// WebSocket server on ws://localhost:3001. No relay, no channel IDs.
//
// Message protocol:
//   Incoming (from MCP server): { id, command, params }
//   Outgoing (to MCP server):   { id, result } | { id, error }
// ============================================================

// ── DOM refs ─────────────────────────────────────────────────

const statusEl = document.getElementById("status")!;
const statusTextEl = document.getElementById("status-text")!;
const serverUrlInput = document.getElementById("server-url") as HTMLInputElement;
const reconnectBtn = document.getElementById("reconnect-btn")!;

// ── Status helper ────────────────────────────────────────────

type StatusType = "connecting" | "connected" | "disconnected" | "error";

function setStatus(text: string, type: StatusType): void {
  statusTextEl.textContent = text;
  statusEl.className = `status status--${type}`;
}

// ── WebSocket connection ──────────────────────────────────────

let ws: WebSocket | null = null;

function connect(): void {
  if (ws) {
    ws.onclose = null;
    ws.onerror = null;
    try { ws.close(); } catch { /* ignore */ }
    ws = null;
  }

  const url = serverUrlInput.value.trim() || "ws://localhost:3001";
  setStatus("Connecting…", "connecting");

  ws = new WebSocket(url);

  ws.onopen = () => {
    setStatus("Connected to figma-mcp", "connected");
  };

  ws.onmessage = (event: MessageEvent<string>) => {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(event.data) as Record<string, unknown>;
    } catch {
      return;
    }

    // Server sends { type: "connected" } on open — already handled by onopen
    if (msg["type"] === "connected") return;

    // Forward command to code.ts: { id, command, params }
    if (msg["command"]) {
      parent.postMessage({ pluginMessage: msg }, "*");
    }
  };

  ws.onerror = () => {
    setStatus("Cannot connect — is figma-mcp running?", "error");
  };

  ws.onclose = (event: CloseEvent) => {
    if (event.wasClean) {
      setStatus("Disconnected", "disconnected");
    } else {
      setStatus("Connection lost — click Reconnect", "error");
    }
  };
}

// ── Receive results from code.ts and forward to MCP server ───

window.onmessage = (event: MessageEvent) => {
  const { pluginMessage } = event.data as { pluginMessage?: unknown };
  if (!pluginMessage) return;
  if (!ws || ws.readyState !== WebSocket.OPEN) return;

  // Forward { id, result } or { id, error } directly — no envelope needed
  ws.send(JSON.stringify(pluginMessage));
};

// ── UI events ─────────────────────────────────────────────────

reconnectBtn.addEventListener("click", () => connect());

// ── Auto-connect ──────────────────────────────────────────────

connect();
