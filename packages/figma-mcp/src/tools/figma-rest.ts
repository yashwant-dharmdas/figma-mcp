// ============================================================
// figma-rest.ts — Figma REST API tools
//
// These tools work WITHOUT the Figma Desktop plugin — they call
// the Figma REST API directly using a personal access token.
//
// Required env var:
//   FIGMA_TOKEN — your Figma personal access token
//   Get one at: https://www.figma.com/settings  → "Personal access tokens"
//   Add to claude_desktop_config.json:
//   { "mcpServers": { "figma": { ..., "env": { "FIGMA_TOKEN": "figd_..." } } } }
//
// Tools registered here:
//   fetch_figma_design  — fetch nodes/layout/styles from any Figma URL
// ============================================================

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const FIGMA_API = "https://api.figma.com/v1";

// ── URL parsing ───────────────────────────────────────────────

function parseFigmaUrl(url: string): { fileKey: string; nodeId: string | null } {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new Error(`Not a valid URL: ${url}`);
  }

  // Matches /design/KEY, /file/KEY, /proto/KEY, /board/KEY
  const m = u.pathname.match(/\/(design|file|proto|board)\/([A-Za-z0-9_-]+)/);
  if (!m) {
    throw new Error(
      `Could not extract a Figma file key from URL: ${url}\n` +
      `Expected format: https://www.figma.com/design/<fileKey>/...`
    );
  }

  const fileKey = m[2]!;
  // URL uses hyphens (0-1), API uses colons (0:1)
  const rawNodeId = u.searchParams.get("node-id");
  const nodeId = rawNodeId ? rawNodeId.replace(/-/g, ":") : null;

  return { fileKey, nodeId };
}

// ── Token ─────────────────────────────────────────────────────

function requireToken(): string {
  const token =
    process.env["FIGMA_TOKEN"] ??
    process.env["FIGMA_PERSONAL_ACCESS_TOKEN"] ??
    "";
  if (!token) {
    throw new Error(
      "FIGMA_TOKEN is not set.\n" +
      "1. Go to https://www.figma.com/settings → Personal access tokens → Create new token\n" +
      "2. Add it to claude_desktop_config.json under the figma server:\n" +
      '   "env": { "FIGMA_TOKEN": "figd_your_token_here" }\n' +
      "3. Restart Claude Desktop"
    );
  }
  return token;
}

// ── Node summariser ───────────────────────────────────────────
// Converts raw Figma API nodes to a compact, model-friendly shape.

type RawNode = Record<string, unknown>;

function rgba(c: { r: number; g: number; b: number; a?: number }) {
  const r = Math.round(c.r * 255);
  const g = Math.round(c.g * 255);
  const b = Math.round(c.b * 255);
  const a = Math.round((c.a ?? 1) * 100) / 100;
  const hex =
    "#" +
    r.toString(16).padStart(2, "0") +
    g.toString(16).padStart(2, "0") +
    b.toString(16).padStart(2, "0");
  return { hex, rgba: `rgba(${r},${g},${b},${a})` };
}

function summarizeFills(fills: unknown[]) {
  return fills
    .filter((f): f is RawNode => !!f && typeof f === "object" && (f as RawNode)["visible"] !== false)
    .map((f) => {
      if (f["type"] === "SOLID" && f["color"]) {
        return { type: "solid", ...rgba(f["color"] as { r: number; g: number; b: number; a?: number }), opacity: f["opacity"] ?? 1 };
      }
      if (f["type"] === "GRADIENT_LINEAR" || f["type"] === "GRADIENT_RADIAL") {
        const stops = ((f["gradientStops"] as RawNode[]) ?? []).map((s) => ({
          position: Math.round((s["position"] as number) * 100) + "%",
          ...rgba(s["color"] as { r: number; g: number; b: number; a?: number }),
        }));
        return { type: f["type"] as string, stops };
      }
      return { type: f["type"] as string };
    });
}

