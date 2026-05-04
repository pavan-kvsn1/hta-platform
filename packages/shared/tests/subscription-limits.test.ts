/**
 * Subscription Limits Unit Tests
 *
 * Tests for:
 * - TIER_LIMITS — each tier has all required fields
 * - getEffectiveLimit() — correct limit per tier per resource; INTERNAL = Infinity
 * - checkLimit() — under limit allowed; at limit not allowed with reason; correct remaining
 * - hasFeature() — STARTER lacks premium features; SCALE has all
 * - getUsagePercentage() — correct math; zero limit -> 100%; Infinity -> 0%
 */

import { describe, it, expect } from 'vitest'
import {
  TIER_LIMITS,
  getEffectiveLimit,
  checkLimit,
  hasFeature,
  getUsagePercentage,
  type TenantTier,
  type SubscriptionData,
  type UsageData,
  type LimitResource,
} from '../src/subscription/limits'

describe('TIER_LIMITS', () => {
  const requiredFields = ['certificates', 'staffUsers', 'customerAccounts', 'customerUsers', 'features']
  const tiers: TenantTier[] = ['STARTER', 'GROWTH', 'SCALE', 'INTERNAL']

  for (const tier of tiers) {
    it(`${tier} tier has all required fields`, () => {
      const limits = TIER_LIMITS[tier]
      for (const field of requiredFields) {
        expect(limits).toHaveProperty(field)
      }
    })
  }

  it('STARTER has lowest limits', () => {
    expect(TIER_LIMITS.STARTER.certificates).toBe(500)
    expect(TIER_LIMITS.STARTER.staffUsers).toBe(5)
    expect(TIER_LIMITS.STARTER.customerAccounts).toBe(20)
    expect(TIER_LIMITS.STARTER.customerUsers).toBe(50)
  })

  it('GROWTH has higher limits than STARTER', () => {
    expect(TIER_LIMITS.GROWTH.certificates).toBeGreaterThan(TIER_LIMITS.STARTER.certificates)
    expect(TIER_LIMITS.GROWTH.staffUsers).toBeGreaterThan(TIER_LIMITS.STARTER.staffUsers)
  })

  it('SCALE and INTERNAL have unlimited resources (-1)', () => {
    for (const tier of ['SCALE', 'INTERNAL'] as TenantTier[]) {
      expect(TIER_LIMITS[tier].certificates).toBe(-1)
      expect(TIER_LIMITS[tier].staffUsers).toBe(-1)
      expect(TIER_LIMITS[tier].customerAccounts).toBe(-1)
      expect(TIER_LIMITS[tier].customerUsers).toBe(-1)
    }
  })

  it('all tiers have features as an array', () => {
    for (const tier of tiers) {
      expect(Array.isArray(TIER_LIMITS[tier].features)).toBe(true)
      expect(TIER_LIMITS[tier].features.length).toBeGreaterThan(0)
    }
  })
})

