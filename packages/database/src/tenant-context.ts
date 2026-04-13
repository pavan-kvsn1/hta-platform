import { AsyncLocalStorage } from 'node:async_hooks'

export interface TenantContext {
  tenantId: string
  tenantSlug: string
}

const tenantStorage = new AsyncLocalStorage<TenantContext>()

/**
 * Get the current tenant context from async local storage.
 * Returns undefined if no tenant context is set.
 */
export function getTenantContext(): TenantContext | undefined {
  return tenantStorage.getStore()
}

/**
 * Run a function within a tenant context.
 * All database queries within the callback will be scoped to this tenant.
 */
export function withTenant<T>(context: TenantContext, fn: () => T): T {
  return tenantStorage.run(context, fn)
}

/**
 * Require tenant context - throws if not in a tenant context.
 */
export function requireTenantContext(): TenantContext {
  const context = getTenantContext()
  if (!context) {
    throw new Error('Tenant context required but not found')
  }
  return context
}
