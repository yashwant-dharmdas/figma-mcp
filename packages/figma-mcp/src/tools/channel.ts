// ============================================================
// join_channel — Simplified for local npx mode.
//
// In the relay model the user had to copy an 8-character channel ID
// from the Figma plugin and pass it here. In local mode the plugin
// connects automatically, so this tool simply verifies the connection
// is live. No channel ID needed.
// ============================================================

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SessionStore } from "../session-store.js";

export function registerJoinChannel(
  server: McpServer,
  sessionStore: SessionStore
): void {
  server.tool(
    "join_channel",
    "Verify the Figma plugin is connected. " +
      "Open the Figma plugin in Figma Desktop and it connects automatically to this server. " +
      "Call this tool before using other Figma tools to confirm the plugin is ready.",
    // No params required — the plugin auto-connects
    { channel: z.string().optional().describe("Not used in local mode. Ignored if provided.") },
    async (_args) => {
      if (!sessionStore.isConnected) {
        return {
          isError: true as const,
          content: [
            {
              type: "text" as const,
              text:
                "No Figma plugin connected. " +
                "Open the Figma plugin in Figma Desktop — it will connect automatically to " +
                `ws://localhost:${process.env["FIGMA_MCP_PORT"] ?? "3001"}.`,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ status: "connected" }),
          },
        ],
      };
    }
  );
}
