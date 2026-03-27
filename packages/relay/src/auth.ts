// ============================================================
// HMAC-SHA256 channel token authentication.
//
// How it works:
//   1. MCP server generates a channel ID (random 8 chars)
//   2. MCP server also generates a token: HMAC-SHA256(channelId, RELAY_SECRET)
//   3. MCP server passes both to the Figma plugin (displayed in UI)
//   4. Plugin sends { type: "join", channel, token } to relay
//   5. Relay validates the token before admitting the plugin
//
// In local dev (RELAY_AUTH=disabled), token validation is skipped.
// ============================================================

import { createHmac, timingSafeEqual } from "crypto";

/**
 * Read at call time (not module load time) so tests can change process.env
 * and unit-test different auth states without dynamic import cache tricks.
 */
function isAuthDisabled(): boolean {
  return process.env["RELAY_AUTH"] === "disabled";
}

function getSecret(): string {
  const secret = process.env["RELAY_SECRET"];
  if (!secret) {
    if (isAuthDisabled()) return "dev-insecure-secret";
    throw new Error(
      "RELAY_SECRET environment variable is required when RELAY_AUTH is not 'disabled'. " +
        "Generate one with: openssl rand -hex 32"
    );
  }
  return secret;
}

/**
 * Generate an HMAC-SHA256 token for a channel ID.
 * Used by the MCP server when creating a channel.
 */
export function generateChannelToken(channelId: string): string {
  return createHmac("sha256", getSecret()).update(channelId).digest("hex");
}

/**
 * Validate a channel token in constant time to prevent timing attacks.
 * Returns true if valid or if auth is disabled.
 */
export function validateChannelToken(
  channelId: string,
  token: string | undefined
): boolean {
  if (isAuthDisabled()) return true;
  if (!token) return false;

  const expected = generateChannelToken(channelId);

  // Ensure equal lengths before timingSafeEqual (it throws on mismatch)
  if (expected.length !== token.length) return false;

  return timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(token, "utf8"));
}

/** Whether auth is currently disabled — read at call time */
export { isAuthDisabled };
