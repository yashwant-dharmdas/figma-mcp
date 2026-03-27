// ============================================================
// code.ts — Figma plugin sandbox entry point.
//
// Runs in Figma's JavaScript sandbox:
//   ✓ Has access to the full Figma API (figma.*)
//   ✗ No network access — cannot fetch or open WebSockets
//   ✗ No DOM — runs in a worker-like context
//
// Responsibilities:
//   1. Show the plugin UI (ui.html in an iframe).
//   2. Receive commands from the UI via figma.ui.onmessage.
//   3. Dispatch commands to registered handlers.
//   4. Return results (or errors) to the UI via figma.ui.postMessage.
//
// Message protocol (matches relay wire format):
//   Incoming: { id: string, command: string, params: Record<string, unknown> }
//   Outgoing: { id: string, result?: unknown } | { id: string, error: string }
// ============================================================

import { dispatcher } from "./dispatcher.js";
import { registerHandlers } from "./handlers/index.js";

// Register all command handlers before the first message arrives.
registerHandlers(dispatcher);

// Show the plugin UI.
// Width/height here is the initial size — the UI can be resized.
figma.showUI(__html__, {
  width: 340,
  height: 180,
  title: "Figma MCP",
  themeColors: true,
});

// ── Message handler ──────────────────────────────────────────

interface CommandMessage {
  id: string;
  command: string;
  params: Record<string, unknown>;
}

figma.ui.onmessage = async (msg: unknown) => {
  // Validate message shape before dispatching.
  if (
    !msg ||
    typeof msg !== "object" ||
    typeof (msg as CommandMessage).id !== "string" ||
    typeof (msg as CommandMessage).command !== "string"
  ) {
    console.warn("[figma-mcp] Received unexpected message:", msg);
    return;
  }

  const { id, command, params = {} } = msg as CommandMessage;

  try {
    const result = await dispatcher.dispatch(command, params);
    figma.ui.postMessage({ id, result });
  } catch (err) {
    const error =
      err instanceof Error ? err.message : `Command failed: ${String(err)}`;
    figma.ui.postMessage({ id, error });
  }
};
