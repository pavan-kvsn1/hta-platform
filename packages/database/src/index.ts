/**
 * @hta/database
 *
 * Prisma client and database utilities for multi-tenant HTA platform.
 * All queries are tenant-scoped by default.
 */

export { prisma } from './client'
export { getTenantContext, withTenant } from './tenant-context'
export type { TenantContext } from './tenant-context'

// Re-export Prisma types
export type { PrismaClient, Prisma } from '@prisma/client'
