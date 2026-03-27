import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SessionStore } from "../src/session-store.js";
import type { RelayClient } from "../src/relay-client.js";

// ── Helpers ──────────────────────────────────────────────────

function makeRelayClient(connected = true): RelayClient {
  return {
    isConnected: connected,
    disconnect: vi.fn(),
    connect: vi.fn(),
    join: vi.fn(),
    sendCommand: vi.fn(),
    onProgress: vi.fn(),
    channelId: null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

// ── Tests ─────────────────────────────────────────────────────

describe("SessionStore", () => {
  let store: SessionStore;

  beforeEach(() => {
    store = new SessionStore("test-session-id");
  });

  afterEach(() => {
    store.cleanup();
  });

  it("exposes the session ID", () => {
    expect(store.sessionId).toBe("test-session-id");
  });

  it("starts with no channel or relay client", () => {
    expect(store.channelId).toBeUndefined();
    expect(store.relayClient).toBeUndefined();
    expect(store.isConnected).toBe(false);
  });

  describe("setChannel()", () => {
    it("stores channelId and relayClient", () => {
      const client = makeRelayClient();
      store.setChannel("abc12345", client);
      expect(store.channelId).toBe("abc12345");
      expect(store.relayClient).toBe(client);
    });

    it("reports isConnected=true when relayClient.isConnected is true", () => {
      const client = makeRelayClient(true);
      store.setChannel("abc12345", client);
      expect(store.isConnected).toBe(true);
    });

    it("reports isConnected=false when relayClient.isConnected is false", () => {
      const client = makeRelayClient(false);
      store.setChannel("abc12345", client);
      expect(store.isConnected).toBe(false);
    });

    it("disconnects the old relay client when a new one is set", () => {
      const old = makeRelayClient();
      const fresh = makeRelayClient();
      store.setChannel("chan-1", old);
      store.setChannel("chan-2", fresh);
      expect(old.disconnect).toHaveBeenCalledOnce();
      expect(store.channelId).toBe("chan-2");
      expect(store.relayClient).toBe(fresh);
    });

    it("does not disconnect client when setting same instance again", () => {
      const client = makeRelayClient();
      store.setChannel("chan", client);
      store.setChannel("chan", client);
      expect(client.disconnect).not.toHaveBeenCalled();
    });

    it("clears the cache on channel change", () => {
      const client = makeRelayClient();
      store.cache.set("get_document_info", {}, { name: "Doc" });
      store.setChannel("abc12345", client);
      expect(store.cache.get("get_document_info", {})).toBeUndefined();
    });
  });

  describe("cleanup()", () => {
    it("disconnects relayClient if present", () => {
      const client = makeRelayClient();
      store.setChannel("abc12345", client);
      store.cleanup();
      expect(client.disconnect).toHaveBeenCalledOnce();
    });

    it("does not throw when no relayClient is set", () => {
      expect(() => store.cleanup()).not.toThrow();
    });
  });
});
