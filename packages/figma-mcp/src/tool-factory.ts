// ============================================================
// ToolFactory — Auto-registers all COMMAND_REGISTRY entries as MCP tools.
// Identical design to the mcp-server package but routes to PluginBridge
// instead of RelayClient.
// ============================================================

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CommandDefinition } from "@figma-mcp/shared";
import type { SessionStore } from "./session-store.js";
import { registerJoinChannel } from "./tools/channel.js";

export class ToolFactory {
  constructor(
    private readonly server: McpServer,
    private readonly sessionStore: SessionStore
  ) {}

  registerAll(registry: CommandDefinition[]): void {
    for (const def of registry) {
      if (def.category === "channel") {
        registerJoinChannel(this.server, this.sessionStore);
      } else {
        this.registerStandardTool(def);
      }
    }
  }

  private registerStandardTool(def: CommandDefinition): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const paramsShape = (def.params as any).shape as Record<string, unknown>;

    this.server.tool(
      def.name,
      def.description,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      paramsShape as any,
      async (args: Record<string, unknown>) => {
        // ── Plugin connection guard ────────────────────────
        if (def.requiresChannel && !this.sessionStore.isConnected) {
          return {
            isError: true as const,
            content: [
              {
                type: "text" as const,
                text:
                  "No Figma plugin connected. " +
                  "Open the Figma plugin in Figma Desktop — it connects automatically.",
              },
            ],
          };
        }

        // ── TTL cache (read-only commands only) ────────────
        if (def.cacheable) {
          const cached = this.sessionStore.cache.get(def.name, args);
          if (cached !== undefined) {
            return {
              content: [{ type: "text" as const, text: JSON.stringify(cached ?? null) }],
            };
          }
        }

        // ── Forward to plugin via bridge ───────────────────
        try {
          const result = await this.sessionStore.pluginBridge.sendCommand(
            def.name,
            args
          );

          const parsed = def.result.safeParse(result);
          if (!parsed.success) {
            process.stderr.write(
              `[tool-factory] Result validation warning for '${def.name}': ${parsed.error.message}\n`
            );
          }

          if (def.cacheable) {
            this.sessionStore.cache.set(def.name, args, result, def.cacheTtlMs);
          }

          return {
            content: [{ type: "text" as const, text: JSON.stringify(result ?? null) }],
          };
        } catch (err) {
          return {
            isError: true as const,
            content: [
              {
                type: "text" as const,
                text: err instanceof Error ? err.message : String(err),
              },
            ],
          };
        }
      }
    );
  }
}
