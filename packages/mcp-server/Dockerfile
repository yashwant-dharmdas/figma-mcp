# ── Figma MCP — MCP Server ───────────────────────────────────
# StreamableHTTP MCP server. Runs TypeScript directly with Bun.
# Build context must be the monorepo root:
#   docker build -f packages/mcp-server/Dockerfile -t figma-mcp-server .
# ─────────────────────────────────────────────────────────────

FROM oven/bun:1.2-alpine

WORKDIR /app

# ── Dependency installation ───────────────────────────────────
COPY package.json bun.lock ./
COPY packages/shared/package.json     ./packages/shared/
COPY packages/mcp-server/package.json ./packages/mcp-server/

RUN bun install --production

# ── Source files ──────────────────────────────────────────────
COPY tsconfig.base.json ./
COPY packages/shared/src    ./packages/shared/src
COPY packages/mcp-server/src ./packages/mcp-server/src

# ── Runtime ───────────────────────────────────────────────────
ENV NODE_ENV=production

# Default port (override with MCP_PORT env var)
EXPOSE 3001

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s \
  CMD wget -qO- http://localhost:${MCP_PORT:-3001}/health || exit 1

CMD ["bun", "run", "packages/mcp-server/src/server.ts"]
