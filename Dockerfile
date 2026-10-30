# Multi-stage Dockerfile for PaperTrader
FROM node:22-slim AS builder

WORKDIR /app

# Install pnpm globally
RUN npm install -g pnpm

# Copy workspace definitions and lockfile
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/api/package.json ./packages/api/
COPY packages/web/package.json ./packages/web/

# Install all dependencies
RUN pnpm install

# Copy source code
COPY packages/api ./packages/api
COPY packages/web ./packages/web

# Build both web & api
RUN pnpm run build

# ── Production Runner ─────────────────────────────────────────
FROM node:22-slim AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4000

# Copy application and artifacts from builder
COPY --from=builder /app /app

EXPOSE 4000

CMD ["node", "packages/api/dist/index.js"]
