import { describe, it, expect, beforeEach } from "vitest";
import { Dispatcher } from "../../src/dispatcher.js";
import { registerCreationHandlers } from "../../src/handlers/creation.js";
import { registerTestNode, clearNodes } from "../setup.js";

describe("creation handlers", () => {
  let dispatcher: Dispatcher;

  beforeEach(() => {
    dispatcher = new Dispatcher();
    registerCreationHandlers(dispatcher);
    clearNodes();
  });

  describe("create_frame", () => {
    it("creates a frame with given dimensions", async () => {
      const result = await dispatcher.dispatch("create_frame", {
        x: 10, y: 20, width: 400, height: 300, name: "TestFrame",
      }) as Record<string, unknown>;
      expect(result["name"]).toBe("TestFrame");
      expect(result["width"]).toBe(400);
      expect(result["height"]).toBe(300);
      expect(typeof result["id"]).toBe("string");
    });

    it("applies fill color when provided", async () => {
      await dispatcher.dispatch("create_frame", {
        x: 0, y: 0, width: 100, height: 100,
        fillColor: { r: 1, g: 0, b: 0, a: 1 },
      });
      expect(figma.createFrame).toHaveBeenCalled();
    });
  });

  describe("create_rectangle", () => {
    it("creates a rectangle with corner radius", async () => {
      const result = await dispatcher.dispatch("create_rectangle", {
        x: 0, y: 0, width: 200, height: 100, cornerRadius: 8,
      }) as Record<string, unknown>;
      expect(result["width"]).toBe(200);
    });
  });

  describe("create_ellipse", () => {
    it("creates an ellipse", async () => {
      const result = await dispatcher.dispatch("create_ellipse", {
        x: 0, y: 0, width: 50, height: 50,
      }) as Record<string, unknown>;
      expect(typeof result["id"]).toBe("string");
    });
  });

  describe("create_text", () => {
    it("creates a text node and loads font", async () => {
      const result = await dispatcher.dispatch("create_text", {
        x: 0, y: 0, text: "Hello", fontSize: 24, fontWeight: "Bold",
      }) as Record<string, unknown>;
      expect(figma.loadFontAsync).toHaveBeenCalledWith({ family: "Inter", style: "Bold" });
      expect(typeof result["id"]).toBe("string");
    });
  });

  describe("group_nodes", () => {
    it("groups multiple nodes", async () => {
      const n1 = registerTestNode("RECTANGLE", { id: "gn1" });
      const n2 = registerTestNode("RECTANGLE", { id: "gn2" });
      // Set same parent
      const parent = { children: [n1, n2], insertChild: vi.fn(), appendChild: vi.fn() };
      (n1 as Record<string, unknown>).parent = parent;
      (n2 as Record<string, unknown>).parent = parent;

      const result = await dispatcher.dispatch("group_nodes", {
        nodeIds: ["gn1", "gn2"], name: "MyGroup",
      }) as Record<string, unknown>;
      expect(figma.group).toHaveBeenCalled();
      expect(typeof result["id"]).toBe("string");
    });

    it("throws when fewer than 2 nodes provided", async () => {
      registerTestNode("RECTANGLE", { id: "solo" });
      await expect(
        dispatcher.dispatch("group_nodes", { nodeIds: ["solo"] })
      ).rejects.toThrow("at least 2");
    });
  });

  describe("ungroup_nodes", () => {
    it("throws when node is not a GROUP", async () => {
      registerTestNode("FRAME", { id: "not-group" });
      await expect(
        dispatcher.dispatch("ungroup_nodes", { nodeId: "not-group" })
      ).rejects.toThrow("not a GROUP");
    });
  });

  describe("insert_child", () => {
    it("moves a node into a parent", async () => {
      registerTestNode("FRAME", { id: "parent-frame" });
      registerTestNode("RECTANGLE", { id: "child-rect" });

      const result = await dispatcher.dispatch("insert_child", {
        parentId: "parent-frame",
        childId: "child-rect",
      }) as Record<string, unknown>;
      expect(result["success"]).toBe(true);
    });
  });
});
