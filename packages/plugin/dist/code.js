"use strict";
(() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropSymbols = Object.getOwnPropertySymbols;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __propIsEnum = Object.prototype.propertyIsEnumerable;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __spreadValues = (a, b) => {
    for (var prop in b || (b = {}))
      if (__hasOwnProp.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    if (__getOwnPropSymbols)
      for (var prop of __getOwnPropSymbols(b)) {
        if (__propIsEnum.call(b, prop))
          __defNormalProp(a, prop, b[prop]);
      }
    return a;
  };

  // src/dispatcher.ts
  var Dispatcher = class {
    constructor() {
      this.handlers = /* @__PURE__ */ new Map();
    }
    /** Register a handler for a command name. Overwrites if already registered. */
    register(name, handler) {
      this.handlers.set(name, handler);
    }
    /** Register multiple handlers at once from an object map. */
    registerAll(map) {
      for (const [name, handler] of Object.entries(map)) {
        this.handlers.set(name, handler);
      }
    }
    /**
     * Dispatch a command to its handler.
     * @throws Error if no handler is registered for the command name.
     */
    async dispatch(command, params) {
      const handler = this.handlers.get(command);
      if (!handler) {
        const known = [...this.handlers.keys()].join(", ");
        throw new Error(
          `Unknown command: "${command}". Registered commands: ${known}`
        );
      }
      return handler(params);
    }
    /** Returns true if a handler exists for the given command name. */
    has(name) {
      return this.handlers.has(name);
    }
    /** Number of registered handlers. */
    get size() {
      return this.handlers.size;
    }
  };
  var dispatcher = new Dispatcher();

  // src/utils/node-helpers.ts
  function requireNode(nodeId) {
    const node = figma.getNodeById(nodeId);
    if (!node) {
      throw new Error(
        `Node not found: "${nodeId}". The node may have been deleted or the ID is incorrect. Call get_selection or get_node_info to find valid IDs.`
      );
    }
    if (node.type === "DOCUMENT" || node.type === "PAGE") {
      throw new Error(
        `Node "${nodeId}" is a ${node.type}, not a scene node. Use page management commands for pages.`
      );
    }
    return node;
  }
  function requirePage(pageId) {
    const node = figma.getNodeById(pageId);
    if (!node || node.type !== "PAGE") {
      throw new Error(`Page not found: "${pageId}".`);
    }
    return node;
  }
  function appendToParent(node, parentId) {
    if (parentId) {
      const parent = figma.getNodeById(parentId);
      if (parent && "appendChild" in parent) {
        parent.appendChild(node);
        return node;
      }
    }
    figma.currentPage.appendChild(node);
    return node;
  }
  function serializeNode(node) {
    var _a;
    const result = {
      id: node.id,
      name: node.name,
      type: node.type
    };
    const n = node;
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
      result.strokeWeight = n.strokeWeight;
    }
    if ("cornerRadius" in n && typeof n.cornerRadius !== "symbol") {
      result.cornerRadius = n.cornerRadius;
    }
    if (n.type === "TEXT") {
      result.characters = n.characters;
      if (typeof n.fontSize !== "symbol") result.fontSize = n.fontSize;
      if (typeof n.fontName !== "symbol") result.fontName = n.fontName;
      result.textAlignHorizontal = n.textAlignHorizontal;
    }
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
    if ("exportSettings" in n && ((_a = n.exportSettings) == null ? void 0 : _a.length)) {
      result.exportSettings = n.exportSettings;
    }
    if ("children" in n && n.children) {
      result.childrenCount = n.children.length;
      result.children = n.children.map((c) => ({
        id: c.id,
        name: c.name,
        type: c.type
      }));
    }
    return result;
  }

  // src/handlers/document.ts
  function registerDocumentHandlers(dispatcher2) {
    dispatcher2.register("get_document_info", async () => {
      const doc = figma.root;
      return {
        name: doc.name,
        id: doc.id,
        currentPage: {
          id: figma.currentPage.id,
          name: figma.currentPage.name
        },
        pages: doc.children.map((p) => ({
          id: p.id,
          name: p.name,
          childCount: "children" in p ? p.children.length : 0
        }))
      };
    });
    dispatcher2.register("get_selection", async () => {
      return figma.currentPage.selection.map((node) => serializeNode(node));
    });
    dispatcher2.register("get_node_info", async (params) => {
      const nodeId = params["nodeId"];
      const node = requireNode(nodeId);
      return serializeNode(node);
    });
    dispatcher2.register("get_nodes_info", async (params) => {
      const nodeIds = params["nodeIds"];
      return nodeIds.map((id) => {
        const node = figma.getNodeById(id);
        if (!node || node.type === "DOCUMENT" || node.type === "PAGE") return null;
        return serializeNode(node);
      });
    });
    dispatcher2.register("get_styles", async () => {
      const toRef = (s) => ({
        id: s.id,
        name: s.name,
        description: s.description
      });
      return {
        paintStyles: figma.getLocalPaintStyles().map(toRef),
        textStyles: figma.getLocalTextStyles().map(toRef),
        effectStyles: figma.getLocalEffectStyles().map(toRef),
        gridStyles: figma.getLocalGridStyles().map(toRef)
      };
    });
    dispatcher2.register("scan_text_nodes", async (params) => {
      const nodeId = params["nodeId"];
      const root = nodeId ? requireNode(nodeId) : figma.currentPage;
      const textNodes = "findAll" in root ? root.findAll((n) => n.type === "TEXT") : [];
      return textNodes.map((n) => ({
        id: n.id,
        name: n.name,
        characters: n.characters,
        fontSize: typeof n.fontSize === "symbol" ? void 0 : n.fontSize,
        fontFamily: typeof n.fontName === "symbol" ? void 0 : n.fontName.family
      }));
    });
    dispatcher2.register("export_node_as_image", async (params) => {
      var _a, _b, _c;
      const nodeId = params["nodeId"];
      const format = (_a = params["format"]) != null ? _a : "PNG";
      const scale = (_b = params["scale"]) != null ? _b : 1;
      const node = requireNode(nodeId);
      let settings;
      if (format === "SVG") {
        settings = { format: "SVG" };
      } else if (format === "PDF") {
        settings = { format: "PDF" };
      } else {
        settings = {
          format,
          constraint: { type: "SCALE", value: scale }
        };
      }
      const bytes = await node.exportAsync(settings);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const data = btoa(binary);
      const mimeTypes = {
        PNG: "image/png",
        JPG: "image/jpeg",
        SVG: "image/svg+xml",
        PDF: "application/pdf"
      };
      return { nodeId, format, data, mimeType: (_c = mimeTypes[format]) != null ? _c : "application/octet-stream" };
    });
  }

  // src/utils/color.ts
  function toSolidPaint(r, g, b, a = 1) {
    return {
      type: "SOLID",
      color: { r, g, b },
      // CRITICAL: use `a` directly — NOT `a || 1`.
      // `a || 1` would convert transparent (a=0) to opaque.
      opacity: a
    };
  }

  // src/handlers/creation.ts
  function applyFillColor(node, color) {
    var _a;
    if (!color) return;
    node.fills = [toSolidPaint(color.r, color.g, color.b, (_a = color.a) != null ? _a : 1)];
  }
  function registerCreationHandlers(dispatcher2) {
    dispatcher2.register("create_frame", async (params) => {
      var _a, _b, _c;
      const x = (_a = params["x"]) != null ? _a : 0;
      const y = (_b = params["y"]) != null ? _b : 0;
      const width = params["width"];
      const height = params["height"];
      const name = (_c = params["name"]) != null ? _c : "Frame";
      const parentId = params["parentId"];
      const fillColor = params["fillColor"];
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
        height: frame.height
      };
    });
    dispatcher2.register("create_rectangle", async (params) => {
      var _a, _b, _c;
      const x = (_a = params["x"]) != null ? _a : 0;
      const y = (_b = params["y"]) != null ? _b : 0;
      const width = params["width"];
      const height = params["height"];
      const name = (_c = params["name"]) != null ? _c : "Rectangle";
      const cornerRadius = params["cornerRadius"];
      const parentId = params["parentId"];
      const fillColor = params["fillColor"];
      const rect = figma.createRectangle();
      rect.x = x;
      rect.y = y;
      rect.resize(width, height);
      rect.name = name;
      if (cornerRadius !== void 0) rect.cornerRadius = cornerRadius;
      applyFillColor(rect, fillColor);
      appendToParent(rect, parentId);
      return { id: rect.id, name: rect.name, x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    });
    dispatcher2.register("create_ellipse", async (params) => {
      var _a, _b, _c;
      const x = (_a = params["x"]) != null ? _a : 0;
      const y = (_b = params["y"]) != null ? _b : 0;
      const width = params["width"];
      const height = params["height"];
      const name = (_c = params["name"]) != null ? _c : "Ellipse";
      const parentId = params["parentId"];
      const fillColor = params["fillColor"];
      const ellipse = figma.createEllipse();
      ellipse.x = x;
      ellipse.y = y;
      ellipse.resize(width, height);
      ellipse.name = name;
      applyFillColor(ellipse, fillColor);
      appendToParent(ellipse, parentId);
      return { id: ellipse.id, name: ellipse.name, x: ellipse.x, y: ellipse.y, width: ellipse.width, height: ellipse.height };
    });
    dispatcher2.register("create_polygon", async (params) => {
      var _a, _b, _c;
      const x = (_a = params["x"]) != null ? _a : 0;
      const y = (_b = params["y"]) != null ? _b : 0;
      const width = params["width"];
      const height = params["height"];
      const sides = params["sides"];
      const name = (_c = params["name"]) != null ? _c : "Polygon";
      const parentId = params["parentId"];
      const fillColor = params["fillColor"];
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
    dispatcher2.register("create_star", async (params) => {
      var _a, _b, _c, _d, _e;
      const x = (_a = params["x"]) != null ? _a : 0;
      const y = (_b = params["y"]) != null ? _b : 0;
      const width = params["width"];
      const height = params["height"];
      const points = (_c = params["points"]) != null ? _c : 5;
      const innerRadius = (_d = params["innerRadius"]) != null ? _d : 0.5;
      const name = (_e = params["name"]) != null ? _e : "Star";
      const parentId = params["parentId"];
      const fillColor = params["fillColor"];
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
    dispatcher2.register("create_text", async (params) => {
      var _a, _b, _c, _d, _e, _f, _g;
      const x = (_a = params["x"]) != null ? _a : 0;
      const y = (_b = params["y"]) != null ? _b : 0;
      const text = params["text"];
      const fontSize = (_c = params["fontSize"]) != null ? _c : 16;
      const fontFamily = (_d = params["fontFamily"]) != null ? _d : "Inter";
      const fontWeight = (_e = params["fontWeight"]) != null ? _e : "Regular";
      const textAlignHorizontal = params["textAlignHorizontal"];
      const name = (_f = params["name"]) != null ? _f : text;
      const parentId = params["parentId"];
      const fillColor = params["fillColor"];
      const fontName = { family: fontFamily, style: fontWeight };
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
        textNode.fills = [toSolidPaint(fillColor.r, fillColor.g, fillColor.b, (_g = fillColor.a) != null ? _g : 1)];
      }
      appendToParent(textNode, parentId);
      return { id: textNode.id, name: textNode.name };
    });
    dispatcher2.register("clone_node", async (params) => {
      const nodeId = params["nodeId"];
      const x = params["x"];
      const y = params["y"];
      const parentId = params["parentId"];
      const original = requireNode(nodeId);
      const clone = original.clone();
      clone.x = x != null ? x : original.x + 10;
      clone.y = y != null ? y : original.y + 10;
      if (parentId) {
        appendToParent(clone, parentId);
      }
      return { id: clone.id, name: clone.name };
    });
    dispatcher2.register("group_nodes", async (params) => {
      var _a, _b;
      const nodeIds = params["nodeIds"];
      const name = (_a = params["name"]) != null ? _a : "Group";
      if (!nodeIds || nodeIds.length < 2) {
        throw new Error("group_nodes requires at least 2 nodeIds.");
      }
      const nodes = nodeIds.map((id) => requireNode(id));
      const parent = (_b = nodes[0].parent) != null ? _b : figma.currentPage;
      const group = figma.group(nodes, parent);
      group.name = name;
      return { id: group.id, name: group.name };
    });
    dispatcher2.register("ungroup_nodes", async (params) => {
      const nodeId = params["nodeId"];
      const node = requireNode(nodeId);
      if (node.type !== "GROUP") {
        throw new Error(`Node "${nodeId}" is not a GROUP (it's a ${node.type})`);
      }
      const group = node;
      const childCount = "children" in group ? group.children.length : 0;
      figma.ungroup(group);
      return { ungroupedCount: childCount };
    });
    dispatcher2.register("flatten_node", async (params) => {
      const nodeId = params["nodeId"];
      const node = requireNode(nodeId);
      const flat = figma.flatten([node]);
      return { id: flat.id, name: flat.name };
    });
    dispatcher2.register("boolean_operation", async (params) => {
      var _a;
      const nodeIds = params["nodeIds"];
      const operation = params["operation"];
      const name = params["name"];
      if (!nodeIds || nodeIds.length < 2) {
        throw new Error("boolean_operation requires at least 2 nodeIds.");
      }
      const nodes = nodeIds.map((id) => requireNode(id));
      const parent = (_a = nodes[0].parent) != null ? _a : figma.currentPage;
      let result;
      switch (operation) {
        case "UNION":
          result = figma.union(nodes, parent);
          break;
        case "SUBTRACT":
          result = figma.subtract(nodes, parent);
          break;
        case "INTERSECT":
          result = figma.intersect(nodes, parent);
          break;
        case "EXCLUDE":
          result = figma.exclude(nodes, parent);
          break;
      }
      if (name) result.name = name;
      return { id: result.id, name: result.name };
    });
    dispatcher2.register("insert_child", async (params) => {
      const parentId = params["parentId"];
      const childId = params["childId"];
      const index = params["index"];
      const parent = requireNode(parentId);
      const child = requireNode(childId);
      if (!("insertChild" in parent)) {
        throw new Error(`Node "${parentId}" (${parent.type}) cannot contain children.`);
      }
      const parentMixin = parent;
      if (index !== void 0) {
        parentMixin.insertChild(index, child);
      } else {
        parentMixin.appendChild(child);
      }
      return { success: true };
    });
  }

  // src/handlers/modification.ts
  function angleToGradientTransform(angleDeg) {
    const rad = angleDeg * Math.PI / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    return [
      [cos, -sin, 0.5 - 0.5 * cos + 0.5 * sin],
      [sin, cos, 0.5 - 0.5 * sin - 0.5 * cos]
    ];
  }
  function collectFillNodes(node) {
    const result = [];
    if ("fills" in node && Array.isArray(node.fills)) {
      result.push(node);
    }
    if ("children" in node) {
      for (const child of node.children) {
        result.push(...collectFillNodes(child));
      }
    }
    return result;
  }
  function colorsMatch(a, b, tolerance) {
    return Math.abs(a.r - b.r) <= tolerance && Math.abs(a.g - b.g) <= tolerance && Math.abs(a.b - b.b) <= tolerance;
  }
  function registerModificationHandlers(dispatcher2) {
    dispatcher2.register("set_fill_color", async (params) => {
      var _a;
      const nodeId = params["nodeId"];
      const r = params["r"];
      const g = params["g"];
      const b = params["b"];
      const a = (_a = params["a"]) != null ? _a : 1;
      const node = requireNode(nodeId);
      if (!("fills" in node)) throw new Error(`Node type ${node.type} does not support fills.`);
      node.fills = [toSolidPaint(r, g, b, a)];
      return { id: node.id, name: node.name };
    });
    dispatcher2.register("set_stroke_color", async (params) => {
      var _a, _b;
      const nodeId = params["nodeId"];
      const r = params["r"];
      const g = params["g"];
      const b = params["b"];
      const a = (_a = params["a"]) != null ? _a : 1;
      const strokeWeight = (_b = params["strokeWeight"]) != null ? _b : 1;
      const node = requireNode(nodeId);
      if (!("strokes" in node)) throw new Error(`Node type ${node.type} does not support strokes.`);
      const n = node;
      if (strokeWeight === 0) {
        n.strokes = [];
      } else {
        n.strokes = [toSolidPaint(r, g, b, a)];
        n.strokeWeight = strokeWeight;
      }
      return { id: node.id, name: node.name };
    });
    dispatcher2.register("set_selection_colors", async (params) => {
      var _a;
      const nodeId = params["nodeId"];
      const sourceColor = params["sourceColor"];
      const targetColor = params["targetColor"];
      const tolerance = (_a = params["tolerance"]) != null ? _a : 0.01;
      const root = requireNode(nodeId);
      const fillNodes = collectFillNodes(root);
      let replacedCount = 0;
      for (const n of fillNodes) {
        const paints = n.fills;
        if (!Array.isArray(paints)) continue;
        const newFills = paints.map((paint) => {
          var _a2;
          if (paint.type !== "SOLID") return paint;
          if (colorsMatch(paint.color, sourceColor, tolerance)) {
            replacedCount++;
            return toSolidPaint(targetColor.r, targetColor.g, targetColor.b, (_a2 = targetColor.a) != null ? _a2 : 1);
          }
          return paint;
        });
        n.fills = newFills;
      }
      return { replacedCount };
    });
    dispatcher2.register("move_node", async (params) => {
      const nodeId = params["nodeId"];
      const x = params["x"];
      const y = params["y"];
      const node = requireNode(nodeId);
      node.x = x;
      node.y = y;
      return { id: node.id, x: node.x, y: node.y };
    });
    dispatcher2.register("resize_node", async (params) => {
      const nodeId = params["nodeId"];
      const width = params["width"];
      const height = params["height"];
      const node = requireNode(nodeId);
      if (!("resize" in node)) throw new Error(`Node type ${node.type} cannot be resized.`);
      node.resize(width, height);
      return { id: node.id, width: node.width, height: node.height };
    });
    dispatcher2.register("rename_node", async (params) => {
      const nodeId = params["nodeId"];
      const name = params["name"];
      const node = requireNode(nodeId);
      node.name = name;
      return { id: node.id, name: node.name };
    });
    dispatcher2.register("delete_node", async (params) => {
      const nodeId = params["nodeId"];
      const node = requireNode(nodeId);
      node.remove();
      return { deleted: true };
    });
    dispatcher2.register("set_corner_radius", async (params) => {
      const nodeId = params["nodeId"];
      const radius = params["radius"];
      const topLeft = params["topLeft"];
      const topRight = params["topRight"];
      const bottomRight = params["bottomRight"];
      const bottomLeft = params["bottomLeft"];
      const node = requireNode(nodeId);
      if (!("cornerRadius" in node)) {
        throw new Error(`Node type ${node.type} does not support corner radius.`);
      }
      const n = node;
      const hasIndividual = topLeft !== void 0 || topRight !== void 0 || bottomRight !== void 0 || bottomLeft !== void 0;
      if (hasIndividual) {
        n.topLeftRadius = topLeft != null ? topLeft : radius;
        n.topRightRadius = topRight != null ? topRight : radius;
        n.bottomRightRadius = bottomRight != null ? bottomRight : radius;
        n.bottomLeftRadius = bottomLeft != null ? bottomLeft : radius;
      } else {
        n.cornerRadius = radius;
      }
      return { id: node.id };
    });
    dispatcher2.register("set_auto_layout", async (params) => {
      var _a, _b, _c, _d, _e, _f, _g, _h;
      const nodeId = params["nodeId"];
      const layoutMode = params["layoutMode"];
      const paddingTop = (_a = params["paddingTop"]) != null ? _a : 0;
      const paddingRight = (_b = params["paddingRight"]) != null ? _b : 0;
      const paddingBottom = (_c = params["paddingBottom"]) != null ? _c : 0;
      const paddingLeft = (_d = params["paddingLeft"]) != null ? _d : 0;
      const itemSpacing = (_e = params["itemSpacing"]) != null ? _e : 0;
      const primaryAxisAlignItems = (_f = params["primaryAxisAlignItems"]) != null ? _f : "MIN";
      const counterAxisAlignItems = (_g = params["counterAxisAlignItems"]) != null ? _g : "MIN";
      const layoutWrap = (_h = params["layoutWrap"]) != null ? _h : "NO_WRAP";
      const node = requireNode(nodeId);
      if (node.type !== "FRAME" && node.type !== "COMPONENT" && node.type !== "INSTANCE") {
        throw new Error(`set_auto_layout requires a FRAME, COMPONENT, or INSTANCE node.`);
      }
      const frame = node;
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
    dispatcher2.register("set_effects", async (params) => {
      const nodeId = params["nodeId"];
      const effectParams = params["effects"];
      const node = requireNode(nodeId);
      if (!("effects" in node)) throw new Error(`Node type ${node.type} does not support effects.`);
      const effects = effectParams.map((e) => {
        var _a, _b, _c, _d, _e, _f;
        const visible = (_a = e.visible) != null ? _a : true;
        const radius = (_b = e.radius) != null ? _b : 8;
        if (e.type === "LAYER_BLUR") {
          return { type: "LAYER_BLUR", radius, visible };
        }
        if (e.type === "BACKGROUND_BLUR") {
          return { type: "BACKGROUND_BLUR", radius, visible };
        }
        const color = e.color ? { r: e.color.r, g: e.color.g, b: e.color.b, a: (_c = e.color.a) != null ? _c : 0.25 } : { r: 0, g: 0, b: 0, a: 0.25 };
        return {
          type: e.type,
          color,
          offset: { x: (_d = e.offsetX) != null ? _d : 0, y: (_e = e.offsetY) != null ? _e : 4 },
          radius,
          spread: (_f = e.spread) != null ? _f : 0,
          visible,
          blendMode: "NORMAL"
        };
      });
      node.effects = effects;
      return { id: node.id };
    });
    dispatcher2.register("rotate_node", async (params) => {
      var _a;
      const nodeId = params["nodeId"];
      const angle = params["angle"];
      const relative = (_a = params["relative"]) != null ? _a : false;
      const node = requireNode(nodeId);
      if (!("rotation" in node)) throw new Error(`Node type ${node.type} does not support rotation.`);
      const n = node;
      n.rotation = relative ? n.rotation + angle : angle;
      return { id: node.id, rotation: n.rotation };
    });
    dispatcher2.register("set_node_properties", async (params) => {
      const nodeId = params["nodeId"];
      const visible = params["visible"];
      const locked = params["locked"];
      const opacity = params["opacity"];
      const node = requireNode(nodeId);
      if (visible !== void 0) node.visible = visible;
      if (locked !== void 0) node.locked = locked;
      if (opacity !== void 0 && "opacity" in node) {
        node.opacity = opacity;
      }
      return { id: node.id };
    });
    dispatcher2.register("set_gradient", async (params) => {
      var _a;
      const nodeId = params["nodeId"];
      const type = params["type"];
      const stops = params["stops"];
      const angle = (_a = params["angle"]) != null ? _a : 0;
      const node = requireNode(nodeId);
      if (!("fills" in node)) throw new Error(`Node type ${node.type} does not support fills.`);
      const gradientType = `GRADIENT_${type}`;
      const gradientStops = stops.map((s) => {
        var _a2;
        return {
          position: s.position,
          color: { r: s.color.r, g: s.color.g, b: s.color.b, a: (_a2 = s.color.a) != null ? _a2 : 1 }
        };
      });
      let gradientTransform;
      if (type === "LINEAR") {
        gradientTransform = angleToGradientTransform(angle);
      } else {
        gradientTransform = [[0.5, 0, 0.5], [0, 0.5, 0.5]];
      }
      node.fills = [{
        type: gradientType,
        gradientStops,
        gradientTransform
      }];
      return { id: node.id };
    });
    dispatcher2.register("set_image", async (params) => {
      var _a;
      const nodeId = params["nodeId"];
      const imageData = params["imageData"];
      const scaleMode = (_a = params["scaleMode"]) != null ? _a : "FILL";
      const node = requireNode(nodeId);
      if (!("fills" in node)) throw new Error(`Node type ${node.type} does not support fills.`);
      if (imageData.startsWith("http://") || imageData.startsWith("https://")) {
        throw new Error(
          "URL-based images require pre-fetching. Please provide base64-encoded image data instead."
        );
      }
      const binary = atob(imageData);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const image = figma.createImage(bytes);
      const imagePaint = {
        type: "IMAGE",
        imageHash: image.hash,
        scaleMode
      };
      node.fills = [imagePaint];
      return { id: node.id };
    });
    dispatcher2.register("reorder_node", async (params) => {
      const nodeId = params["nodeId"];
      const position = params["position"];
      const index = params["index"];
      const node = requireNode(nodeId);
      const parent = node.parent;
      if (!parent || !("children" in parent)) {
        throw new Error("Node has no parent to reorder within.");
      }
      const children = parent.children;
      const currentIndex = children.indexOf(node);
      let newIndex;
      switch (position) {
        case "FRONT":
          newIndex = children.length - 1;
          break;
        case "BACK":
          newIndex = 0;
          break;
        case "FORWARD":
          newIndex = Math.min(currentIndex + 1, children.length - 1);
          break;
        case "BACKWARD":
          newIndex = Math.max(currentIndex - 1, 0);
          break;
        case "INDEX":
          if (index === void 0) throw new Error("index is required when position='INDEX'.");
          newIndex = Math.max(0, Math.min(index, children.length - 1));
          break;
      }
      parent.insertChild(newIndex, node);
      return { id: node.id };
    });
    dispatcher2.register("convert_to_frame", async (params) => {
      var _a;
      const nodeId = params["nodeId"];
      const node = requireNode(nodeId);
      if (node.type === "FRAME") {
        return { id: node.id, name: node.name };
      }
      if (!("children" in node)) {
        throw new Error(`Node type ${node.type} cannot be converted to a frame.`);
      }
      const groupNode = node;
      const frame = figma.createFrame();
      frame.name = groupNode.name;
      frame.x = groupNode.x;
      frame.y = groupNode.y;
      frame.resize(groupNode.width, groupNode.height);
      frame.fills = [];
      const parent = (_a = groupNode.parent) != null ? _a : figma.currentPage;
      const originalIndex = parent.children.indexOf(groupNode);
      const children = [...groupNode.children];
      for (const child of children) {
        frame.appendChild(child);
      }
      parent.insertChild(originalIndex, frame);
      groupNode.remove();
      return { id: frame.id, name: frame.name };
    });
    dispatcher2.register("set_grid", async (params) => {
      const nodeId = params["nodeId"];
      const grids = params["grids"];
      const node = requireNode(nodeId);
      if (node.type !== "FRAME" && node.type !== "COMPONENT" && node.type !== "INSTANCE") {
        throw new Error("set_grid requires a FRAME node.");
      }
      const frame = node;
      const layoutGrids = grids.map((g) => {
        var _a, _b, _c, _d, _e, _f;
        const color = g.color ? { r: g.color.r, g: g.color.g, b: g.color.b, a: (_a = g.color.a) != null ? _a : 0.1 } : void 0;
        if (g.pattern === "GRID") {
          const grid = {
            pattern: "GRID",
            sectionSize: (_b = g.sectionSize) != null ? _b : 8,
            visible: true,
            color: color != null ? color : { r: 0.7, g: 0.7, b: 1, a: 0.1 }
          };
          return grid;
        }
        return {
          pattern: g.pattern,
          sectionSize: (_c = g.sectionSize) != null ? _c : 64,
          visible: true,
          color: color != null ? color : { r: 0.7, g: 0.7, b: 1, a: 0.1 },
          alignment: "MIN",
          gutterSize: (_d = g.gutterSize) != null ? _d : 0,
          count: (_e = g.count) != null ? _e : 12,
          offset: (_f = g.offset) != null ? _f : 0
        };
      });
      frame.layoutGrids = layoutGrids;
      return { id: node.id };
    });
    dispatcher2.register("get_grid", async (params) => {
      const nodeId = params["nodeId"];
      const node = requireNode(nodeId);
      if (!("layoutGrids" in node)) return [];
      return node.layoutGrids;
    });
    dispatcher2.register("set_annotation", async (params) => {
      const nodeId = params["nodeId"];
      const label = params["label"];
      const node = requireNode(nodeId);
      if (!("annotations" in node)) {
        throw new Error(`Node type ${node.type} does not support annotations.`);
      }
      node.annotations = [{ label }];
      return { id: node.id };
    });
    dispatcher2.register("get_annotation", async (params) => {
      var _a;
      const nodeId = params["nodeId"];
      const node = requireNode(nodeId);
      if (!("annotations" in node)) return { label: void 0 };
      const annotations = node.annotations;
      const label = (_a = annotations == null ? void 0 : annotations[0]) == null ? void 0 : _a.label;
      return { label };
    });
  }

  // src/handlers/text.ts
  function requireTextNode(nodeId) {
    const node = requireNode(nodeId);
    if (node.type !== "TEXT") {
      throw new Error(`Node "${nodeId}" is not a TEXT node (it's a ${node.type}).`);
    }
    return node;
  }
  function registerTextHandlers(dispatcher2) {
    dispatcher2.register("set_text_content", async (params) => {
      const nodeId = params["nodeId"];
      const text = params["text"];
      const node = requireTextNode(nodeId);
      const fontName = typeof node.fontName === "symbol" ? { family: "Inter", style: "Regular" } : node.fontName;
      await figma.loadFontAsync(fontName);
      node.characters = text;
      return { id: node.id, characters: node.characters };
    });
    dispatcher2.register("set_multiple_text_contents", async (params) => {
      const updates = params["updates"];
      let updatedCount = 0;
      let failedCount = 0;
      for (const { nodeId, text } of updates) {
        try {
          const node = requireTextNode(nodeId);
          const fontName = typeof node.fontName === "symbol" ? { family: "Inter", style: "Regular" } : node.fontName;
          await figma.loadFontAsync(fontName);
          node.characters = text;
          updatedCount++;
        } catch (e) {
          failedCount++;
        }
      }
      return { updatedCount, failedCount };
    });
    dispatcher2.register("set_font_name", async (params) => {
      var _a;
      const nodeId = params["nodeId"];
      const family = params["family"];
      const style = (_a = params["style"]) != null ? _a : "Regular";
      const fontName = { family, style };
      await figma.loadFontAsync(fontName);
      const node = requireTextNode(nodeId);
      node.fontName = fontName;
      return { id: node.id };
    });
    dispatcher2.register("set_font_size", async (params) => {
      const nodeId = params["nodeId"];
      const fontSize = params["fontSize"];
      const node = requireTextNode(nodeId);
      if (typeof node.fontName !== "symbol") {
        await figma.loadFontAsync(node.fontName);
      }
      node.fontSize = fontSize;
      return { id: node.id };
    });
    dispatcher2.register("set_font_weight", async (params) => {
      const nodeId = params["nodeId"];
      const weight = params["weight"];
      const node = requireTextNode(nodeId);
      const currentFamily = typeof node.fontName === "symbol" ? "Inter" : node.fontName.family;
      const fontName = { family: currentFamily, style: weight };
      await figma.loadFontAsync(fontName);
      node.fontName = fontName;
      return { id: node.id };
    });
    dispatcher2.register("set_letter_spacing", async (params) => {
      var _a;
      const nodeId = params["nodeId"];
      const letterSpacing = params["letterSpacing"];
      const unit = (_a = params["unit"]) != null ? _a : "PIXELS";
      const node = requireTextNode(nodeId);
      if (typeof node.fontName !== "symbol") {
        await figma.loadFontAsync(node.fontName);
      }
      node.letterSpacing = { value: letterSpacing, unit };
      return { id: node.id };
    });
    dispatcher2.register("set_line_height", async (params) => {
      var _a;
      const nodeId = params["nodeId"];
      const lineHeight = params["lineHeight"];
      const unit = (_a = params["unit"]) != null ? _a : "PIXELS";
      const node = requireTextNode(nodeId);
      if (typeof node.fontName !== "symbol") {
        await figma.loadFontAsync(node.fontName);
      }
      if (unit === "AUTO") {
        node.lineHeight = { unit: "AUTO" };
      } else {
        node.lineHeight = { value: lineHeight, unit };
      }
      return { id: node.id };
    });
    dispatcher2.register("set_text_align", async (params) => {
      const nodeId = params["nodeId"];
      const textAlignHorizontal = params["textAlignHorizontal"];
      const textAlignVertical = params["textAlignVertical"];
      const node = requireTextNode(nodeId);
      if (textAlignHorizontal) node.textAlignHorizontal = textAlignHorizontal;
      if (textAlignVertical) node.textAlignVertical = textAlignVertical;
      return { id: node.id };
    });
    dispatcher2.register("set_text_case", async (params) => {
      const nodeId = params["nodeId"];
      const textCase = params["textCase"];
      const node = requireTextNode(nodeId);
      if (typeof node.fontName !== "symbol") {
        await figma.loadFontAsync(node.fontName);
      }
      node.textCase = textCase;
      return { id: node.id };
    });
    dispatcher2.register("set_text_decoration", async (params) => {
      const nodeId = params["nodeId"];
      const textDecoration = params["textDecoration"];
      const node = requireTextNode(nodeId);
      if (typeof node.fontName !== "symbol") {
        await figma.loadFontAsync(node.fontName);
      }
      node.textDecoration = textDecoration;
      return { id: node.id };
    });
    dispatcher2.register("set_paragraph_spacing", async (params) => {
      const nodeId = params["nodeId"];
      const paragraphSpacing = params["paragraphSpacing"];
      const node = requireTextNode(nodeId);
      if (typeof node.fontName !== "symbol") {
        await figma.loadFontAsync(node.fontName);
      }
      node.paragraphSpacing = paragraphSpacing;
      return { id: node.id };
    });
    dispatcher2.register("get_styled_text_segments", async (params) => {
      const nodeId = params["nodeId"];
      const property = params["property"];
      const node = requireTextNode(nodeId);
      const segments = node.getStyledTextSegments([property]);
      return segments.map((s) => __spreadValues({}, s));
    });
    dispatcher2.register("set_text_style_id", async (params) => {
      const nodeId = params["nodeId"];
      const textStyleId = params["textStyleId"];
      const node = requireTextNode(nodeId);
      node.textStyleId = textStyleId;
      return { id: node.id };
    });
    dispatcher2.register("load_font_async", async (params) => {
      var _a;
      const family = params["family"];
      const style = (_a = params["style"]) != null ? _a : "Regular";
      await figma.loadFontAsync({ family, style });
      return { loaded: true };
    });
  }

  // src/handlers/component.ts
  function registerComponentHandlers(dispatcher2) {
    dispatcher2.register("get_local_components", async () => {
      const components = figma.root.findAllWithCriteria({ types: ["COMPONENT"] });
      return components.map((c) => ({
        id: c.id,
        key: c.key,
        name: c.name,
        description: c.description
      }));
    });
    dispatcher2.register("get_remote_components", async () => {
      const importableComponents = figma.root.findAllWithCriteria({ types: ["COMPONENT"] }).filter((c) => c.remote);
      return importableComponents.map((c) => ({
        key: c.key,
        name: c.name,
        description: c.description
      }));
    });
    dispatcher2.register("create_component_instance", async (params) => {
      var _a, _b;
      const componentKey = params["componentKey"];
      const x = (_a = params["x"]) != null ? _a : 0;
      const y = (_b = params["y"]) != null ? _b : 0;
      const parentId = params["parentId"];
      const localComponents = figma.root.findAllWithCriteria({ types: ["COMPONENT"] });
      const localMatch = localComponents.find((c) => c.key === componentKey);
      let instance;
      if (localMatch) {
        instance = localMatch.createInstance();
      } else {
        const component = await figma.importComponentByKeyAsync(componentKey);
        instance = component.createInstance();
      }
      instance.x = x;
      instance.y = y;
      appendToParent(instance, parentId);
      return { id: instance.id, name: instance.name };
    });
    dispatcher2.register("create_component_from_node", async (params) => {
      const nodeId = params["nodeId"];
      const name = params["name"];
      const node = requireNode(nodeId);
      const component = figma.createComponentFromNode(node);
      if (name) component.name = name;
      return { id: component.id, key: component.key, name: component.name };
    });
    dispatcher2.register("create_component_set", async (params) => {
      const componentIds = params["componentIds"];
      const name = params["name"];
      if (componentIds.length < 2) {
        throw new Error("create_component_set requires at least 2 component IDs.");
      }
      const components = componentIds.map((id) => {
        const node = requireNode(id);
        if (node.type !== "COMPONENT") {
          throw new Error(`Node "${id}" is not a COMPONENT (it's a ${node.type}).`);
        }
        return node;
      });
      const componentSet = figma.combineAsVariants(components, figma.currentPage);
      if (name) componentSet.name = name;
      return { id: componentSet.id, name: componentSet.name };
    });
    dispatcher2.register("set_instance_variant", async (params) => {
      const nodeId = params["nodeId"];
      const properties = params["properties"];
      const node = requireNode(nodeId);
      if (node.type !== "INSTANCE") {
        throw new Error(`Node "${nodeId}" is not an INSTANCE (it's a ${node.type}).`);
      }
      const instance = node;
      instance.setProperties(properties);
      return { id: instance.id };
    });
    dispatcher2.register("set_effect_style_id", async (params) => {
      const nodeId = params["nodeId"];
      const effectStyleId = params["effectStyleId"];
      const node = requireNode(nodeId);
      if (!("effectStyleId" in node)) {
        throw new Error(`Node type ${node.type} does not support effect styles.`);
      }
      node.effectStyleId = effectStyleId;
      return { id: node.id };
    });
  }

  // src/handlers/svg.ts
  function registerSvgHandlers(dispatcher2) {
    dispatcher2.register("set_svg", async (params) => {
      var _a, _b;
      const svgString = params["svgString"];
      const x = (_a = params["x"]) != null ? _a : 0;
      const y = (_b = params["y"]) != null ? _b : 0;
      const name = params["name"];
      const parentId = params["parentId"];
      const node = figma.createNodeFromSvg(svgString);
      node.x = x;
      node.y = y;
      if (name) node.name = name;
      appendToParent(node, parentId);
      return { id: node.id, name: node.name };
    });
    dispatcher2.register("get_svg", async (params) => {
      const nodeId = params["nodeId"];
      const node = requireNode(nodeId);
      const bytes = await node.exportAsync({ format: "SVG" });
      let svg = "";
      for (let i = 0; i < bytes.length; i++) {
        svg += String.fromCharCode(bytes[i]);
      }
      return { svg };
    });
  }

  // src/handlers/variable.ts
  function registerVariableHandlers(dispatcher2) {
    dispatcher2.register("get_variables", async () => {
      const collections = figma.variables.getLocalVariableCollections();
      return {
        collections: collections.map((col) => ({
          id: col.id,
          name: col.name,
          modes: col.modes.map((m) => ({ modeId: m.modeId, name: m.name })),
          variables: col.variableIds.map((vid) => {
            const v = figma.variables.getVariableById(vid);
            if (!v) return null;
            return {
              id: v.id,
              name: v.name,
              resolvedType: v.resolvedType
            };
          }).filter(Boolean)
        }))
      };
    });
    dispatcher2.register("set_variable", async (params) => {
      var _a;
      const collectionId = params["collectionId"];
      const collectionName = params["collectionName"];
      const name = params["name"];
      const resolvedType = params["resolvedType"];
      const value = params["value"];
      const modeId = params["modeId"];
      let collection;
      if (collectionId) {
        const existing = figma.variables.getVariableCollectionById(collectionId);
        if (!existing) throw new Error(`Variable collection not found: "${collectionId}"`);
        collection = existing;
      } else if (collectionName) {
        const existing = figma.variables.getLocalVariableCollections().find((c) => c.name === collectionName);
        collection = existing != null ? existing : figma.variables.createVariableCollection(collectionName);
      } else {
        throw new Error("Must provide collectionId or collectionName.");
      }
      const existingVar = figma.variables.getLocalVariables(resolvedType).find((v) => v.variableCollectionId === collection.id && v.name === name);
      const variable = existingVar != null ? existingVar : figma.variables.createVariable(name, collection, resolvedType);
      const targetModeId = modeId != null ? modeId : collection.defaultModeId;
      let figmaValue;
      if (resolvedType === "COLOR" && typeof value === "object" && value !== null && "r" in value) {
        const c = value;
        figmaValue = { r: c.r, g: c.g, b: c.b, a: (_a = c.a) != null ? _a : 1 };
      } else {
        figmaValue = value;
      }
      variable.setValueForMode(targetModeId, figmaValue);
      return { id: variable.id, name: variable.name };
    });
    dispatcher2.register("apply_variable_to_node", async (params) => {
      const nodeId = params["nodeId"];
      const variableId = params["variableId"];
      const field = params["field"];
      const node = requireNode(nodeId);
      const variable = figma.variables.getVariableById(variableId);
      if (!variable) throw new Error(`Variable not found: "${variableId}"`);
      const bindableFields = [
        "width",
        "height",
        "x",
        "y",
        "rotation",
        "opacity",
        "cornerRadius",
        "topLeftRadius",
        "topRightRadius",
        "bottomLeftRadius",
        "bottomRightRadius",
        "itemSpacing",
        "paddingTop",
        "paddingBottom",
        "paddingLeft",
        "paddingRight",
        "characters",
        "fontSize",
        "letterSpacing",
        "lineHeight",
        "paragraphSpacing"
      ];
      if (!bindableFields.includes(field)) {
        throw new Error(
          `Field "${field}" is not directly bindable via setBoundVariable. Supported fields: ${bindableFields.join(", ")}`
        );
      }
      node.setBoundVariable(field, variable);
      return { id: node.id };
    });
    dispatcher2.register("switch_variable_mode", async (params) => {
      const nodeId = params["nodeId"];
      const collectionId = params["collectionId"];
      const modeId = params["modeId"];
      const node = requireNode(nodeId);
      const collection = figma.variables.getVariableCollectionById(collectionId);
      if (!collection) throw new Error(`Variable collection not found: "${collectionId}"`);
      if (!("setExplicitVariableModeForCollection" in node)) {
        throw new Error(
          `Node type ${node.type} does not support variable mode switching.`
        );
      }
      node.setExplicitVariableModeForCollection(collection, modeId);
      return { id: node.id };
    });
  }

  // src/handlers/page.ts
  function registerPageHandlers(dispatcher2) {
    dispatcher2.register("get_pages", async () => {
      return figma.root.children.map((p) => ({
        id: p.id,
        name: p.name,
        childCount: "children" in p ? p.children.length : 0,
        isCurrent: p.id === figma.currentPage.id
      }));
    });
    dispatcher2.register("create_page", async (params) => {
      const name = params["name"];
      const page = figma.createPage();
      page.name = name;
      return { id: page.id, name: page.name };
    });
    dispatcher2.register("delete_page", async (params) => {
      const pageId = params["pageId"];
      if (figma.root.children.length <= 1) {
        throw new Error("Cannot delete the last page in the document.");
      }
      const page = requirePage(pageId);
      const id = page.id;
      page.remove();
      return { id };
    });
    dispatcher2.register("rename_page", async (params) => {
      const pageId = params["pageId"];
      const name = params["name"];
      const page = requirePage(pageId);
      page.name = name;
      return { id: page.id, name: page.name };
    });
    dispatcher2.register("set_current_page", async (params) => {
      const pageId = params["pageId"];
      const page = requirePage(pageId);
      figma.currentPage = page;
      return { id: page.id, name: page.name };
    });
    dispatcher2.register("duplicate_page", async (params) => {
      const pageId = params["pageId"];
      const newName = params["name"];
      const page = requirePage(pageId);
      const clone = page.clone();
      if (newName) clone.name = newName;
      else clone.name = `${page.name} Copy`;
      return { id: clone.id, name: clone.name };
    });
  }

  // src/handlers/batch.ts
  function registerBatchHandlers(dispatcher2) {
    dispatcher2.register("batch_execute", async (params) => {
      var _a;
      const operations = params["operations"];
      const stopOnError = (_a = params["stopOnError"]) != null ? _a : true;
      const results = [];
      let successCount = 0;
      let failedCount = 0;
      for (const [i, op] of operations.entries()) {
        try {
          const result = await dispatcher2.dispatch(op.command, op.params);
          results.push({ index: i, command: op.command, success: true, result });
          successCount++;
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          results.push({ index: i, command: op.command, success: false, error });
          failedCount++;
          if (stopOnError) break;
        }
      }
      return { results, successCount, failedCount };
    });
  }

  // src/handlers/index.ts
  function registerHandlers(dispatcher2) {
    registerDocumentHandlers(dispatcher2);
    registerCreationHandlers(dispatcher2);
    registerModificationHandlers(dispatcher2);
    registerTextHandlers(dispatcher2);
    registerComponentHandlers(dispatcher2);
    registerSvgHandlers(dispatcher2);
    registerVariableHandlers(dispatcher2);
    registerPageHandlers(dispatcher2);
    registerBatchHandlers(dispatcher2);
  }

  // src/code.ts
  registerHandlers(dispatcher);
  figma.showUI(__html__, {
    width: 340,
    height: 180,
    title: "Figma MCP",
    themeColors: true
  });
  figma.ui.onmessage = async (msg) => {
    if (!msg || typeof msg !== "object" || typeof msg.id !== "string" || typeof msg.command !== "string") {
      console.warn("[figma-mcp] Received unexpected message:", msg);
      return;
    }
    const { id, command, params = {} } = msg;
    try {
      const result = await dispatcher.dispatch(command, params);
      figma.ui.postMessage({ id, result });
    } catch (err) {
      const error = err instanceof Error ? err.message : `Command failed: ${String(err)}`;
      figma.ui.postMessage({ id, error });
    }
  };
})();
