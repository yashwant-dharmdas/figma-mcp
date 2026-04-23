// src/index.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

// shared-src/protocol/errors.ts
var FigmaMcpError = class extends Error {
  code;
  context;
  constructor(message, code, context) {
    super(message);
    this.name = "FigmaMcpError";
    this.code = code;
    if (context !== void 0) {
      this.context = context;
    }
  }
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      ...this.context ? { context: this.context } : {}
    };
  }
};

// shared-src/registry.ts
import { z } from "zod";
var NodeIdSchema = z.string().min(1).describe("Figma node ID (e.g. '1:23'). Find it with get_selection or get_node_info.");
var ColorSchema = z.object({
  r: z.number().min(0).max(1).describe("Red (0\u20131)"),
  g: z.number().min(0).max(1).describe("Green (0\u20131)"),
  b: z.number().min(0).max(1).describe("Blue (0\u20131)"),
  a: z.number().min(0).max(1).default(1).describe("Alpha (0\u20131). Default: 1 (fully opaque). Use 0 for fully transparent.")
});
var PositionSchema = z.object({
  x: z.number().describe("X coordinate in pixels"),
  y: z.number().describe("Y coordinate in pixels")
});
var SizeSchema = z.object({
  width: z.number().positive().describe("Width in pixels"),
  height: z.number().positive().describe("Height in pixels")
});
function defineCommand(def) {
  return def;
}
var COMMAND_REGISTRY = [
  // ── Channel ──────────────────────────────────────────────
  defineCommand({
    name: "join_channel",
    description: "Connect to the Figma plugin. Call this before using other Figma tools to confirm the plugin is ready. In local mode (npx figma-mcp): the plugin connects automatically \u2014 no channel ID needed. In hosted/relay mode: pass the 8-character channel ID shown in the Figma plugin UI.",
    category: "channel",
    params: z.object({
      channel: z.string().optional().describe("Channel ID (only required in hosted/relay mode \u2014 omit for local npx mode)"),
      token: z.string().optional().describe("Auth token (hosted mode only)")
    }),
    result: z.object({
      status: z.literal("connected")
    }),
    requiresChannel: false,
    cacheable: false,
    examples: [
      { description: "Verify plugin connection (local mode)", input: {} },
      { description: "Connect to hosted session", input: { channel: "abc12345" } }
    ]
  }),
  // ── Document (read operations) ────────────────────────────
  defineCommand({
    name: "get_document_info",
    description: "Get metadata about the current Figma document: its name, all pages, and the current page. Use this as your first call to orient yourself in the document before making changes. Results are cached for 5 seconds.",
    category: "document",
    params: z.object({}),
    result: z.object({
      name: z.string(),
      id: z.string(),
      currentPage: z.object({ id: z.string(), name: z.string() }),
      pages: z.array(z.object({
        id: z.string(),
        name: z.string(),
        childCount: z.number()
      }))
    }),
    requiresChannel: true,
    cacheable: true,
    cacheTtlMs: 5e3,
    examples: [
      { description: "Get document overview before starting work", input: {} }
    ]
  }),
  defineCommand({
    name: "get_selection",
    description: "Get the currently selected nodes in Figma. Returns node IDs, names, types, and positions. Ask the user to select nodes in Figma first if you need to work on specific elements.",
    category: "document",
    params: z.object({}),
    result: z.object({
      selection: z.array(z.object({
        id: z.string(),
        name: z.string(),
        type: z.string(),
        x: z.number(),
        y: z.number(),
        width: z.number(),
        height: z.number()
      }))
    }),
    requiresChannel: true,
    cacheable: false,
    examples: [
      { description: "Find out what the user has selected", input: {} }
    ]
  }),
  defineCommand({
    name: "get_node_info",
    description: "Get detailed information about a specific node by its ID. Returns full node properties including fills, strokes, effects, children (for frames/groups), typography (for text nodes), and component info. Use get_selection first to find node IDs.",
    category: "document",
    params: z.object({
      nodeId: NodeIdSchema
    }),
    result: z.object({
      id: z.string(),
      name: z.string(),
      type: z.string(),
      visible: z.boolean(),
      locked: z.boolean(),
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number()
    }).passthrough(),
    requiresChannel: true,
    cacheable: true,
    cacheTtlMs: 3e3,
    examples: [
      { description: "Inspect a specific node", input: { nodeId: "1:23" } }
    ]
  }),
  defineCommand({
    name: "get_nodes_info",
    description: "Get detailed information about multiple nodes at once. More efficient than calling get_node_info repeatedly. Use when you need to inspect several nodes in one step.",
    category: "document",
    params: z.object({
      nodeIds: z.array(NodeIdSchema).min(1).max(50).describe("Array of node IDs to fetch info for (max 50)")
    }),
    result: z.array(z.object({
      id: z.string(),
      name: z.string(),
      type: z.string()
    }).passthrough()),
    requiresChannel: true,
    cacheable: false,
    examples: [
      { description: "Get info for 3 nodes at once", input: { nodeIds: ["1:1", "1:2", "1:3"] } }
    ]
  }),
  defineCommand({
    name: "get_styles",
    description: "Get all local styles defined in the Figma document: paint styles (colors), text styles (typography), effect styles (shadows/blurs), and grid styles. Returns style IDs that can be applied to nodes. Cached for 10 seconds.",
    category: "document",
    params: z.object({}),
    result: z.object({
      paintStyles: z.array(z.object({ id: z.string(), name: z.string(), description: z.string() })),
      textStyles: z.array(z.object({ id: z.string(), name: z.string(), description: z.string() })),
      effectStyles: z.array(z.object({ id: z.string(), name: z.string(), description: z.string() })),
      gridStyles: z.array(z.object({ id: z.string(), name: z.string(), description: z.string() }))
    }),
    requiresChannel: true,
    cacheable: true,
    cacheTtlMs: 1e4,
    examples: [
      { description: "List all design system styles available", input: {} }
    ]
  }),
  defineCommand({
    name: "get_pages",
    description: "Get all pages in the current Figma document with their names and IDs.",
    category: "document",
    params: z.object({}),
    result: z.array(z.object({
      id: z.string(),
      name: z.string(),
      isCurrent: z.boolean()
    })),
    requiresChannel: true,
    cacheable: true,
    cacheTtlMs: 5e3,
    examples: [
      { description: "List all pages", input: {} }
    ]
  }),
  defineCommand({
    name: "scan_text_nodes",
    description: "Scan all text nodes in a frame or the entire page and return their content and IDs. Use this to audit text content, find specific strings, or prepare bulk text edits. For large frames, results are streamed with progress updates.",
    category: "document",
    params: z.object({
      nodeId: NodeIdSchema.optional().describe("Scope the scan to this node. Omit to scan the whole current page."),
      chunkSize: z.number().int().min(5).max(100).default(20).describe("How many text nodes to process per chunk. Smaller = more frequent progress updates.")
    }),
    result: z.array(z.object({
      id: z.string(),
      name: z.string(),
      characters: z.string(),
      fontSize: z.number().optional(),
      fontFamily: z.string().optional()
    })),
    requiresChannel: true,
    cacheable: false,
    examples: [
      { description: "Scan all text in a frame", input: { nodeId: "1:23" } },
      { description: "Scan entire page in small chunks", input: { chunkSize: 10 } }
    ]
  }),
  defineCommand({
    name: "export_node_as_image",
    description: "Export a node as a PNG, JPG, SVG, or PDF image and return it as a base64-encoded string. Use for design previews or asset generation. Large exports may take up to 60 seconds.",
    category: "document",
    params: z.object({
      nodeId: NodeIdSchema,
      format: z.enum(["PNG", "JPG", "SVG", "PDF"]).default("PNG").describe("Export format"),
      scale: z.number().min(0.5).max(4).default(1).describe("Scale multiplier for raster formats (PNG/JPG). 2 = @2x retina.")
    }),
    result: z.object({
      nodeId: z.string(),
      format: z.string(),
      data: z.string().describe("Base64-encoded image data"),
      mimeType: z.string()
    }),
    requiresChannel: true,
    cacheable: false,
    examples: [
      { description: "Export a frame as PNG at 2x", input: { nodeId: "1:23", format: "PNG", scale: 2 } }
    ]
  }),
  defineCommand({
    name: "get_local_components",
    description: "Get all components defined locally in the current Figma document. Returns component keys for use with create_component_instance. Cached for 10 seconds.",
    category: "component",
    params: z.object({}),
    result: z.array(z.object({
      id: z.string(),
      key: z.string(),
      name: z.string(),
      description: z.string()
    })),
    requiresChannel: true,
    cacheable: true,
    cacheTtlMs: 1e4,
    examples: [
      { description: "List all local components to find the right key", input: {} }
    ]
  }),
  // ── Page Management ───────────────────────────────────────
  defineCommand({
    name: "create_page",
    description: "Create a new page in the Figma document with the given name.",
    category: "document",
    params: z.object({
      name: z.string().min(1).describe("Name for the new page")
    }),
    result: z.object({ id: z.string(), name: z.string() }),
    requiresChannel: true,
    cacheable: false
  }),
  defineCommand({
    name: "delete_page",
    description: "Delete a page from the Figma document. Cannot delete the last remaining page.",
    category: "document",
    params: z.object({
      pageId: z.string().describe("ID of the page to delete")
    }),
    result: z.object({ deleted: z.boolean() }),
    requiresChannel: true,
    cacheable: false
  }),
  defineCommand({
    name: "rename_page",
    description: "Rename an existing page.",
    category: "document",
    params: z.object({
      pageId: z.string().describe("ID of the page to rename"),
      name: z.string().min(1).describe("New name for the page")
    }),
    result: z.object({ id: z.string(), name: z.string() }),
    requiresChannel: true,
    cacheable: false
  }),
  defineCommand({
    name: "set_current_page",
    description: "Switch the active page in Figma to the specified page.",
    category: "document",
    params: z.object({
      pageId: z.string().describe("ID of the page to navigate to")
    }),
    result: z.object({ id: z.string(), name: z.string() }),
    requiresChannel: true,
    cacheable: false
  }),
  defineCommand({
    name: "duplicate_page",
    description: "Duplicate an existing page, creating an identical copy with a new name.",
    category: "document",
    params: z.object({
      pageId: z.string().describe("ID of the page to duplicate"),
      name: z.string().optional().describe("Name for the duplicate. Defaults to '<original> Copy'.")
    }),
    result: z.object({ id: z.string(), name: z.string() }),
    requiresChannel: true,
    cacheable: false
  }),
  // ── Creation ─────────────────────────────────────────────
  defineCommand({
    name: "create_frame",
    description: "Create a new frame (container) in Figma. Frames are the primary layout containers \u2014 use them for screens, sections, and component wrappers. All coordinates are relative to the parent (or page origin if no parent).",
    category: "creation",
    params: z.object({
      x: z.number().describe("X position in pixels"),
      y: z.number().describe("Y position in pixels"),
      width: z.number().positive().describe("Width in pixels"),
      height: z.number().positive().describe("Height in pixels"),
      name: z.string().optional().describe("Frame name. Defaults to 'Frame'."),
      parentId: NodeIdSchema.optional().describe("Parent node ID. Omit to place on current page."),
      fillColor: ColorSchema.optional().describe("Background fill color. Defaults to white.")
    }),
    result: z.object({ id: z.string(), name: z.string(), x: z.number(), y: z.number(), width: z.number(), height: z.number() }),
    requiresChannel: true,
    cacheable: false,
    examples: [
      { description: "Create a 375\xD7812 mobile screen frame", input: { x: 0, y: 0, width: 375, height: 812, name: "Mobile Screen" } },
      { description: "Create a frame inside another frame", input: { x: 16, y: 16, width: 200, height: 100, parentId: "1:23" } }
    ]
  }),
  defineCommand({
    name: "create_rectangle",
    description: "Create a rectangle shape. Rectangles are decorative elements \u2014 use frames instead if you need to contain other elements.",
    category: "creation",
    params: z.object({
      x: z.number(),
      y: z.number(),
      width: z.number().positive(),
      height: z.number().positive(),
      name: z.string().optional(),
      parentId: NodeIdSchema.optional(),
      fillColor: ColorSchema.optional(),
      cornerRadius: z.number().min(0).optional().describe("Corner radius for all corners")
    }),
    result: z.object({ id: z.string(), name: z.string() }),
    requiresChannel: true,
    cacheable: false,
    examples: [
      { description: "Create a rounded button background", input: { x: 0, y: 0, width: 120, height: 40, cornerRadius: 8, fillColor: { r: 0.2, g: 0.4, b: 1, a: 1 } } }
    ]
  }),
  defineCommand({
    name: "create_text",
    description: "Create a text node. Specify content, position, and optional styling. For text inside buttons/cards, set parentId to place it inside the frame.",
    category: "creation",
    params: z.object({
      x: z.number(),
      y: z.number(),
      text: z.string().describe("The text content to display"),
      name: z.string().optional().describe("Layer name in Figma. Defaults to the text content."),
      parentId: NodeIdSchema.optional(),
      fontSize: z.number().min(1).max(1e3).optional().default(16).describe("Font size in pixels"),
      fontFamily: z.string().optional().default("Inter").describe("Font family name"),
      fontWeight: z.enum(["Thin", "ExtraLight", "Light", "Regular", "Medium", "SemiBold", "Bold", "ExtraBold", "Black"]).optional().default("Regular"),
      fillColor: ColorSchema.optional().describe("Text color. Defaults to black."),
      textAlignHorizontal: z.enum(["LEFT", "CENTER", "RIGHT", "JUSTIFIED"]).optional().default("LEFT")
    }),
    result: z.object({ id: z.string(), name: z.string() }),
    requiresChannel: true,
    cacheable: false,
    examples: [
      { description: "Create a heading", input: { x: 0, y: 0, text: "Welcome", fontSize: 32, fontWeight: "Bold" } },
      { description: "Create centered button label", input: { x: 0, y: 0, text: "Get Started", fontSize: 14, fontWeight: "SemiBold", textAlignHorizontal: "CENTER", parentId: "1:23" } }
    ]
  }),
  defineCommand({
    name: "create_ellipse",
    description: "Create an ellipse (circle or oval) shape.",
    category: "creation",
    params: z.object({
      x: z.number(),
      y: z.number(),
      width: z.number().positive(),
      height: z.number().positive(),
      name: z.string().optional(),
      parentId: NodeIdSchema.optional(),
      fillColor: ColorSchema.optional()
    }),
    result: z.object({ id: z.string(), name: z.string() }),
    requiresChannel: true,
    cacheable: false,
    examples: [
      { description: "Create a 48\xD748 avatar placeholder circle", input: { x: 0, y: 0, width: 48, height: 48, fillColor: { r: 0.9, g: 0.9, b: 0.9, a: 1 } } }
    ]
  }),
  defineCommand({
    name: "create_polygon",
    description: "Create a regular polygon with a specified number of sides.",
    category: "creation",
    params: z.object({
      x: z.number(),
      y: z.number(),
      width: z.number().positive(),
      height: z.number().positive(),
      sides: z.number().int().min(3).max(20).describe("Number of polygon sides (3 = triangle, 6 = hexagon)"),
      name: z.string().optional(),
      parentId: NodeIdSchema.optional(),
      fillColor: ColorSchema.optional()
    }),
    result: z.object({ id: z.string(), name: z.string() }),
    requiresChannel: true,
    cacheable: false
  }),
  defineCommand({
    name: "create_star",
    description: "Create a star shape.",
    category: "creation",
    params: z.object({
      x: z.number(),
      y: z.number(),
      width: z.number().positive(),
      height: z.number().positive(),
      points: z.number().int().min(3).max(20).default(5).describe("Number of star points"),
      innerRadius: z.number().min(0.1).max(0.9).default(0.5).describe("Inner radius ratio (0.1\u20130.9)"),
      name: z.string().optional(),
      parentId: NodeIdSchema.optional(),
      fillColor: ColorSchema.optional()
    }),
    result: z.object({ id: z.string(), name: z.string() }),
    requiresChannel: true,
    cacheable: false
  }),
  defineCommand({
    name: "clone_node",
    description: "Duplicate an existing node. The clone appears next to the original by default, or at the specified x/y position.",
    category: "creation",
    params: z.object({
      nodeId: NodeIdSchema,
      x: z.number().optional().describe("X position for the clone. Defaults to original x + 10."),
      y: z.number().optional().describe("Y position for the clone. Defaults to original y + 10."),
      parentId: NodeIdSchema.optional().describe("Parent for the clone. Defaults to original's parent.")
    }),
    result: z.object({ id: z.string(), name: z.string() }),
    requiresChannel: true,
    cacheable: false,
    examples: [
      { description: "Clone a button and offset it", input: { nodeId: "1:23", x: 150, y: 0 } }
    ]
  }),
  defineCommand({
    name: "group_nodes",
    description: "Group multiple nodes into a single group layer.",
    category: "creation",
    params: z.object({
      nodeIds: z.array(NodeIdSchema).min(2).describe("IDs of nodes to group (minimum 2)"),
      name: z.string().optional().describe("Name for the group. Defaults to 'Group'.")
    }),
    result: z.object({ id: z.string(), name: z.string() }),
    requiresChannel: true,
    cacheable: false
  }),
  defineCommand({
    name: "ungroup_nodes",
    description: "Ungroup a group, releasing its children into the parent container.",
    category: "creation",
    params: z.object({
      nodeId: NodeIdSchema.describe("ID of the group to ungroup")
    }),
    result: z.object({ ungroupedCount: z.number() }),
    requiresChannel: true,
    cacheable: false
  }),
  defineCommand({
    name: "flatten_node",
    description: "Flatten a vector or group into a single vector path.",
    category: "creation",
    params: z.object({
      nodeId: NodeIdSchema
    }),
    result: z.object({ id: z.string(), name: z.string() }),
    requiresChannel: true,
    cacheable: false
  }),
  defineCommand({
    name: "boolean_operation",
    description: "Combine multiple vector shapes using a Boolean operation. Union merges shapes, Subtract removes overlap, Intersect keeps only the overlap, Exclude inverts.",
    category: "creation",
    params: z.object({
      nodeIds: z.array(NodeIdSchema).min(2).describe("IDs of shapes to combine (minimum 2)"),
      operation: z.enum(["UNION", "SUBTRACT", "INTERSECT", "EXCLUDE"]).describe("Boolean operation type"),
      name: z.string().optional().describe("Name for the resulting shape")
    }),
    result: z.object({ id: z.string(), name: z.string() }),
    requiresChannel: true,
    cacheable: false
  }),
  defineCommand({
    name: "insert_child",
    description: "Move a node into a different parent container, at a specific z-order index.",
    category: "creation",
    params: z.object({
      parentId: NodeIdSchema.describe("ID of the new parent (frame or group)"),
      childId: NodeIdSchema.describe("ID of the node to move"),
      index: z.number().int().min(0).optional().describe("Position in parent's children array. Omit to add at end.")
    }),
    result: z.object({ success: z.boolean() }),
    requiresChannel: true,
    cacheable: false
  }),
  // ── Modification ──────────────────────────────────────────
  defineCommand({
    name: "set_fill_color",
    description: "Set the solid fill color of a node. Use r/g/b/a values in 0\u20131 range (not 0\u2013255). To convert hex: #FF0000 \u2192 r:1, g:0, b:0. Set a:0 for fully transparent, a:1 for fully opaque.",
    category: "modification",
    params: z.object({
      nodeId: NodeIdSchema,
      r: z.number().min(0).max(1).describe("Red (0\u20131)"),
      g: z.number().min(0).max(1).describe("Green (0\u20131)"),
      b: z.number().min(0).max(1).describe("Blue (0\u20131)"),
      a: z.number().min(0).max(1).optional().describe("Alpha (0\u20131). Default: 1 (opaque). Use 0 for transparent.")
    }),
    result: z.object({ id: z.string(), name: z.string() }),
    requiresChannel: true,
    cacheable: false,
    examples: [
      { description: "Set to a vibrant red", input: { nodeId: "1:23", r: 0.95, g: 0.2, b: 0.2 } },
      { description: "Set to semi-transparent dark overlay", input: { nodeId: "1:23", r: 0, g: 0, b: 0, a: 0.5 } },
      { description: "Set to fully transparent (remove fill)", input: { nodeId: "1:23", r: 0, g: 0, b: 0, a: 0 } }
    ]
  }),
  defineCommand({
    name: "set_stroke_color",
    description: "Set the stroke (border) color and weight of a node. Use r/g/b/a values in 0\u20131 range.",
    category: "modification",
    params: z.object({
      nodeId: NodeIdSchema,
      r: z.number().min(0).max(1),
      g: z.number().min(0).max(1),
      b: z.number().min(0).max(1),
      a: z.number().min(0).max(1).optional(),
      strokeWeight: z.number().min(0).optional().default(1).describe("Stroke width in pixels. Set to 0 to remove stroke.")
    }),
    result: z.object({ id: z.string(), name: z.string() }),
    requiresChannel: true,
    cacheable: false,
    examples: [
      { description: "Add a 2px blue border", input: { nodeId: "1:23", r: 0.2, g: 0.4, b: 1, strokeWeight: 2 } },
      { description: "Remove the stroke", input: { nodeId: "1:23", r: 0, g: 0, b: 0, strokeWeight: 0 } }
    ]
  }),
  defineCommand({
    name: "set_selection_colors",
    description: "Recursively update all fill colors that match a source color inside a node tree. Useful for rebranding \u2014 replace all instances of one color with another. Processes nodes in chunks with progress updates for large selections.",
    category: "modification",
    params: z.object({
      nodeId: NodeIdSchema.describe("Root node to search within"),
      sourceColor: ColorSchema.describe("The color to find and replace"),
      targetColor: ColorSchema.describe("The replacement color"),
      tolerance: z.number().min(0).max(0.1).optional().default(0.01).describe("Color matching tolerance (0\u20130.1). Higher = more fuzzy matching.")
    }),
    result: z.object({ replacedCount: z.number() }),
    requiresChannel: true,
    cacheable: false
  }),
  defineCommand({
    name: "move_node",
    description: "Move a node to a new position. Coordinates are relative to the parent container.",
    category: "modification",
    params: z.object({
      nodeId: NodeIdSchema,
      x: z.number().describe("New X position in pixels"),
      y: z.number().describe("New Y position in pixels")
    }),
    result: z.object({ id: z.string(), x: z.number(), y: z.number() }),
    requiresChannel: true,
    cacheable: false,
    examples: [
      { description: "Move to top-left of parent", input: { nodeId: "1:23", x: 0, y: 0 } }
    ]
  }),
  defineCommand({
    name: "resize_node",
    description: "Resize a node to new dimensions.",
    category: "modification",
    params: z.object({
      nodeId: NodeIdSchema,
      width: z.number().positive().describe("New width in pixels"),
      height: z.number().positive().describe("New height in pixels")
    }),
    result: z.object({ id: z.string(), width: z.number(), height: z.number() }),
    requiresChannel: true,
    cacheable: false
  }),
  defineCommand({
    name: "rename_node",
    description: "Rename a node (changes the layer name in Figma's layers panel).",
    category: "modification",
    params: z.object({
      nodeId: NodeIdSchema,
      name: z.string().min(1).describe("New layer name")
    }),
    result: z.object({ id: z.string(), name: z.string() }),
    requiresChannel: true,
    cacheable: false
  }),
  defineCommand({
    name: "delete_node",
    description: "Permanently delete a node from the canvas. This cannot be undone via MCP.",
    category: "modification",
    params: z.object({
      nodeId: NodeIdSchema
    }),
    result: z.object({ deleted: z.boolean() }),
    requiresChannel: true,
    cacheable: false
  }),
  defineCommand({
    name: "set_corner_radius",
    description: "Set the corner radius of a frame or rectangle. Can set all corners uniformly or individually.",
    category: "modification",
    params: z.object({
      nodeId: NodeIdSchema,
      radius: z.number().min(0).describe("Corner radius in pixels. Applied to all corners unless individual values are set."),
      topLeft: z.number().min(0).optional(),
      topRight: z.number().min(0).optional(),
      bottomRight: z.number().min(0).optional(),
      bottomLeft: z.number().min(0).optional()
    }),
    result: z.object({ id: z.string() }),
    requiresChannel: true,
    cacheable: false,
    examples: [
      { description: "Rounded corners (pill shape)", input: { nodeId: "1:23", radius: 999 } },
      { description: "Top corners only (card style)", input: { nodeId: "1:23", radius: 0, topLeft: 12, topRight: 12 } }
    ]
  }),
  defineCommand({
    name: "set_auto_layout",
    description: "Configure auto-layout on a frame. Auto-layout arranges children automatically like CSS flexbox. Use HORIZONTAL for rows, VERTICAL for columns.",
    category: "modification",
    params: z.object({
      nodeId: NodeIdSchema,
      layoutMode: z.enum(["HORIZONTAL", "VERTICAL", "NONE"]).describe("Direction of child arrangement. NONE removes auto-layout."),
      paddingTop: z.number().min(0).optional().default(0),
      paddingRight: z.number().min(0).optional().default(0),
      paddingBottom: z.number().min(0).optional().default(0),
      paddingLeft: z.number().min(0).optional().default(0),
      itemSpacing: z.number().min(0).optional().default(0).describe("Gap between children"),
      primaryAxisAlignItems: z.enum(["MIN", "MAX", "CENTER", "SPACE_BETWEEN"]).optional().default("MIN"),
      counterAxisAlignItems: z.enum(["MIN", "MAX", "CENTER", "BASELINE"]).optional().default("MIN"),
      layoutWrap: z.enum(["NO_WRAP", "WRAP"]).optional().default("NO_WRAP")
    }),
    result: z.object({ id: z.string() }),
    requiresChannel: true,
    cacheable: false,
    examples: [
      { description: "Horizontal nav bar with gaps", input: { nodeId: "1:23", layoutMode: "HORIZONTAL", itemSpacing: 16, paddingLeft: 24, paddingRight: 24 } },
      { description: "Vertical card content", input: { nodeId: "1:23", layoutMode: "VERTICAL", paddingTop: 16, paddingBottom: 16, paddingLeft: 16, paddingRight: 16, itemSpacing: 8 } }
    ]
  }),
  defineCommand({
    name: "set_effects",
    description: "Set visual effects on a node: drop shadows, inner shadows, layer blurs, or background blurs. Replaces all existing effects.",
    category: "modification",
    params: z.object({
      nodeId: NodeIdSchema,
      effects: z.array(z.discriminatedUnion("type", [
        z.object({
          type: z.literal("DROP_SHADOW"),
          color: ColorSchema.optional(),
          offsetX: z.number().optional().default(0),
          offsetY: z.number().optional().default(4),
          radius: z.number().min(0).optional().default(8),
          spread: z.number().optional().default(0),
          visible: z.boolean().optional().default(true)
        }),
        z.object({
          type: z.literal("INNER_SHADOW"),
          color: ColorSchema.optional(),
          offsetX: z.number().optional().default(0),
          offsetY: z.number().optional().default(2),
          radius: z.number().min(0).optional().default(4),
          spread: z.number().optional().default(0),
          visible: z.boolean().optional().default(true)
        }),
        z.object({
          type: z.literal("LAYER_BLUR"),
          radius: z.number().min(0).describe("Blur radius in pixels"),
          visible: z.boolean().optional().default(true)
        }),
        z.object({
          type: z.literal("BACKGROUND_BLUR"),
          radius: z.number().min(0).describe("Background blur radius"),
          visible: z.boolean().optional().default(true)
        })
      ])).describe("Array of effects. Pass empty array [] to remove all effects.")
    }),
    result: z.object({ id: z.string() }),
    requiresChannel: true,
    cacheable: false,
    examples: [
      { description: "Add a soft card shadow", input: { nodeId: "1:23", effects: [{ type: "DROP_SHADOW", color: { r: 0, g: 0, b: 0, a: 0.1 }, offsetY: 4, radius: 12 }] } },
      { description: "Remove all effects", input: { nodeId: "1:23", effects: [] } }
    ]
  }),
  defineCommand({
    name: "rotate_node",
    description: "Rotate a node around its center point.",
    category: "modification",
    params: z.object({
      nodeId: NodeIdSchema,
      angle: z.number().min(-360).max(360).describe("Rotation angle in degrees. Positive = clockwise."),
      relative: z.boolean().optional().default(false).describe("If true, adds the angle to the current rotation. If false, sets an absolute rotation.")
    }),
    result: z.object({ id: z.string(), rotation: z.number() }),
    requiresChannel: true,
    cacheable: false,
    examples: [
      { description: "Rotate 45 degrees clockwise", input: { nodeId: "1:23", angle: 45 } },
      { description: "Add 90 degrees to current rotation", input: { nodeId: "1:23", angle: 90, relative: true } }
    ]
  }),
  defineCommand({
    name: "set_node_properties",
    description: "Set visibility, lock state, and/or opacity of a node.",
    category: "modification",
    params: z.object({
      nodeId: NodeIdSchema,
      visible: z.boolean().optional().describe("Show/hide the node"),
      locked: z.boolean().optional().describe("Lock/unlock the node (locked nodes can't be selected in Figma)"),
      opacity: z.number().min(0).max(1).optional().describe("Opacity (0\u20131). Affects the whole node including children.")
    }),
    result: z.object({ id: z.string() }),
    requiresChannel: true,
    cacheable: false
  }),
  defineCommand({
    name: "set_gradient",
    description: "Set a gradient fill on a node. Replaces any existing solid fill.",
    category: "modification",
    params: z.object({
      nodeId: NodeIdSchema,
      type: z.enum(["LINEAR", "RADIAL", "ANGULAR", "DIAMOND"]).describe("Gradient type"),
      stops: z.array(z.object({
        position: z.number().min(0).max(1).describe("Stop position (0 = start, 1 = end)"),
        color: ColorSchema
      })).min(2).describe("Color stops for the gradient (minimum 2)"),
      angle: z.number().optional().default(0).describe("Gradient angle in degrees (for LINEAR gradients)")
    }),
    result: z.object({ id: z.string() }),
    requiresChannel: true,
    cacheable: false,
    examples: [
      { description: "Blue to purple linear gradient", input: { nodeId: "1:23", type: "LINEAR", angle: 135, stops: [{ position: 0, color: { r: 0.2, g: 0.4, b: 1, a: 1 } }, { position: 1, color: { r: 0.6, g: 0.2, b: 0.8, a: 1 } }] } }
    ]
  }),
  defineCommand({
    name: "set_image",
    description: "Fill a node with an image from a URL or base64 data. Maximum image size: 5MB.",
    category: "modification",
    params: z.object({
      nodeId: NodeIdSchema,
      imageData: z.string().describe("Base64-encoded image data OR a URL starting with http:// or https://"),
      scaleMode: z.enum(["FILL", "FIT", "CROP", "TILE"]).optional().default("FILL").describe("How the image fills the node")
    }),
    result: z.object({ id: z.string() }),
    requiresChannel: true,
    cacheable: false
  }),
  defineCommand({
    name: "reorder_node",
    description: "Change the z-order (stacking position) of a node within its parent.",
    category: "modification",
    params: z.object({
      nodeId: NodeIdSchema,
      position: z.enum(["FRONT", "BACK", "FORWARD", "BACKWARD", "INDEX"]).describe("FRONT/BACK = move to top/bottom. FORWARD/BACKWARD = move one step. INDEX = move to specific index."),
      index: z.number().int().min(0).optional().describe("Target index when position='INDEX'")
    }),
    result: z.object({ id: z.string() }),
    requiresChannel: true,
    cacheable: false
  }),
  defineCommand({
    name: "convert_to_frame",
    description: "Convert a group or other container node to a frame.",
    category: "modification",
    params: z.object({
      nodeId: NodeIdSchema
    }),
    result: z.object({ id: z.string(), name: z.string() }),
    requiresChannel: true,
    cacheable: false
  }),
  defineCommand({
    name: "set_grid",
    description: "Set layout grids on a frame (column grids, row grids, or dot grids for alignment).",
    category: "modification",
    params: z.object({
      nodeId: NodeIdSchema,
      grids: z.array(z.discriminatedUnion("pattern", [
        z.object({
          pattern: z.literal("COLUMNS"),
          count: z.number().int().min(1),
          sectionSize: z.number().optional(),
          gutterSize: z.number().optional(),
          offset: z.number().optional(),
          color: ColorSchema.optional()
        }),
        z.object({
          pattern: z.literal("ROWS"),
          count: z.number().int().min(1),
          sectionSize: z.number().optional(),
          gutterSize: z.number().optional(),
          offset: z.number().optional(),
          color: ColorSchema.optional()
        }),
        z.object({
          pattern: z.literal("GRID"),
          sectionSize: z.number().min(1).describe("Grid cell size"),
          color: ColorSchema.optional()
        })
      ])).describe("Array of grids. Pass [] to remove all grids.")
    }),
    result: z.object({ id: z.string() }),
    requiresChannel: true,
    cacheable: false,
    examples: [
      { description: "12-column grid", input: { nodeId: "1:23", grids: [{ pattern: "COLUMNS", count: 12, gutterSize: 16, offset: 24 }] } }
    ]
  }),
  defineCommand({
    name: "get_grid",
    description: "Get the layout grids configured on a frame.",
    category: "modification",
    params: z.object({ nodeId: NodeIdSchema }),
    result: z.array(z.object({ pattern: z.string() }).passthrough()),
    requiresChannel: true,
    cacheable: true,
    cacheTtlMs: 3e3
  }),
  defineCommand({
    name: "set_annotation",
    description: "Add a design annotation/note to a node.",
    category: "modification",
    params: z.object({
      nodeId: NodeIdSchema,
      label: z.string().min(1).describe("Annotation text")
    }),
    result: z.object({ id: z.string() }),
    requiresChannel: true,
    cacheable: false
  }),
  defineCommand({
    name: "get_annotation",
    description: "Get the design annotation on a node.",
    category: "modification",
    params: z.object({ nodeId: NodeIdSchema }),
    result: z.object({ label: z.string().optional() }),
    requiresChannel: true,
    cacheable: true,
    cacheTtlMs: 3e3
  }),
  // ── Text ─────────────────────────────────────────────────
  defineCommand({
    name: "set_text_content",
    description: "Update the text content of a text node.",
    category: "text",
    params: z.object({
      nodeId: NodeIdSchema,
      text: z.string().describe("New text content")
    }),
    result: z.object({ id: z.string(), characters: z.string() }),
    requiresChannel: true,
    cacheable: false,
    examples: [
      { description: "Update a heading", input: { nodeId: "1:23", text: "New Heading" } }
    ]
  }),
  defineCommand({
    name: "set_multiple_text_contents",
    description: "Update text content for multiple text nodes at once. More efficient than calling set_text_content in a loop. Maps node IDs to their new text values.",
    category: "text",
    params: z.object({
      updates: z.array(z.object({
        nodeId: NodeIdSchema,
        text: z.string()
      })).min(1).max(100).describe("Array of { nodeId, text } pairs to update")
    }),
    result: z.object({
      updatedCount: z.number(),
      failedCount: z.number()
    }),
    requiresChannel: true,
    cacheable: false,
    examples: [
      { description: "Update 3 text nodes at once", input: { updates: [{ nodeId: "1:1", text: "Title" }, { nodeId: "1:2", text: "Subtitle" }, { nodeId: "1:3", text: "Body copy here" }] } }
    ]
  }),
  defineCommand({
    name: "set_font_name",
    description: "Change the font family and style of a text node.",
    category: "text",
    params: z.object({
      nodeId: NodeIdSchema,
      family: z.string().describe("Font family name (e.g. 'Inter', 'Roboto', 'SF Pro Display')"),
      style: z.string().optional().default("Regular").describe("Font style (e.g. 'Regular', 'Bold', 'Italic', 'SemiBold')")
    }),
    result: z.object({ id: z.string() }),
    requiresChannel: true,
    cacheable: false
  }),
  defineCommand({
    name: "set_font_size",
    description: "Set the font size of a text node.",
    category: "text",
    params: z.object({
      nodeId: NodeIdSchema,
      fontSize: z.number().min(1).max(1e3).describe("Font size in pixels")
    }),
    result: z.object({ id: z.string() }),
    requiresChannel: true,
    cacheable: false
  }),
  defineCommand({
    name: "set_font_weight",
    description: "Set the font weight of a text node.",
    category: "text",
    params: z.object({
      nodeId: NodeIdSchema,
      weight: z.enum(["Thin", "ExtraLight", "Light", "Regular", "Medium", "SemiBold", "Bold", "ExtraBold", "Black"]).describe("Font weight name")
    }),
    result: z.object({ id: z.string() }),
    requiresChannel: true,
    cacheable: false
  }),
  defineCommand({
    name: "set_letter_spacing",
    description: "Set the letter spacing (tracking) of a text node.",
    category: "text",
    params: z.object({
      nodeId: NodeIdSchema,
      letterSpacing: z.number().describe("Letter spacing value"),
      unit: z.enum(["PIXELS", "PERCENT"]).optional().default("PIXELS")
    }),
    result: z.object({ id: z.string() }),
    requiresChannel: true,
    cacheable: false
  }),
  defineCommand({
    name: "set_line_height",
    description: "Set the line height of a text node.",
    category: "text",
    params: z.object({
      nodeId: NodeIdSchema,
      lineHeight: z.number().positive().describe("Line height value"),
      unit: z.enum(["PIXELS", "PERCENT", "AUTO"]).optional().default("PIXELS")
    }),
    result: z.object({ id: z.string() }),
    requiresChannel: true,
    cacheable: false
  }),
  defineCommand({
    name: "set_text_align",
    description: "Set the horizontal and/or vertical text alignment of a text node.",
    category: "text",
    params: z.object({
      nodeId: NodeIdSchema,
      textAlignHorizontal: z.enum(["LEFT", "CENTER", "RIGHT", "JUSTIFIED"]).optional(),
      textAlignVertical: z.enum(["TOP", "CENTER", "BOTTOM"]).optional()
    }),
    result: z.object({ id: z.string() }),
    requiresChannel: true,
    cacheable: false
  }),
  defineCommand({
    name: "set_text_case",
    description: "Set the text case transformation of a text node.",
    category: "text",
    params: z.object({
      nodeId: NodeIdSchema,
      textCase: z.enum(["ORIGINAL", "UPPER", "LOWER", "TITLE"]).describe("ORIGINAL = no transformation. UPPER/LOWER/TITLE = force case.")
    }),
    result: z.object({ id: z.string() }),
    requiresChannel: true,
    cacheable: false
  }),
  defineCommand({
    name: "set_text_decoration",
    description: "Set text decoration (underline or strikethrough) on a text node.",
    category: "text",
    params: z.object({
      nodeId: NodeIdSchema,
      textDecoration: z.enum(["NONE", "UNDERLINE", "STRIKETHROUGH"])
    }),
    result: z.object({ id: z.string() }),
    requiresChannel: true,
    cacheable: false
  }),
  defineCommand({
    name: "set_paragraph_spacing",
    description: "Set the spacing between paragraphs in a text node.",
    category: "text",
    params: z.object({
      nodeId: NodeIdSchema,
      paragraphSpacing: z.number().min(0).describe("Space between paragraphs in pixels")
    }),
    result: z.object({ id: z.string() }),
    requiresChannel: true,
    cacheable: false
  }),
  defineCommand({
    name: "get_styled_text_segments",
    description: "Get the styled segments of a mixed-format text node (e.g. bold + regular in same node). Returns per-segment style properties.",
    category: "text",
    params: z.object({
      nodeId: NodeIdSchema,
      property: z.enum(["fontSize", "fontName", "fills", "letterSpacing", "lineHeight", "paragraphSpacing", "textCase", "textDecoration", "textStyleId", "listOptions"]).describe("Which style property to inspect across segments")
    }),
    result: z.array(z.object({
      characters: z.string(),
      start: z.number(),
      end: z.number()
    }).passthrough()),
    requiresChannel: true,
    cacheable: true,
    cacheTtlMs: 3e3
  }),
  defineCommand({
    name: "set_text_style_id",
    description: "Apply a text style from the document's style library to a text node.",
    category: "text",
    params: z.object({
      nodeId: NodeIdSchema,
      textStyleId: z.string().describe("ID of the text style to apply (from get_styles)")
    }),
    result: z.object({ id: z.string() }),
    requiresChannel: true,
    cacheable: false
  }),
  defineCommand({
    name: "load_font_async",
    description: "Pre-load a font into the Figma document before using it. Required before setting fonts that are not already in the document.",
    category: "text",
    params: z.object({
      family: z.string().describe("Font family name"),
      style: z.string().optional().default("Regular").describe("Font style")
    }),
    result: z.object({ loaded: z.boolean() }),
    requiresChannel: true,
    cacheable: false
  }),
  // ── Components ────────────────────────────────────────────
  defineCommand({
    name: "get_remote_components",
    description: "Get components available from team libraries connected to this document.",
    category: "component",
    params: z.object({}),
    result: z.array(z.object({
      key: z.string(),
      name: z.string(),
      description: z.string()
    })),
    requiresChannel: true,
    cacheable: true,
    cacheTtlMs: 3e4
  }),
  defineCommand({
    name: "create_component_instance",
    description: "Create an instance of a component (local or from a team library). Use get_local_components to find component keys.",
    category: "component",
    params: z.object({
      componentKey: z.string().describe("Component key (from get_local_components or get_remote_components)"),
      x: z.number().optional().default(0),
      y: z.number().optional().default(0),
      parentId: NodeIdSchema.optional()
    }),
    result: z.object({ id: z.string(), name: z.string() }),
    requiresChannel: true,
    cacheable: false,
    examples: [
      { description: "Place a button component", input: { componentKey: "abc123def456", x: 100, y: 200 } }
    ]
  }),
  defineCommand({
    name: "create_component_from_node",
    description: "Convert an existing node into a reusable component.",
    category: "component",
    params: z.object({
      nodeId: NodeIdSchema,
      name: z.string().optional().describe("Name for the new component. Defaults to the node's name.")
    }),
    result: z.object({ id: z.string(), key: z.string(), name: z.string() }),
    requiresChannel: true,
    cacheable: false
  }),
  defineCommand({
    name: "create_component_set",
    description: "Combine multiple components into a component set (variants group).",
    category: "component",
    params: z.object({
      componentIds: z.array(NodeIdSchema).min(2).describe("IDs of components to group as variants"),
      name: z.string().optional().describe("Name for the component set")
    }),
    result: z.object({ id: z.string(), name: z.string() }),
    requiresChannel: true,
    cacheable: false
  }),
  defineCommand({
    name: "set_instance_variant",
    description: "Switch the variant of a component instance (e.g. change Button state from Default to Hover).",
    category: "component",
    params: z.object({
      nodeId: NodeIdSchema.describe("ID of the component instance"),
      properties: z.record(z.string(), z.string()).describe("Variant property key-value pairs (e.g. { State: 'Hover', Size: 'Large' })")
    }),
    result: z.object({ id: z.string() }),
    requiresChannel: true,
    cacheable: false,
    examples: [
      { description: "Switch button to hover state", input: { nodeId: "1:23", properties: { State: "Hover" } } }
    ]
  }),
  defineCommand({
    name: "set_effect_style_id",
    description: "Apply an effect style from the document's style library to a node.",
    category: "component",
    params: z.object({
      nodeId: NodeIdSchema,
      effectStyleId: z.string().describe("ID of the effect style (from get_styles)")
    }),
    result: z.object({ id: z.string() }),
    requiresChannel: true,
    cacheable: false
  }),
  // ── SVG ──────────────────────────────────────────────────
  defineCommand({
    name: "set_svg",
    description: "Insert an SVG as a vector node on the canvas. The SVG string must be valid XML. Maximum size: 500KB.",
    category: "svg",
    params: z.object({
      svgString: z.string().describe("Valid SVG XML string"),
      x: z.number().optional().default(0),
      y: z.number().optional().default(0),
      name: z.string().optional().describe("Layer name for the SVG node"),
      parentId: NodeIdSchema.optional()
    }),
    result: z.object({ id: z.string(), name: z.string() }),
    requiresChannel: true,
    cacheable: false
  }),
  defineCommand({
    name: "get_svg",
    description: "Export a node as an SVG string. Works best with vector shapes.",
    category: "svg",
    params: z.object({
      nodeId: NodeIdSchema
    }),
    result: z.object({ svg: z.string() }),
    requiresChannel: true,
    cacheable: false
  }),
  // ── Variables ─────────────────────────────────────────────
  defineCommand({
    name: "get_variables",
    description: "Get all Figma Variables (design tokens) defined in the document: colors, numbers, strings, booleans. Returns variable IDs needed for apply_variable_to_node.",
    category: "variable",
    params: z.object({}),
    result: z.object({
      collections: z.array(z.object({
        id: z.string(),
        name: z.string(),
        modes: z.array(z.object({ modeId: z.string(), name: z.string() })),
        variables: z.array(z.object({
          id: z.string(),
          name: z.string(),
          resolvedType: z.enum(["COLOR", "FLOAT", "STRING", "BOOLEAN"])
        }))
      }))
    }),
    requiresChannel: true,
    cacheable: true,
    cacheTtlMs: 1e4
  }),
  defineCommand({
    name: "set_variable",
    description: "Create or update a Figma Variable (design token).",
    category: "variable",
    params: z.object({
      collectionId: z.string().optional().describe("Variable collection ID. Specify either this or collectionName."),
      collectionName: z.string().optional().describe("Variable collection name. Creates a new collection if it doesn't exist."),
      name: z.string().min(1).describe("Variable name"),
      resolvedType: z.enum(["COLOR", "FLOAT", "STRING", "BOOLEAN"]).describe("Variable type"),
      value: z.union([ColorSchema, z.number(), z.string(), z.boolean()]).describe("Variable value"),
      modeId: z.string().optional().describe("Mode ID to set the value for. Defaults to the default mode.")
    }),
    result: z.object({ id: z.string(), name: z.string() }),
    requiresChannel: true,
    cacheable: false
  }),
  defineCommand({
    name: "apply_variable_to_node",
    description: "Bind a Figma Variable to a node property. This links the node's property to the design token so it updates when the variable changes.",
    category: "variable",
    params: z.object({
      nodeId: NodeIdSchema,
      variableId: z.string().describe("ID of the variable to bind (from get_variables)"),
      field: z.string().describe("Node field to bind (e.g. 'fills', 'strokes', 'width', 'height', 'opacity', 'characters')")
    }),
    result: z.object({ id: z.string() }),
    requiresChannel: true,
    cacheable: false
  }),
  defineCommand({
    name: "switch_variable_mode",
    description: "Switch a frame/page to a different variable mode (e.g. Light \u2194 Dark theme).",
    category: "variable",
    params: z.object({
      nodeId: NodeIdSchema,
      collectionId: z.string().describe("Variable collection ID"),
      modeId: z.string().describe("Mode ID to switch to")
    }),
    result: z.object({ id: z.string() }),
    requiresChannel: true,
    cacheable: false
  }),
  // ── Batch ─────────────────────────────────────────────────
  defineCommand({
    name: "batch_execute",
    description: "Execute multiple Figma commands in a single round-trip \u2014 the most efficient way to make bulk changes. ALWAYS prefer this over calling individual tools in a loop. Example use cases: change 20 colors, create a full UI layout, update multiple text nodes. Set stopOnError=false to collect all results even when some operations fail (non-atomic). Set stopOnError=true (default) to stop on first failure.",
    category: "batch",
    params: z.object({
      operations: z.array(z.object({
        command: z.string().describe("Command name (e.g. 'set_fill_color')"),
        params: z.record(z.string(), z.unknown()).describe("Command parameters")
      })).min(1).max(100).describe("Array of operations to execute (max 100)"),
      stopOnError: z.boolean().optional().default(true).describe("Stop on first error (true) or collect all results (false)")
    }),
    result: z.object({
      results: z.array(z.object({
        index: z.number(),
        command: z.string(),
        success: z.boolean(),
        result: z.unknown().optional(),
        error: z.string().optional()
      })),
      successCount: z.number(),
      errorCount: z.number()
    }),
    requiresChannel: true,
    cacheable: false,
    examples: [
      {
        description: "Create a frame then add text inside it",
        input: {
          operations: [
            { command: "create_frame", params: { x: 0, y: 0, width: 375, height: 812, name: "Screen" } },
            { command: "create_text", params: { x: 24, y: 48, text: "Hello", fontSize: 24, fontWeight: "Bold" } }
          ]
        }
      },
      {
        description: "Update 3 colors at once",
        input: {
          operations: [
            { command: "set_fill_color", params: { nodeId: "1:1", r: 0.2, g: 0.4, b: 1 } },
            { command: "set_fill_color", params: { nodeId: "1:2", r: 0.95, g: 0.2, b: 0.2 } },
            { command: "set_fill_color", params: { nodeId: "1:3", r: 0.1, g: 0.8, b: 0.4 } }
          ],
          stopOnError: false
        }
      }
    ]
  })
];
var COMMAND_MAP = new Map(
  COMMAND_REGISTRY.map((def) => [def.name, def])
);

