# ── Figma MCP — Relay Server ─────────────────────────────────
# Bun-native WebSocket relay. Runs TypeScript directly (no compile step).
# Build context must be the monorepo root:
#   docker build -f packages/relay/Dockerfile -t figma-mcp-relay .
# ─────────────────────────────────────────────────────────────

FROM oven/bun:1.2-alpine

WORKDIR /app

# ── Dependency installation ───────────────────────────────────
# Copy workspace manifests first for better layer caching.
COPY package.json bun.lock ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/relay/package.json   ./packages/relay/

# Install production deps only (bun-types / vitest not needed at runtime).
RUN bun install --frozen-lockfile --production

# ── Source files ──────────────────────────────────────────────
COPY tsconfig.base.json ./
COPY packages/shared/src ./packages/shared/src
COPY packages/relay/src  ./packages/relay/src

# ── Runtime ───────────────────────────────────────────────────
ENV NODE_ENV=production

# Default port (override with RELAY_PORT env var)
EXPOSE 3055

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s \
  CMD wget -qO- http://localhost:${RELAY_PORT:-3055}/health || exit 1

CMD ["bun", "run", "packages/relay/src/server.ts"]
