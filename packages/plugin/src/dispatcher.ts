// ============================================================
// Dispatcher — Map-based command router.
//
// Replaces the 65-case switch statement in the original project.
//
//   dispatcher.register("set_fill_color", handler)  → O(1) registration
//   dispatcher.dispatch("set_fill_color", params)   → O(1) lookup + call
//
// Handlers are plain async functions:
//   (params: Record<string, unknown>) => Promise<unknown>
//
// Errors thrown by handlers propagate to code.ts, which converts them
// to { id, error: "..." } and sends them back to the relay.
// ============================================================

export type Handler = (params: Record<string, unknown>) => Promise<unknown>;

export class Dispatcher {
  private readonly handlers = new Map<string, Handler>();

  /** Register a handler for a command name. Overwrites if already registered. */
  register(name: string, handler: Handler): void {
    this.handlers.set(name, handler);
  }

  /** Register multiple handlers at once from an object map. */
  registerAll(map: Record<string, Handler>): void {
    for (const [name, handler] of Object.entries(map)) {
      this.handlers.set(name, handler);
    }
  }

  /**
   * Dispatch a command to its handler.
   * @throws Error if no handler is registered for the command name.
   */
  async dispatch(command: string, params: Record<string, unknown>): Promise<unknown> {
    const handler = this.handlers.get(command);
    if (!handler) {
      const known = [...this.handlers.keys()].join(", ");
      throw new Error(
        `Unknown command: "${command}". ` +
          `Registered commands: ${known}`
      );
    }
    return handler(params);
  }

  /** Returns true if a handler exists for the given command name. */
  has(name: string): boolean {
    return this.handlers.has(name);
  }

  /** Number of registered handlers. */
  get size(): number {
    return this.handlers.size;
  }
}

/** Singleton dispatcher used by code.ts and the batch handler. */
export const dispatcher = new Dispatcher();