describe('getEffectiveLimit', () => {
  it('returns base limit for STARTER certificates (no extras)', () => {
    const sub: SubscriptionData = {
      tier: 'STARTER',
      extraStaffSeats: 0,
      extraCustomerAccounts: 0,
      extraCustomerUserSeats: 0,
    }
    expect(getEffectiveLimit(sub, 'certificates')).toBe(500)
  })

  it('returns base + extra for staffUsers', () => {
    const sub: SubscriptionData = {
      tier: 'STARTER',
      extraStaffSeats: 3,
      extraCustomerAccounts: 0,
      extraCustomerUserSeats: 0,
    }
    expect(getEffectiveLimit(sub, 'staffUsers')).toBe(8) // 5 + 3
  })

  it('returns base + extra for customerAccounts', () => {
    const sub: SubscriptionData = {
      tier: 'STARTER',
      extraStaffSeats: 0,
      extraCustomerAccounts: 10,
      extraCustomerUserSeats: 0,
    }
    expect(getEffectiveLimit(sub, 'customerAccounts')).toBe(30) // 20 + 10
  })

  it('returns base + extra for customerUsers', () => {
    const sub: SubscriptionData = {
      tier: 'GROWTH',
      extraStaffSeats: 0,
      extraCustomerAccounts: 0,
      extraCustomerUserSeats: 20,
    }
    expect(getEffectiveLimit(sub, 'customerUsers')).toBe(320) // 300 + 20
  })

  it('returns Infinity for INTERNAL tier', () => {
    const sub: SubscriptionData = {
      tier: 'INTERNAL',
      extraStaffSeats: 0,
      extraCustomerAccounts: 0,
      extraCustomerUserSeats: 0,
    }
    const resources: LimitResource[] = ['certificates', 'staffUsers', 'customerAccounts', 'customerUsers']
    for (const resource of resources) {
      expect(getEffectiveLimit(sub, resource)).toBe(Infinity)
    }
  })

  it('returns Infinity for SCALE tier', () => {
    const sub: SubscriptionData = {
      tier: 'SCALE',
      extraStaffSeats: 0,
      extraCustomerAccounts: 0,
      extraCustomerUserSeats: 0,
    }
    expect(getEffectiveLimit(sub, 'certificates')).toBe(Infinity)
    expect(getEffectiveLimit(sub, 'staffUsers')).toBe(Infinity)
  })

  it('does not add extras to certificates (no extra cert add-on)', () => {
    const sub: SubscriptionData = {
      tier: 'STARTER',
      extraStaffSeats: 5,
      extraCustomerAccounts: 5,
      extraCustomerUserSeats: 5,
    }
    expect(getEffectiveLimit(sub, 'certificates')).toBe(500)
  })
})

describe('checkLimit', () => {
  const baseSub: SubscriptionData = {
    tier: 'STARTER',
    extraStaffSeats: 0,
    extraCustomerAccounts: 0,
    extraCustomerUserSeats: 0,
  }

  it('allows operation when under limit', () => {
    const usage: UsageData = {
      certificatesIssued: 100,
      staffUserCount: 2,
      customerAccountCount: 5,
      customerUserCount: 10,
    }

    const result = checkLimit(baseSub, usage, 'certificates')
    expect(result.allowed).toBe(true)
    expect(result.current).toBe(100)
    expect(result.remaining).toBe(400) // 500 - 100
  })

  it('disallows operation when at limit', () => {
    const usage: UsageData = {
      certificatesIssued: 500,
      staffUserCount: 2,
      customerAccountCount: 5,
      customerUserCount: 10,
    }

    const result = checkLimit(baseSub, usage, 'certificates')
    expect(result.allowed).toBe(false)
    expect(result.remaining).toBe(0)
    expect(result.message).toBeDefined()
    expect(result.message).toContain('limit reached')
  })

  it('disallows when increment would exceed limit', () => {
    const usage: UsageData = {
      certificatesIssued: 499,
      staffUserCount: 2,
      customerAccountCount: 5,
      customerUserCount: 10,
    }

    const result = checkLimit(baseSub, usage, 'certificates', 2)
    expect(result.allowed).toBe(false)
    expect(result.message).toContain('upgrade')
  })

  it('always allows for INTERNAL tier (Infinity limit)', () => {
    const internalSub: SubscriptionData = {
      tier: 'INTERNAL',
      extraStaffSeats: 0,
      extraCustomerAccounts: 0,
      extraCustomerUserSeats: 0,
    }
    const usage: UsageData = {
      certificatesIssued: 999999,
      staffUserCount: 99999,
      customerAccountCount: 99999,
      customerUserCount: 99999,
    }

    const result = checkLimit(internalSub, usage, 'certificates')
    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(-1) // Infinity mapped to -1
    expect(result.limit).toBe(-1)
  })

  it('checks staffUsers limit correctly', () => {
    const usage: UsageData = {
      certificatesIssued: 0,
      staffUserCount: 5,
      customerAccountCount: 0,
      customerUserCount: 0,
    }

    const result = checkLimit(baseSub, usage, 'staffUsers')
    expect(result.allowed).toBe(false)
    expect(result.current).toBe(5)
    expect(result.limit).toBe(5)
    expect(result.message).toContain('Staff user')
  })

  it('returns correct remaining calculation', () => {
    const usage: UsageData = {
      certificatesIssued: 300,
      staffUserCount: 1,
      customerAccountCount: 3,
      customerUserCount: 10,
    }

    const result = checkLimit(baseSub, usage, 'certificates')
    expect(result.remaining).toBe(200) // 500 - 300
  })

  it('default increment is 1', () => {
    const usage: UsageData = {
      certificatesIssued: 499,
      staffUserCount: 0,
      customerAccountCount: 0,
      customerUserCount: 0,
    }

    const result = checkLimit(baseSub, usage, 'certificates')
    expect(result.allowed).toBe(true)
  })
})