// src/plugin-bridge.ts
import { WebSocketServer, WebSocket } from "ws";
import { randomUUID } from "crypto";
var DEFAULT_COMMAND_TIMEOUT_MS = Number(
  process.env["COMMAND_TIMEOUT_MS"] ?? 3e4
);
var PluginBridge = class {
  wss;
  pluginSocket = null;
  pending = /* @__PURE__ */ new Map();
  _progressCallback;
  constructor(port) {
    this.wss = new WebSocketServer({ port, host: "127.0.0.1" });
    this.wss.on("connection", (ws) => {
      process.stderr.write("[figma-mcp] Figma plugin connected\n");
      if (this.pluginSocket?.readyState === WebSocket.OPEN) {
        this.pluginSocket.close();
      }
      this.pluginSocket = ws;
      ws.send(JSON.stringify({ type: "connected" }));
      ws.on("message", (data) => {
        this.handleMessage(data.toString());
      });
      ws.on("close", () => {
        process.stderr.write("[figma-mcp] Figma plugin disconnected\n");
        if (this.pluginSocket === ws) this.pluginSocket = null;
        this.rejectAllPending(
          new FigmaMcpError(
            "Figma plugin disconnected.",
            "RELAY_DISCONNECTED" /* RELAY_DISCONNECTED */
          )
        );
      });
      ws.on("error", (err) => {
        process.stderr.write(`[figma-mcp] Plugin socket error: ${err.message}
`);
      });
    });
    this.wss.on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        process.stderr.write(
          `[figma-mcp] Port ${port} already in use. Set FIGMA_MCP_PORT to a different port and restart.
`
        );
      } else {
        process.stderr.write(`[figma-mcp] WebSocket server error: ${err.message}
`);
      }
    });
  }
  get isConnected() {
    return this.pluginSocket?.readyState === WebSocket.OPEN;
  }
  /**
   * Send a command to the connected Figma plugin and wait for its response.
   * Throws FigmaMcpError(NO_CHANNEL) if no plugin is connected.
   * Throws FigmaMcpError(PLUGIN_TIMEOUT) if the plugin doesn't respond in time.
   */
  sendCommand(command, params, timeoutMs = DEFAULT_COMMAND_TIMEOUT_MS) {
    if (!this.isConnected) {
      throw new FigmaMcpError(
        "No Figma plugin connected. Open the Figma plugin in Figma Desktop \u2014 it connects automatically.",
        "NO_CHANNEL" /* NO_CHANNEL */
      );
    }
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(
          new FigmaMcpError(
            `Command '${command}' timed out after ${timeoutMs}ms. Ensure the Figma plugin is open.`,
            "PLUGIN_TIMEOUT" /* PLUGIN_TIMEOUT */
          )
        );
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.pluginSocket.send(JSON.stringify({ id, command, params }));
    });
  }
  onProgress(callback) {
    this._progressCallback = callback;
  }
  close() {
    this.rejectAllPending(
      new FigmaMcpError("Server shutting down.", "RELAY_DISCONNECTED" /* RELAY_DISCONNECTED */)
    );
    this.wss.close();
  }
  // ── Private ──────────────────────────────────────────────────
  handleMessage(raw) {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (msg["type"] === "progress" && this._progressCallback) {
      this._progressCallback(msg["data"]);
      return;
    }
    const id = msg["id"];
    if (!id) return;
    const pending = this.pending.get(id);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(id);
    if ("error" in msg) {
      pending.reject(new Error(msg["error"]));
    } else {
      pending.resolve(msg["result"]);
    }
  }
  rejectAllPending(error) {
    for (const [id, req] of this.pending) {
      clearTimeout(req.timer);
      req.reject(error);
      this.pending.delete(id);
    }
  }
};

