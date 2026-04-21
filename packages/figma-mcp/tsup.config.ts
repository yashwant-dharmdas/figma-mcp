import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node18",
  outDir: "dist",
  // Bundle the private workspace package so the published package
  // has no dependency on @figma-mcp/shared being on npm.
  noExternal: [/@figma-mcp\/.*/],
  // Keep runtime deps external — npm will install them for the user.
  external: ["ws", "zod", "@modelcontextprotocol/sdk"],
  splitting: false,
  sourcemap: false,
  clean: true,
  banner: {
    // Ensure the shebang works when the file is imported by the bin shim.
    js: "",
  },
});
