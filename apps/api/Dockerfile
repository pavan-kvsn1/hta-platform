# syntax=docker/dockerfile:1
# =============================================================================
# HTA API Service Dockerfile
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
COPY apps/api/package.json ./apps/api/
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
RUN pnpm --filter @hta/api build

# Prune devDependencies (keeps pnpm structure intact, just removes devDeps)
RUN pnpm prune --prod

# -----------------------------------------------------------------------------
# Runner stage: Production image
# -----------------------------------------------------------------------------
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 htaapi

# Copy pruned node_modules (preserves pnpm symlink structure with Prisma client)
COPY --from=builder --chown=htaapi:nodejs /app/node_modules ./node_modules

# Copy workspace config (needed for pnpm to resolve workspace packages)
COPY --from=builder --chown=htaapi:nodejs /app/pnpm-workspace.yaml ./
COPY --from=builder --chown=htaapi:nodejs /app/package.json ./

# Copy built API
COPY --from=builder --chown=htaapi:nodejs /app/apps/api/dist ./apps/api/dist
COPY --from=builder --chown=htaapi:nodejs /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder --chown=htaapi:nodejs /app/apps/api/node_modules ./apps/api/node_modules

# Copy built database package
COPY --from=builder --chown=htaapi:nodejs /app/packages/database/dist ./packages/database/dist
COPY --from=builder --chown=htaapi:nodejs /app/packages/database/package.json ./packages/database/package.json
COPY --from=builder --chown=htaapi:nodejs /app/packages/database/prisma ./packages/database/prisma
COPY --from=builder --chown=htaapi:nodejs /app/packages/database/node_modules ./packages/database/node_modules

# Copy built shared package
COPY --from=builder --chown=htaapi:nodejs /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder --chown=htaapi:nodejs /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder --chown=htaapi:nodejs /app/packages/shared/node_modules ./packages/shared/node_modules

# Copy built emails package
COPY --from=builder --chown=htaapi:nodejs /app/packages/emails/dist ./packages/emails/dist
COPY --from=builder --chown=htaapi:nodejs /app/packages/emails/package.json ./packages/emails/package.json
COPY --from=builder --chown=htaapi:nodejs /app/packages/emails/node_modules ./packages/emails/node_modules

USER htaapi

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

CMD ["node", "apps/api/dist/server.js"]
