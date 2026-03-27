// ============================================================
// Modification handlers — change properties of existing nodes.
// ============================================================

import type { Dispatcher } from "../dispatcher.js";
import { requireNode } from "../utils/node-helpers.js";
import { toSolidPaint } from "../utils/color.js";

type ColorParam = { r: number; g: number; b: number; a?: number };

// ── Helpers ──────────────────────────────────────────────────

/** Convert angle (degrees, 0=left→right) to Figma gradient transform. */
function angleToGradientTransform(angleDeg: number): Transform {
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return [
    [cos, -sin, 0.5 - 0.5 * cos + 0.5 * sin],
    [sin,  cos, 0.5 - 0.5 * sin - 0.5 * cos],
  ];
}

/** Recursively collect all nodes with fills inside a subtree. */
function collectFillNodes(node: SceneNode): Array<GeometryMixin & SceneNode> {
  const result: Array<GeometryMixin & SceneNode> = [];
  if ("fills" in node && Array.isArray((node as GeometryMixin).fills)) {
    result.push(node as GeometryMixin & SceneNode);
  }
  if ("children" in node) {
    for (const child of (node as ChildrenMixin).children) {
      result.push(...collectFillNodes(child));
    }
  }
  return result;
}

/** Check if two colors match within tolerance. */
function colorsMatch(
  a: RGB,
  b: { r: number; g: number; b: number },
  tolerance: number
): boolean {
  return (
    Math.abs(a.r - b.r) <= tolerance &&
    Math.abs(a.g - b.g) <= tolerance &&
    Math.abs(a.b - b.b) <= tolerance
  );
}

// ── Handlers ─────────────────────────────────────────────────

