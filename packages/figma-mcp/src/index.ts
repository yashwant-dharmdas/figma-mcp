// ============================================================
// figma-mcp — Single-process entry point for npx distribution.
//
// Two things happen here:
//   1. A WebSocket server starts on localhost:FIGMA_MCP_PORT (default 3001)
//      so the Figma plugin can connect directly (no relay needed).
//   2. An MCP server starts on stdio so Claude Desktop can spawn this
//      process via "command": "npx", "args": ["-y", "figma-mcp"].
//
// Claude Desktop config (~/.claude/claude_desktop_config.json):
//   {
//     "mcpServers": {
//       "figma": {
//         "command": "npx",
//         "args": ["-y", "figma-mcp"]
//       }
//     }
//   }
//
// All diagnostic output uses process.stderr so it doesn't interfere
// with the MCP stdio transport on stdout.
// ============================================================

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { COMMAND_REGISTRY } from "@figma-mcp/shared";
import { PluginBridge } from "./plugin-bridge.js";
import { SessionStore } from "./session-store.js";
import { ToolFactory } from "./tool-factory.js";

const PLUGIN_WS_PORT = Number(process.env["FIGMA_MCP_PORT"] ?? 3001);

// ── Start the WebSocket server for the Figma plugin ──────────

const bridge = new PluginBridge(PLUGIN_WS_PORT);

process.stderr.write(
  `[figma-mcp] Plugin WebSocket server on ws://localhost:${PLUGIN_WS_PORT}\n`
);
process.stderr.write(
  `[figma-mcp] Open the Figma plugin — it will connect automatically\n`
);

// ── Register MCP tools ────────────────────────────────────────

const sessionStore = new SessionStore(bridge);
const mcpServer = new McpServer({ name: "figma-mcp", version: "3.0.0" });
const toolFactory = new ToolFactory(mcpServer, sessionStore);
toolFactory.registerAll(COMMAND_REGISTRY);

// ── Connect MCP server to stdio transport ────────────────────

const transport = new StdioServerTransport();
await mcpServer.connect(transport);

// ── Graceful shutdown ─────────────────────────────────────────

process.on("SIGINT", () => {
  bridge.close();
  sessionStore.cleanup();
  process.exit(0);
});

process.on("SIGTERM", () => {
  bridge.close();
  sessionStore.cleanup();
  process.exit(0);
});
