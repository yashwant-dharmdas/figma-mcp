// ============================================================
// Batch handler — execute multiple commands in one round-trip.
// ============================================================

import type { Dispatcher } from "../dispatcher.js";

export function registerBatchHandlers(dispatcher: Dispatcher): void {

  // ── batch_execute ─────────────────────────────────────────

  dispatcher.register("batch_execute", async (params) => {
    const operations = params["operations"] as Array<{
      command: string;
      params: Record<string, unknown>;
    }>;
    const stopOnError = (params["stopOnError"] as boolean | undefined) ?? true;

    const results: Array<{
      index: number;
      command: string;
      success: boolean;
      result?: unknown;
      error?: string;
    }> = [];

    let successCount = 0;
    let failedCount = 0;

    for (const [i, op] of operations.entries()) {
      try {
        const result = await dispatcher.dispatch(op.command, op.params);
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
