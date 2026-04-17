/**
 * Subscription Service
 * Handles tenant subscription limits and usage tracking
 */

import { prisma } from '@hta/database'
import {
  checkLimit as checkLimitUtil,
  type LimitResource,
  type SubscriptionData,
  type UsageData,
  type LimitCheckResult,
  type TenantTier,
} from '@hta/shared'

/**
 * Get subscription data for a tenant
 */
export async function getSubscription(tenantId: string): Promise<SubscriptionData | null> {
  const subscription = await prisma.tenantSubscription.findUnique({
    where: { tenantId },
  })

  if (!subscription) {
    return null
  }

  return {
    tier: subscription.tier as TenantTier,
    extraStaffSeats: subscription.extraStaffSeats,
    extraCustomerAccounts: subscription.extraCustomerAccounts,
    extraCustomerUserSeats: subscription.extraCustomerUserSeats,
  }
}

/**
 * Get current usage for a tenant (live counts from database)
 */
export async function getCurrentUsage(tenantId: string): Promise<UsageData> {
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  const [
    certificatesThisMonth,
    staffUserCount,
    customerAccountCount,
    customerUserCount,
  ] = await Promise.all([
    // Certificates created this month
    prisma.certificate.count({
      where: {
        tenantId,
        createdAt: { gte: startOfMonth },
      },
    }),
    // Active staff users
    prisma.user.count({
      where: {
        tenantId,
        isActive: true,
      },
    }),
    // Active customer accounts
    prisma.customerAccount.count({
      where: {
        tenantId,
        isActive: true,
      },
    }),
    // Active customer users
    prisma.customerUser.count({
      where: {
        tenantId,
        isActive: true,
      },
    }),
  ])

  return {
    certificatesIssued: certificatesThisMonth,
    staffUserCount,
    customerAccountCount,
    customerUserCount,
  }
}

/**
 * Check if a resource creation is allowed
 */
export async function canCreate(
  tenantId: string,
  resource: LimitResource,
  increment: number = 1
): Promise<LimitCheckResult> {
  const subscription = await getSubscription(tenantId)

  // If no subscription, allow by default (for backwards compatibility)
  // In production, you might want to deny instead
  if (!subscription) {
    return {
      allowed: true,
      current: 0,
      limit: -1,
      remaining: -1,
      message: 'No subscription found - allowing by default',
    }
  }

  const usage = await getCurrentUsage(tenantId)
  return checkLimitUtil(subscription, usage, resource, increment)
}

/**
 * Enforce limit and throw if exceeded
 */
export async function enforceLimit(
  tenantId: string,
  resource: LimitResource,
  increment: number = 1
): Promise<void> {
  const result = await canCreate(tenantId, resource, increment)

  if (!result.allowed) {
    const error = new Error(result.message || `${resource} limit exceeded`)
    ;(error as Error & { statusCode: number }).statusCode = 403
    ;(error as Error & { code: string }).code = 'LIMIT_EXCEEDED'
    ;(error as Error & { resource: string }).resource = resource
    ;(error as Error & { current: number }).current = result.current
    ;(error as Error & { limit: number }).limit = result.limit
    throw error
  }
}

/**
 * Update usage tracking record for the current period
 */
export async function updateUsageTracking(tenantId: string): Promise<void> {
  const subscription = await prisma.tenantSubscription.findUnique({
    where: { tenantId },
  })

  if (!subscription) {
    return
  }

  const now = new Date()
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1)

  const usage = await getCurrentUsage(tenantId)

  // Upsert usage record for current period
  await prisma.tenantUsage.upsert({
    where: {
      subscriptionId_periodStart: {
        subscriptionId: subscription.id,
        periodStart,
      },
    },
    update: {
      certificatesIssued: usage.certificatesIssued,
      staffUserCount: usage.staffUserCount,
      customerAccountCount: usage.customerAccountCount,
      customerUserCount: usage.customerUserCount,
      updatedAt: now,
    },
    create: {
      subscriptionId: subscription.id,
      periodStart,
      periodEnd,
      certificatesIssued: usage.certificatesIssued,
      staffUserCount: usage.staffUserCount,
      customerAccountCount: usage.customerAccountCount,
      customerUserCount: usage.customerUserCount,
    },
  })
}

/**
 * Get subscription status summary for a tenant
 */
export async function getSubscriptionStatus(tenantId: string) {
  const subscription = await prisma.tenantSubscription.findUnique({
    where: { tenantId },
    include: {
      usage: {
        orderBy: { periodStart: 'desc' },
        take: 1,
      },
    },
  })

  if (!subscription) {
    return null
  }

  const liveUsage = await getCurrentUsage(tenantId)

  return {
    tier: subscription.tier,
    status: subscription.status,
    currentPeriodStart: subscription.currentPeriodStart,
    currentPeriodEnd: subscription.currentPeriodEnd,
    extraSeats: {
      staff: subscription.extraStaffSeats,
      customerAccounts: subscription.extraCustomerAccounts,
      customerUsers: subscription.extraCustomerUserSeats,
    },
    usage: liveUsage,
    lastTrackedUsage: subscription.usage[0] || null,
  }
}