describe('hasFeature', () => {
  it('STARTER has basic_workflows', () => {
    expect(hasFeature('STARTER', 'basic_workflows')).toBe(true)
  })

  it('STARTER has customer_portal', () => {
    expect(hasFeature('STARTER', 'customer_portal')).toBe(true)
  })

  it('STARTER lacks api_access', () => {
    expect(hasFeature('STARTER', 'api_access')).toBe(false)
  })

  it('STARTER lacks custom_branding', () => {
    expect(hasFeature('STARTER', 'custom_branding')).toBe(false)
  })

  it('STARTER lacks advanced_workflows', () => {
    expect(hasFeature('STARTER', 'advanced_workflows')).toBe(false)
  })

  it('GROWTH has api_access', () => {
    expect(hasFeature('GROWTH', 'api_access')).toBe(true)
  })

  it('GROWTH has custom_branding', () => {
    expect(hasFeature('GROWTH', 'custom_branding')).toBe(true)
  })

  it('GROWTH has advanced_workflows', () => {
    expect(hasFeature('GROWTH', 'advanced_workflows')).toBe(true)
  })

  it('SCALE has all features (includes "all")', () => {
    expect(hasFeature('SCALE', 'api_access')).toBe(true)
    expect(hasFeature('SCALE', 'custom_branding')).toBe(true)
    expect(hasFeature('SCALE', 'anything_at_all')).toBe(true)
  })

  it('INTERNAL has all features', () => {
    expect(hasFeature('INTERNAL', 'any_feature')).toBe(true)
  })
})

describe('getUsagePercentage', () => {
  const baseSub: SubscriptionData = {
    tier: 'STARTER',
    extraStaffSeats: 0,
    extraCustomerAccounts: 0,
    extraCustomerUserSeats: 0,
  }

  it('returns correct percentage', () => {
    const usage: UsageData = {
      certificatesIssued: 250,
      staffUserCount: 0,
      customerAccountCount: 0,
      customerUserCount: 0,
    }

    const pct = getUsagePercentage(baseSub, usage, 'certificates')
    expect(pct).toBe(50) // 250/500 = 50%
  })

  it('returns 0% for Infinity limit (INTERNAL/SCALE)', () => {
    const internalSub: SubscriptionData = {
      tier: 'INTERNAL',
      extraStaffSeats: 0,
      extraCustomerAccounts: 0,
      extraCustomerUserSeats: 0,
    }
    const usage: UsageData = {
      certificatesIssued: 99999,
      staffUserCount: 0,
      customerAccountCount: 0,
      customerUserCount: 0,
    }

    expect(getUsagePercentage(internalSub, usage, 'certificates')).toBe(0)
  })

  it('returns 100% when at limit', () => {
    const usage: UsageData = {
      certificatesIssued: 500,
      staffUserCount: 0,
      customerAccountCount: 0,
      customerUserCount: 0,
    }

    expect(getUsagePercentage(baseSub, usage, 'certificates')).toBe(100)
  })

  it('returns > 100% when over limit', () => {
    const usage: UsageData = {
      certificatesIssued: 600,
      staffUserCount: 0,
      customerAccountCount: 0,
      customerUserCount: 0,
    }

    expect(getUsagePercentage(baseSub, usage, 'certificates')).toBe(120)
  })

  it('returns 0% when no usage', () => {
    const usage: UsageData = {
      certificatesIssued: 0,
      staffUserCount: 0,
      customerAccountCount: 0,
      customerUserCount: 0,
    }

    expect(getUsagePercentage(baseSub, usage, 'certificates')).toBe(0)
  })

  it('rounds to nearest integer', () => {
    const usage: UsageData = {
      certificatesIssued: 333,
      staffUserCount: 0,
      customerAccountCount: 0,
      customerUserCount: 0,
    }

    const pct = getUsagePercentage(baseSub, usage, 'certificates')
    expect(pct).toBe(67) // 333/500 = 66.6 -> rounds to 67
  })
})
