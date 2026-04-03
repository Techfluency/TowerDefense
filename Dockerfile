# ---------------------------------------------------------------
# Tower Defense Game -- Dockerfile
# ---------------------------------------------------------------
# This game is client-side only (no backend). Docker serves two purposes:
# 1. Development: run the Vite dev server in a reproducible environment
# 2. Build: produce the dist/ folder for Cloudflare Pages deployment
#
# Multi-stage build:
#   Stage 1 (build): Install deps, compile TypeScript, bundle with Vite
#   Stage 2 (serve): Serve the static dist/ with a lightweight HTTP server
# ---------------------------------------------------------------

# --- Stage 1: Build ---
FROM node:22-alpine AS build

# pnpm is the project's package manager.
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy package manifests first for layer caching.
# If dependencies have not changed, Docker reuses the cached layer.
COPY package.json pnpm-lock.yaml ./

RUN pnpm install --frozen-lockfile

# Copy all source and assets, then build.
COPY . .
RUN pnpm run build

# --- Stage 2: Serve ---
# In production, Cloudflare Pages serves the dist/ folder directly.
# This stage is for local preview and testing only.
FROM node:22-alpine AS serve

RUN npm install -g serve

WORKDIR /app
COPY --from=build /app/dist ./dist

EXPOSE 3000

CMD ["serve", "dist", "-l", "3000"]
