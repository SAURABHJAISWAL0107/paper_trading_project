# Multi-stage Dockerfile for PaperTrader
FROM node:22-alpine AS builder

WORKDIR /app

# Enable pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy monorepo manifests
COPY package.json pnpm-workspace.yaml ./
COPY packages/api/package.json ./packages/api/
COPY packages/web/package.json ./packages/web/

# Install dependencies
RUN pnpm install --frozen-lockfile=false

# Copy source code
COPY packages/api ./packages/api
COPY packages/web ./packages/web

# Build both web & api
RUN pnpm run build

# ── Production Runner ─────────────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4000

# Copy built artifacts and runtime packages
COPY --from=builder /app/package.json ./
COPY --from=builder /app/packages/api/dist ./packages/api/dist
COPY --from=builder /app/packages/api/package.json ./packages/api/
COPY --from=builder /app/packages/web/dist ./packages/web/dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/api/node_modules ./packages/api/node_modules

EXPOSE 4000

CMD ["node", "packages/api/dist/index.js"]
