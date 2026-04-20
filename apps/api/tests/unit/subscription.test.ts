/**
 * Subscription Service Unit Tests
 *
 * Tests for tenant subscription limits and usage tracking functionality.
 * Mocks Prisma database operations to test business logic.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Type definitions
type TenantTier = 'STARTER' | 'GROWTH' | 'SCALE' | 'INTERNAL'

type LimitResource = 'certificates' | 'staffUsers' | 'customerAccounts' | 'customerUsers'

interface SubscriptionData {
  tier: TenantTier
  extraStaffSeats: number
  extraCustomerAccounts: number
  extraCustomerUserSeats: number
}

interface UsageData {
  certificatesIssued: number
  staffUserCount: number
  customerAccountCount: number
  customerUserCount: number
}

interface LimitCheckResult {
  allowed: boolean
  current: number
  limit: number
  remaining: number
  message?: string
}

// Tier limits for testing
const TIER_LIMITS: Record<TenantTier, { certificates: number; staffUsers: number; customerAccounts: number; customerUsers: number }> = {
  STARTER: { certificates: 500, staffUsers: 5, customerAccounts: 20, customerUsers: 50 },
  GROWTH: { certificates: 5000, staffUsers: 15, customerAccounts: 100, customerUsers: 300 },
  SCALE: { certificates: -1, staffUsers: -1, customerAccounts: -1, customerUsers: -1 },
  INTERNAL: { certificates: -1, staffUsers: -1, customerAccounts: -1, customerUsers: -1 },
}

// Mock implementation of checkLimit
function mockCheckLimit(
  subscription: SubscriptionData,
  usage: UsageData,
  resource: LimitResource,
  increment: number = 1
): LimitCheckResult {
  let baseLimit = TIER_LIMITS[subscription.tier][resource]

  // Add extra seats
  if (resource === 'staffUsers') {
    baseLimit = baseLimit === -1 ? -1 : baseLimit + subscription.extraStaffSeats
  } else if (resource === 'customerAccounts') {
    baseLimit = baseLimit === -1 ? -1 : baseLimit + subscription.extraCustomerAccounts
  } else if (resource === 'customerUsers') {
    baseLimit = baseLimit === -1 ? -1 : baseLimit + subscription.extraCustomerUserSeats
  }

  const limit = baseLimit === -1 ? Infinity : baseLimit

  const currentMap: Record<LimitResource, number> = {
    certificates: usage.certificatesIssued,
    staffUsers: usage.staffUserCount,
    customerAccounts: usage.customerAccountCount,
    customerUsers: usage.customerUserCount,
  }

  const current = currentMap[resource]
  const remaining = limit === Infinity ? Infinity : limit - current

  if (current + increment > limit && limit !== Infinity) {
    return {
      allowed: false,
      current,
      limit: limit === Infinity ? -1 : limit,
      remaining: remaining === Infinity ? -1 : remaining,
      message: `limit reached (${current}/${limit}). Please upgrade your plan or purchase additional seats.`,
    }
  }

  return {
    allowed: true,
    current,
    limit: limit === Infinity ? -1 : limit,
    remaining: remaining === Infinity ? -1 : remaining,
  }
}

// Mock @hta/shared before importing subscription service
vi.mock('@hta/shared', () => ({
  checkLimit: vi.fn((subscription: SubscriptionData, usage: UsageData, resource: LimitResource, increment: number = 1) =>
    mockCheckLimit(subscription, usage, resource, increment)
  ),
}))

// Mock @hta/database
vi.mock('@hta/database', () => ({
  prisma: {
    tenantSubscription: {
      findUnique: vi.fn(),
    },
    certificate: {
      count: vi.fn(),
    },
    user: {
      count: vi.fn(),
    },
    customerAccount: {
      count: vi.fn(),
    },
    customerUser: {
      count: vi.fn(),
    },
    tenantUsage: {
      upsert: vi.fn(),
    },
  },
}))

// Import after mocking
import { prisma } from '@hta/database'
import {
  getSubscription,
  getCurrentUsage,
  canCreate,
  enforceLimit,
  updateUsageTracking,
  getSubscriptionStatus,
} from '../../src/services/subscription'

describe('Subscription Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getSubscription', () => {
    it('should return subscription data when subscription exists', async () => {
      const mockSubscription = {
        tenantId: 'tenant-123',
        tier: 'GROWTH' as TenantTier,
        extraStaffSeats: 5,
        extraCustomerAccounts: 10,
        extraCustomerUserSeats: 20,
      }

      vi.mocked(prisma.tenantSubscription.findUnique).mockResolvedValue(mockSubscription as any)

      const result = await getSubscription('tenant-123')

      expect(prisma.tenantSubscription.findUnique).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-123' },
      })
      expect(result).toEqual({
        tier: 'GROWTH',
        extraStaffSeats: 5,
        extraCustomerAccounts: 10,
        extraCustomerUserSeats: 20,
      })
    })

    it('should return null when no subscription exists', async () => {
      vi.mocked(prisma.tenantSubscription.findUnique).mockResolvedValue(null)

      const result = await getSubscription('tenant-nonexistent')

      expect(result).toBeNull()
    })

    it('should handle all tier types', async () => {
      const tiers: TenantTier[] = ['STARTER', 'GROWTH', 'SCALE', 'INTERNAL']

      for (const tier of tiers) {
        vi.mocked(prisma.tenantSubscription.findUnique).mockResolvedValue({
          tenantId: 'tenant-123',
          tier,
          extraStaffSeats: 0,
          extraCustomerAccounts: 0,
          extraCustomerUserSeats: 0,
        } as any)

        const result = await getSubscription('tenant-123')
        expect(result?.tier).toBe(tier)
      }
    })
  })

  describe('getCurrentUsage', () => {
    it('should return correct usage counts', async () => {
      vi.mocked(prisma.certificate.count).mockResolvedValue(150)
      vi.mocked(prisma.user.count).mockResolvedValue(10)
      vi.mocked(prisma.customerAccount.count).mockResolvedValue(25)
      vi.mocked(prisma.customerUser.count).mockResolvedValue(75)

      const result = await getCurrentUsage('tenant-123')

      expect(result).toEqual({
        certificatesIssued: 150,
        staffUserCount: 10,
        customerAccountCount: 25,
        customerUserCount: 75,
      })
    })

    it('should count certificates created this month only', async () => {
      vi.mocked(prisma.certificate.count).mockResolvedValue(50)
      vi.mocked(prisma.user.count).mockResolvedValue(5)
      vi.mocked(prisma.customerAccount.count).mockResolvedValue(10)
      vi.mocked(prisma.customerUser.count).mockResolvedValue(20)

      await getCurrentUsage('tenant-123')

      expect(prisma.certificate.count).toHaveBeenCalledWith({
        where: {
          tenantId: 'tenant-123',
          createdAt: { gte: expect.any(Date) },
        },
      })
    })

    it('should count only active users', async () => {
      vi.mocked(prisma.certificate.count).mockResolvedValue(0)
      vi.mocked(prisma.user.count).mockResolvedValue(5)
      vi.mocked(prisma.customerAccount.count).mockResolvedValue(10)
      vi.mocked(prisma.customerUser.count).mockResolvedValue(20)

      await getCurrentUsage('tenant-123')

      expect(prisma.user.count).toHaveBeenCalledWith({
        where: {
          tenantId: 'tenant-123',
          isActive: true,
        },
      })
      expect(prisma.customerAccount.count).toHaveBeenCalledWith({
        where: {
          tenantId: 'tenant-123',
          isActive: true,
        },
      })
      expect(prisma.customerUser.count).toHaveBeenCalledWith({
        where: {
          tenantId: 'tenant-123',
          isActive: true,
        },
      })
    })

    it('should return zero counts when no data exists', async () => {
      vi.mocked(prisma.certificate.count).mockResolvedValue(0)
      vi.mocked(prisma.user.count).mockResolvedValue(0)
      vi.mocked(prisma.customerAccount.count).mockResolvedValue(0)
      vi.mocked(prisma.customerUser.count).mockResolvedValue(0)

      const result = await getCurrentUsage('tenant-123')

      expect(result).toEqual({
        certificatesIssued: 0,
        staffUserCount: 0,
        customerAccountCount: 0,
        customerUserCount: 0,
      })
    })
  })

  describe('canCreate', () => {
    const mockStarterSubscription = {
      tenantId: 'tenant-123',
      tier: 'STARTER' as TenantTier,
      extraStaffSeats: 0,
      extraCustomerAccounts: 0,
      extraCustomerUserSeats: 0,
    }

    beforeEach(() => {
      vi.mocked(prisma.certificate.count).mockResolvedValue(0)
      vi.mocked(prisma.user.count).mockResolvedValue(0)
      vi.mocked(prisma.customerAccount.count).mockResolvedValue(0)
      vi.mocked(prisma.customerUser.count).mockResolvedValue(0)
    })

    it('should allow creation when within limits', async () => {
      vi.mocked(prisma.tenantSubscription.findUnique).mockResolvedValue(mockStarterSubscription as any)
      vi.mocked(prisma.user.count).mockResolvedValue(3) // STARTER limit is 5

      const result = await canCreate('tenant-123', 'staffUsers')

      expect(result.allowed).toBe(true)
      expect(result.current).toBe(3)
      expect(result.remaining).toBe(2)
    })

    it('should deny creation when at limit', async () => {
      vi.mocked(prisma.tenantSubscription.findUnique).mockResolvedValue(mockStarterSubscription as any)
      vi.mocked(prisma.user.count).mockResolvedValue(5) // STARTER limit is 5

      const result = await canCreate('tenant-123', 'staffUsers')

      expect(result.allowed).toBe(false)
      expect(result.current).toBe(5)
      expect(result.remaining).toBe(0)
      expect(result.message).toContain('limit reached')
    })

    it('should deny creation when over limit', async () => {
      vi.mocked(prisma.tenantSubscription.findUnique).mockResolvedValue(mockStarterSubscription as any)
      vi.mocked(prisma.certificate.count).mockResolvedValue(500) // STARTER limit is 500

      const result = await canCreate('tenant-123', 'certificates')

      expect(result.allowed).toBe(false)
    })

    it('should allow creation when no subscription exists (backwards compatibility)', async () => {
      vi.mocked(prisma.tenantSubscription.findUnique).mockResolvedValue(null)

      const result = await canCreate('tenant-123', 'certificates')

      expect(result.allowed).toBe(true)
      expect(result.current).toBe(0)
      expect(result.limit).toBe(-1)
      expect(result.message).toContain('No subscription found')
    })

    it('should consider increment when checking limits', async () => {
      vi.mocked(prisma.tenantSubscription.findUnique).mockResolvedValue(mockStarterSubscription as any)
      vi.mocked(prisma.user.count).mockResolvedValue(4) // STARTER limit is 5

      // Adding 1 should be allowed
      const result1 = await canCreate('tenant-123', 'staffUsers', 1)
      expect(result1.allowed).toBe(true)

      // Adding 2 should be denied
      const result2 = await canCreate('tenant-123', 'staffUsers', 2)
      expect(result2.allowed).toBe(false)
    })

    it('should always allow creation on SCALE tier (unlimited)', async () => {
      vi.mocked(prisma.tenantSubscription.findUnique).mockResolvedValue({
        ...mockStarterSubscription,
        tier: 'SCALE',
      } as any)
      vi.mocked(prisma.certificate.count).mockResolvedValue(10000)

      const result = await canCreate('tenant-123', 'certificates')

      expect(result.allowed).toBe(true)
      expect(result.limit).toBe(-1)
      expect(result.remaining).toBe(-1)
    })

    it('should always allow creation on INTERNAL tier (unlimited)', async () => {
      vi.mocked(prisma.tenantSubscription.findUnique).mockResolvedValue({
        ...mockStarterSubscription,
        tier: 'INTERNAL',
      } as any)
      vi.mocked(prisma.user.count).mockResolvedValue(1000)

      const result = await canCreate('tenant-123', 'staffUsers')

      expect(result.allowed).toBe(true)
    })

    it('should account for extra seats when checking limits', async () => {
      vi.mocked(prisma.tenantSubscription.findUnique).mockResolvedValue({
        ...mockStarterSubscription,
        extraStaffSeats: 5, // 5 base + 5 extra = 10 limit
      } as any)
      vi.mocked(prisma.user.count).mockResolvedValue(7)

      const result = await canCreate('tenant-123', 'staffUsers')

      expect(result.allowed).toBe(true)
      expect(result.limit).toBe(10) // 5 base + 5 extra
    })

    it('should check customer accounts resource', async () => {
      vi.mocked(prisma.tenantSubscription.findUnique).mockResolvedValue(mockStarterSubscription as any)
      vi.mocked(prisma.customerAccount.count).mockResolvedValue(15)

      const result = await canCreate('tenant-123', 'customerAccounts')

      expect(result.allowed).toBe(true)
      expect(result.current).toBe(15)
      expect(result.limit).toBe(20) // STARTER limit
    })

    it('should check customer users resource', async () => {
      vi.mocked(prisma.tenantSubscription.findUnique).mockResolvedValue(mockStarterSubscription as any)
      vi.mocked(prisma.customerUser.count).mockResolvedValue(50) // At limit

      const result = await canCreate('tenant-123', 'customerUsers')

      expect(result.allowed).toBe(false)
      expect(result.current).toBe(50)
      expect(result.limit).toBe(50) // STARTER limit
    })
  })

  describe('enforceLimit', () => {
    const mockStarterSubscription = {
      tenantId: 'tenant-123',
      tier: 'STARTER' as TenantTier,
      extraStaffSeats: 0,
      extraCustomerAccounts: 0,
      extraCustomerUserSeats: 0,
    }

    beforeEach(() => {
      vi.mocked(prisma.certificate.count).mockResolvedValue(0)
      vi.mocked(prisma.user.count).mockResolvedValue(0)
      vi.mocked(prisma.customerAccount.count).mockResolvedValue(0)
      vi.mocked(prisma.customerUser.count).mockResolvedValue(0)
    })

    it('should not throw when within limits', async () => {
      vi.mocked(prisma.tenantSubscription.findUnique).mockResolvedValue(mockStarterSubscription as any)
      vi.mocked(prisma.user.count).mockResolvedValue(3)

      await expect(enforceLimit('tenant-123', 'staffUsers')).resolves.not.toThrow()
    })

    it('should throw with statusCode 403 when limit exceeded', async () => {
      vi.mocked(prisma.tenantSubscription.findUnique).mockResolvedValue(mockStarterSubscription as any)
      vi.mocked(prisma.user.count).mockResolvedValue(5)

      try {
        await enforceLimit('tenant-123', 'staffUsers')
        expect.fail('Should have thrown an error')
      } catch (error: any) {
        expect(error.statusCode).toBe(403)
        expect(error.code).toBe('LIMIT_EXCEEDED')
        expect(error.resource).toBe('staffUsers')
        expect(error.current).toBe(5)
        expect(error.limit).toBe(5)
      }
    })

    it('should include resource info in error', async () => {
      vi.mocked(prisma.tenantSubscription.findUnique).mockResolvedValue(mockStarterSubscription as any)
      vi.mocked(prisma.certificate.count).mockResolvedValue(500)

      try {
        await enforceLimit('tenant-123', 'certificates')
        expect.fail('Should have thrown an error')
      } catch (error: any) {
        expect(error.resource).toBe('certificates')
        expect(error.message).toContain('limit')
      }
    })

    it('should consider increment parameter', async () => {
      vi.mocked(prisma.tenantSubscription.findUnique).mockResolvedValue(mockStarterSubscription as any)
      vi.mocked(prisma.user.count).mockResolvedValue(4)

      // Adding 1 should be allowed
      await expect(enforceLimit('tenant-123', 'staffUsers', 1)).resolves.not.toThrow()

      // Adding 2 should throw
      await expect(enforceLimit('tenant-123', 'staffUsers', 2)).rejects.toThrow()
    })
  })

  describe('updateUsageTracking', () => {
    const mockSubscription = {
      id: 'sub-123',
      tenantId: 'tenant-123',
      tier: 'GROWTH' as TenantTier,
    }

    beforeEach(() => {
      vi.mocked(prisma.certificate.count).mockResolvedValue(100)
      vi.mocked(prisma.user.count).mockResolvedValue(10)
      vi.mocked(prisma.customerAccount.count).mockResolvedValue(50)
      vi.mocked(prisma.customerUser.count).mockResolvedValue(150)
    })

    it('should upsert usage record with current usage', async () => {
      vi.mocked(prisma.tenantSubscription.findUnique).mockResolvedValue(mockSubscription as any)
      vi.mocked(prisma.tenantUsage.upsert).mockResolvedValue({} as any)

      await updateUsageTracking('tenant-123')

      expect(prisma.tenantUsage.upsert).toHaveBeenCalledWith({
        where: {
          subscriptionId_periodStart: {
            subscriptionId: 'sub-123',
            periodStart: expect.any(Date),
          },
        },
        update: {
          certificatesIssued: 100,
          staffUserCount: 10,
          customerAccountCount: 50,
          customerUserCount: 150,
          updatedAt: expect.any(Date),
        },
        create: {
          subscriptionId: 'sub-123',
          periodStart: expect.any(Date),
          periodEnd: expect.any(Date),
          certificatesIssued: 100,
          staffUserCount: 10,
          customerAccountCount: 50,
          customerUserCount: 150,
        },
      })
    })

    it('should not update when no subscription exists', async () => {
      vi.mocked(prisma.tenantSubscription.findUnique).mockResolvedValue(null)

      await updateUsageTracking('tenant-nonexistent')

      expect(prisma.tenantUsage.upsert).not.toHaveBeenCalled()
    })

    it('should use correct period boundaries', async () => {
      vi.mocked(prisma.tenantSubscription.findUnique).mockResolvedValue(mockSubscription as any)
      vi.mocked(prisma.tenantUsage.upsert).mockResolvedValue({} as any)

      await updateUsageTracking('tenant-123')

      const upsertCall = vi.mocked(prisma.tenantUsage.upsert).mock.calls[0][0]
      const periodStart = upsertCall.create.periodStart as Date
      const periodEnd = upsertCall.create.periodEnd as Date

      // Period start should be first of current month
      expect(periodStart.getDate()).toBe(1)

      // Period end should be first of next month
      expect(periodEnd.getDate()).toBe(1)
      if (periodStart.getMonth() === 11) {
        expect(periodEnd.getMonth()).toBe(0)
        expect(periodEnd.getFullYear()).toBe(periodStart.getFullYear() + 1)
      } else {
        expect(periodEnd.getMonth()).toBe(periodStart.getMonth() + 1)
      }
    })
  })

  describe('getSubscriptionStatus', () => {
    const mockSubscription = {
      id: 'sub-123',
      tenantId: 'tenant-123',
      tier: 'GROWTH' as TenantTier,
      status: 'active',
      currentPeriodStart: new Date('2024-01-01'),
      currentPeriodEnd: new Date('2024-02-01'),
      extraStaffSeats: 5,
      extraCustomerAccounts: 10,
      extraCustomerUserSeats: 20,
      usage: [
        {
          certificatesIssued: 80,
          staffUserCount: 8,
          customerAccountCount: 40,
          customerUserCount: 100,
        },
      ],
    }

    beforeEach(() => {
      vi.mocked(prisma.certificate.count).mockResolvedValue(100)
      vi.mocked(prisma.user.count).mockResolvedValue(10)
      vi.mocked(prisma.customerAccount.count).mockResolvedValue(50)
      vi.mocked(prisma.customerUser.count).mockResolvedValue(150)
    })

    it('should return complete subscription status', async () => {
      vi.mocked(prisma.tenantSubscription.findUnique).mockResolvedValue(mockSubscription as any)

      const result = await getSubscriptionStatus('tenant-123')

      expect(result).toEqual({
        tier: 'GROWTH',
        status: 'active',
        currentPeriodStart: mockSubscription.currentPeriodStart,
        currentPeriodEnd: mockSubscription.currentPeriodEnd,
        extraSeats: {
          staff: 5,
          customerAccounts: 10,
          customerUsers: 20,
        },
        usage: {
          certificatesIssued: 100,
          staffUserCount: 10,
          customerAccountCount: 50,
          customerUserCount: 150,
        },
        lastTrackedUsage: mockSubscription.usage[0],
      })
    })

    it('should return null when no subscription exists', async () => {
      vi.mocked(prisma.tenantSubscription.findUnique).mockResolvedValue(null)

      const result = await getSubscriptionStatus('tenant-nonexistent')

      expect(result).toBeNull()
    })

    it('should query subscription with usage included', async () => {
      vi.mocked(prisma.tenantSubscription.findUnique).mockResolvedValue(mockSubscription as any)

      await getSubscriptionStatus('tenant-123')

      expect(prisma.tenantSubscription.findUnique).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-123' },
        include: {
          usage: {
            orderBy: { periodStart: 'desc' },
            take: 1,
          },
        },
      })
    })

    it('should handle subscription with no usage history', async () => {
      vi.mocked(prisma.tenantSubscription.findUnique).mockResolvedValue({
        ...mockSubscription,
        usage: [],
      } as any)

      const result = await getSubscriptionStatus('tenant-123')

      expect(result?.lastTrackedUsage).toBeNull()
    })

    it('should return live usage counts', async () => {
      vi.mocked(prisma.tenantSubscription.findUnique).mockResolvedValue(mockSubscription as any)

      const result = await getSubscriptionStatus('tenant-123')

      // Should return live counts, not tracked counts
      expect(result?.usage.certificatesIssued).toBe(100)
      expect(result?.usage.staffUserCount).toBe(10)
      expect(result?.usage.customerAccountCount).toBe(50)
      expect(result?.usage.customerUserCount).toBe(150)
    })
  })
})
