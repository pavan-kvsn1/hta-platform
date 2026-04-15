import { describe, it, expect } from 'vitest'
import { getTenantContext, withTenant } from '../src/tenant-context.js'
import type { TenantContext } from '../src/tenant-context.js'

describe('tenant-context', () => {
  describe('getTenantContext', () => {
    it('returns undefined when no tenant context is set', () => {
      const result = getTenantContext()
      expect(result).toBeUndefined()
    })

    it('returns the tenant context when inside withTenant', () => {
      const context: TenantContext = {
        tenantId: 'tenant-123',
        tenantSlug: 'acme-corp',
      }

      withTenant(context, () => {
        const result = getTenantContext()
        expect(result).toEqual(context)
        expect(result?.tenantId).toBe('tenant-123')
        expect(result?.tenantSlug).toBe('acme-corp')
      })
    })
  })

  describe('withTenant', () => {
    it('runs the callback and returns its result', () => {
      const context: TenantContext = {
        tenantId: 'tenant-456',
        tenantSlug: 'test-org',
      }

      const result = withTenant(context, () => {
        return 'callback-result'
      })

      expect(result).toBe('callback-result')
    })

    it('provides tenant context to nested calls', () => {
      const context: TenantContext = {
        tenantId: 'tenant-789',
        tenantSlug: 'nested-org',
      }

      withTenant(context, () => {
        const innerContext = getTenantContext()
        expect(innerContext).toBeDefined()
        expect(innerContext?.tenantId).toBe('tenant-789')
      })
    })

    it('clears context after callback completes', () => {
      const context: TenantContext = {
        tenantId: 'tenant-temp',
        tenantSlug: 'temp-org',
      }

      withTenant(context, () => {
        // Context should be set here
        expect(getTenantContext()).toBeDefined()
      })

      // Context should be cleared after withTenant returns
      expect(getTenantContext()).toBeUndefined()
    })

    it('handles nested withTenant calls correctly', () => {
      const outerContext: TenantContext = {
        tenantId: 'tenant-outer',
        tenantSlug: 'outer-org',
      }
      const innerContext: TenantContext = {
        tenantId: 'tenant-inner',
        tenantSlug: 'inner-org',
      }

      withTenant(outerContext, () => {
        expect(getTenantContext()?.tenantId).toBe('tenant-outer')

        withTenant(innerContext, () => {
          expect(getTenantContext()?.tenantId).toBe('tenant-inner')
        })

        // After inner withTenant returns, outer context should be restored
        expect(getTenantContext()?.tenantId).toBe('tenant-outer')
      })
    })

    it('propagates errors from callback', () => {
      const context: TenantContext = {
        tenantId: 'tenant-error',
        tenantSlug: 'error-org',
      }

      expect(() => {
        withTenant(context, () => {
          throw new Error('Test error')
        })
      }).toThrow('Test error')

      // Context should still be cleared after error
      expect(getTenantContext()).toBeUndefined()
    })

    it('works with async callbacks', async () => {
      const context: TenantContext = {
        tenantId: 'tenant-async',
        tenantSlug: 'async-org',
      }

      const result = await withTenant(context, async () => {
        // Simulate async operation
        await new Promise((resolve) => setTimeout(resolve, 10))
        const ctx = getTenantContext()
        return ctx?.tenantId
      })

      expect(result).toBe('tenant-async')
    })
  })
})
