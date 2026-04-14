# =============================================================================
# HTA Web Tenant Template Dockerfile
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
COPY apps/web-tenant-template/package.json ./apps/web-tenant-template/
COPY packages/database/package.json ./packages/database/
COPY packages/shared/package.json ./packages/shared/
COPY packages/ui/package.json ./packages/ui/
COPY packages/emails/package.json ./packages/emails/

# Install dependencies
RUN pnpm install --frozen-lockfile

# -----------------------------------------------------------------------------
# Builder stage: Build the application
# -----------------------------------------------------------------------------
FROM base AS builder
WORKDIR /app

# Copy dependencies
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web-tenant-template/node_modules ./apps/web-tenant-template/node_modules
COPY --from=deps /app/packages/database/node_modules ./packages/database/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/packages/ui/node_modules ./packages/ui/node_modules
COPY --from=deps /app/packages/emails/node_modules ./packages/emails/node_modules

# Copy source code
COPY . .

# Generate Prisma client
RUN pnpm --filter @hta/database db:generate

# Build arguments for Next.js
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

# Build the application
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @hta/web-tenant-template build

# -----------------------------------------------------------------------------
# Runner stage: Production image
# -----------------------------------------------------------------------------
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
USER nextjs

# Copy standalone build
COPY --from=builder --chown=nextjs:nodejs /app/apps/web-tenant-template/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web-tenant-template/.next/static ./apps/web-tenant-template/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web-tenant-template/public ./apps/web-tenant-template/public

EXPOSE 3000

# Start the server
CMD ["node", "apps/web-tenant-template/server.js"]
