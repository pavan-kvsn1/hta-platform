/**
 * Tenant-aware Prisma client
 *
 * This module provides a context-aware Prisma client that automatically
 * scopes all queries to the current tenant using AsyncLocalStorage.
 *
 * Usage:
 * 1. Wrap your page/route with withTenantContext(tenantId, () => ...)
 * 2. Import and use prisma normally - tenant scoping is automatic
 *
 * For explicit tenant control, use getDb() or getTenantClient(tenantId).
 */
export {
  prisma,
  basePrisma,
  getDb,
  getDbForSession,
  getTenantClient,
  getDefaultTenantId,
  withTenantContext,
  getCurrentTenantId,
  withTenantId,
} from './db'

export type { TenantPrismaClient, ContextAwarePrismaClient } from './db'