function summarizeNode(node: RawNode, depth = 0, maxDepth = 4): Record<string, unknown> | null {
  if (!node || depth > maxDepth) return null;

  const out: Record<string, unknown> = {
    id:   node["id"],
    name: node["name"],
    type: node["type"],
  };

  // Bounding box
  const bb = node["absoluteBoundingBox"] as { x: number; y: number; width: number; height: number } | undefined;
  if (bb) {
    out["bounds"] = {
      x:      Math.round(bb.x),
      y:      Math.round(bb.y),
      width:  Math.round(bb.width),
      height: Math.round(bb.height),
    };
  }

  // Visibility / opacity
  if (node["visible"] === false) out["visible"] = false;
  if (typeof node["opacity"] === "number" && node["opacity"] !== 1) out["opacity"] = node["opacity"];

  // Fills
  const fills = node["fills"] as unknown[];
  if (Array.isArray(fills) && fills.length > 0) {
    const sf = summarizeFills(fills);
    if (sf.length > 0) out["fills"] = sf;
  }

  // Strokes
  const strokes = node["strokes"] as unknown[];
  if (Array.isArray(strokes) && strokes.length > 0) {
    const ss = summarizeFills(strokes);
    if (ss.length > 0) {
      out["strokes"] = ss;
      out["strokeWeight"] = node["strokeWeight"];
      out["strokeAlign"]  = node["strokeAlign"];
    }
  }

  // Corner radius
  if (typeof node["cornerRadius"] === "number") out["cornerRadius"] = node["cornerRadius"];

  // Typography (TEXT nodes)
  if (node["type"] === "TEXT") {
    out["text"] = node["characters"];
    const s = node["style"] as RawNode | undefined;
    if (s) {
      out["typography"] = {
        fontFamily:           s["fontFamily"],
        fontSize:             s["fontSize"],
        fontWeight:           s["fontWeight"],
        lineHeightPx:         s["lineHeightPx"],
        letterSpacing:        s["letterSpacing"],
        textAlignHorizontal:  s["textAlignHorizontal"],
        textAlignVertical:    s["textAlignVertical"],
        textDecoration:       s["textDecoration"],
        textCase:             s["textCase"],
      };
    }
  }

  // Auto-layout
  if (node["layoutMode"]) {
    out["autoLayout"] = {
      direction:              node["layoutMode"],
      itemSpacing:            node["itemSpacing"],
      paddingTop:             node["paddingTop"],
      paddingRight:           node["paddingRight"],
      paddingBottom:          node["paddingBottom"],
      paddingLeft:            node["paddingLeft"],
      primaryAxisSizing:      node["primaryAxisSizingMode"],
      counterAxisSizing:      node["counterAxisSizingMode"],
      primaryAxisAlign:       node["primaryAxisAlignItems"],
      counterAxisAlign:       node["counterAxisAlignItems"],
      layoutWrap:             node["layoutWrap"],
    };
  }

  // Effects (shadows, blur)
  const effects = node["effects"] as unknown[];
  if (Array.isArray(effects) && effects.length > 0) {
    out["effects"] = effects
      .filter((e): e is RawNode => !!(e as RawNode)["visible"])
      .map((e) => {
        const base: Record<string, unknown> = { type: e["type"], radius: e["radius"] };
        if (e["color"]) base["color"] = rgba(e["color"] as { r: number; g: number; b: number; a?: number });
        if (e["offset"]) base["offset"] = e["offset"];
        return base;
      });
  }

  // Image fills (for component screenshots reference)
  if (node["type"] === "RECTANGLE" || node["type"] === "FRAME") {
    const imageFill = (node["fills"] as RawNode[] | undefined)?.find(
      (f) => f["type"] === "IMAGE"
    );
    if (imageFill) out["hasImageFill"] = true;
  }

  // Children (recursive)
  const children = node["children"] as RawNode[] | undefined;
  if (Array.isArray(children) && children.length > 0 && depth < maxDepth) {
    out["children"] = children
      .map((c) => summarizeNode(c, depth + 1, maxDepth))
      .filter(Boolean);
  } else if (Array.isArray(children)) {
    out["childCount"] = children.length;
  }

  return out;
}

