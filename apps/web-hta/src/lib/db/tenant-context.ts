/**
 * Tenant Context using AsyncLocalStorage
 *
 * Provides request-scoped tenant context for automatic tenant isolation.
 * This allows `prisma` to automatically scope queries to the current tenant
 * without explicitly passing tenantId everywhere.
 */

import { AsyncLocalStorage } from 'async_hooks'

interface TenantContext {
  tenantId: string
}

// AsyncLocalStorage for request-scoped tenant context
export const tenantStorage = new AsyncLocalStorage<TenantContext>()

/**
 * Get the current tenant ID from async context.
 * Returns undefined if not in a tenant context.
 */
export function getCurrentTenantId(): string | undefined {
  return tenantStorage.getStore()?.tenantId
}

/**
 * Run a function within a tenant context.
 * All database queries within this context will be scoped to the tenant.
 *
 * @example
 * await withTenantContext(tenantId, async () => {
 *   // All prisma queries here are automatically tenant-scoped
 *   const certs = await prisma.certificate.findMany()
 * })
 */
export function withTenantContext<T>(tenantId: string, fn: () => T): T {
  return tenantStorage.run({ tenantId }, fn)
}

/**
 * Higher-order function to wrap an async handler with tenant context.
 * Useful for API routes and server actions.
 */
export function withTenant<T extends (...args: unknown[]) => Promise<unknown>>(
  getTenantId: (...args: Parameters<T>) => Promise<string> | string,
  handler: T
): T {
  return (async (...args: Parameters<T>) => {
    const tenantId = await getTenantId(...args)
    return withTenantContext(tenantId, () => handler(...args))
  }) as T
}
