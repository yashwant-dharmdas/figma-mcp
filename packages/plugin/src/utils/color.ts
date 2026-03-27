// ============================================================
// Color utilities for Figma plugin handlers.
//
// CRITICAL FIX over the original project:
//   Original used: opacity: alpha || 1  → alpha=0 (transparent) became 1 (opaque)
//   Correct code:  opacity: alpha ?? 1  → only defaults when alpha is undefined
//
// Always pass alpha explicitly when transparency matters.
// ============================================================

/** Create a SolidPaint from r/g/b/a values (all in 0–1 range). */
export function toSolidPaint(
  r: number,
  g: number,
  b: number,
  /** Alpha in 0–1. Defaults to 1 (fully opaque). 0 is fully transparent. */
  a = 1
): SolidPaint {
  return {
    type: "SOLID",
    color: { r, g, b },
    // CRITICAL: use `a` directly — NOT `a || 1`.
    // `a || 1` would convert transparent (a=0) to opaque.
    opacity: a,
  };
}

/** Extract r/g/b/a from a SolidPaint. Returns undefined for non-solid paints. */
export function fromSolidPaint(
  paint: Paint
): { r: number; g: number; b: number; a: number } | undefined {
  if (paint.type !== "SOLID") return undefined;
  const { r, g, b } = paint.color;
  return { r, g, b, a: paint.opacity ?? 1 };
}

/**
 * Parse a color param that may be:
 *   - An object { r, g, b, a? } (preferred — values in 0–1)
 *   - Or separate r/g/b/a fields at the top level of params
 */
export function parseColorParam(
  params: Record<string, unknown>,
  prefix = ""
): { r: number; g: number; b: number; a: number } {
  const key = (k: string) => (prefix ? `${prefix}${k}` : k);

  // Check for nested color object
  const colorObj = params[prefix || "color"] as
    | { r: number; g: number; b: number; a?: number }
    | undefined;
  if (colorObj && typeof colorObj === "object" && "r" in colorObj) {
    return {
      r: colorObj.r,
      g: colorObj.g,
      b: colorObj.b,
      a: colorObj.a ?? 1,
    };
  }

  // Top-level r/g/b/a fields
  return {
    r: (params[key("r")] as number) ?? 0,
    g: (params[key("g")] as number) ?? 0,
    b: (params[key("b")] as number) ?? 0,
    a: (params[key("a")] as number) ?? 1,
  };
}
