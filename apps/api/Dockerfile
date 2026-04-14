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

# Copy package.json files for all workspaces (for dependency resolution)
COPY apps/api/package.json ./apps/api/
COPY packages/database/package.json ./packages/database/
COPY packages/shared/package.json ./packages/shared/
COPY packages/emails/package.json ./packages/emails/

# Install dependencies
RUN pnpm install --frozen-lockfile

# -----------------------------------------------------------------------------
# Builder stage: Build the application
# -----------------------------------------------------------------------------
FROM base AS builder
WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages/database/node_modules ./packages/database/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/packages/emails/node_modules ./packages/emails/node_modules

# Copy source code
COPY . .

# Generate Prisma client
RUN pnpm --filter @hta/database db:generate

# Build shared packages first, then API
RUN pnpm --filter @hta/api build

# -----------------------------------------------------------------------------
# Runner stage: Production image
# -----------------------------------------------------------------------------
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 htaapi
USER htaapi

# Copy built application
COPY --from=builder --chown=htaapi:nodejs /app/apps/api/dist ./dist
COPY --from=builder --chown=htaapi:nodejs /app/apps/api/package.json ./package.json

# Copy node_modules (production dependencies)
COPY --from=builder --chown=htaapi:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=htaapi:nodejs /app/packages/database/node_modules ./packages/database/node_modules
COPY --from=builder --chown=htaapi:nodejs /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=builder --chown=htaapi:nodejs /app/packages/emails/node_modules ./packages/emails/node_modules

# Copy Prisma schema and generated client
COPY --from=builder --chown=htaapi:nodejs /app/packages/database/prisma ./packages/database/prisma
COPY --from=builder --chown=htaapi:nodejs /app/packages/database/src ./packages/database/src

# Copy shared package dist
COPY --from=builder --chown=htaapi:nodejs /app/packages/shared/src ./packages/shared/src
COPY --from=builder --chown=htaapi:nodejs /app/packages/emails/src ./packages/emails/src

EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

CMD ["node", "dist/server.js"]
