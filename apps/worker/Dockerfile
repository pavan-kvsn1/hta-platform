# syntax=docker/dockerfile:1
# =============================================================================
# HTA Worker Service Dockerfile
# Multi-stage build for production deployment
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
COPY apps/worker/package.json ./apps/worker/
COPY packages/database/package.json ./packages/database/
COPY packages/shared/package.json ./packages/shared/
COPY packages/emails/package.json ./packages/emails/

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

# Generate Prisma client and build all packages
RUN pnpm --filter @hta/database build
RUN pnpm --filter @hta/shared build
RUN pnpm --filter @hta/emails build
RUN pnpm --filter @hta/worker build

# Prune devDependencies (keeps pnpm structure intact)
RUN pnpm prune --prod

# -----------------------------------------------------------------------------
# Runner stage: Production image
# -----------------------------------------------------------------------------
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 htaworker

# Copy pruned node_modules (preserves pnpm symlink structure with Prisma client)
COPY --from=builder --chown=htaworker:nodejs /app/node_modules ./node_modules

# Copy workspace config (needed for pnpm to resolve workspace packages)
COPY --from=builder --chown=htaworker:nodejs /app/pnpm-workspace.yaml ./
COPY --from=builder --chown=htaworker:nodejs /app/package.json ./

# Copy built worker
COPY --from=builder --chown=htaworker:nodejs /app/apps/worker/dist ./apps/worker/dist
COPY --from=builder --chown=htaworker:nodejs /app/apps/worker/package.json ./apps/worker/package.json
COPY --from=builder --chown=htaworker:nodejs /app/apps/worker/node_modules ./apps/worker/node_modules

# Copy built database package
COPY --from=builder --chown=htaworker:nodejs /app/packages/database/dist ./packages/database/dist
COPY --from=builder --chown=htaworker:nodejs /app/packages/database/package.json ./packages/database/package.json
COPY --from=builder --chown=htaworker:nodejs /app/packages/database/prisma ./packages/database/prisma
COPY --from=builder --chown=htaworker:nodejs /app/packages/database/node_modules ./packages/database/node_modules

# Copy built shared package
COPY --from=builder --chown=htaworker:nodejs /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder --chown=htaworker:nodejs /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder --chown=htaworker:nodejs /app/packages/shared/node_modules ./packages/shared/node_modules

# Copy built emails package
COPY --from=builder --chown=htaworker:nodejs /app/packages/emails/dist ./packages/emails/dist
COPY --from=builder --chown=htaworker:nodejs /app/packages/emails/package.json ./packages/emails/package.json
COPY --from=builder --chown=htaworker:nodejs /app/packages/emails/node_modules ./packages/emails/node_modules

USER htaworker

# No port exposed - worker is not a web server

CMD ["node", "apps/worker/dist/index.js"]
