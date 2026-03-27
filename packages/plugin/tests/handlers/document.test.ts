import { describe, it, expect, beforeEach } from "vitest";
import { Dispatcher } from "../../src/dispatcher.js";
import { registerDocumentHandlers } from "../../src/handlers/document.js";
import { registerTestNode, clearNodes } from "../setup.js";

describe("document handlers", () => {
  let dispatcher: Dispatcher;

  beforeEach(() => {
    dispatcher = new Dispatcher();
    registerDocumentHandlers(dispatcher);
    clearNodes();
  });

  // ── get_document_info ──────────────────────────────────────

  describe("get_document_info", () => {
    it("returns document name and current page", async () => {
      const result = await dispatcher.dispatch("get_document_info", {}) as Record<string, unknown>;
      expect(result).toHaveProperty("name");
      expect(result).toHaveProperty("currentPage");
      expect(result).toHaveProperty("pages");
      expect(Array.isArray(result["pages"])).toBe(true);
    });
  });

  // ── get_selection ──────────────────────────────────────────

  describe("get_selection", () => {
    it("returns empty array when nothing is selected", async () => {
      (figma.currentPage as unknown as { selection: unknown[] }).selection = [];
      const result = await dispatcher.dispatch("get_selection", {});
      expect(result).toEqual([]);
    });
  });

  // ── get_node_info ──────────────────────────────────────────

  describe("get_node_info", () => {
    it("returns serialized node", async () => {
      const node = registerTestNode("RECTANGLE", { id: "rect-1", name: "MyRect" });
      const result = await dispatcher.dispatch("get_node_info", { nodeId: "rect-1" }) as Record<string, unknown>;
      expect(result["id"]).toBe("rect-1");
      expect(result["name"]).toBe("MyRect");
      expect(result["type"]).toBe("RECTANGLE");
    });

    it("throws for unknown node", async () => {
      await expect(
        dispatcher.dispatch("get_node_info", { nodeId: "nonexistent" })
      ).rejects.toThrow("Node not found");
    });
  });

  // ── get_nodes_info ────────────────────────────────────────

  describe("get_nodes_info", () => {
    it("returns array of serialized nodes", async () => {
      registerTestNode("RECTANGLE", { id: "r1" });
      registerTestNode("FRAME", { id: "f1" });
      const result = await dispatcher.dispatch("get_nodes_info", { nodeIds: ["r1", "f1"] }) as unknown[];
      expect(result).toHaveLength(2);
    });

    it("filters out missing nodes (returns null)", async () => {
      registerTestNode("RECTANGLE", { id: "exists" });
      const result = await dispatcher.dispatch("get_nodes_info", { nodeIds: ["exists", "missing"] }) as unknown[];
      expect(result).toHaveLength(2);
      expect(result[0]).not.toBeNull();
      expect(result[1]).toBeNull();
    });
  });

  // ── get_styles ────────────────────────────────────────────

  describe("get_styles", () => {
    it("returns style categories", async () => {
      const result = await dispatcher.dispatch("get_styles", {}) as Record<string, unknown>;
      expect(result).toHaveProperty("paintStyles");
      expect(result).toHaveProperty("textStyles");
      expect(result).toHaveProperty("effectStyles");
      expect(result).toHaveProperty("gridStyles");
    });
  });

  // ── scan_text_nodes ───────────────────────────────────────

  describe("scan_text_nodes", () => {
    it("returns array (empty page has no text nodes)", async () => {
      const result = await dispatcher.dispatch("scan_text_nodes", {});
      expect(Array.isArray(result)).toBe(true);
    });
  });

  // ── export_node_as_image ──────────────────────────────────

  describe("export_node_as_image", () => {
    it("returns base64 image data", async () => {
      const node = registerTestNode("FRAME", { id: "export-1" });
      const result = await dispatcher.dispatch("export_node_as_image", {
        nodeId: "export-1",
        format: "PNG",
        scale: 1,
      }) as Record<string, unknown>;
      expect(result["nodeId"]).toBe("export-1");
      expect(result["format"]).toBe("PNG");
      expect(typeof result["data"]).toBe("string");
      expect(result["mimeType"]).toBe("image/png");
    });

    it("throws for nodes that can't export", async () => {
      registerTestNode("VECTOR", {
        id: "no-export",
        exportAsync: undefined,
      });
      await expect(
        dispatcher.dispatch("export_node_as_image", { nodeId: "no-export" })
      ).rejects.toThrow();
    });
  });
});
