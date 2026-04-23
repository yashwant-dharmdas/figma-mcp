// ============================================================
// figma-mcp — Single-process entry point for npx distribution.
//
// Claude Desktop spawns this process via stdio transport:
//
//   claude_desktop_config.json:
//   { "mcpServers": { "figma": { "command": "npx",
//     "args": ["-y", "@yashwant.dharmdas/figma-mcp"] } } }
//
// The Figma plugin connects to ws://localhost:PORT automatically.
// Default port is 3001. If 3001 is in use, set FIGMA_MCP_PORT=3002
// (or any free port) and update the plugin URL in its Settings.
//
// All diagnostic output goes to stderr so it never interferes
// with the stdio MCP transport on stdout.
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

// ── Start the MCP server (stdio transport) ───────────────────

const sessionStore = new SessionStore(bridge);
const mcpServer    = new McpServer({ name: "figma-mcp", version: "3.0.4" });
const factory      = new ToolFactory(mcpServer, sessionStore);
factory.registerAll(COMMAND_REGISTRY);

const transport = new StdioServerTransport();
await mcpServer.connect(transport);

process.stderr.write(`[figma-mcp] stdio mode — ready\n`);

// ── Graceful shutdown ─────────────────────────────────────────

process.on("SIGINT",  () => { bridge.close(); process.exit(0); });
process.on("SIGTERM", () => { bridge.close(); process.exit(0); });
