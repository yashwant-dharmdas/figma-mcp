import { describe, it, expect, beforeEach } from "vitest";
import { Dispatcher } from "../../src/dispatcher.js";
import { registerModificationHandlers } from "../../src/handlers/modification.js";
import { registerTestNode, clearNodes } from "../setup.js";

describe("modification handlers", () => {
  let dispatcher: Dispatcher;

  beforeEach(() => {
    dispatcher = new Dispatcher();
    registerModificationHandlers(dispatcher);
    clearNodes();
  });

  describe("set_fill_color", () => {
    it("sets fill on a node with fills", async () => {
      const node = registerTestNode("RECTANGLE", { id: "fill-1" });
      const result = await dispatcher.dispatch("set_fill_color", {
        nodeId: "fill-1", r: 1, g: 0, b: 0, a: 1,
      }) as Record<string, unknown>;
      expect(result["id"]).toBe("fill-1");
      const fills = (node as Record<string, unknown>).fills as Paint[];
      expect(fills[0].type).toBe("SOLID");
    });

    it("preserves a=0 (transparent) — critical fix", async () => {
      const node = registerTestNode("RECTANGLE", { id: "transparent" });
      await dispatcher.dispatch("set_fill_color", {
        nodeId: "transparent", r: 0, g: 0, b: 0, a: 0,
      });
      const fills = (node as Record<string, unknown>).fills as SolidPaint[];
      expect(fills[0].opacity).toBe(0); // must NOT be 1
    });
  });

  describe("set_stroke_color", () => {
    it("sets stroke and weight", async () => {
      const node = registerTestNode("RECTANGLE", { id: "stroke-1" });
      await dispatcher.dispatch("set_stroke_color", {
        nodeId: "stroke-1", r: 0, g: 0, b: 1, strokeWeight: 2,
      });
      const strokes = (node as Record<string, unknown>).strokes as Paint[];
      expect(strokes).toHaveLength(1);
      expect(strokes[0].type).toBe("SOLID");
    });

    it("removes stroke when strokeWeight=0", async () => {
      const node = registerTestNode("RECTANGLE", { id: "no-stroke" });
      await dispatcher.dispatch("set_stroke_color", {
        nodeId: "no-stroke", r: 0, g: 0, b: 0, strokeWeight: 0,
      });
      expect((node as Record<string, unknown>).strokes).toHaveLength(0);
    });
  });

  describe("move_node", () => {
    it("updates x and y", async () => {
      const node = registerTestNode("RECTANGLE", { id: "move-1" });
      const result = await dispatcher.dispatch("move_node", {
        nodeId: "move-1", x: 100, y: 200,
      }) as Record<string, unknown>;
      expect(result["x"]).toBe(100);
      expect(result["y"]).toBe(200);
      expect((node as Record<string, unknown>).x).toBe(100);
    });
  });

  describe("resize_node", () => {
    it("calls resize with new dimensions", async () => {
      const node = registerTestNode("RECTANGLE", { id: "resize-1" });
      const result = await dispatcher.dispatch("resize_node", {
        nodeId: "resize-1", width: 300, height: 200,
      }) as Record<string, unknown>;
      expect(result["width"]).toBe(300);
      expect(result["height"]).toBe(200);
    });
  });

  describe("rename_node", () => {
    it("changes node name", async () => {
      const node = registerTestNode("RECTANGLE", { id: "rename-1" });
      const result = await dispatcher.dispatch("rename_node", {
        nodeId: "rename-1", name: "NewName",
      }) as Record<string, unknown>;
      expect(result["name"]).toBe("NewName");
      expect((node as Record<string, unknown>).name).toBe("NewName");
    });
  });

  describe("delete_node", () => {
    it("calls remove on the node", async () => {
      const node = registerTestNode("RECTANGLE", { id: "del-1" });
      const result = await dispatcher.dispatch("delete_node", { nodeId: "del-1" }) as Record<string, unknown>;
      expect(result["deleted"]).toBe(true);
      expect((node as Record<string, unknown>).remove).toHaveBeenCalled();
    });
  });

  describe("set_auto_layout", () => {
    it("sets layout mode on frame", async () => {
      const node = registerTestNode("FRAME", { id: "layout-1" });
      await dispatcher.dispatch("set_auto_layout", {
        nodeId: "layout-1",
        layoutMode: "HORIZONTAL",
        itemSpacing: 16,
        paddingLeft: 8,
        paddingRight: 8,
      });
      expect((node as Record<string, unknown>).layoutMode).toBe("HORIZONTAL");
      expect((node as Record<string, unknown>).itemSpacing).toBe(16);
    });

    it("throws for non-frame nodes", async () => {
      registerTestNode("RECTANGLE", { id: "not-frame" });
      await expect(
        dispatcher.dispatch("set_auto_layout", { nodeId: "not-frame", layoutMode: "HORIZONTAL" })
      ).rejects.toThrow();
    });
  });

  describe("set_effects", () => {
    it("sets drop shadow effect", async () => {
      const node = registerTestNode("RECTANGLE", { id: "effect-1" });
      await dispatcher.dispatch("set_effects", {
        nodeId: "effect-1",
        effects: [{ type: "DROP_SHADOW", color: { r: 0, g: 0, b: 0, a: 0.25 }, offsetY: 4, radius: 8 }],
      });
      const effects = (node as Record<string, unknown>).effects as Effect[];
      expect(effects[0].type).toBe("DROP_SHADOW");
    });

    it("removes effects with empty array", async () => {
      const node = registerTestNode("RECTANGLE", { id: "effect-2" });
      await dispatcher.dispatch("set_effects", { nodeId: "effect-2", effects: [] });
      expect((node as Record<string, unknown>).effects).toHaveLength(0);
    });
  });

  describe("set_node_properties", () => {
    it("sets visibility", async () => {
      const node = registerTestNode("RECTANGLE", { id: "prop-1" });
      await dispatcher.dispatch("set_node_properties", { nodeId: "prop-1", visible: false });
      expect((node as Record<string, unknown>).visible).toBe(false);
    });

    it("sets opacity", async () => {
      const node = registerTestNode("RECTANGLE", { id: "prop-2" });
      await dispatcher.dispatch("set_node_properties", { nodeId: "prop-2", opacity: 0.5 });
      expect((node as Record<string, unknown>).opacity).toBe(0.5);
    });
  });

  describe("set_gradient", () => {
    it("sets linear gradient fill", async () => {
      const node = registerTestNode("RECTANGLE", { id: "grad-1" });
      await dispatcher.dispatch("set_gradient", {
        nodeId: "grad-1",
        type: "LINEAR",
        angle: 0,
        stops: [
          { position: 0, color: { r: 1, g: 0, b: 0, a: 1 } },
          { position: 1, color: { r: 0, g: 0, b: 1, a: 1 } },
        ],
      });
      const fills = (node as Record<string, unknown>).fills as Paint[];
      expect(fills[0].type).toBe("GRADIENT_LINEAR");
    });
  });

  describe("rotate_node", () => {
    it("sets absolute rotation", async () => {
      const node = registerTestNode("RECTANGLE", { id: "rot-1" });
      const result = await dispatcher.dispatch("rotate_node", {
        nodeId: "rot-1", angle: 45,
      }) as Record<string, unknown>;
      expect(result["rotation"]).toBe(45);
    });

    it("adds relative rotation", async () => {
      const node = registerTestNode("RECTANGLE", { id: "rot-2", rotation: 30 });
      const result = await dispatcher.dispatch("rotate_node", {
        nodeId: "rot-2", angle: 15, relative: true,
      }) as Record<string, unknown>;
      expect(result["rotation"]).toBe(45);
    });
  });
});
