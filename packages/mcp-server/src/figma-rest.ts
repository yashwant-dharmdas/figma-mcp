// ============================================================
// FigmaRestClient — Optional Figma REST API client.
//
// When FIGMA_REST_TOKEN is set, the MCP server can use the Figma REST API
// for fast cacheable reads (file info, styles, components) instead of
// round-tripping to the plugin for every call.
//
// Currently provides:
//   - getFile(fileKey)         — full file JSON
//   - getFileNodes(fileKey, ids) — specific nodes
//   - getLocalStyles(fileKey)  — published styles
//   - getComponents(fileKey)   — published components
//
// Usage: FigmaRestClient.fromEnv() returns null if the token is not set,
// so callers can check and fall back gracefully.
// ============================================================

const FIGMA_API_BASE = "https://api.figma.com/v1";

export class FigmaRestClient {
  private readonly token: string;

  constructor(token: string) {
    this.token = token;
  }

  /** Returns a client if FIGMA_REST_TOKEN is set, otherwise null. */
  static fromEnv(): FigmaRestClient | null {
    const token = process.env["FIGMA_REST_TOKEN"];
    if (!token) return null;
    return new FigmaRestClient(token);
  }

  // ── Core request helper ──────────────────────────────────

  private async request<T>(path: string): Promise<T> {
    const url = `${FIGMA_API_BASE}${path}`;
    const res = await fetch(url, {
      headers: {
        "X-Figma-Token": this.token,
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "(unreadable)");
      throw new Error(
        `Figma REST API error ${res.status} at ${path}: ${text}`
      );
    }

    return res.json() as Promise<T>;
  }

  // ── File ─────────────────────────────────────────────────

  /**
   * Fetch the full Figma file JSON.
   * Warning: can be very large — use getFileNodes for targeted reads.
   */
  getFile(fileKey: string): Promise<unknown> {
    return this.request(`/files/${encodeURIComponent(fileKey)}`);
  }

  /**
   * Fetch one or more specific nodes from a file by their IDs.
   * @param ids — array of node IDs, e.g. ["1:23", "4:56"]
   */
  getFileNodes(fileKey: string, ids: string[]): Promise<unknown> {
    const query = ids.map((id) => `ids=${encodeURIComponent(id)}`).join("&");
    return this.request(
      `/files/${encodeURIComponent(fileKey)}/nodes?${query}`
    );
  }

  /**
   * List all published local styles in a file.
   */
  getLocalStyles(fileKey: string): Promise<unknown> {
    return this.request(`/files/${encodeURIComponent(fileKey)}/styles`);
  }

  /**
   * List all published components in a file.
   */
  getComponents(fileKey: string): Promise<unknown> {
    return this.request(`/files/${encodeURIComponent(fileKey)}/components`);
  }

  /**
   * Get component sets (variants).
   */
  getComponentSets(fileKey: string): Promise<unknown> {
    return this.request(
      `/files/${encodeURIComponent(fileKey)}/component_sets`
    );
  }
}