// src/cache.ts
var DEFAULT_TTL_MS = Number(process.env["CACHE_DEFAULT_TTL_MS"] ?? 5e3);
var TtlCache = class _TtlCache {
  constructor(defaultTtlMs = DEFAULT_TTL_MS) {
    this.defaultTtlMs = defaultTtlMs;
    this.cleanupInterval = setInterval(() => this.evictExpired(), 6e4);
  }
  defaultTtlMs;
  store = /* @__PURE__ */ new Map();
  cleanupInterval = null;
  static key(command, params) {
    return `${command}:${JSON.stringify(params)}`;
  }
  get(command, params) {
    const key = _TtlCache.key(command, params);
    const entry = this.store.get(key);
    if (!entry) return void 0;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return void 0;
    }
    return entry.value;
  }
  set(command, params, value, ttlMs) {
    const key = _TtlCache.key(command, params);
    this.store.set(key, {
      value,
      expiresAt: Date.now() + (ttlMs ?? this.defaultTtlMs)
    });
  }
  evictExpired() {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now > entry.expiresAt) this.store.delete(key);
    }
  }
  clear() {
    this.store.clear();
  }
  get size() {
    return this.store.size;
  }
  destroy() {
    if (this.cleanupInterval !== null) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.store.clear();
  }
};