// ── Tool registration ─────────────────────────────────────────

export function registerFetchFigmaDesign(server: McpServer): void {
  server.tool(
    "fetch_figma_design",
    "Fetch design data from any Figma URL using the Figma REST API — no Figma Desktop needed. " +
    "Returns node hierarchy, layout, colors, typography, effects, and auto-layout data. " +
    "Requires FIGMA_TOKEN env var (personal access token from figma.com/settings). " +
    "Use this when you have a Figma URL and want to read the design without opening Figma Desktop.",
    {
      url: z
        .string()
        .describe(
          "Figma file or node URL. Examples:\n" +
          "  https://www.figma.com/design/ABC123/MyFile\n" +
          "  https://www.figma.com/design/ABC123/MyFile?node-id=0-1"
        ),
      depth: z
        .number()
        .int()
        .min(1)
        .max(6)
        .optional()
        .describe("Child traversal depth (1–6, default 4). Use 2–3 for a quick overview, 5–6 for full detail."),
    },
    async ({ url, depth = 4 }) => {
      try {
        const token = requireToken();
        const { fileKey, nodeId } = parseFigmaUrl(url);

        if (nodeId) {
          // ── Fetch specific node ──────────────────────────────
          const apiUrl =
            `${FIGMA_API}/files/${fileKey}/nodes?ids=${encodeURIComponent(nodeId)}&geometry=paths`;

          const res = await fetch(apiUrl, {
            headers: { "X-Figma-Token": token },
          });

          if (!res.ok) {
            const body = await res.text();
            if (res.status === 403) {
              throw new Error(
                `Figma API returned 403 Forbidden. Check that:\n` +
                `  1. Your FIGMA_TOKEN is valid (get from figma.com/settings)\n` +
                `  2. You have access to this file: ${fileKey}`
              );
            }
            throw new Error(`Figma API error ${res.status}: ${body}`);
          }

          const data = await res.json() as Record<string, unknown>;
          const rawNodes = data["nodes"] as Record<string, { document: RawNode }>;
          const nodes = Object.values(rawNodes).map((n) =>
            summarizeNode(n.document, 0, depth)
          );

          return {
            content: [{
              type: "text" as const,
              text: JSON.stringify({
                fileKey,
                nodeId,
                nodes,
                styles: (data["styles"] as unknown) ?? {},
              }, null, 2),
            }],
          };

        } else {
          // ── Fetch file overview (all pages, top-level frames) ─
          const apiUrl = `${FIGMA_API}/files/${fileKey}?depth=2`;

          const res = await fetch(apiUrl, {
            headers: { "X-Figma-Token": token },
          });

          if (!res.ok) {
            const body = await res.text();
            if (res.status === 403) {
              throw new Error(
                `Figma API returned 403 Forbidden. Check that:\n` +
                `  1. Your FIGMA_TOKEN is valid (get from figma.com/settings)\n` +
                `  2. You have access to this file: ${fileKey}`
              );
            }
            throw new Error(`Figma API error ${res.status}: ${body}`);
          }

          const data = await res.json() as Record<string, unknown>;
          const doc = data["document"] as RawNode;
          const pages = (doc["children"] as RawNode[]) ?? [];

          return {
            content: [{
              type: "text" as const,
              text: JSON.stringify({
                fileKey,
                fileName:     data["name"],
                lastModified: data["lastModified"],
                version:      data["version"],
                pages: pages.map((p) => ({
                  id:   p["id"],
                  name: p["name"],
                  topLevelFrames: ((p["children"] as RawNode[]) ?? []).slice(0, 30).map((c) => ({
                    id:     c["id"],
                    name:   c["name"],
                    type:   c["type"],
                    bounds: c["absoluteBoundingBox"],
                  })),
                })),
                hint: "To read a specific frame: call fetch_figma_design with the URL and ?node-id=<id>",
              }, null, 2),
            }],
          };
        }
      } catch (err) {
        return {
          isError: true as const,
          content: [{
            type: "text" as const,
            text: err instanceof Error ? err.message : String(err),
          }],
        };
      }
    }
  );
}
