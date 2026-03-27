import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { TtlCache } from "../src/cache.js";

describe("TtlCache", () => {
  let cache: TtlCache;

  beforeEach(() => {
    cache = new TtlCache(1000); // 1s TTL
  });

  afterEach(() => {
    cache.destroy();
    vi.useRealTimers();
  });

  // ── key() ──────────────────────────────────────────────────

  describe("key()", () => {
    it("builds a deterministic key from command and params", () => {
      const k1 = TtlCache.key("get_document_info", {});
      const k2 = TtlCache.key("get_document_info", {});
      expect(k1).toBe(k2);
    });

    it("differentiates by command name", () => {
      const k1 = TtlCache.key("get_document_info", {});
      const k2 = TtlCache.key("get_selection", {});
      expect(k1).not.toBe(k2);
    });

    it("differentiates by params", () => {
      const k1 = TtlCache.key("get_node_info", { nodeId: "1:1" });
      const k2 = TtlCache.key("get_node_info", { nodeId: "2:2" });
      expect(k1).not.toBe(k2);
    });
  });

  // ── set / get ──────────────────────────────────────────────

  describe("set() / get()", () => {
    it("stores and retrieves a value", () => {
      cache.set("get_document_info", {}, { name: "My Doc" });
      expect(cache.get("get_document_info", {})).toEqual({ name: "My Doc" });
    });

    it("returns undefined for unknown keys", () => {
      expect(cache.get("get_document_info", {})).toBeUndefined();
    });

    it("returns undefined for an expired entry", () => {
      vi.useFakeTimers();
      cache.set("get_document_info", {}, { name: "My Doc" }, 500);
      vi.advanceTimersByTime(501);
      expect(cache.get("get_document_info", {})).toBeUndefined();
    });

    it("returns value before TTL expires", () => {
      vi.useFakeTimers();
      cache.set("get_document_info", {}, { name: "My Doc" }, 500);
      vi.advanceTimersByTime(499);
      expect(cache.get("get_document_info", {})).toEqual({ name: "My Doc" });
    });

    it("uses instance default TTL when none is specified", () => {
      vi.useFakeTimers();
      cache = new TtlCache(200);
      cache.set("cmd", {}, "value");
      vi.advanceTimersByTime(199);
      expect(cache.get("cmd", {})).toBe("value");
      vi.advanceTimersByTime(2);
      expect(cache.get("cmd", {})).toBeUndefined();
      cache.destroy();
    });

    it("overwrites existing entry on repeated set()", () => {
      cache.set("cmd", {}, "v1");
      cache.set("cmd", {}, "v2");
      expect(cache.get("cmd", {})).toBe("v2");
    });
  });

  // ── clear() ───────────────────────────────────────────────

  describe("clear()", () => {
    it("removes all entries", () => {
      cache.set("a", {}, 1);
      cache.set("b", {}, 2);
      cache.clear();
      expect(cache.get("a", {})).toBeUndefined();
      expect(cache.get("b", {})).toBeUndefined();
      expect(cache.size).toBe(0);
    });
  });

  // ── evictExpired() ────────────────────────────────────────

  describe("evictExpired()", () => {
    it("removes only expired entries", () => {
      vi.useFakeTimers();
      cache.set("live", {}, "still-valid", 1000);
      cache.set("dead", {}, "expired", 100);
      vi.advanceTimersByTime(200);
      cache.evictExpired();
      expect(cache.get("live", {})).toBe("still-valid");
      expect(cache.get("dead", {})).toBeUndefined();
    });
  });

  // ── size ──────────────────────────────────────────────────

  describe("size", () => {
    it("reflects number of stored entries (may include expired)", () => {
      expect(cache.size).toBe(0);
      cache.set("a", {}, 1);
      cache.set("b", {}, 2);
      expect(cache.size).toBe(2);
    });
  });

  // ── destroy() ────────────────────────────────────────────

  describe("destroy()", () => {
    it("clears entries and stops cleanup interval", () => {
      cache.set("a", {}, 1);
      cache.destroy();
      expect(cache.size).toBe(0);
      // Calling destroy twice should not throw
      expect(() => cache.destroy()).not.toThrow();
    });
  });
});
