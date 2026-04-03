// ============================================================
// SessionStore — Per-MCP-session state.
//
// Each MCP session (one per HTTP connection / Mcp-Session-Id) gets its own
// SessionStore holding:
//   - channelId   : which Figma channel this session joined
//   - relayClient : the live WebSocket connection to the relay
//   - cache       : isolated TTL cache (read-only Figma results)
//
// Lifecycle:
//   1. Created when a new HTTP session is initialised.
//   2. Updated when the user calls join_channel.
//   3. Destroyed (cleanup) when the session is deleted or transport closes.
// ============================================================

import type { RelayClient } from "./relay-client.js";
import { TtlCache } from "./cache.js";

export interface SessionState {
  readonly sessionId: string;
  channelId: string | undefined;
  relayClient: RelayClient | undefined;
  readonly cache: TtlCache;
}

export class SessionStore {
  private readonly state: SessionState;

  constructor(sessionId: string) {
    this.state = {
      sessionId,
      channelId: undefined,
      relayClient: undefined,
      cache: new TtlCache(),
    };
  }

  get sessionId(): string {
    return this.state.sessionId;
  }

  get channelId(): string | undefined {
    return this.state.channelId;
  }

  get relayClient(): RelayClient | undefined {
    return this.state.relayClient;
  }

  get cache(): TtlCache {
    return this.state.cache;
  }

  get isConnected(): boolean {
    return (
      this.state.channelId !== undefined &&
      this.state.relayClient !== undefined &&
      this.state.relayClient.isConnected
    );
  }

  /**
   * Store the eagerly-connected relay client created at session init.
   * Does NOT disconnect any previous client (there should be none yet).
   */
  setRelayClient(client: RelayClient): void {
    this.state.relayClient = client;
  }

  /**
   * Called by join_channel after successfully connecting + joining.
   * Disconnects any previous relay client to avoid dangling connections.
   */
  setChannel(channelId: string, relayClient: RelayClient): void {
    if (
      this.state.relayClient !== undefined &&
      this.state.relayClient !== relayClient
    ) {
      this.state.relayClient.disconnect();
    }
    this.state.channelId = channelId;
    this.state.relayClient = relayClient;
    // Invalidate cache on channel change so stale data from the old
    // channel is never served.
    this.state.cache.clear();
  }

  /**
   * Release all resources.  Called when the MCP session ends (transport close
   * or DELETE /mcp request).
   */
  cleanup(): void {
    this.state.relayClient?.disconnect();
    this.state.cache.destroy();
  }
}
