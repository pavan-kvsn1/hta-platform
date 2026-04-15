/**
 * Database Client Exports
 *
 * Provides tenant-scoped Prisma client for multi-tenant data isolation.
 */

import { PrismaClient } from '@prisma/client'
import { createTenantClient, TenantPrismaClient } from './tenant-client'
export { withTenantContext, getCurrentTenantId } from './tenant-context'

// Global base Prisma client (singleton)
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const basePrisma = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = basePrisma
}

// Default tenant for this HTA instance
const DEFAULT_TENANT_SLUG = 'hta-calibration'
const DEFAULT_TENANT_NAME = 'HTA Calibration Services'

// Cache for tenant ID and scoped clients
let defaultTenantId: string | null = null
const clientCache = new Map<string, TenantPrismaClient>()

/**
 * Get or create the default tenant for this app instance.
 */
export async function getDefaultTenantId(): Promise<string> {
  if (defaultTenantId) {
    return defaultTenantId
  }

  let tenant = await basePrisma.tenant.findUnique({
    where: { slug: DEFAULT_TENANT_SLUG },
  })

  if (!tenant) {
    tenant = await basePrisma.tenant.create({
      data: {
        slug: DEFAULT_TENANT_SLUG,
        name: DEFAULT_TENANT_NAME,
        isActive: true,
      },
    })
  }

  defaultTenantId = tenant.id
  return defaultTenantId
}

/**
 * Get a tenant-scoped Prisma client.
 * All queries through this client are automatically filtered by tenantId.
 */
export function getTenantClient(tenantId: string): TenantPrismaClient {
  if (!clientCache.has(tenantId)) {
    clientCache.set(tenantId, createTenantClient(basePrisma, tenantId))
  }
  return clientCache.get(tenantId)!
}

/**
 * Get the tenant-scoped client for the default tenant.
 * Use this in most cases for this single-tenant deployment.
 */
export async function getDb(): Promise<TenantPrismaClient> {
  const tenantId = await getDefaultTenantId()
  return getTenantClient(tenantId)
}

/**
 * For server components/actions: get db scoped to current session's tenant.
 * Falls back to default tenant if no session.
 */
export async function getDbForSession(sessionTenantId?: string): Promise<TenantPrismaClient> {
  const tenantId = sessionTenantId || await getDefaultTenantId()
  return getTenantClient(tenantId)
}

/**
 * Base Prisma client (no automatic tenant scoping).
 *
 * For tenant-isolated queries, use:
 * - getDb() - returns client pre-scoped to default tenant
 * - getTenantClient(tenantId) - returns client scoped to specific tenant
 * - withTenantContext(tenantId, fn) - wraps code with tenant context
 *
 * NOTE: Direct use of `prisma` on tenant-scoped models (User, Certificate, etc.)
 * will NOT automatically filter by tenant. Use getDb() for proper isolation.
 */
export const prisma = basePrisma

// Re-export types
export type { TenantPrismaClient, ContextAwarePrismaClient } from './tenant-client'

/**
 * Helper to add tenantId to data objects.
 * Use this when TypeScript requires tenantId but you're using a scoped client.
 *
 * @example
 * const db = await getDb()
 * await db.certificate.create({
 *   data: withTenantId({
 *     certificateNumber: 'CERT-001',
 *     ...
 *   })
 * })
 */
export function withTenantId<T extends Record<string, unknown>>(data: T): T & { tenantId: string } {
  return { ...data, tenantId: '' } as T & { tenantId: string }
}