// src/session-store.ts
var SessionStore = class {
  constructor(bridge2) {
    this.bridge = bridge2;
    this.cache = new TtlCache();
  }
  bridge;
  cache;
  get isConnected() {
    return this.bridge.isConnected;
  }
  get pluginBridge() {
    return this.bridge;
  }
  cleanup() {
    this.cache.destroy();
  }
};

// src/tools/channel.ts
import { z as z2 } from "zod";
function registerJoinChannel(server, sessionStore2) {
  server.tool(
    "join_channel",
    "Verify the Figma plugin is connected. Open the Figma plugin in Figma Desktop and it connects automatically to this server. Call this tool before using other Figma tools to confirm the plugin is ready.",
    // No params required — the plugin auto-connects
    { channel: z2.string().optional().describe("Not used in local mode. Ignored if provided.") },
    async (_args) => {
      if (!sessionStore2.isConnected) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `No Figma plugin connected. Open the Figma plugin in Figma Desktop \u2014 it will connect automatically to ws://localhost:${process.env["FIGMA_MCP_PORT"] ?? "3001"}.`
            }
          ]
        };
      }
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ status: "connected" })
          }
        ]
      };
    }
  );
}

// src/tool-factory.ts
var ToolFactory = class {
  constructor(server, sessionStore2) {
    this.server = server;
    this.sessionStore = sessionStore2;
  }
  server;
  sessionStore;
  registerAll(registry) {
    for (const def of registry) {
      if (def.category === "channel") {
        registerJoinChannel(this.server, this.sessionStore);
      } else {
        this.registerStandardTool(def);
      }
    }
  }
  registerStandardTool(def) {
    const paramsShape = def.params.shape;
    this.server.tool(
      def.name,
      def.description,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      paramsShape,
      async (args) => {
        if (def.requiresChannel && !this.sessionStore.isConnected) {
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: "No Figma plugin connected. Open the Figma plugin in Figma Desktop \u2014 it connects automatically."
              }
            ]
          };
        }
        if (def.cacheable) {
          const cached = this.sessionStore.cache.get(def.name, args);
          if (cached !== void 0) {
            return {
              content: [{ type: "text", text: JSON.stringify(cached ?? null) }]
            };
          }
        }
        try {
          const result = await this.sessionStore.pluginBridge.sendCommand(
            def.name,
            args
          );
          const parsed = def.result.safeParse(result);
          if (!parsed.success) {
            process.stderr.write(
              `[tool-factory] Result validation warning for '${def.name}': ${parsed.error.message}
`
            );
          }
          if (def.cacheable) {
            this.sessionStore.cache.set(def.name, args, result, def.cacheTtlMs);
          }
          return {
            content: [{ type: "text", text: JSON.stringify(result ?? null) }]
          };
        } catch (err) {
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: err instanceof Error ? err.message : String(err)
              }
            ]
          };
        }
      }
    );
  }
};

// src/index.ts
var PLUGIN_WS_PORT = Number(process.env["FIGMA_MCP_PORT"] ?? 3001);
var bridge = new PluginBridge(PLUGIN_WS_PORT);
process.stderr.write(
  `[figma-mcp] Plugin WebSocket server on ws://localhost:${PLUGIN_WS_PORT}
`
);
process.stderr.write(
  `[figma-mcp] Open the Figma plugin \u2014 it will connect automatically
`
);
var sessionStore = new SessionStore(bridge);
var mcpServer = new McpServer({ name: "figma-mcp", version: "3.0.4" });
var factory = new ToolFactory(mcpServer, sessionStore);
factory.registerAll(COMMAND_REGISTRY);
var transport = new StdioServerTransport();
await mcpServer.connect(transport);
process.stderr.write(`[figma-mcp] stdio mode \u2014 ready
`);
process.on("SIGINT", () => {
  bridge.close();
  process.exit(0);
});
process.on("SIGTERM", () => {
  bridge.close();
  process.exit(0);
});