export function registerModificationHandlers(dispatcher: Dispatcher): void {

  // ── set_fill_color ────────────────────────────────────────

  dispatcher.register("set_fill_color", async (params) => {
    const nodeId = params["nodeId"] as string;
    const r = params["r"] as number;
    const g = params["g"] as number;
    const b = params["b"] as number;
    const a = (params["a"] as number | undefined) ?? 1;

    const node = requireNode(nodeId);
    if (!("fills" in node)) throw new Error(`Node type ${node.type} does not support fills.`);

    (node as GeometryMixin).fills = [toSolidPaint(r, g, b, a)];

    return { id: node.id, name: node.name };
  });

  // ── set_stroke_color ──────────────────────────────────────

  dispatcher.register("set_stroke_color", async (params) => {
    const nodeId = params["nodeId"] as string;
    const r = params["r"] as number;
    const g = params["g"] as number;
    const b = params["b"] as number;
    const a = (params["a"] as number | undefined) ?? 1;
    const strokeWeight = (params["strokeWeight"] as number | undefined) ?? 1;

    const node = requireNode(nodeId);
    if (!("strokes" in node)) throw new Error(`Node type ${node.type} does not support strokes.`);

    const n = node as GeometryMixin;
    if (strokeWeight === 0) {
      n.strokes = [];
    } else {
      n.strokes = [toSolidPaint(r, g, b, a)];
      n.strokeWeight = strokeWeight;
    }

    return { id: node.id, name: node.name };
  });

  // ── set_selection_colors ──────────────────────────────────

  dispatcher.register("set_selection_colors", async (params) => {
    const nodeId = params["nodeId"] as string;
    const sourceColor = params["sourceColor"] as ColorParam;
    const targetColor = params["targetColor"] as ColorParam;
    const tolerance = (params["tolerance"] as number | undefined) ?? 0.01;

    const root = requireNode(nodeId);
    const fillNodes = collectFillNodes(root);
    let replacedCount = 0;

    for (const n of fillNodes) {
      const paints = n.fills as Paint[];
      if (!Array.isArray(paints)) continue;

      const newFills = paints.map((paint) => {
        if (paint.type !== "SOLID") return paint;
        if (colorsMatch(paint.color, sourceColor, tolerance)) {
          replacedCount++;
          return toSolidPaint(targetColor.r, targetColor.g, targetColor.b, targetColor.a ?? 1);
        }
        return paint;
      });

      n.fills = newFills;
    }

    return { replacedCount };
  });

  // ── move_node ─────────────────────────────────────────────

  dispatcher.register("move_node", async (params) => {
    const nodeId = params["nodeId"] as string;
    const x = params["x"] as number;
    const y = params["y"] as number;

    const node = requireNode(nodeId);
    node.x = x;
    node.y = y;

    return { id: node.id, x: node.x, y: node.y };
  });

  // ── resize_node ───────────────────────────────────────────

  dispatcher.register("resize_node", async (params) => {
    const nodeId = params["nodeId"] as string;
    const width = params["width"] as number;
    const height = params["height"] as number;

    const node = requireNode(nodeId);
    if (!("resize" in node)) throw new Error(`Node type ${node.type} cannot be resized.`);

    (node as LayoutMixin).resize(width, height);

    return { id: node.id, width: node.width, height: node.height };
  });

  // ── rename_node ───────────────────────────────────────────

  dispatcher.register("rename_node", async (params) => {
    const nodeId = params["nodeId"] as string;
    const name = params["name"] as string;

    const node = requireNode(nodeId);
    node.name = name;

    return { id: node.id, name: node.name };
  });

  // ── delete_node ───────────────────────────────────────────

  dispatcher.register("delete_node", async (params) => {
    const nodeId = params["nodeId"] as string;
    const node = requireNode(nodeId);
    node.remove();
    return { deleted: true };
  });

  // ── set_corner_radius ─────────────────────────────────────

  dispatcher.register("set_corner_radius", async (params) => {
    const nodeId = params["nodeId"] as string;
    const radius = params["radius"] as number;
    const topLeft = params["topLeft"] as number | undefined;
    const topRight = params["topRight"] as number | undefined;
    const bottomRight = params["bottomRight"] as number | undefined;
    const bottomLeft = params["bottomLeft"] as number | undefined;

    const node = requireNode(nodeId);
    if (!("cornerRadius" in node)) {
      throw new Error(`Node type ${node.type} does not support corner radius.`);
    }

    const n = node as RectangleNode | FrameNode | ComponentNode | InstanceNode;

    const hasIndividual = topLeft !== undefined || topRight !== undefined ||
      bottomRight !== undefined || bottomLeft !== undefined;

    if (hasIndividual) {
      n.topLeftRadius = topLeft ?? radius;
      n.topRightRadius = topRight ?? radius;
      n.bottomRightRadius = bottomRight ?? radius;
      n.bottomLeftRadius = bottomLeft ?? radius;
    } else {
      n.cornerRadius = radius;
    }

    return { id: node.id };
  });

  // ── set_auto_layout ───────────────────────────────────────

  dispatcher.register("set_auto_layout", async (params) => {
    const nodeId = params["nodeId"] as string;
    const layoutMode = params["layoutMode"] as "HORIZONTAL" | "VERTICAL" | "NONE";
    const paddingTop = (params["paddingTop"] as number | undefined) ?? 0;
    const paddingRight = (params["paddingRight"] as number | undefined) ?? 0;
    const paddingBottom = (params["paddingBottom"] as number | undefined) ?? 0;
    const paddingLeft = (params["paddingLeft"] as number | undefined) ?? 0;
    const itemSpacing = (params["itemSpacing"] as number | undefined) ?? 0;
    const primaryAxisAlignItems = (params["primaryAxisAlignItems"] as
      "MIN" | "MAX" | "CENTER" | "SPACE_BETWEEN" | undefined) ?? "MIN";
    const counterAxisAlignItems = (params["counterAxisAlignItems"] as
      "MIN" | "MAX" | "CENTER" | "BASELINE" | undefined) ?? "MIN";
    const layoutWrap = (params["layoutWrap"] as "NO_WRAP" | "WRAP" | undefined) ?? "NO_WRAP";

    const node = requireNode(nodeId);
    if (node.type !== "FRAME" && node.type !== "COMPONENT" && node.type !== "INSTANCE") {
      throw new Error(`set_auto_layout requires a FRAME, COMPONENT, or INSTANCE node.`);
    }

    const frame = node as FrameNode;
    frame.layoutMode = layoutMode;

    if (layoutMode !== "NONE") {
      frame.paddingTop = paddingTop;
      frame.paddingRight = paddingRight;
      frame.paddingBottom = paddingBottom;
      frame.paddingLeft = paddingLeft;
      frame.itemSpacing = itemSpacing;
      frame.primaryAxisAlignItems = primaryAxisAlignItems;
      frame.counterAxisAlignItems = counterAxisAlignItems;
      frame.layoutWrap = layoutWrap;
    }

    return { id: node.id };
  });

  // ── set_effects ───────────────────────────────────────────

  dispatcher.register("set_effects", async (params) => {
    const nodeId = params["nodeId"] as string;
    const effectParams = params["effects"] as Array<{
      type: "DROP_SHADOW" | "INNER_SHADOW" | "LAYER_BLUR" | "BACKGROUND_BLUR";
      color?: ColorParam;
      offsetX?: number;
      offsetY?: number;
      radius?: number;
      spread?: number;
      visible?: boolean;
    }>;

    const node = requireNode(nodeId);
    if (!("effects" in node)) throw new Error(`Node type ${node.type} does not support effects.`);

    const effects = effectParams.map((e) => {
      const visible = e.visible ?? true;
      const radius = e.radius ?? 8;

      if (e.type === "LAYER_BLUR") {
        return { type: "LAYER_BLUR" as const, radius, visible };
      }
      if (e.type === "BACKGROUND_BLUR") {
        return { type: "BACKGROUND_BLUR" as const, radius, visible };
      }

      const color: RGBA = e.color
        ? { r: e.color.r, g: e.color.g, b: e.color.b, a: e.color.a ?? 0.25 }
        : { r: 0, g: 0, b: 0, a: 0.25 };

      return {
        type: e.type as "DROP_SHADOW" | "INNER_SHADOW",
        color,
        offset: { x: e.offsetX ?? 0, y: e.offsetY ?? 4 },
        radius,
        spread: e.spread ?? 0,
        visible,
        blendMode: "NORMAL" as BlendMode,
      };
    });

    (node as BlendMixin).effects = effects as unknown as Effect[];

    return { id: node.id };
  });

  // ── rotate_node ───────────────────────────────────────────

  dispatcher.register("rotate_node", async (params) => {
    const nodeId = params["nodeId"] as string;
    const angle = params["angle"] as number;
    const relative = (params["relative"] as boolean | undefined) ?? false;

    const node = requireNode(nodeId);
    if (!("rotation" in node)) throw new Error(`Node type ${node.type} does not support rotation.`);

    const n = node as LayoutMixin;
    n.rotation = relative ? n.rotation + angle : angle;

    return { id: node.id, rotation: n.rotation };
  });

  // ── set_node_properties ───────────────────────────────────

  dispatcher.register("set_node_properties", async (params) => {
    const nodeId = params["nodeId"] as string;
    const visible = params["visible"] as boolean | undefined;
    const locked = params["locked"] as boolean | undefined;
    const opacity = params["opacity"] as number | undefined;

    const node = requireNode(nodeId);

    if (visible !== undefined) node.visible = visible;
    if (locked !== undefined) node.locked = locked;
    if (opacity !== undefined && "opacity" in node) {
      (node as BlendMixin).opacity = opacity;
    }

    return { id: node.id };
  });

  // ── set_gradient ──────────────────────────────────────────

  dispatcher.register("set_gradient", async (params) => {
    const nodeId = params["nodeId"] as string;
    const type = params["type"] as "LINEAR" | "RADIAL" | "ANGULAR" | "DIAMOND";
    const stops = params["stops"] as Array<{ position: number; color: ColorParam }>;
    const angle = (params["angle"] as number | undefined) ?? 0;

    const node = requireNode(nodeId);
    if (!("fills" in node)) throw new Error(`Node type ${node.type} does not support fills.`);

    const gradientType = `GRADIENT_${type}` as
      "GRADIENT_LINEAR" | "GRADIENT_RADIAL" | "GRADIENT_ANGULAR" | "GRADIENT_DIAMOND";

    const gradientStops: ColorStop[] = stops.map((s) => ({
      position: s.position,
      color: { r: s.color.r, g: s.color.g, b: s.color.b, a: s.color.a ?? 1 },
    }));

    let gradientTransform: Transform;
    if (type === "LINEAR") {
      gradientTransform = angleToGradientTransform(angle);
    } else {
      // Center radial/angular/diamond at (0.5, 0.5)
      gradientTransform = [[0.5, 0, 0.5], [0, 0.5, 0.5]];
    }

    (node as GeometryMixin).fills = [{
      type: gradientType,
      gradientStops,
      gradientTransform,
    }];

    return { id: node.id };
  });

  // ── set_image ─────────────────────────────────────────────

  dispatcher.register("set_image", async (params) => {
    const nodeId = params["nodeId"] as string;
    const imageData = params["imageData"] as string;
    const scaleMode = (params["scaleMode"] as "FILL" | "FIT" | "CROP" | "TILE" | undefined) ?? "FILL";

    const node = requireNode(nodeId);
    if (!("fills" in node)) throw new Error(`Node type ${node.type} does not support fills.`);

    if (imageData.startsWith("http://") || imageData.startsWith("https://")) {
      throw new Error(
        "URL-based images require pre-fetching. " +
        "Please provide base64-encoded image data instead."
      );
    }

    // Decode base64 to bytes
    const binary = atob(imageData);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    const image = figma.createImage(bytes);
    const imagePaint: ImagePaint = {
      type: "IMAGE",
      imageHash: image.hash,
      scaleMode,
    };

    (node as GeometryMixin).fills = [imagePaint];

    return { id: node.id };
  });

  // ── reorder_node ──────────────────────────────────────────

  dispatcher.register("reorder_node", async (params) => {
    const nodeId = params["nodeId"] as string;
    const position = params["position"] as "FRONT" | "BACK" | "FORWARD" | "BACKWARD" | "INDEX";
    const index = params["index"] as number | undefined;

    const node = requireNode(nodeId);
    const parent = node.parent as ChildrenMixin | null;
    if (!parent || !("children" in parent)) {
      throw new Error("Node has no parent to reorder within.");
    }

    const children = parent.children as SceneNode[];
    const currentIndex = children.indexOf(node as SceneNode);

    let newIndex: number;
    switch (position) {
      case "FRONT":    newIndex = children.length - 1; break;
      case "BACK":     newIndex = 0; break;
      case "FORWARD":  newIndex = Math.min(currentIndex + 1, children.length - 1); break;
      case "BACKWARD": newIndex = Math.max(currentIndex - 1, 0); break;
      case "INDEX":
        if (index === undefined) throw new Error("index is required when position='INDEX'.");
        newIndex = Math.max(0, Math.min(index, children.length - 1));
        break;
    }

    parent.insertChild(newIndex, node as SceneNode);

    return { id: node.id };
  });

  // ── convert_to_frame ──────────────────────────────────────

  dispatcher.register("convert_to_frame", async (params) => {
    const nodeId = params["nodeId"] as string;
    const node = requireNode(nodeId);

    if (node.type === "FRAME") {
      return { id: node.id, name: node.name };
    }

    if (!("children" in node)) {
      throw new Error(`Node type ${node.type} cannot be converted to a frame.`);
    }

    const groupNode = node as GroupNode | ComponentNode;
    const frame = figma.createFrame();
    frame.name = groupNode.name;
    frame.x = groupNode.x;
    frame.y = groupNode.y;
    frame.resize(groupNode.width, groupNode.height);
    frame.fills = [];

    const parent = groupNode.parent as ChildrenMixin ?? figma.currentPage;
    const originalIndex = parent.children.indexOf(groupNode as SceneNode);

    // Move children to new frame
    const children = [...groupNode.children] as SceneNode[];
    for (const child of children) {
      frame.appendChild(child);
    }

    parent.insertChild(originalIndex, frame);
    groupNode.remove();

    return { id: frame.id, name: frame.name };
  });

  // ── set_grid ──────────────────────────────────────────────

  dispatcher.register("set_grid", async (params) => {
    const nodeId = params["nodeId"] as string;
    const grids = params["grids"] as Array<{
      pattern: "COLUMNS" | "ROWS" | "GRID";
      count?: number;
      sectionSize?: number;
      gutterSize?: number;
      offset?: number;
      color?: ColorParam;
    }>;

    const node = requireNode(nodeId);
    if (node.type !== "FRAME" && node.type !== "COMPONENT" && node.type !== "INSTANCE") {
      throw new Error("set_grid requires a FRAME node.");
    }

    const frame = node as FrameNode;

    const layoutGrids: LayoutGrid[] = grids.map((g) => {
      const color: RGBA | undefined = g.color
        ? { r: g.color.r, g: g.color.g, b: g.color.b, a: g.color.a ?? 0.1 }
        : undefined;

      if (g.pattern === "GRID") {
        const grid: GridLayoutGrid = {
          pattern: "GRID",
          sectionSize: g.sectionSize ?? 8,
          visible: true,
          color: color ?? { r: 0.7, g: 0.7, b: 1, a: 0.1 },
        };
        return grid;
      }

      return {
        pattern: g.pattern,
        sectionSize: g.sectionSize ?? 64,
        visible: true,
        color: color ?? { r: 0.7, g: 0.7, b: 1, a: 0.1 },
        alignment: "MIN",
        gutterSize: g.gutterSize ?? 0,
        count: g.count ?? 12,
        offset: g.offset ?? 0,
      } as RowsColsLayoutGrid;
    });

    frame.layoutGrids = layoutGrids;

    return { id: node.id };
  });

  // ── get_grid ──────────────────────────────────────────────

  dispatcher.register("get_grid", async (params) => {
    const nodeId = params["nodeId"] as string;
    const node = requireNode(nodeId);

    if (!("layoutGrids" in node)) return [];

    return (node as FrameNode).layoutGrids;
  });

  // ── set_annotation ────────────────────────────────────────

  dispatcher.register("set_annotation", async (params) => {
    const nodeId = params["nodeId"] as string;
    const label = params["label"] as string;

    const node = requireNode(nodeId);
    if (!("annotations" in node)) {
      throw new Error(`Node type ${node.type} does not support annotations.`);
    }

    (node as SceneNode & { annotations: Annotation[] }).annotations = [{ label }];

    return { id: node.id };
  });

  // ── get_annotation ────────────────────────────────────────

  dispatcher.register("get_annotation", async (params) => {
    const nodeId = params["nodeId"] as string;
    const node = requireNode(nodeId);

    if (!("annotations" in node)) return { label: undefined };

    const annotations = (node as SceneNode & { annotations?: Annotation[] }).annotations;
    const label = annotations?.[0]?.label;

    return { label };
  });
}
