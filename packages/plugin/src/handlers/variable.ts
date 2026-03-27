// ============================================================
// Variable handlers — Figma Variables (design tokens).
// ============================================================

import type { Dispatcher } from "../dispatcher.js";
import { requireNode } from "../utils/node-helpers.js";

export function registerVariableHandlers(dispatcher: Dispatcher): void {

  // ── get_variables ─────────────────────────────────────────

  dispatcher.register("get_variables", async () => {
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
            resolvedType: v.resolvedType,
          };
        }).filter(Boolean),
      })),
    };
  });

  // ── set_variable ─────────────────────────────────────────

  dispatcher.register("set_variable", async (params) => {
    const collectionId = params["collectionId"] as string | undefined;
    const collectionName = params["collectionName"] as string | undefined;
    const name = params["name"] as string;
    const resolvedType = params["resolvedType"] as "COLOR" | "FLOAT" | "STRING" | "BOOLEAN";
    const value = params["value"] as unknown;
    const modeId = params["modeId"] as string | undefined;

    // Get or create collection
    let collection: VariableCollection;
    if (collectionId) {
      const existing = figma.variables.getVariableCollectionById(collectionId);
      if (!existing) throw new Error(`Variable collection not found: "${collectionId}"`);
      collection = existing;
    } else if (collectionName) {
      const existing = figma.variables.getLocalVariableCollections()
        .find((c) => c.name === collectionName);
      collection = existing ?? figma.variables.createVariableCollection(collectionName);
    } else {
      throw new Error("Must provide collectionId or collectionName.");
    }

    // Get or create variable
    const existingVar = figma.variables.getLocalVariables(resolvedType)
      .find((v) => v.variableCollectionId === collection.id && v.name === name);
    const variable = existingVar ?? figma.variables.createVariable(name, collection, resolvedType);

    // Resolve mode
    const targetModeId = modeId ?? collection.defaultModeId;

    // Coerce value for COLOR type
    let figmaValue: VariableValue;
    if (
      resolvedType === "COLOR" &&
      typeof value === "object" &&
      value !== null &&
      "r" in value
    ) {
      const c = value as { r: number; g: number; b: number; a?: number };
      figmaValue = { r: c.r, g: c.g, b: c.b, a: c.a ?? 1 } as RGBA;
    } else {
      figmaValue = value as VariableValue;
    }

    variable.setValueForMode(targetModeId, figmaValue);

    return { id: variable.id, name: variable.name };
  });

  // ── apply_variable_to_node ────────────────────────────────

  dispatcher.register("apply_variable_to_node", async (params) => {
    const nodeId = params["nodeId"] as string;
    const variableId = params["variableId"] as string;
    const field = params["field"] as string;

    const node = requireNode(nodeId);
    const variable = figma.variables.getVariableById(variableId);
    if (!variable) throw new Error(`Variable not found: "${variableId}"`);

    // Bind variable to the node field
    const bindableFields: string[] = [
      "width", "height", "x", "y", "rotation", "opacity",
      "cornerRadius", "topLeftRadius", "topRightRadius", "bottomLeftRadius", "bottomRightRadius",
      "itemSpacing", "paddingTop", "paddingBottom", "paddingLeft", "paddingRight",
      "characters", "fontSize", "letterSpacing", "lineHeight", "paragraphSpacing",
    ];

    if (!bindableFields.includes(field)) {
      throw new Error(
        `Field "${field}" is not directly bindable via setBoundVariable. ` +
        `Supported fields: ${bindableFields.join(", ")}`
      );
    }

    (node as SceneNode & { setBoundVariable: (field: string, variable: Variable | null) => void })
      .setBoundVariable(field, variable);

    return { id: node.id };
  });

  // ── switch_variable_mode ──────────────────────────────────

  dispatcher.register("switch_variable_mode", async (params) => {
    const nodeId = params["nodeId"] as string;
    const collectionId = params["collectionId"] as string;
    const modeId = params["modeId"] as string;

    const node = requireNode(nodeId);
    const collection = figma.variables.getVariableCollectionById(collectionId);
    if (!collection) throw new Error(`Variable collection not found: "${collectionId}"`);

    if (!("setExplicitVariableModeForCollection" in node)) {
      throw new Error(
        `Node type ${(node as SceneNode).type} does not support variable mode switching.`
      );
    }

    (node as FrameNode).setExplicitVariableModeForCollection(collection, modeId);

    return { id: node.id };
  });
}
