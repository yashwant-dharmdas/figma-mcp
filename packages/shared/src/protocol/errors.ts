// ============================================================
// Structured error types for the Figma MCP system.
// Used by relay, mcp-server, and plugin for consistent error reporting.
// ============================================================

export enum FigmaErrorCode {
  // Channel / connection errors
  NO_CHANNEL = "NO_CHANNEL",
  RELAY_DISCONNECTED = "RELAY_DISCONNECTED",
  AUTH_FAILED = "AUTH_FAILED",

  // Node / Figma API errors
  NODE_NOT_FOUND = "NODE_NOT_FOUND",
  UNSUPPORTED_NODE_TYPE = "UNSUPPORTED_NODE_TYPE",
  FONT_LOAD_FAILED = "FONT_LOAD_FAILED",
  STYLE_NOT_FOUND = "STYLE_NOT_FOUND",
  COMPONENT_NOT_FOUND = "COMPONENT_NOT_FOUND",

  // Command errors
  UNKNOWN_COMMAND = "UNKNOWN_COMMAND",
  INVALID_PARAMS = "INVALID_PARAMS",
  PLUGIN_TIMEOUT = "PLUGIN_TIMEOUT",
  COMMAND_EXECUTION_FAILED = "COMMAND_EXECUTION_FAILED",

  // Batch errors
  BATCH_PARTIAL_FAILURE = "BATCH_PARTIAL_FAILURE",
  BATCH_STOPPED_ON_ERROR = "BATCH_STOPPED_ON_ERROR",

  // Misc
  INTERNAL_ERROR = "INTERNAL_ERROR",
}

/**
 * Structured error class used throughout the system.
 * Always carries a FigmaErrorCode so callers can handle specific cases.
 */
export class FigmaMcpError extends Error {
  public readonly code: FigmaErrorCode;
  public readonly context?: Record<string, unknown>;

  constructor(
    message: string,
    code: FigmaErrorCode,
    context?: Record<string, unknown>
  ) {
    super(message);
    this.name = "FigmaMcpError";
    this.code = code;
    // exactOptionalPropertyTypes: only assign when defined so the property
    // stays absent (not present-with-undefined) when not provided.
    if (context !== undefined) {
      this.context = context;
    }
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      ...(this.context ? { context: this.context } : {}),
    };
  }
}

/** Type guard for FigmaMcpError */
export function isFigmaMcpError(err: unknown): err is FigmaMcpError {
  return err instanceof FigmaMcpError;
}

/** Coerce any thrown value into a human-readable message string */
export function toErrorMessage(err: unknown): string {
  if (err instanceof FigmaMcpError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}
