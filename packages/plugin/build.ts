// ============================================================
// Figma Plugin Build Script
//
// Produces two outputs:
//   dist/code.js  — plugin sandbox entry (IIFE, Figma API access)
//   dist/ui.html  — plugin UI (inline script, WebSocket access)
//
// Uses esbuild with target: ["es2017"] to downcompile class fields
// and other modern syntax that Figma's sandbox V8 does not support.
//
// Usage:
//   bun run build.ts        (one-time build)
//   bun run --watch build.ts (rebuild on changes)
// ============================================================

import * as esbuild from "esbuild";
import { readFileSync, mkdirSync } from "fs";

mkdirSync("./dist", { recursive: true });

// ── Build code.ts ─────────────────────────────────────────────

console.log("[build] Compiling code.ts...");

await esbuild.build({
  entryPoints: ["./src/code.ts"],
  outfile: "./dist/code.js",
  bundle: true,
  format: "iife",
  target: ["es2017"],
  define: {
    "process.env.NODE_ENV": '"production"',
  },
});

// ── Build ui.ts ───────────────────────────────────────────────

console.log("[build] Compiling ui.ts...");

const uiResult = await esbuild.build({
  entryPoints: ["./src/ui.ts"],
  bundle: true,
  format: "iife",
  target: ["es2017"],
  write: false,
});

// ── Inline JS into HTML template ──────────────────────────────

console.log("[build] Generating ui.html...");

const uiJs = new TextDecoder().decode(uiResult.outputFiles[0]!.contents);
const htmlTemplate = readFileSync("./src/ui.html", "utf-8");
const uiHtml = htmlTemplate.replace("<!-- __SCRIPT__ -->", `<script>\n${uiJs}\n</script>`);

await Bun.write("./dist/ui.html", uiHtml);

console.log("[build] ✓ dist/code.js");
console.log("[build] ✓ dist/ui.html");
console.log("[build] Done.");
