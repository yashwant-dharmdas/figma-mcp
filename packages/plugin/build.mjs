// Node.js build script — equivalent to build.ts but runs with plain node.
// Produces:
//   dist/code.js   — plugin sandbox (IIFE, Figma API access)
//   dist/ui.html   — plugin UI (inline script, WebSocket access)

import * as esbuild from "esbuild";
import { readFileSync, mkdirSync, writeFileSync } from "fs";

mkdirSync("./dist", { recursive: true });

// ── Build code.ts ─────────────────────────────────────────────
console.log("[build] Compiling code.ts...");

await esbuild.build({
  entryPoints: ["./src/code.ts"],
  outfile: "./dist/code.js",
  bundle: true,
  format: "iife",
  target: ["es2017"],
  define: { "process.env.NODE_ENV": '"production"' },
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

const uiJs       = new TextDecoder().decode(uiResult.outputFiles[0].contents);
const template   = readFileSync("./src/ui.html", "utf-8");
const uiHtml     = template.replace("<!-- __SCRIPT__ -->", `<script>\n${uiJs}\n</script>`);

writeFileSync("./dist/ui.html", uiHtml, "utf-8");

console.log("[build] ✓ dist/code.js");
console.log("[build] ✓ dist/ui.html");
console.log("[build] Done.");
