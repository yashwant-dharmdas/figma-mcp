// ============================================================
// join_channel — Special tool handler.
//
// Unlike all other tools (which are auto-registered by ToolFactory from the
// COMMAND_REGISTRY and simply forward to the relay), join_channel is handled
// here in the MCP server because it:
//   1. Creates a new RelayClient for the session.
//   2. Connects to the relay WebSocket.
//   3. Sends the join message and waits for confirmation.
//   4. Stores the channelId + relayClient in the SessionStore.
//
// This function is called by ToolFactory.registerAll() when it encounters the
// "channel" category command.
// ============================================================

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CommandDefinition } from "@figma-mcp/shared";
import type { SessionStore } from "../session-store.js";
import { RelayClient } from "../relay-client.js";

const RELAY_URL = process.env["RELAY_URL"] ?? "ws://localhost:3055";


export function registerJoinChannel(
  server: McpServer,
  def: CommandDefinition,
  sessionStore: SessionStore
): void {
  // params.shape gives ToolFactory the raw Zod shape (Record<string, ZodTypeAny>)
  // which is what McpServer.tool() expects.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const paramsShape = (def.params as any).shape as Record<string, unknown>;

  server.tool(
    def.name,
    def.description,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    paramsShape as any,
    async (args: Record<string, unknown>) => {
      const channel = args["channel"] as string | undefined;
      const token = args["token"] as string | undefined;

      if (!channel) {
        return {
          isError: true as const,
          content: [
            {
              type: "text" as const,
              text:
                "channel is required in hosted/relay mode. " +
                "Pass the 8-character channel ID shown in the Figma plugin UI.",
            },
          ],
        };
      }

      // Re-use the pre-connected relay client, or create a new one if missing.
      const relayClient = sessionStore.relayClient ?? new RelayClient(RELAY_URL);

      try {
        // Returns immediately if already OPEN; waits for connection otherwise.
        await relayClient.connect();
        relayClient.startKeepalive();
      } catch (err) {
        return {
          isError: true as const,
          content: [
            {
              type: "text" as const,
              text:
                err instanceof Error
                  ? err.message
                  : `Failed to connect to relay: ${String(err)}`,
            },
          ],
        };
      }

      try {
        await relayClient.join(channel, token);
      } catch (err) {
        relayClient.disconnect();
        return {
          isError: true as const,
          content: [
            {
              type: "text" as const,
              text:
                err instanceof Error
                  ? err.message
                  : `Failed to join channel '${channel}': ${String(err)}`,
            },
          ],
        };
      }

      sessionStore.setChannel(channel, relayClient);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ channel, status: "connected" }),
          },
        ],
      };
    }
  );
}
