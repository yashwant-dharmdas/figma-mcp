// ============================================================
// Component handlers — components, instances, and styles.
// ============================================================

import type { Dispatcher } from "../dispatcher.js";
import { requireNode, appendToParent } from "../utils/node-helpers.js";

export function registerComponentHandlers(dispatcher: Dispatcher): void {

  // ── get_local_components ──────────────────────────────────

  dispatcher.register("get_local_components", async () => {
    const components = figma.root.findAllWithCriteria({ types: ["COMPONENT"] });
    return components.map((c) => ({
      id: c.id,
      key: c.key,
      name: c.name,
      description: c.description,
    }));
  });

  // ── get_remote_components ─────────────────────────────────

  dispatcher.register("get_remote_components", async () => {
    // Remote team library components — exposed via importable component keys
    // Note: In the plugin sandbox, we can only get published/imported components.
    // figma.teamLibrary is not available in all contexts.
    const importableComponents = figma.root.findAllWithCriteria({ types: ["COMPONENT"] })
      .filter((c) => c.remote);
    return importableComponents.map((c) => ({
      key: c.key,
      name: c.name,
      description: c.description,
    }));
  });

  // ── create_component_instance ─────────────────────────────

  dispatcher.register("create_component_instance", async (params) => {
    const componentKey = params["componentKey"] as string;
    const x = (params["x"] as number | undefined) ?? 0;
    const y = (params["y"] as number | undefined) ?? 0;
    const parentId = params["parentId"] as string | undefined;

    // Try to find local component by key first
    const localComponents = figma.root.findAllWithCriteria({ types: ["COMPONENT"] });
    const localMatch = localComponents.find((c) => c.key === componentKey);

    let instance: InstanceNode;
    if (localMatch) {
      instance = localMatch.createInstance();
    } else {
      // Try importing from team library
      const component = await figma.importComponentByKeyAsync(componentKey);
      instance = component.createInstance();
    }

    instance.x = x;
    instance.y = y;

    appendToParent(instance, parentId);

    return { id: instance.id, name: instance.name };
  });

  // ── create_component_from_node ────────────────────────────

  dispatcher.register("create_component_from_node", async (params) => {
    const nodeId = params["nodeId"] as string;
    const name = params["name"] as string | undefined;

    const node = requireNode(nodeId);
    const component = figma.createComponentFromNode(node);

    if (name) component.name = name;

    return { id: component.id, key: component.key, name: component.name };
  });

  // ── create_component_set ──────────────────────────────────

  dispatcher.register("create_component_set", async (params) => {
    const componentIds = params["componentIds"] as string[];
    const name = params["name"] as string | undefined;

    if (componentIds.length < 2) {
      throw new Error("create_component_set requires at least 2 component IDs.");
    }

    const components = componentIds.map((id) => {
      const node = requireNode(id);
      if (node.type !== "COMPONENT") {
        throw new Error(`Node "${id}" is not a COMPONENT (it's a ${node.type}).`);
      }
      return node as ComponentNode;
    });

    const componentSet = figma.combineAsVariants(components, figma.currentPage);

    if (name) componentSet.name = name;

    return { id: componentSet.id, name: componentSet.name };
  });

  // ── set_instance_variant ──────────────────────────────────

  dispatcher.register("set_instance_variant", async (params) => {
    const nodeId = params["nodeId"] as string;
    const properties = params["properties"] as Record<string, string>;

    const node = requireNode(nodeId);
    if (node.type !== "INSTANCE") {
      throw new Error(`Node "${nodeId}" is not an INSTANCE (it's a ${node.type}).`);
    }

    const instance = node as InstanceNode;
    instance.setProperties(properties);

    return { id: instance.id };
  });

  // ── set_effect_style_id ───────────────────────────────────

  dispatcher.register("set_effect_style_id", async (params) => {
    const nodeId = params["nodeId"] as string;
    const effectStyleId = params["effectStyleId"] as string;

    const node = requireNode(nodeId);
    if (!("effectStyleId" in node)) {
      throw new Error(`Node type ${node.type} does not support effect styles.`);
    }

    (node as BlendMixin & { effectStyleId: string }).effectStyleId = effectStyleId;

    return { id: node.id };
  });
}
