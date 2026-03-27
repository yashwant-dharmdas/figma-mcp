import { describe, it, expect, beforeEach, vi } from "vitest";
import { ChannelManager } from "../src/channel-manager.js";

// Mock the auth module to disable auth in tests
vi.mock("../src/auth.js", () => ({
  validateChannelToken: vi.fn().mockReturnValue(true),
  isAuthDisabled: true,
}));

// Mock the metrics module
vi.mock("../src/metrics.js", () => ({
  metrics: {
    increment: vi.fn(),
    decrement: vi.fn(),
    set: vi.fn(),
    get: vi.fn().mockReturnValue(0),
    uptimeSeconds: vi.fn().mockReturnValue(0),
    toPrometheusText: vi.fn().mockReturnValue(""),
    toJSON: vi.fn().mockReturnValue({}),
  },
}));

/** Create a minimal mock WS object */
function createMockWs(overrides?: Partial<{ readyState: number }>) {
  const sent: string[] = [];
  return {
    data: {} as Record<string, unknown>,
    readyState: overrides?.readyState ?? WebSocket.OPEN,
    send: vi.fn((msg: string) => { sent.push(msg); }),
    _sent: sent, // for inspection
  };
}

describe("ChannelManager", () => {
  let manager: ChannelManager;

  beforeEach(() => {
    manager = new ChannelManager();
  });

  describe("onConnect", () => {
    it("assigns a clientId to ws.data", () => {
      const ws = createMockWs();
      manager.onConnect(ws as any);
      expect(ws.data.clientId).toBeTruthy();
      expect(typeof ws.data.clientId).toBe("string");
    });

    it("sends a welcome system message", () => {
      const ws = createMockWs();
      manager.onConnect(ws as any);
      expect(ws.send).toHaveBeenCalledOnce();
      const msg = JSON.parse(ws.send.mock.calls[0]![0] as string);
      expect(msg.type).toBe("system");
    });

    it("does not add client to any channel on connect", () => {
      const ws = createMockWs();
      manager.onConnect(ws as any);
      expect(manager.getChannelCount()).toBe(0);
    });
  });

  describe("join (via onMessage)", () => {
    it("adds client to a new channel", () => {
      const ws = createMockWs();
      manager.onConnect(ws as any);
      manager.onMessage(ws as any, JSON.stringify({ type: "join", channel: "test123" }));

      expect(manager.getChannelCount()).toBe(1);
      expect(ws.data.channelId).toBe("test123");
    });

    it("sends join confirmation to the joining client", () => {
      const ws = createMockWs();
      manager.onConnect(ws as any);
      ws.send.mockClear();
      manager.onMessage(ws as any, JSON.stringify({ type: "join", channel: "test123", id: "req-1" }));

      const calls = ws.send.mock.calls.map((c) => JSON.parse(c[0] as string));
      const confirmation = calls.find((m) => m.type === "system" && m.channel === "test123");
      expect(confirmation).toBeTruthy();
    });

    it("notifies existing channel members when a new client joins", () => {
      const ws1 = createMockWs();
      const ws2 = createMockWs();

      manager.onConnect(ws1 as any);
      manager.onConnect(ws2 as any);
      manager.onMessage(ws1 as any, JSON.stringify({ type: "join", channel: "test123" }));

      ws1.send.mockClear();
      manager.onMessage(ws2 as any, JSON.stringify({ type: "join", channel: "test123" }));

      // ws1 should receive a notification
      const calls = ws1.send.mock.calls.map((c) => JSON.parse(c[0] as string));
      const notification = calls.find((m) => m.message === "A new client has joined the channel");
      expect(notification).toBeTruthy();
    });

    it("rejects join with missing channel name", () => {
      const ws = createMockWs();
      manager.onConnect(ws as any);
      ws.send.mockClear();
      manager.onMessage(ws as any, JSON.stringify({ type: "join" }));

      const calls = ws.send.mock.calls.map((c) => JSON.parse(c[0] as string));
      const error = calls.find((m) => m.type === "error");
      expect(error).toBeTruthy();
      expect(manager.getChannelCount()).toBe(0);
    });

    it("two clients can be in the same channel", () => {
      const ws1 = createMockWs();
      const ws2 = createMockWs();
      manager.onConnect(ws1 as any);
      manager.onConnect(ws2 as any);
      manager.onMessage(ws1 as any, JSON.stringify({ type: "join", channel: "shared" }));
      manager.onMessage(ws2 as any, JSON.stringify({ type: "join", channel: "shared" }));

      expect(manager.getChannelCount()).toBe(1); // still 1 channel
      expect(manager.getClientCount()).toBe(2);  // 2 clients in it
    });

    it("two clients can be in different channels", () => {
      const ws1 = createMockWs();
      const ws2 = createMockWs();
      manager.onConnect(ws1 as any);
      manager.onConnect(ws2 as any);
      manager.onMessage(ws1 as any, JSON.stringify({ type: "join", channel: "chan-a" }));
      manager.onMessage(ws2 as any, JSON.stringify({ type: "join", channel: "chan-b" }));

      expect(manager.getChannelCount()).toBe(2);
      expect(manager.getClientCount()).toBe(2);
    });
  });

  describe("message routing", () => {
    it("broadcasts to all channel members when a message is sent", () => {
      const ws1 = createMockWs();
      const ws2 = createMockWs();
      manager.onConnect(ws1 as any);
      manager.onConnect(ws2 as any);
      manager.onMessage(ws1 as any, JSON.stringify({ type: "join", channel: "chan" }));
      manager.onMessage(ws2 as any, JSON.stringify({ type: "join", channel: "chan" }));

      ws1.send.mockClear();
      ws2.send.mockClear();

      manager.onMessage(ws1 as any, JSON.stringify({
        type: "message",
        channel: "chan",
        message: { id: "cmd-1", command: "get_document_info", params: {} },
      }));

      // Both ws1 (sender) and ws2 should receive the broadcast
      const calls2 = ws2.send.mock.calls.map((c) => JSON.parse(c[0] as string));
      const broadcast = calls2.find((m) => m.type === "broadcast");
      expect(broadcast).toBeTruthy();
      expect(broadcast?.message?.command).toBe("get_document_info");
    });

    it("does not route messages to clients in other channels", () => {
      const ws1 = createMockWs();
      const ws2 = createMockWs();
      manager.onConnect(ws1 as any);
      manager.onConnect(ws2 as any);
      manager.onMessage(ws1 as any, JSON.stringify({ type: "join", channel: "chan-a" }));
      manager.onMessage(ws2 as any, JSON.stringify({ type: "join", channel: "chan-b" }));

      ws2.send.mockClear();
      manager.onMessage(ws1 as any, JSON.stringify({
        type: "message",
        channel: "chan-a",
        message: { id: "cmd-1", command: "ping", params: {} },
      }));

      // ws2 is in a different channel — should not receive anything
      const calls2 = ws2.send.mock.calls.map((c) => JSON.parse(c[0] as string));
      const broadcast = calls2.find((m) => m.type === "broadcast");
      expect(broadcast).toBeUndefined();
    });
  });

  describe("disconnect", () => {
    it("removes client from channel on disconnect", () => {
      const ws = createMockWs();
      manager.onConnect(ws as any);
      manager.onMessage(ws as any, JSON.stringify({ type: "join", channel: "chan" }));

      expect(manager.getClientCount()).toBe(1);
      manager.onDisconnect(ws as any, 1000, "normal");
      expect(manager.getClientCount()).toBe(0);
    });

    it("removes empty channels after last client disconnects", () => {
      const ws = createMockWs();
      manager.onConnect(ws as any);
      manager.onMessage(ws as any, JSON.stringify({ type: "join", channel: "chan" }));

      expect(manager.getChannelCount()).toBe(1);
      manager.onDisconnect(ws as any, 1000, "");
      expect(manager.getChannelCount()).toBe(0);
    });

    it("notifies remaining peers when a client disconnects", () => {
      const ws1 = createMockWs();
      const ws2 = createMockWs();
      manager.onConnect(ws1 as any);
      manager.onConnect(ws2 as any);
      manager.onMessage(ws1 as any, JSON.stringify({ type: "join", channel: "chan" }));
      manager.onMessage(ws2 as any, JSON.stringify({ type: "join", channel: "chan" }));

      ws2.send.mockClear();
      manager.onDisconnect(ws1 as any, 1000, "");

      // ws2 should be notified
      const calls = ws2.send.mock.calls.map((c) => JSON.parse(c[0] as string));
      const notification = calls.find((m) => m.type === "system" && String(m.message).includes("left"));
      expect(notification).toBeTruthy();
    });

    it("does not crash if client was never in a channel", () => {
      const ws = createMockWs();
      manager.onConnect(ws as any);
      // Don't join any channel
      expect(() => manager.onDisconnect(ws as any, 1000, "")).not.toThrow();
    });
  });

  describe("ping/pong", () => {
    it("responds to ping with pong", () => {
      const ws = createMockWs();
      manager.onConnect(ws as any);
      ws.send.mockClear();

      manager.onMessage(ws as any, JSON.stringify({ type: "ping", id: "ping-123" }));

      const calls = ws.send.mock.calls.map((c) => JSON.parse(c[0] as string));
      const pong = calls.find((m) => m.type === "pong");
      expect(pong).toBeTruthy();
      expect(pong?.id).toBe("ping-123");
    });
  });

  describe("invalid messages", () => {
    it("returns error for invalid JSON", () => {
      const ws = createMockWs();
      manager.onConnect(ws as any);
      ws.send.mockClear();

      manager.onMessage(ws as any, "not valid json {{{");

      const calls = ws.send.mock.calls.map((c) => JSON.parse(c[0] as string));
      const error = calls.find((m) => m.type === "error");
      expect(error).toBeTruthy();
    });

    it("returns error for unknown message type", () => {
      const ws = createMockWs();
      manager.onConnect(ws as any);
      ws.send.mockClear();

      manager.onMessage(ws as any, JSON.stringify({ type: "unknown_type" }));

      const calls = ws.send.mock.calls.map((c) => JSON.parse(c[0] as string));
      const error = calls.find((m) => m.type === "error");
      expect(error).toBeTruthy();
    });
  });
});
