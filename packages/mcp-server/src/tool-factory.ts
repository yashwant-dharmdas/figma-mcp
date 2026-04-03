// ============================================================
// ToolFactory — Auto-registers all COMMAND_REGISTRY entries as MCP tools.
//
// Key design properties:
//
//   1. SINGLE source of truth — every tool is derived from CommandDefinition;
//      no per-tool boilerplate is ever written.
//
//   2. isError: true — ALL errors are returned with isError:true so the AI
//      can distinguish success from failure at the protocol level.
//
//   3. Channel guard — commands with requiresChannel:true return a
//      helpful error if join_channel hasn't been called yet.
//
//   4. TTL cache — cacheable:true commands return cached results when
//      available, avoiding redundant round-trips to the Figma plugin.
//
//   5. Result validation — plugin results are parsed against def.result;
//      mismatches are logged as warnings but the result is still returned
//      (fail-open so partial data still reaches the AI).
//
//   6. Category routing — "channel" commands are handled by registerJoinChannel
//      (no relay forwarding); all others are forwarded to the relay.
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

  /**
   * Register every command in the registry as an MCP tool.
   * Call this once after constructing McpServer, before calling server.connect().
   */
  registerAll(registry: CommandDefinition[]): void {
    for (const def of registry) {
      if (def.category === "channel") {
        // join_channel needs special handling (connects relay, stores state)
        registerJoinChannel(this.server, def, this.sessionStore);
      } else {
        this.registerStandardTool(def);
      }
    }
  }

  // ── Standard tool (forwards to relay) ───────────────────

  private registerStandardTool(def: CommandDefinition): void {
    // Extract the raw Zod shape from the ZodObject so McpServer can build
    // its own JSON Schema from it.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const paramsShape = (def.params as any).shape as Record<string, unknown>;

    this.server.tool(
      def.name,
      def.description,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      paramsShape as any,
      async (args: Record<string, unknown>) => {
        // ── Channel guard ──────────────────────────────────
        if (def.requiresChannel && !this.sessionStore.isConnected) {
          return {
            isError: true as const,
            content: [
              {
                type: "text" as const,
                text:
                  "No active Figma session. " +
                  "Call join_channel first with the 8-character channel ID " +
                  "shown in the Figma plugin.",
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

        // ── Forward to relay → plugin ──────────────────────
        try {
          const result = await this.sessionStore.relayClient!.sendCommand(
            def.name,
            args
          );

          // Validate result shape (warn-only — fail open)
          const parsed = def.result.safeParse(result);
          if (!parsed.success) {
            console.warn(
              `[tool-factory] Result validation warning for '${def.name}':`,
              parsed.error.message
            );
          }

          // Store in cache for next read (cacheable commands only)
          if (def.cacheable) {
            this.sessionStore.cache.set(
              def.name,
              args,
              result,
              def.cacheTtlMs
            );
          }

          return {
            content: [
              { type: "text" as const, text: JSON.stringify(result ?? null) },
            ],
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
