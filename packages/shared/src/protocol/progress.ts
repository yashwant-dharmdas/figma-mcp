// ============================================================
// Progress update types for long-running Figma operations.
// The plugin emits these during chunked operations (e.g. scan_text_nodes,
// set_selection_colors) and they're relayed back to the MCP client.
// ============================================================

export type ProgressStatus = "started" | "in_progress" | "completed" | "error";

export interface ProgressData {
  /** Status of the operation */
  status: ProgressStatus;
  /** 0–100 completion percentage */
  progress: number;
  /** Human-readable status message */
  message: string;
  /** Total items being processed (e.g. total nodes) */
  totalItems?: number;
  /** How many have been processed so far */
  processedItems?: number;
  /** For chunked operations: current chunk index (1-based) */
  currentChunk?: number;
  /** For chunked operations: total number of chunks */
  totalChunks?: number;
  /** Items per chunk */
  chunkSize?: number;
  /** Partial payload for incremental results */
  payload?: unknown;
}

export interface CommandProgressUpdate {
  /** The type discriminator */
  type: "command_progress";
  /** UUID matching the originating command's id */
  commandId: string;
  /** e.g. "scan_text_nodes" */
  commandType: string;
  /** Unix timestamp in ms */
  timestamp: number;
  /** Progress data */
  data: ProgressData;
}
