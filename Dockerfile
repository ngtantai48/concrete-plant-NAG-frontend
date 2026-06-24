# syntax=docker/dockerfile:1
# Multi-stage production build for Next.js (output: 'standalone').
# Runtime image ships only the standalone server + static assets -> small image, low RAM.

# ============================================================
# Base — slim Node (glibc) + pnpm via corepack (pinned by packageManager)
# ============================================================
FROM node:22-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /app

# ============================================================
# Deps — install with frozen lockfile (BuildKit cache for pnpm store)
# ============================================================
FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile

# ============================================================
# Builder — produce .next/standalone (next build runs here)
# ============================================================
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN --mount=type=cache,id=next-cache,target=/app/.next/cache \
    pnpm build

# ============================================================
# Runner — minimal runtime, non-root, only the standalone output
# ============================================================
FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=4000
ENV HOSTNAME=0.0.0.0

RUN groupadd --system --gid 1001 nodejs \
 && useradd --system --uid 1001 --gid nodejs nextjs

# public assets + standalone server + static chunks
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 4000
CMD ["node", "server.js"]
