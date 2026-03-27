// ============================================================
// @figma-mcp/shared — Public API
// ============================================================

// Protocol types
export * from "./protocol/errors.js";
export * from "./protocol/messages.js";
export * from "./protocol/progress.js";

// Command registry
export * from "./registry.js";

// Future extension interfaces (no implementation yet)
export type {
  DesignComponent,
  ComponentSearchResult,
  SearchOptions,
  SyncOptions,
  DesignLibraryProvider,
  EmbeddingProvider,
  WebsiteGenerationRequest,
  WebsiteGenerationResult,
} from "./extensions/design-library.js";
