// ── Shared package — registry and protocol tests ─────────────
//
// These tests verify the central invariants of the CommandRegistry
// that all other packages depend on:
//   1. Every command has a unique name.
//   2. Every command has a valid category.
//   3. join_channel exists with requiresChannel=false.
//   4. batch_execute exists with requiresChannel=true.
//   5. COMMAND_MAP and getCommand() return correct definitions.
//   6. FigmaMcpError carries the right code and message.

import { describe, it, expect } from "vitest";
import {
  COMMAND_REGISTRY,
  COMMAND_MAP,
  getCommand,
  getCommandsByCategory,
} from "../src/registry.js";
import {
  FigmaMcpError,
  FigmaErrorCode,
  isFigmaMcpError,
  toErrorMessage,
} from "../src/protocol/errors.js";

// ── Registry integrity ────────────────────────────────────────

describe("COMMAND_REGISTRY", () => {
  it("contains at least one command", () => {
    expect(COMMAND_REGISTRY.length).toBeGreaterThan(0);
  });

  it("has no duplicate names", () => {
    const names = COMMAND_REGISTRY.map((c) => c.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  it("every command has a non-empty description", () => {
    for (const def of COMMAND_REGISTRY) {
      expect(def.description.trim().length, `${def.name} has empty description`).toBeGreaterThan(0);
    }
  });

  it("every command has a valid category", () => {
    const valid = new Set([
      "document",
      "creation",
      "modification",
      "text",
      "component",
      "svg",
      "variable",
      "batch",
      "channel",
    ]);
    for (const def of COMMAND_REGISTRY) {
      expect(valid.has(def.category), `${def.name} has unknown category: ${def.category}`).toBe(true);
    }
  });

  it("every command has a Zod params schema with a .shape property", () => {
    for (const def of COMMAND_REGISTRY) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(typeof (def.params as any).shape, `${def.name}.params has no .shape`).toBe("object");
    }
  });

  it("every command has a Zod result schema with a .safeParse method", () => {
    for (const def of COMMAND_REGISTRY) {
      expect(
        typeof def.result.safeParse,
        `${def.name}.result has no .safeParse`
      ).toBe("function");
    }
  });
});

// ── Specific commands ─────────────────────────────────────────

describe("join_channel", () => {
  const def = COMMAND_MAP.get("join_channel");

  it("exists in the registry", () => {
    expect(def).toBeDefined();
  });

  it("has requiresChannel=false", () => {
    expect(def?.requiresChannel).toBe(false);
  });

  it("has category 'channel'", () => {
    expect(def?.category).toBe("channel");
  });

  it("params schema validates a valid channel id", () => {
    const parsed = def!.params.safeParse({ channel: "abc12345" });
    expect(parsed.success).toBe(true);
  });

  it("params schema rejects an empty channel", () => {
    const parsed = def!.params.safeParse({ channel: "" });
    expect(parsed.success).toBe(false);
  });
});

describe("batch_execute", () => {
  const def = COMMAND_MAP.get("batch_execute");

  it("exists in the registry", () => {
    expect(def).toBeDefined();
  });

  it("has requiresChannel=true", () => {
    expect(def?.requiresChannel).toBe(true);
  });

  it("params schema validates a valid batch", () => {
    const parsed = def!.params.safeParse({
      operations: [{ command: "get_document_info", params: {} }],
    });
    expect(parsed.success).toBe(true);
  });

  it("params schema rejects an empty operations array", () => {
    const parsed = def!.params.safeParse({ operations: [] });
    expect(parsed.success).toBe(false);
  });
});

// ── COMMAND_MAP / getCommand ──────────────────────────────────

describe("COMMAND_MAP", () => {
  it("has the same size as COMMAND_REGISTRY", () => {
    expect(COMMAND_MAP.size).toBe(COMMAND_REGISTRY.length);
  });
});

describe("getCommand()", () => {
  it("returns a command by name", () => {
    const def = getCommand("join_channel");
    expect(def.name).toBe("join_channel");
  });

  it("throws for unknown command name", () => {
    expect(() => getCommand("totally_fake_command")).toThrow("Unknown command");
  });
});

// ── getCommandsByCategory ────────────────────────────────────

describe("getCommandsByCategory()", () => {
  it("returns only commands with the given category", () => {
    const channelCmds = getCommandsByCategory("channel");
    expect(channelCmds.every((c) => c.category === "channel")).toBe(true);
  });

  it("returns at least one channel command", () => {
    expect(getCommandsByCategory("channel").length).toBeGreaterThan(0);
  });
});

// ── FigmaMcpError ─────────────────────────────────────────────

describe("FigmaMcpError", () => {
  it("carries code and message", () => {
    const err = new FigmaMcpError("test error", FigmaErrorCode.NODE_NOT_FOUND);
    expect(err.message).toBe("test error");
    expect(err.code).toBe(FigmaErrorCode.NODE_NOT_FOUND);
    expect(err.name).toBe("FigmaMcpError");
  });

  it("is an instance of Error", () => {
    const err = new FigmaMcpError("oops", FigmaErrorCode.INTERNAL_ERROR);
    expect(err instanceof Error).toBe(true);
  });

  it("toJSON() includes code and message", () => {
    const err = new FigmaMcpError("bad node", FigmaErrorCode.NODE_NOT_FOUND, {
      nodeId: "1:1",
    });
    const json = err.toJSON();
    expect(json.message).toBe("bad node");
    expect(json.code).toBe("NODE_NOT_FOUND");
    expect(json.context).toEqual({ nodeId: "1:1" });
  });
});

describe("isFigmaMcpError()", () => {
  it("returns true for FigmaMcpError instances", () => {
    expect(
      isFigmaMcpError(new FigmaMcpError("x", FigmaErrorCode.INTERNAL_ERROR))
    ).toBe(true);
  });

  it("returns false for plain Error", () => {
    expect(isFigmaMcpError(new Error("plain"))).toBe(false);
  });

  it("returns false for non-error values", () => {
    expect(isFigmaMcpError("string")).toBe(false);
    expect(isFigmaMcpError(null)).toBe(false);
  });
});

describe("toErrorMessage()", () => {
  it("extracts message from FigmaMcpError", () => {
    expect(
      toErrorMessage(new FigmaMcpError("test", FigmaErrorCode.UNKNOWN_COMMAND))
    ).toBe("test");
  });

  it("extracts message from plain Error", () => {
    expect(toErrorMessage(new Error("plain error"))).toBe("plain error");
  });

  it("stringifies non-error values", () => {
    expect(toErrorMessage(42)).toBe("42");
    expect(toErrorMessage("raw string")).toBe("raw string");
  });
});
