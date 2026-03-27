// ============================================================
// SVG handlers — insert and export SVG content.
// ============================================================

import type { Dispatcher } from "../dispatcher.js";
import { requireNode, appendToParent } from "../utils/node-helpers.js";

export function registerSvgHandlers(dispatcher: Dispatcher): void {

  // ── set_svg ───────────────────────────────────────────────

  dispatcher.register("set_svg", async (params) => {
    const svgString = params["svgString"] as string;
    const x = (params["x"] as number | undefined) ?? 0;
    const y = (params["y"] as number | undefined) ?? 0;
    const name = params["name"] as string | undefined;
    const parentId = params["parentId"] as string | undefined;

    const node = figma.createNodeFromSvg(svgString);
    node.x = x;
    node.y = y;
    if (name) node.name = name;

    appendToParent(node, parentId);

    return { id: node.id, name: node.name };
  });

  // ── get_svg ───────────────────────────────────────────────

  dispatcher.register("get_svg", async (params) => {
    const nodeId = params["nodeId"] as string;
    const node = requireNode(nodeId);

    const bytes = await (node as unknown as ExportMixin).exportAsync({ format: "SVG" });

    // Convert UTF-8 bytes to string
    let svg = "";
    for (let i = 0; i < bytes.length; i++) {
      svg += String.fromCharCode(bytes[i]!);
    }

    return { svg };
  });
}
