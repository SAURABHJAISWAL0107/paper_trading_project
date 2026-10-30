# Multi-stage Dockerfile for PaperTrader
FROM node:22-slim AS builder

WORKDIR /app

# Install pnpm v9 to match lockfileVersion 9.0
RUN npm install -g pnpm@9

# Copy workspace definitions, config, and lockfile
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc* ./
COPY packages/api/package.json ./packages/api/
COPY packages/web/package.json ./packages/web/

# Install dependencies
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
