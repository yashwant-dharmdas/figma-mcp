// Since auth.ts reads process.env at call time (not module load time),
// we can import it statically and control behavior with env vars per test.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { generateChannelToken, validateChannelToken } from "../src/auth.js";

const ORIGINAL_SECRET = process.env["RELAY_SECRET"];
const ORIGINAL_AUTH = process.env["RELAY_AUTH"];

describe("auth", () => {
  beforeEach(() => {
    process.env["RELAY_SECRET"] = "test-secret-for-unit-tests";
    process.env["RELAY_AUTH"] = "enabled";
  });

  afterEach(() => {
    if (ORIGINAL_SECRET !== undefined) {
      process.env["RELAY_SECRET"] = ORIGINAL_SECRET;
    } else {
      delete process.env["RELAY_SECRET"];
    }
    if (ORIGINAL_AUTH !== undefined) {
      process.env["RELAY_AUTH"] = ORIGINAL_AUTH;
    } else {
      delete process.env["RELAY_AUTH"];
    }
  });

  describe("generateChannelToken", () => {
    it("generates a 64-character hex token", () => {
      const token = generateChannelToken("abc12345");
      expect(token).toBeTruthy();
      expect(typeof token).toBe("string");
      expect(token.length).toBe(64); // SHA-256 hex = 64 chars
    });

    it("is deterministic for the same input", () => {
      const t1 = generateChannelToken("abc12345");
      const t2 = generateChannelToken("abc12345");
      expect(t1).toBe(t2);
    });

    it("produces different tokens for different channel IDs", () => {
      const t1 = generateChannelToken("abc12345");
      const t2 = generateChannelToken("xyz99999");
      expect(t1).not.toBe(t2);
    });

    it("token contains only hex characters", () => {
      const token = generateChannelToken("abc12345");
      expect(token).toMatch(/^[0-9a-f]+$/);
    });
  });

  describe("validateChannelToken (auth enabled)", () => {
    it("returns true for a valid token", () => {
      const channelId = "test-chan-1";
      const token = generateChannelToken(channelId);
      expect(validateChannelToken(channelId, token)).toBe(true);
    });

    it("returns false for an obviously wrong token", () => {
      expect(validateChannelToken("abc12345", "wrongtoken")).toBe(false);
    });

    it("returns false for undefined token", () => {
      expect(validateChannelToken("abc12345", undefined)).toBe(false);
    });

    it("returns false for empty string token", () => {
      expect(validateChannelToken("abc12345", "")).toBe(false);
    });

    it("returns false when token belongs to a different channel", () => {
      const tokenForOtherChannel = generateChannelToken("other-channel");
      expect(validateChannelToken("abc12345", tokenForOtherChannel)).toBe(false);
    });
  });

  describe("validateChannelToken (RELAY_AUTH=disabled)", () => {
    it("always returns true regardless of token", () => {
      process.env["RELAY_AUTH"] = "disabled";
      expect(validateChannelToken("any-channel", undefined)).toBe(true);
      expect(validateChannelToken("any-channel", "wrongtoken")).toBe(true);
      expect(validateChannelToken("any-channel", "")).toBe(true);
    });
  });
});
