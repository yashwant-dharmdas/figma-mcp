// ============================================================
// Document handlers — read-only inspection of the Figma document.
// ============================================================

import type { Dispatcher } from "../dispatcher.js";
import { requireNode, serializeNode } from "../utils/node-helpers.js";

export function registerDocumentHandlers(dispatcher: Dispatcher): void {

  // ── get_document_info ──────────────────────────────────────

  dispatcher.register("get_document_info", async () => {
    const doc = figma.root;
    return {
      name: doc.name,
      id: doc.id,
      currentPage: {
        id: figma.currentPage.id,
        name: figma.currentPage.name,
      },
      pages: doc.children.map((p) => ({
        id: p.id,
        name: p.name,
        childCount: p.children.length,
      })),
    };
  });

  // ── get_selection ──────────────────────────────────────────

  dispatcher.register("get_selection", async () => {
    return figma.currentPage.selection.map((node) => serializeNode(node));
  });

  // ── get_node_info ──────────────────────────────────────────

  dispatcher.register("get_node_info", async (params) => {
    const nodeId = params["nodeId"] as string;
    const node = requireNode(nodeId);
    return serializeNode(node);
  });

  // ── get_nodes_info ────────────────────────────────────────

  dispatcher.register("get_nodes_info", async (params) => {
    const nodeIds = params["nodeIds"] as string[];
    return nodeIds.map((id) => {
      const node = figma.getNodeById(id);
      if (!node || node.type === "DOCUMENT" || node.type === "PAGE") return null;
      return serializeNode(node as SceneNode);
    });
  });

  // ── get_styles ────────────────────────────────────────────

  dispatcher.register("get_styles", async () => {
    const toRef = (s: BaseStyle) => ({
      id: s.id,
      name: s.name,
      description: s.description,
    });
    return {
      paintStyles: figma.getLocalPaintStyles().map(toRef),
      textStyles: figma.getLocalTextStyles().map(toRef),
      effectStyles: figma.getLocalEffectStyles().map(toRef),
      gridStyles: figma.getLocalGridStyles().map(toRef),
    };
  });

  // ── scan_text_nodes ────────────────────────────────────────

  dispatcher.register("scan_text_nodes", async (params) => {
    const nodeId = params["nodeId"] as string | undefined;

    const root: BaseNode = nodeId
      ? requireNode(nodeId)
      : figma.currentPage;

    const textNodes = ("findAll" in root
      ? (root as ChildrenMixin).findAll((n) => n.type === "TEXT")
      : []) as TextNode[];

    return textNodes.map((n) => ({
      id: n.id,
      name: n.name,
      characters: n.characters,
      fontSize: typeof n.fontSize === "symbol" ? undefined : (n.fontSize as number),
      fontFamily: typeof n.fontName === "symbol" ? undefined : (n.fontName as FontName).family,
    }));
  });

  // ── export_node_as_image ──────────────────────────────────

  dispatcher.register("export_node_as_image", async (params) => {
    const nodeId = params["nodeId"] as string;
    const format = (params["format"] as "PNG" | "JPG" | "SVG" | "PDF" | undefined) ?? "PNG";
    const scale = (params["scale"] as number | undefined) ?? 1;

    const node = requireNode(nodeId);

    let settings: ExportSettings;
    if (format === "SVG") {
      settings = { format: "SVG" };
    } else if (format === "PDF") {
      settings = { format: "PDF" };
    } else {
      settings = {
        format,
        constraint: { type: "SCALE", value: scale },
      };
    }

    const bytes = await (node as unknown as ExportMixin).exportAsync(settings);

    // Convert bytes to base64
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]!);
    }
    const data = btoa(binary);

    const mimeTypes: Record<string, string> = {
      PNG: "image/png",
      JPG: "image/jpeg",
      SVG: "image/svg+xml",
      PDF: "application/pdf",
    };

    return { nodeId, format, data, mimeType: mimeTypes[format] ?? "application/octet-stream" };
  });
}
