import { describe, it, expect, beforeEach } from "vitest";
import { Dispatcher } from "../src/dispatcher.js";

describe("Dispatcher", () => {
  let dispatcher: Dispatcher;

  beforeEach(() => {
    dispatcher = new Dispatcher();
  });

  it("registers and dispatches a command", async () => {
    dispatcher.register("test_cmd", async (params) => ({ echo: params["value"] }));
    const result = await dispatcher.dispatch("test_cmd", { value: "hello" });
    expect(result).toEqual({ echo: "hello" });
  });

  it("throws on unknown command", async () => {
    await expect(dispatcher.dispatch("unknown_cmd", {})).rejects.toThrow(
      "unknown_cmd"
    );
  });

  it("has() returns true for registered commands", () => {
    dispatcher.register("my_cmd", async () => ({}));
    expect(dispatcher.has("my_cmd")).toBe(true);
    expect(dispatcher.has("other_cmd")).toBe(false);
  });

  it("size reflects registered count", () => {
    expect(dispatcher.size).toBe(0);
    dispatcher.register("cmd1", async () => ({}));
    dispatcher.register("cmd2", async () => ({}));
    expect(dispatcher.size).toBe(2);
  });

  it("registerAll registers multiple commands", async () => {
    dispatcher.registerAll({
      cmd_a: async () => ({ from: "a" }),
      cmd_b: async () => ({ from: "b" }),
    });
    expect(dispatcher.size).toBe(2);
    expect(await dispatcher.dispatch("cmd_a", {})).toEqual({ from: "a" });
    expect(await dispatcher.dispatch("cmd_b", {})).toEqual({ from: "b" });
  });

  it("propagates errors from handlers", async () => {
    dispatcher.register("failing_cmd", async () => {
      throw new Error("handler error");
    });
    await expect(dispatcher.dispatch("failing_cmd", {})).rejects.toThrow("handler error");
  });

  it("overwrites existing handler when registered again", async () => {
    dispatcher.register("dup", async () => ({ v: 1 }));
    dispatcher.register("dup", async () => ({ v: 2 }));
    const result = await dispatcher.dispatch("dup", {});
    expect(result).toEqual({ v: 2 });
  });
});
