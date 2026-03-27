// ============================================================
// Figma Plugin Build Script
//
// Produces two outputs:
//   dist/code.js  — plugin sandbox entry (IIFE, Figma API access)
//   dist/ui.html  — plugin UI (inline script, WebSocket access)
//
// Usage:
//   bun run build.ts        (one-time build)
//   bun run --watch build.ts (rebuild on changes)
// ============================================================

import { readFileSync, mkdirSync } from "fs";

mkdirSync("./dist", { recursive: true });

// ── Build code.ts ─────────────────────────────────────────────

console.log("[build] Compiling code.ts...");

const codeResult = await Bun.build({
  entrypoints: ["./src/code.ts"],
  outdir: "./dist",
  target: "browser",
  format: "iife",
  naming: "[name].js",
  minify: { whitespace: false, identifiers: false, syntax: false },
  define: {
    // Bun sets these; silence any undefined warnings
    "process.env.NODE_ENV": '"production"',
  },
});

if (!codeResult.success) {
  console.error("[build] code.ts FAILED:");
  for (const log of codeResult.logs) console.error(" ", log);
  process.exit(1);
}

// ── Build ui.ts ───────────────────────────────────────────────

console.log("[build] Compiling ui.ts...");

const uiResult = await Bun.build({
  entrypoints: ["./src/ui.ts"],
  target: "browser",
  format: "iife",
  minify: { whitespace: false, identifiers: false, syntax: false },
});

if (!uiResult.success) {
  console.error("[build] ui.ts FAILED:");
  for (const log of uiResult.logs) console.error(" ", log);
  process.exit(1);
}

// ── Inline JS into HTML template ──────────────────────────────

console.log("[build] Generating ui.html...");

const uiJs = await uiResult.outputs[0]!.text();
const htmlTemplate = readFileSync("./src/ui.html", "utf-8");
const uiHtml = htmlTemplate.replace("<!-- __SCRIPT__ -->", `<script>\n${uiJs}\n</script>`);

await Bun.write("./dist/ui.html", uiHtml);

console.log("[build] ✓ dist/code.js");
console.log("[build] ✓ dist/ui.html");
console.log("[build] Done.");
