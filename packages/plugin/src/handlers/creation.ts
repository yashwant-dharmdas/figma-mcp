// ============================================================
// Creation handlers — create new nodes in the Figma canvas.
// ============================================================

import type { Dispatcher } from "../dispatcher.js";
import { requireNode, appendToParent } from "../utils/node-helpers.js";
import { toSolidPaint } from "../utils/color.js";

// ── Helpers ──────────────────────────────────────────────────

type ColorParam = { r: number; g: number; b: number; a?: number } | undefined;

function applyFillColor(node: GeometryMixin, color: ColorParam): void {
  if (!color) return;
  node.fills = [toSolidPaint(color.r, color.g, color.b, color.a ?? 1)];
}

// ── Handlers ─────────────────────────────────────────────────

export function registerCreationHandlers(dispatcher: Dispatcher): void {

  // ── create_frame ──────────────────────────────────────────

  dispatcher.register("create_frame", async (params) => {
    const x = (params["x"] as number) ?? 0;
    const y = (params["y"] as number) ?? 0;
    const width = params["width"] as number;
    const height = params["height"] as number;
    const name = (params["name"] as string | undefined) ?? "Frame";
    const parentId = params["parentId"] as string | undefined;
    const fillColor = params["fillColor"] as ColorParam;

    const frame = figma.createFrame();
    frame.x = x;
    frame.y = y;
    frame.resize(width, height);
    frame.name = name;

    if (fillColor) {
      applyFillColor(frame, fillColor);
    } else {
      frame.fills = [toSolidPaint(1, 1, 1, 1)];
    }

    appendToParent(frame, parentId);

    return {
      id: frame.id,
      name: frame.name,
      x: frame.x,
      y: frame.y,
      width: frame.width,
      height: frame.height,
    };
  });

  // ── create_rectangle ─────────────────────────────────────

  dispatcher.register("create_rectangle", async (params) => {
    const x = (params["x"] as number) ?? 0;
    const y = (params["y"] as number) ?? 0;
    const width = params["width"] as number;
    const height = params["height"] as number;
    const name = (params["name"] as string | undefined) ?? "Rectangle";
    const cornerRadius = params["cornerRadius"] as number | undefined;
    const parentId = params["parentId"] as string | undefined;
    const fillColor = params["fillColor"] as ColorParam;

    const rect = figma.createRectangle();
    rect.x = x;
    rect.y = y;
    rect.resize(width, height);
    rect.name = name;

    if (cornerRadius !== undefined) rect.cornerRadius = cornerRadius;
    applyFillColor(rect, fillColor);
    appendToParent(rect, parentId);

    return { id: rect.id, name: rect.name, x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });

  // ── create_ellipse ────────────────────────────────────────

  dispatcher.register("create_ellipse", async (params) => {
    const x = (params["x"] as number) ?? 0;
    const y = (params["y"] as number) ?? 0;
    const width = params["width"] as number;
    const height = params["height"] as number;
    const name = (params["name"] as string | undefined) ?? "Ellipse";
    const parentId = params["parentId"] as string | undefined;
    const fillColor = params["fillColor"] as ColorParam;

    const ellipse = figma.createEllipse();
    ellipse.x = x;
    ellipse.y = y;
    ellipse.resize(width, height);
    ellipse.name = name;

    applyFillColor(ellipse, fillColor);
    appendToParent(ellipse, parentId);

    return { id: ellipse.id, name: ellipse.name, x: ellipse.x, y: ellipse.y, width: ellipse.width, height: ellipse.height };
  });

  // ── create_polygon ────────────────────────────────────────

  dispatcher.register("create_polygon", async (params) => {
    const x = (params["x"] as number) ?? 0;
    const y = (params["y"] as number) ?? 0;
    const width = params["width"] as number;
    const height = params["height"] as number;
    const sides = params["sides"] as number;
    const name = (params["name"] as string | undefined) ?? "Polygon";
    const parentId = params["parentId"] as string | undefined;
    const fillColor = params["fillColor"] as ColorParam;

    const polygon = figma.createPolygon();
    polygon.x = x;
    polygon.y = y;
    polygon.resize(width, height);
    polygon.pointCount = sides;
    polygon.name = name;

    applyFillColor(polygon, fillColor);
    appendToParent(polygon, parentId);

    return { id: polygon.id, name: polygon.name, x: polygon.x, y: polygon.y, width: polygon.width, height: polygon.height };
  });

  // ── create_star ───────────────────────────────────────────

  dispatcher.register("create_star", async (params) => {
    const x = (params["x"] as number) ?? 0;
    const y = (params["y"] as number) ?? 0;
    const width = params["width"] as number;
    const height = params["height"] as number;
    const points = (params["points"] as number) ?? 5;
    const innerRadius = (params["innerRadius"] as number) ?? 0.5;
    const name = (params["name"] as string | undefined) ?? "Star";
    const parentId = params["parentId"] as string | undefined;
    const fillColor = params["fillColor"] as ColorParam;

    const star = figma.createStar();
    star.x = x;
    star.y = y;
    star.resize(width, height);
    star.pointCount = points;
    star.innerRadius = innerRadius;
    star.name = name;

    applyFillColor(star, fillColor);
    appendToParent(star, parentId);

    return { id: star.id, name: star.name, x: star.x, y: star.y, width: star.width, height: star.height };
  });

  // ── create_text ───────────────────────────────────────────

  dispatcher.register("create_text", async (params) => {
    const x = (params["x"] as number) ?? 0;
    const y = (params["y"] as number) ?? 0;
    const text = params["text"] as string;
    const fontSize = (params["fontSize"] as number) ?? 16;
    const fontFamily = (params["fontFamily"] as string) ?? "Inter";
    const fontWeight = (params["fontWeight"] as string) ?? "Regular";
    const textAlignHorizontal = params["textAlignHorizontal"] as
      | TextNode["textAlignHorizontal"]
      | undefined;
    const name = (params["name"] as string | undefined) ?? text;
    const parentId = params["parentId"] as string | undefined;
    const fillColor = params["fillColor"] as ColorParam;

    const fontName: FontName = { family: fontFamily, style: fontWeight };
    await figma.loadFontAsync(fontName);

    const textNode = figma.createText();
    textNode.x = x;
    textNode.y = y;
    textNode.fontName = fontName;
    textNode.fontSize = fontSize;
    textNode.characters = text;
    textNode.name = name;

    if (textAlignHorizontal) textNode.textAlignHorizontal = textAlignHorizontal;

    if (fillColor) {
      textNode.fills = [toSolidPaint(fillColor.r, fillColor.g, fillColor.b, fillColor.a ?? 1)];
    }

    appendToParent(textNode, parentId);

    return { id: textNode.id, name: textNode.name };
  });

  // ── clone_node ────────────────────────────────────────────

  dispatcher.register("clone_node", async (params) => {
    const nodeId = params["nodeId"] as string;
    const x = params["x"] as number | undefined;
    const y = params["y"] as number | undefined;
    const parentId = params["parentId"] as string | undefined;

    const original = requireNode(nodeId);
    const clone = original.clone();

    clone.x = x ?? original.x + 10;
    clone.y = y ?? original.y + 10;

    if (parentId) {
      appendToParent(clone, parentId);
    }

    return { id: clone.id, name: clone.name };
  });

  // ── group_nodes ───────────────────────────────────────────

  dispatcher.register("group_nodes", async (params) => {
    const nodeIds = params["nodeIds"] as string[];
    const name = (params["name"] as string | undefined) ?? "Group";

    if (!nodeIds || nodeIds.length < 2) {
      throw new Error("group_nodes requires at least 2 nodeIds.");
    }

    const nodes = nodeIds.map((id) => requireNode(id));
    const parent = (nodes[0]!.parent ?? figma.currentPage) as (BaseNode & ChildrenMixin);
    const group = figma.group(nodes, parent);
    group.name = name;

    return { id: group.id, name: group.name };
  });

  // ── ungroup_nodes ─────────────────────────────────────────

  dispatcher.register("ungroup_nodes", async (params) => {
    const nodeId = params["nodeId"] as string;
    const node = requireNode(nodeId);

    if (node.type !== "GROUP") {
      throw new Error(`Node "${nodeId}" is not a GROUP (it's a ${node.type})`);
    }

    const group = node as GroupNode;
    const childCount = group.children.length;
    figma.ungroup(group);

    return { ungroupedCount: childCount };
  });

  // ── flatten_node ──────────────────────────────────────────

  dispatcher.register("flatten_node", async (params) => {
    const nodeId = params["nodeId"] as string;
    const node = requireNode(nodeId);

    const flat = figma.flatten([node]);

    return { id: flat.id, name: flat.name };
  });

  // ── boolean_operation ─────────────────────────────────────

  dispatcher.register("boolean_operation", async (params) => {
    const nodeIds = params["nodeIds"] as string[];
    const operation = params["operation"] as "UNION" | "SUBTRACT" | "INTERSECT" | "EXCLUDE";
    const name = params["name"] as string | undefined;

    if (!nodeIds || nodeIds.length < 2) {
      throw new Error("boolean_operation requires at least 2 nodeIds.");
    }

    const nodes = nodeIds.map((id) => requireNode(id));
    const parent = (nodes[0]!.parent ?? figma.currentPage) as (BaseNode & ChildrenMixin);

    let result: BooleanOperationNode;
    switch (operation) {
      case "UNION":     result = figma.union(nodes, parent); break;
      case "SUBTRACT":  result = figma.subtract(nodes, parent); break;
      case "INTERSECT": result = figma.intersect(nodes, parent); break;
      case "EXCLUDE":   result = figma.exclude(nodes, parent); break;
    }

    if (name) result.name = name;

    return { id: result.id, name: result.name };
  });

  // ── insert_child ──────────────────────────────────────────

  dispatcher.register("insert_child", async (params) => {
    const parentId = params["parentId"] as string;
    const childId = params["childId"] as string;
    const index = params["index"] as number | undefined;

    const parent = requireNode(parentId);
    const child = requireNode(childId);

    if (!("insertChild" in parent)) {
      throw new Error(`Node "${parentId}" (${parent.type}) cannot contain children.`);
    }

    const parentMixin = parent as ChildrenMixin;
    if (index !== undefined) {
      parentMixin.insertChild(index, child);
    } else {
      parentMixin.appendChild(child);
    }

    return { success: true };
  });
}
