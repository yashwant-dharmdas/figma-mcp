// ============================================================
// Design Library Extension Interfaces
//
// These interfaces define the contracts for the future design library
// feature (hundreds of Figma sections → AI-powered site generation).
//
// NO IMPLEMENTATION in Phase 1–5. Implement in a future packages/design-library package.
// The interfaces are defined here so the rest of the system can reference
// them without knowing the implementation details.
// ============================================================

export interface DesignComponent {
  /** Unique ID in our database */
  id: string;
  /** Figma component key (for create_component_instance) */
  key: string;
  /** Figma file key this component lives in */
  fileKey: string;
  /** Human-readable name */
  name: string;
  /** Description of the component's purpose */
  description: string;
  /**
   * Category: "hero", "about", "services", "shop", "navigation",
   * "footer", "pricing", "testimonials", "gallery", etc.
   */
  category: string;
  /** Sub-category or variant label */
  variant?: string;
  /** Tags for filtering */
  tags: string[];
  /** Thumbnail image URL */
  thumbnailUrl?: string;
  /**
   * Vector embedding for semantic similarity search.
   * Populated by the indexing pipeline.
   * Not serialized to Figma; stored only in the vector DB.
   */
  embedding?: number[];
  /** Width in pixels */
  width?: number;
  /** Height in pixels */
  height?: number;
  /** ISO timestamp of when this was indexed */
  indexedAt: string;
}

export interface ComponentSearchResult {
  component: DesignComponent;
  /** Cosine similarity score (0–1). Higher = more relevant. */
  score: number;
  /** Optional: LLM-generated reasoning for why this matches the query */
  reasoning?: string;
}

export interface SearchOptions {
  limit?: number;
  /** Filter to a specific category */
  category?: string;
  /** Minimum similarity score (0–1) */
  minScore?: number;
  /** Filter by tags */
  tags?: string[];
}

export interface SyncOptions {
  /** If true, re-embed and update all components even if unchanged */
  forceReindex?: boolean;
  /** Only sync components in these categories */
  categories?: string[];
}

/**
 * Interface for the design library storage/retrieval layer.
 *
 * Implementations:
 * - packages/design-library/src/providers/qdrant.ts (Qdrant vector DB)
 * - packages/design-library/src/providers/pgvector.ts (PostgreSQL + pgvector)
 * - packages/design-library/src/providers/memory.ts (in-memory, for testing)
 */
export interface DesignLibraryProvider {
  /**
   * Semantic search for design components matching a natural language query.
   * Uses vector similarity (cosine) on component embeddings.
   *
   * @example
   * provider.search("hero section with large image background and CTA button", { limit: 5 })
   */
  search(query: string, options?: SearchOptions): Promise<ComponentSearchResult[]>;

  /**
   * Get a single component by its database ID.
   */
  getById(id: string): Promise<DesignComponent | null>;

  /**
   * Get a component by its Figma key.
   */
  getByKey(key: string): Promise<DesignComponent | null>;

  /**
   * Insert or update components in the library.
   */
  upsert(components: DesignComponent[]): Promise<void>;

  /**
   * Delete a component from the library.
   */
  delete(id: string): Promise<void>;

  /**
   * Sync all components from a Figma file into the library.
   * Fetches component list via Figma REST API, embeds them, and stores.
   */
  syncFromFigmaFile(fileKey: string, options?: SyncOptions): Promise<{
    added: number;
    updated: number;
    removed: number;
  }>;

  /**
   * List all categories currently in the library.
   */
  getCategories(): Promise<string[]>;

  /**
   * Health check — returns true if the provider is reachable.
   */
  isHealthy(): Promise<boolean>;
}

/**
 * Interface for embedding service that converts text/images to vectors.
 *
 * Implementations:
 * - OpenAI text-embedding-3-small
 * - Local sentence-transformers model
 */
export interface EmbeddingProvider {
  /**
   * Embed a text description into a vector.
   */
  embedText(text: string): Promise<number[]>;

  /**
   * Embed an image (thumbnail) into a vector.
   * Optional — only implement for multimodal similarity.
   */
  embedImage?(imageUrl: string): Promise<number[]>;

  /** Dimensionality of the embedding vectors */
  readonly dimensions: number;
}

/**
 * Website generation request — future high-level API
 */
export interface WebsiteGenerationRequest {
  /** Business description */
  businessDescription: string;
  /** Business type (e.g. "restaurant", "SaaS", "e-commerce") */
  businessType: string;
  /** Target audience */
  targetAudience?: string;
  /** Design style preferences */
  stylePreferences?: {
    colorScheme?: "light" | "dark" | "colorful" | "minimal";
    style?: "modern" | "classic" | "bold" | "friendly";
  };
  /** Sections to include (if empty, AI decides) */
  sections?: string[];
  /** Max number of section candidates per slot */
  candidatesPerSection?: number;
}

export interface WebsiteGenerationResult {
  /** Ordered list of sections chosen for the website */
  sections: Array<{
    slot: string;           // e.g. "hero", "features", "pricing"
    component: DesignComponent;
    score: number;
    reasoning: string;
  }>;
  /** Figma page created for the website */
  figmaPageId?: string;
}
