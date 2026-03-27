// ============================================================
// Text handlers — manipulate text node properties.
// ============================================================

import type { Dispatcher } from "../dispatcher.js";
import { requireNode } from "../utils/node-helpers.js";
import { toSolidPaint } from "../utils/color.js";

function requireTextNode(nodeId: string): TextNode {
  const node = requireNode(nodeId);
  if (node.type !== "TEXT") {
    throw new Error(`Node "${nodeId}" is not a TEXT node (it's a ${node.type}).`);
  }
  return node as TextNode;
}

export function registerTextHandlers(dispatcher: Dispatcher): void {

  // ── set_text_content ─────────────────────────────────────

  dispatcher.register("set_text_content", async (params) => {
    const nodeId = params["nodeId"] as string;
    const text = params["text"] as string;

    const node = requireTextNode(nodeId);

    // Must load the font currently applied to the node before modifying characters
    const fontName = typeof node.fontName === "symbol"
      ? { family: "Inter", style: "Regular" }
      : node.fontName as FontName;
    await figma.loadFontAsync(fontName);

    node.characters = text;

    return { id: node.id, characters: node.characters };
  });

  // ── set_multiple_text_contents ────────────────────────────

  dispatcher.register("set_multiple_text_contents", async (params) => {
    const updates = params["updates"] as Array<{ nodeId: string; text: string }>;
    let updatedCount = 0;
    let failedCount = 0;

    for (const { nodeId, text } of updates) {
      try {
        const node = requireTextNode(nodeId);
        const fontName = typeof node.fontName === "symbol"
          ? { family: "Inter", style: "Regular" }
          : node.fontName as FontName;
        await figma.loadFontAsync(fontName);
        node.characters = text;
        updatedCount++;
      } catch {
        failedCount++;
      }
    }

    return { updatedCount, failedCount };
  });

  // ── set_font_name ─────────────────────────────────────────

  dispatcher.register("set_font_name", async (params) => {
    const nodeId = params["nodeId"] as string;
    const family = params["family"] as string;
    const style = (params["style"] as string | undefined) ?? "Regular";

    const fontName: FontName = { family, style };
    await figma.loadFontAsync(fontName);

    const node = requireTextNode(nodeId);
    node.fontName = fontName;

    return { id: node.id };
  });

  // ── set_font_size ─────────────────────────────────────────

  dispatcher.register("set_font_size", async (params) => {
    const nodeId = params["nodeId"] as string;
    const fontSize = params["fontSize"] as number;

    const node = requireTextNode(nodeId);

    // Load current font before changing size
    if (typeof node.fontName !== "symbol") {
      await figma.loadFontAsync(node.fontName as FontName);
    }

    node.fontSize = fontSize;

    return { id: node.id };
  });

  // ── set_font_weight ───────────────────────────────────────

  dispatcher.register("set_font_weight", async (params) => {
    const nodeId = params["nodeId"] as string;
    const weight = params["weight"] as string;

    const node = requireTextNode(nodeId);

    const currentFamily = typeof node.fontName === "symbol"
      ? "Inter"
      : (node.fontName as FontName).family;

    const fontName: FontName = { family: currentFamily, style: weight };
    await figma.loadFontAsync(fontName);
    node.fontName = fontName;

    return { id: node.id };
  });

  // ── set_letter_spacing ────────────────────────────────────

  dispatcher.register("set_letter_spacing", async (params) => {
    const nodeId = params["nodeId"] as string;
    const letterSpacing = params["letterSpacing"] as number;
    const unit = (params["unit"] as "PIXELS" | "PERCENT" | undefined) ?? "PIXELS";

    const node = requireTextNode(nodeId);

    if (typeof node.fontName !== "symbol") {
      await figma.loadFontAsync(node.fontName as FontName);
    }

    node.letterSpacing = { value: letterSpacing, unit };

    return { id: node.id };
  });

  // ── set_line_height ───────────────────────────────────────

  dispatcher.register("set_line_height", async (params) => {
    const nodeId = params["nodeId"] as string;
    const lineHeight = params["lineHeight"] as number;
    const unit = (params["unit"] as "PIXELS" | "PERCENT" | "AUTO" | undefined) ?? "PIXELS";

    const node = requireTextNode(nodeId);

    if (typeof node.fontName !== "symbol") {
      await figma.loadFontAsync(node.fontName as FontName);
    }

    if (unit === "AUTO") {
      node.lineHeight = { unit: "AUTO" };
    } else {
      node.lineHeight = { value: lineHeight, unit };
    }

    return { id: node.id };
  });

  // ── set_text_align ────────────────────────────────────────

  dispatcher.register("set_text_align", async (params) => {
    const nodeId = params["nodeId"] as string;
    const textAlignHorizontal = params["textAlignHorizontal"] as
      "LEFT" | "CENTER" | "RIGHT" | "JUSTIFIED" | undefined;
    const textAlignVertical = params["textAlignVertical"] as
      "TOP" | "CENTER" | "BOTTOM" | undefined;

    const node = requireTextNode(nodeId);

    if (textAlignHorizontal) node.textAlignHorizontal = textAlignHorizontal;
    if (textAlignVertical) node.textAlignVertical = textAlignVertical;

    return { id: node.id };
  });

  // ── set_text_case ─────────────────────────────────────────

  dispatcher.register("set_text_case", async (params) => {
    const nodeId = params["nodeId"] as string;
    const textCase = params["textCase"] as "ORIGINAL" | "UPPER" | "LOWER" | "TITLE";

    const node = requireTextNode(nodeId);

    if (typeof node.fontName !== "symbol") {
      await figma.loadFontAsync(node.fontName as FontName);
    }

    node.textCase = textCase;

    return { id: node.id };
  });

  // ── set_text_decoration ───────────────────────────────────

  dispatcher.register("set_text_decoration", async (params) => {
    const nodeId = params["nodeId"] as string;
    const textDecoration = params["textDecoration"] as "NONE" | "UNDERLINE" | "STRIKETHROUGH";

    const node = requireTextNode(nodeId);

    if (typeof node.fontName !== "symbol") {
      await figma.loadFontAsync(node.fontName as FontName);
    }

    node.textDecoration = textDecoration;

    return { id: node.id };
  });

  // ── set_paragraph_spacing ─────────────────────────────────

  dispatcher.register("set_paragraph_spacing", async (params) => {
    const nodeId = params["nodeId"] as string;
    const paragraphSpacing = params["paragraphSpacing"] as number;

    const node = requireTextNode(nodeId);

    if (typeof node.fontName !== "symbol") {
      await figma.loadFontAsync(node.fontName as FontName);
    }

    node.paragraphSpacing = paragraphSpacing;

    return { id: node.id };
  });

  // ── get_styled_text_segments ──────────────────────────────

  dispatcher.register("get_styled_text_segments", async (params) => {
    const nodeId = params["nodeId"] as string;
    const property = params["property"] as
      "fontSize" | "fontName" | "fills" | "letterSpacing" | "lineHeight" |
      "paragraphSpacing" | "textCase" | "textDecoration" | "textStyleId" | "listOptions";

    const node = requireTextNode(nodeId);
    const segments = node.getStyledTextSegments([property]);

    return segments.map((s) => ({ ...s }));
  });

  // ── set_text_style_id ─────────────────────────────────────

  dispatcher.register("set_text_style_id", async (params) => {
    const nodeId = params["nodeId"] as string;
    const textStyleId = params["textStyleId"] as string;

    const node = requireTextNode(nodeId);
    node.textStyleId = textStyleId;

    return { id: node.id };
  });

  // ── load_font_async ───────────────────────────────────────

  dispatcher.register("load_font_async", async (params) => {
    const family = params["family"] as string;
    const style = (params["style"] as string | undefined) ?? "Regular";

    await figma.loadFontAsync({ family, style });

    return { loaded: true };
  });
}
