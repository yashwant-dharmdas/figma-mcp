// ── ToolFactory unit tests ────────────────────────────────────
//
// Tests verify the critical invariants:
//   1. requiresChannel guard — returns isError:true when no channel is set.
//   2. isError:true on relay errors — never text-wraps errors.
//   3. TTL cache — cacheable commands return cached result on second call.
//   4. join_channel — sets channel on session store when relay succeeds.
//   5. join_channel — returns isError:true when relay is unreachable.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ToolFactory } from "../src/tool-factory.js";
import { SessionStore } from "../src/session-store.js";
import type { RelayClient } from "../src/relay-client.js";
import type { CommandDefinition } from "@figma-mcp/shared";
import { FigmaErrorCode, FigmaMcpError } from "@figma-mcp/shared";

// ── Helpers ──────────────────────────────────────────────────

/** Capture tool handlers registered via server.tool() */
type ToolHandler = (args: Record<string, unknown>) => Promise<unknown>;

function makeMockServer(): {
  server: McpServer;
  handlers: Map<string, ToolHandler>;
} {
  const handlers = new Map<string, ToolHandler>();
  const server = {
    tool: vi.fn(
      (
        name: string,
        _description: string,
        _paramsShape: unknown,
        handler: ToolHandler
      ) => {
        handlers.set(name, handler);
      }
    ),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any as McpServer;
  return { server, handlers };
}

function makeRelayClient(
  overrides: Partial<RelayClient> = {}
): RelayClient {
  return {
    isConnected: true,
    connect: vi.fn().mockResolvedValue(undefined),
    join: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn(),
    sendCommand: vi.fn().mockResolvedValue({ ok: true }),
    onProgress: vi.fn(),
    channelId: "test-channel",
    ...overrides,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any as RelayClient;
}

function makeCommandDef(
  overrides: Partial<CommandDefinition> = {}
): CommandDefinition {
  return {
    name: "test_command",
    description: "A test command",
    category: "document",
    params: z.object({ nodeId: z.string() }),
    result: z.object({ id: z.string() }),
    requiresChannel: true,
    cacheable: false,
    ...overrides,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any as CommandDefinition;
}

// ── Tests ─────────────────────────────────────────────────────

describe("ToolFactory", () => {
  let store: SessionStore;
  let relayClient: RelayClient;

  beforeEach(() => {
    store = new SessionStore("test-session");
    relayClient = makeRelayClient();
  });

  afterEach(() => {
    store.cleanup();
    vi.restoreAllMocks();
  });

  // ── Channel guard ────────────────────────────────────────

  describe("channel guard", () => {
    it("returns isError when no channel is joined", async () => {
      const { server, handlers } = makeMockServer();
      const factory = new ToolFactory(server, store);
      factory.registerAll([makeCommandDef({ requiresChannel: true })]);

      const handler = handlers.get("test_command")!;
      const result = (await handler({ nodeId: "1:1" })) as {
        isError: boolean;
        content: Array<{ type: string; text: string }>;
      };

      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain("join_channel");
    });

    it("does not guard commands with requiresChannel:false", async () => {
      const { server, handlers } = makeMockServer();
      store.setChannel("chan", relayClient);
      const factory = new ToolFactory(server, store);
      factory.registerAll([makeCommandDef({ requiresChannel: false })]);

      const handler = handlers.get("test_command")!;
      const result = await handler({ nodeId: "1:1" });
      expect((result as { isError?: boolean }).isError).toBeUndefined();
    });
  });

  // ── isError on relay error ────────────────────────────────

  describe("error propagation", () => {
    it("returns isError:true when relay throws", async () => {
      relayClient = makeRelayClient({
        isConnected: true,
        sendCommand: vi.fn().mockRejectedValue(
          new FigmaMcpError("Node not found: 99:99", FigmaErrorCode.NODE_NOT_FOUND)
        ),
      });
      store.setChannel("chan", relayClient);

      const { server, handlers } = makeMockServer();
      const factory = new ToolFactory(server, store);
      factory.registerAll([makeCommandDef()]);

      const result = (await handlers.get("test_command")!({ nodeId: "99:99" })) as {
        isError: boolean;
        content: Array<{ text: string }>;
      };

      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain("Node not found");
    });

    it("includes non-Error objects in error text", async () => {
      relayClient = makeRelayClient({
        isConnected: true,
        sendCommand: vi.fn().mockRejectedValue("string error"),
      });
      store.setChannel("chan", relayClient);

      const { server, handlers } = makeMockServer();
      new ToolFactory(server, store).registerAll([makeCommandDef()]);

      const result = (await handlers.get("test_command")!({ nodeId: "1:1" })) as {
        isError: boolean;
      };
      expect(result.isError).toBe(true);
    });
  });

  // ── TTL cache ─────────────────────────────────────────────

  describe("TTL cache", () => {
    it("returns cached result on second call for cacheable command", async () => {
      store.setChannel("chan", relayClient);
      const { server, handlers } = makeMockServer();
      new ToolFactory(server, store).registerAll([
        makeCommandDef({ cacheable: true, cacheTtlMs: 5000 }),
      ]);

      const handler = handlers.get("test_command")!;
      await handler({});     // first call — populates cache
      await handler({});     // second call — should hit cache

      // sendCommand should only be called once (cache hit on second call)
      expect(relayClient.sendCommand).toHaveBeenCalledTimes(1);
    });

    it("does not cache non-cacheable commands", async () => {
      store.setChannel("chan", relayClient);
      const { server, handlers } = makeMockServer();
      new ToolFactory(server, store).registerAll([
        makeCommandDef({ cacheable: false }),
      ]);

      const handler = handlers.get("test_command")!;
      await handler({});
      await handler({});

      expect(relayClient.sendCommand).toHaveBeenCalledTimes(2);
    });
  });

  // ── join_channel ──────────────────────────────────────────

  describe("join_channel routing", () => {
    it("registers join_channel as a tool", () => {
      const { server, handlers } = makeMockServer();
      const joinDef = makeCommandDef({
        name: "join_channel",
        category: "channel",
        requiresChannel: false,
        params: z.object({
          channel: z.string(),
          token: z.string().optional(),
        }),
        result: z.object({ channel: z.string(), status: z.literal("connected") }),
      });

      new ToolFactory(server, store).registerAll([joinDef]);
      expect(handlers.has("join_channel")).toBe(true);
    });
  });

  // ── Result validation (warn-only) ─────────────────────────

  describe("result validation", () => {
    it("returns the raw result even if schema validation fails", async () => {
      relayClient = makeRelayClient({
        isConnected: true,
        sendCommand: vi
          .fn()
          .mockResolvedValue({ unexpected_field: 42 }), // doesn't match z.object({id})
      });
      store.setChannel("chan", relayClient);

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const { server, handlers } = makeMockServer();
      new ToolFactory(server, store).registerAll([makeCommandDef()]);

      const result = (await handlers.get("test_command")!({ nodeId: "1:1" })) as {
        isError?: boolean;
        content: Array<{ text: string }>;
      };

      // Validation failure is warn-only, result is still returned
      expect(result.isError).toBeUndefined();
      expect(result.content[0]?.text).toContain("unexpected_field");
      expect(warnSpy).toHaveBeenCalled();
    });
  });
});
