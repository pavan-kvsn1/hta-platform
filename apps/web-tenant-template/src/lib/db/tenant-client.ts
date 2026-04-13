/**
 * Tenant-Scoped Prisma Client
 *
 * Production-grade multi-tenant data isolation using Prisma Client Extensions.
 * All queries are automatically scoped to the current tenant.
 */

import { PrismaClient } from '@prisma/client'
import { getCurrentTenantId } from './tenant-context'

// Models that have tenantId field and require tenant isolation
const TENANT_SCOPED_MODELS = new Set([
  'User',
  'CustomerUser',
  'CustomerAccount',
  'MasterInstrument',
  'Certificate',
])

/**
 * Creates a tenant-scoped Prisma client that automatically injects
 * tenantId into all queries for tenant-scoped models.
 */
export function createTenantClient(basePrisma: PrismaClient, tenantId: string) {
  return basePrisma.$extends({
    name: 'tenantIsolation',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          // Skip if model doesn't require tenant scoping
          if (!TENANT_SCOPED_MODELS.has(model)) {
            return query(args)
          }

          // Cast to any for dynamic manipulation - Prisma extensions are inherently dynamic
          const modifiedArgs = { ...args } as Record<string, unknown>

          // Add tenantId to WHERE clause for read/update/delete operations
          const operationsWithWhere = [
            'findUnique', 'findFirst', 'findMany',
            'update', 'updateMany', 'delete', 'deleteMany',
            'count', 'aggregate', 'groupBy'
          ]

          if (operationsWithWhere.includes(operation)) {
            modifiedArgs.where = {
              ...(modifiedArgs.where as Record<string, unknown> || {}),
              tenantId,
            }
          }

          // Add tenantId to DATA for create operations
          const operationsWithData = ['create', 'update', 'upsert']

          if (operationsWithData.includes(operation)) {
            if (operation === 'create' || operation === 'upsert') {
              modifiedArgs.data = {
                ...(modifiedArgs.data as Record<string, unknown> || {}),
                tenantId,
              }
            }
            // For upsert, also add to create data
            if (operation === 'upsert' && modifiedArgs.create) {
              modifiedArgs.create = {
                ...(modifiedArgs.create as Record<string, unknown>),
                tenantId,
              }
            }
          }

          // Handle createMany (array of data)
          if (operation === 'createMany' && Array.isArray(modifiedArgs.data)) {
            modifiedArgs.data = (modifiedArgs.data as Record<string, unknown>[]).map((item) => ({
              ...item,
              tenantId,
            }))
          }

          return query(modifiedArgs as typeof args)
        },
      },
    },
  })
}

// Type for the tenant-scoped client
export type TenantPrismaClient = ReturnType<typeof createTenantClient>

/**
 * Creates a context-aware Prisma client that reads tenantId from AsyncLocalStorage.
 * This allows using `prisma` directly without explicitly passing tenantId.
 *
 * If no tenant context is set, queries to tenant-scoped models will throw.
 */
export function createContextAwareClient(basePrisma: PrismaClient) {
  return basePrisma.$extends({
    name: 'contextAwareTenantIsolation',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          // Skip if model doesn't require tenant scoping
          if (!TENANT_SCOPED_MODELS.has(model)) {
            return query(args)
          }

          // Get tenant ID from async context
          const tenantId = getCurrentTenantId()

          if (!tenantId) {
            throw new Error(
              `Tenant context required for ${model}.${operation}(). ` +
              `Wrap your code with withTenantContext() or use getDb() instead.`
            )
          }

          // Cast to any for dynamic manipulation - Prisma extensions are inherently dynamic
          const modifiedArgs = { ...args } as Record<string, unknown>

          // Add tenantId to WHERE clause for read/update/delete operations
          const operationsWithWhere = [
            'findUnique', 'findFirst', 'findMany',
            'update', 'updateMany', 'delete', 'deleteMany',
            'count', 'aggregate', 'groupBy'
          ]

          if (operationsWithWhere.includes(operation)) {
            modifiedArgs.where = {
              ...(modifiedArgs.where as Record<string, unknown> || {}),
              tenantId,
            }
          }

          // Add tenantId to DATA for create operations
          const operationsWithData = ['create', 'update', 'upsert']

          if (operationsWithData.includes(operation)) {
            if (operation === 'create' || operation === 'upsert') {
              modifiedArgs.data = {
                ...(modifiedArgs.data as Record<string, unknown> || {}),
                tenantId,
              }
            }
            if (operation === 'upsert' && modifiedArgs.create) {
              modifiedArgs.create = {
                ...(modifiedArgs.create as Record<string, unknown>),
                tenantId,
              }
            }
          }

          // Handle createMany (array of data)
          if (operation === 'createMany' && Array.isArray(modifiedArgs.data)) {
            modifiedArgs.data = (modifiedArgs.data as Record<string, unknown>[]).map((item) => ({
              ...item,
              tenantId,
            }))
          }

          return query(modifiedArgs as typeof args)
        },
      },
    },
  })
}

export type ContextAwarePrismaClient = ReturnType<typeof createContextAwareClient>
