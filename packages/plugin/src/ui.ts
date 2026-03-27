// ============================================================
// ui.ts — Plugin UI (runs in an iframe, has network access).
//
// Responsibilities:
//   1. Generate a channel ID and display it prominently.
//   2. Connect to the relay server via WebSocket.
//   3. Join the channel.
//   4. Bridge messages:
//        Relay → WS message → postMessage → code.ts
//        code.ts → onmessage → WS message → Relay
//
// This file is compiled to an IIFE and inlined into ui.html by build.ts.
// ============================================================

// ── Channel ID ───────────────────────────────────────────────

const CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";

function generateChannelId(length = 8): string {
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => CHARS[b % CHARS.length]!).join("");
}

const channelId = generateChannelId();

// ── DOM refs ─────────────────────────────────────────────────

const channelIdEl = document.getElementById("channel-id")!;
const statusEl = document.getElementById("status")!;
const relayUrlInput = document.getElementById("relay-url") as HTMLInputElement;
const reconnectBtn = document.getElementById("reconnect-btn")!;
const copyBtn = document.getElementById("copy-btn")!;

channelIdEl.textContent = channelId;

// ── Status helper ────────────────────────────────────────────

type StatusType = "connecting" | "connected" | "disconnected" | "error";

function setStatus(text: string, type: StatusType): void {
  statusEl.textContent = text;
  statusEl.className = `status status--${type}`;
}

// ── WebSocket relay connection ────────────────────────────────

let ws: WebSocket | null = null;

function connect(): void {
  if (ws) {
    ws.onclose = null;
    ws.onerror = null;
    try { ws.close(); } catch { /* ignore */ }
    ws = null;
  }

  const url = relayUrlInput.value.trim() || "ws://localhost:3055";
  setStatus(`Connecting to relay…`, "connecting");

  ws = new WebSocket(url);

  ws.onopen = () => {
    ws!.send(JSON.stringify({ type: "join", channel: channelId }));
    setStatus("Connected — paste the channel ID into your MCP client", "connected");
  };

  ws.onmessage = (event: MessageEvent<string>) => {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(event.data) as Record<string, unknown>;
    } catch {
      return;
    }

    // Forward command messages to code.ts
    if (msg["type"] === "message" && msg["message"]) {
      parent.postMessage({ pluginMessage: msg["message"] }, "*");
    }
  };

  ws.onerror = () => {
    setStatus("Connection error — check the relay URL and retry", "error");
  };

  ws.onclose = (event: CloseEvent) => {
    if (event.wasClean) {
      setStatus("Disconnected", "disconnected");
    } else {
      setStatus("Connection lost — click Reconnect to retry", "error");
    }
  };
}

// ── Receive results from code.ts and forward to relay ────────

window.onmessage = (event: MessageEvent) => {
  const { pluginMessage } = event.data as { pluginMessage?: unknown };
  if (!pluginMessage) return;
  if (!ws || ws.readyState !== WebSocket.OPEN) return;

  ws.send(
    JSON.stringify({
      type: "message",
      channel: channelId,
      message: pluginMessage,
    })
  );
};

// ── UI event handlers ─────────────────────────────────────────

reconnectBtn.addEventListener("click", () => connect());

copyBtn.addEventListener("click", () => {
  navigator.clipboard
    .writeText(channelId)
    .then(() => {
      copyBtn.textContent = "Copied!";
      setTimeout(() => { copyBtn.textContent = "Copy"; }, 1500);
    })
    .catch(() => {
      // Fallback: select the text
      const range = document.createRange();
      range.selectNode(channelIdEl);
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(range);
    });
});

// ── Auto-connect ──────────────────────────────────────────────

connect();
