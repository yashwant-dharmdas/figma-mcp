// ============================================================
// SessionStore — Holds the single session's state.
//
// In the local npx model there is exactly one session (Claude Desktop
// spawns one process and owns it). The store holds the plugin bridge
// reference and a TTL cache for read-only Figma results.
// ============================================================

import type { PluginBridge } from "./plugin-bridge.js";
import { TtlCache } from "./cache.js";

export class SessionStore {
  readonly cache: TtlCache;

  constructor(private readonly bridge: PluginBridge) {
    this.cache = new TtlCache();
  }

  get isConnected(): boolean {
    return this.bridge.isConnected;
  }

  get pluginBridge(): PluginBridge {
    return this.bridge;
  }

  cleanup(): void {
    this.cache.destroy();
  }
}
