# syntax=docker/dockerfile:1
# =============================================================================
# HTA Web Frontend Dockerfile
# Multi-stage build for Next.js production deployment
# =============================================================================

# -----------------------------------------------------------------------------
# Base stage: Node.js Alpine with pnpm
# -----------------------------------------------------------------------------
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
RUN apk add --no-cache libc6-compat

# -----------------------------------------------------------------------------
# Dependencies stage: Install all dependencies
# -----------------------------------------------------------------------------
FROM base AS deps
WORKDIR /app

# Copy workspace configuration
COPY pnpm-workspace.yaml ./
COPY pnpm-lock.yaml ./
COPY package.json ./
COPY turbo.json ./

# Copy package.json files for all workspaces
COPY apps/web-hta/package.json ./apps/web-hta/
COPY packages/database/package.json ./packages/database/
COPY packages/shared/package.json ./packages/shared/
COPY packages/ui/package.json ./packages/ui/
COPY packages/emails/package.json ./packages/emails/
COPY packages/assets/package.json ./packages/assets/

# Install ALL dependencies (need devDeps for build)
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# -----------------------------------------------------------------------------
# Builder stage: Build the application
# -----------------------------------------------------------------------------
FROM base AS builder
WORKDIR /app

# Copy everything from deps (includes node_modules with pnpm structure)
COPY --from=deps /app ./

# Copy source code
COPY . .

# Generate derived assets (logos, base64 for PDFs) from packages/assets/logos/
RUN node packages/assets/scripts/generate.mjs

# Build all required packages
RUN pnpm --filter @hta/database build
RUN pnpm --filter @hta/shared build
RUN pnpm --filter @hta/emails build

# Build arguments for Next.js
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

# Build the application (Next.js standalone mode bundles everything)
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @hta/web build

# -----------------------------------------------------------------------------
# Runner stage: Production image
# -----------------------------------------------------------------------------
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

USER nextjs

# Copy standalone build (Next.js bundles all dependencies)
COPY --from=builder --chown=nextjs:nodejs /app/apps/web-hta/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web-hta/.next/static ./apps/web-hta/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web-hta/public ./apps/web-hta/public

EXPOSE 3000

CMD ["node", "apps/web-hta/server.js"]
