/**
 * @hta/database
 *
 * Prisma client and database utilities for multi-tenant HTA platform.
 * All queries are tenant-scoped by default.
 */

export { prisma } from './client.js'
export { getTenantContext, withTenant } from './tenant-context.js'
export type { TenantContext } from './tenant-context.js'

// Re-export Prisma namespace (as value, not just type)
export { Prisma } from '@prisma/client'

// Re-export Prisma types
export type {
  PrismaClient,
  User,
  CustomerUser,
  CustomerAccount,
  Certificate,
  MasterInstrument,
  Parameter,
  CalibrationResult,
  Tenant,
} from '@prisma/client'
