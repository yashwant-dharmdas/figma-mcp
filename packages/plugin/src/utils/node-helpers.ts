// ============================================================
// Node helpers — utilities shared across all plugin handlers.
// ============================================================

/**
 * Get a node by ID, throwing a clear error if not found.
 * Use this in every handler that takes a nodeId param.
 */
export function requireNode(nodeId: string): SceneNode {
  const node = figma.getNodeById(nodeId);
  if (!node) {
    throw new Error(
      `Node not found: "${nodeId}". ` +
        "The node may have been deleted or the ID is incorrect. " +
        "Call get_selection or get_node_info to find valid IDs."
    );
  }
  if (node.type === "DOCUMENT" || node.type === "PAGE") {
    throw new Error(
      `Node "${nodeId}" is a ${node.type}, not a scene node. ` +
        "Use page management commands for pages."
    );
  }
  return node as SceneNode;
}

/**
 * Get a page by ID, throwing a clear error if not found.
 */
export function requirePage(pageId: string): PageNode {
  const node = figma.getNodeById(pageId);
  if (!node || node.type !== "PAGE") {
    throw new Error(`Page not found: "${pageId}".`);
  }
  return node;
}

/**
 * Append a node to a parent (by ID) or to the current page if no parentId.
 * Returns the node for chaining.
 */
export function appendToParent<T extends SceneNode>(
  node: T,
  parentId?: string
): T {
  if (parentId) {
    const parent = figma.getNodeById(parentId);
    if (parent && "appendChild" in parent) {
      (parent as ChildrenMixin).appendChild(node);
      return node;
    }
  }
  figma.currentPage.appendChild(node);
  return node;
}

// ── Node serialization ────────────────────────────────────────

/** Minimal node info (id, name, type) — used in list responses. */
export interface NodeRef {
  id: string;
  name: string;
  type: string;
}

/** Full serialized node — used in get_node_info responses. */
export interface SerializedNode extends NodeRef {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  visible?: boolean;
  locked?: boolean;
  opacity?: number;
  blendMode?: string;
  fills?: readonly Paint[];
  strokes?: readonly Paint[];
  strokeWeight?: number;
  cornerRadius?: number | typeof figma.mixed;
  characters?: string;
  fontSize?: number | typeof figma.mixed;
  fontName?: FontName | typeof figma.mixed;
  textAlignHorizontal?: string;
  layoutMode?: string;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  itemSpacing?: number;
  children?: NodeRef[];
  childrenCount?: number;
  constraints?: Constraints;
  exportSettings?: readonly ExportSettings[];
}

/**
 * Serialize a node for JSON transport.
 * Converts Figma API node to a plain object.
 * Symbol values (figma.mixed) are converted to the string "MIXED".
 */
export function serializeNode(node: BaseNode): SerializedNode {
  const result: SerializedNode = {
    id: node.id,
    name: node.name,
    type: node.type,
  };

  const n = node as SceneNode & {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    visible?: boolean;
    locked?: boolean;
    opacity?: number;
    blendMode?: BlendMode;
    fills?: readonly Paint[];
    strokes?: readonly Paint[];
    strokeWeight?: number | symbol;
    cornerRadius?: number | symbol;
    characters?: string;
    fontSize?: number | symbol;
    fontName?: FontName | symbol;
    textAlignHorizontal?: TextNode["textAlignHorizontal"];
    layoutMode?: FrameNode["layoutMode"];
    paddingTop?: number;
    paddingRight?: number;
    paddingBottom?: number;
    paddingLeft?: number;
    itemSpacing?: number;
    constraints?: Constraints;
    exportSettings?: readonly ExportSettings[];
    children?: readonly SceneNode[];
  };

  if ("x" in n) result.x = n.x;
  if ("y" in n) result.y = n.y;
  if ("width" in n) result.width = n.width;
  if ("height" in n) result.height = n.height;
  if ("visible" in n) result.visible = n.visible;
  if ("locked" in n) result.locked = n.locked;
  if ("opacity" in n) result.opacity = n.opacity;
  if ("blendMode" in n && n.blendMode) result.blendMode = n.blendMode;
  if ("fills" in n && Array.isArray(n.fills)) result.fills = n.fills;
  if ("strokes" in n && Array.isArray(n.strokes)) result.strokes = n.strokes;

  if ("strokeWeight" in n && typeof n.strokeWeight !== "symbol") {
    result.strokeWeight = n.strokeWeight as number;
  }

  if ("cornerRadius" in n && typeof n.cornerRadius !== "symbol") {
    result.cornerRadius = n.cornerRadius as number;
  }

  // Text properties
  if (n.type === "TEXT") {
    result.characters = n.characters;
    if (typeof n.fontSize !== "symbol") result.fontSize = n.fontSize as number;
    if (typeof n.fontName !== "symbol") result.fontName = n.fontName as FontName;
    result.textAlignHorizontal = n.textAlignHorizontal;
  }

  // Frame / auto-layout properties
  if (n.type === "FRAME" || n.type === "COMPONENT" || n.type === "INSTANCE") {
    result.layoutMode = n.layoutMode;
    if (n.layoutMode && n.layoutMode !== "NONE") {
      result.paddingTop = n.paddingTop;
      result.paddingRight = n.paddingRight;
      result.paddingBottom = n.paddingBottom;
      result.paddingLeft = n.paddingLeft;
      result.itemSpacing = n.itemSpacing;
    }
  }

  if ("constraints" in n && n.constraints) {
    result.constraints = n.constraints;
  }

  if ("exportSettings" in n && n.exportSettings?.length) {
    result.exportSettings = n.exportSettings;
  }

  // Children (shallow — just refs)
  if ("children" in n && n.children) {
    result.childrenCount = n.children.length;
    result.children = n.children.map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
    }));
  }

  return result;
}
