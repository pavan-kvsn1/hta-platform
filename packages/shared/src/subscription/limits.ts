/**
 * Tenant Subscription Limits
 * Enforces tier-based resource limits for B2B2B model
 */

// Tier limit definitions
export interface TierLimits {
  certificates: number // -1 = unlimited
  staffUsers: number
  customerAccounts: number
  customerUsers: number
  features: string[]
}

export type TenantTier = 'STARTER' | 'GROWTH' | 'SCALE' | 'INTERNAL'

export const TIER_LIMITS: Record<TenantTier, TierLimits> = {
  STARTER: {
    certificates: 500,
    staffUsers: 5,
    customerAccounts: 20,
    customerUsers: 50,
    features: ['basic_workflows', 'customer_portal', 'email_notifications'],
  },
  GROWTH: {
    certificates: 5000,
    staffUsers: 15,
    customerAccounts: 100,
    customerUsers: 300,
    features: [
      'basic_workflows',
      'customer_portal',
      'email_notifications',
      'custom_branding',
      'api_access',
      'advanced_workflows',
    ],
  },
  SCALE: {
    certificates: -1, // Unlimited
    staffUsers: -1,
    customerAccounts: -1,
    customerUsers: -1,
    features: ['all'],
  },
  INTERNAL: {
    certificates: -1,
    staffUsers: -1,
    customerAccounts: -1,
    customerUsers: -1,
    features: ['all'],
  },
}

// Resource type mapping for limit checks
export type LimitResource =
  | 'certificates'
  | 'staffUsers'
  | 'customerAccounts'
  | 'customerUsers'

export interface LimitCheckResult {
  allowed: boolean
  current: number
  limit: number
  remaining: number
  message?: string
}

export interface SubscriptionData {
  tier: TenantTier
  extraStaffSeats: number
  extraCustomerAccounts: number
  extraCustomerUserSeats: number
}

export interface UsageData {
  certificatesIssued: number
  staffUserCount: number
  customerAccountCount: number
  customerUserCount: number
}

/**
 * Calculate the effective limit for a resource, including extra seats
 */
export function getEffectiveLimit(
  subscription: SubscriptionData,
  resource: LimitResource
): number {
  const baseLimit = TIER_LIMITS[subscription.tier][resource]

  // Unlimited tiers
  if (baseLimit === -1) {
    return Infinity
  }

  // Add extra seats
  switch (resource) {
    case 'staffUsers':
      return baseLimit + subscription.extraStaffSeats
    case 'customerAccounts':
      return baseLimit + subscription.extraCustomerAccounts
    case 'customerUsers':
      return baseLimit + subscription.extraCustomerUserSeats
    default:
      return baseLimit
  }
}

/**
 * Check if a resource operation is allowed within limits
 */
export function checkLimit(
  subscription: SubscriptionData,
  usage: UsageData,
  resource: LimitResource,
  increment: number = 1
): LimitCheckResult {
  const limit = getEffectiveLimit(subscription, resource)

  // Map resource to usage field
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
      message: `${formatResourceName(resource)} limit reached (${current}/${limit}). Please upgrade your plan or purchase additional seats.`,
    }
  }

  return {
    allowed: true,
    current,
    limit: limit === Infinity ? -1 : limit,
    remaining: remaining === Infinity ? -1 : remaining,
  }
}

/**
 * Check if a feature is available for a tier
 */
export function hasFeature(tier: TenantTier, feature: string): boolean {
  const features = TIER_LIMITS[tier].features
  return features.includes('all') || features.includes(feature)
}

/**
 * Get usage percentage for a resource
 */
export function getUsagePercentage(
  subscription: SubscriptionData,
  usage: UsageData,
  resource: LimitResource
): number {
  const limit = getEffectiveLimit(subscription, resource)
  if (limit === Infinity) return 0

  const currentMap: Record<LimitResource, number> = {
    certificates: usage.certificatesIssued,
    staffUsers: usage.staffUserCount,
    customerAccounts: usage.customerAccountCount,
    customerUsers: usage.customerUserCount,
  }

  return Math.round((currentMap[resource] / limit) * 100)
}

/**
 * Format resource name for display
 */
function formatResourceName(resource: LimitResource): string {
  const names: Record<LimitResource, string> = {
    certificates: 'Certificate',
    staffUsers: 'Staff user',
    customerAccounts: 'Customer account',
    customerUsers: 'Customer user',
  }
  return names[resource]
}
