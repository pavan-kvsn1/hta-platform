/**
 * Cache Invalidation
 *
 * Event-based cache invalidation for maintaining cache consistency.
 * Call these functions when entities are created, updated, or deleted.
 *
 * Usage:
 * ```typescript
 * import { invalidateOnCertificateChange } from '@/lib/cache/invalidation'
 *
 * // After updating a certificate
 * await invalidateOnCertificateChange(certificateId, createdById)
 * ```
 */

import { cache, logCache } from './index'

/**
 * Invalidation patterns for different entity changes
 */
const invalidationRules: Record<string, (id?: string, extra?: Record<string, string>) => string[]> = {
  // Certificate events
  'certificate:created': (id, extra) => [
    'certs:list:*',
    'certs:engineer:*',           // Engineer dashboard certificates
    'admin:certs:*',               // Admin certificate list
    `stats:user:${extra?.userId || '*'}`,
    'dashboard:*',                 // All dashboards (admin, engineer, customer)
    'certs:stats',                 // Global certificate stats
  ],
  'certificate:updated': (id, extra) => [
    `cert:${id}`,
    'certs:list:*',
    'certs:engineer:*',
    'admin:certs:*',
    `stats:user:${extra?.userId || '*'}`,
    'dashboard:*',
    'certs:stats',
  ],
  'certificate:deleted': (id, extra) => [
    `cert:${id}`,
    'certs:list:*',
    'certs:engineer:*',
    'admin:certs:*',
    `stats:user:${extra?.userId || '*'}`,
    'dashboard:*',
    'certs:stats',
  ],
  'certificate:status_changed': (id, extra) => [
    `cert:${id}`,
    'certs:list:*',
    'certs:engineer:*',
    'admin:certs:*',
    `stats:user:${extra?.userId || '*'}`,
    'dashboard:*',
    'certs:stats',
    'dropdown:reviewers:*',       // Reviewer pending counts change
  ],

  // Customer events
  'customer:created': () => [
    'customers:list:*',
    'dropdown:customers',
    'customers:search:*',          // Customer autocomplete search
  ],
  'customer:updated': (id) => [
    `customer:${id}`,
    'customers:list:*',
    'dropdown:customers',
    'customers:search:*',
  ],
  'customer:deleted': (id) => [
    `customer:${id}`,
    'customers:list:*',
    'dropdown:customers',
    'customers:search:*',
  ],

  // User events
  'user:created': () => [
    'dropdown:admins',
    'dropdown:reviewers:*',
    'users:list:*',
    'reviewers:*',                 // Reviewers list cache
  ],
  'user:updated': (id) => [
    `user:${id}`,
    'dropdown:admins',
    'dropdown:reviewers:*',
    'users:list:*',
    'reviewers:*',
  ],
  'user:deleted': (id) => [
    `user:${id}`,
    'dropdown:admins',
    'dropdown:reviewers:*',
    'users:list:*',
    'reviewers:*',
    'session:*',  // Invalidate all sessions for this user
  ],

  // Session events
  'session:invalidated': (id) => [
    `session:${id}`,
  ],
  'session:all_invalidated': (id, extra) => [
    `session:*:${extra?.userId || '*'}`,
  ],

  // Instrument events
  'instrument:created': () => [
    'dropdown:instruments',
    'instruments:list:*',
  ],
  'instrument:updated': (id) => [
    `instrument:${id}`,
    'dropdown:instruments',
    'instruments:list:*',
  ],
}

/**
 * Invalidate cache based on event type
 */
export async function invalidateOnEvent(
  event: string,
  entityId?: string,
  extra?: Record<string, string>
): Promise<number> {
  const getPatterns = invalidationRules[event]

  if (!getPatterns) {
    logCache(`WARN: No invalidation rules for event: ${event}`)
    return 0
  }

  const patterns = getPatterns(entityId, extra)
  let totalDeleted = 0

  for (const pattern of patterns) {
    const deleted = await cache.deletePattern(pattern)
    totalDeleted += deleted
  }

  if (totalDeleted > 0) {
    logCache(`INVALIDATE: ${event}`, { patterns, totalDeleted })
  }

  return totalDeleted
}

// ============================================
// Convenience functions for common operations
// ============================================

/**
 * Invalidate cache when a certificate is created
 */
export async function invalidateOnCertificateCreate(userId: string): Promise<void> {
  await invalidateOnEvent('certificate:created', undefined, { userId })
}

/**
 * Invalidate cache when a certificate is updated
 */
export async function invalidateOnCertificateUpdate(certificateId: string, userId: string): Promise<void> {
  await invalidateOnEvent('certificate:updated', certificateId, { userId })
}

/**
 * Invalidate cache when a certificate status changes
 */
export async function invalidateOnCertificateStatusChange(certificateId: string, userId: string): Promise<void> {
  await invalidateOnEvent('certificate:status_changed', certificateId, { userId })
}

/**
 * Invalidate cache when a certificate is deleted
 */
export async function invalidateOnCertificateDelete(certificateId: string, userId: string): Promise<void> {
  await invalidateOnEvent('certificate:deleted', certificateId, { userId })
}

/**
 * Invalidate cache when a customer is created
 */
export async function invalidateOnCustomerCreate(): Promise<void> {
  await invalidateOnEvent('customer:created')
}

/**
 * Invalidate cache when a customer is updated
 */
export async function invalidateOnCustomerUpdate(customerId: string): Promise<void> {
  await invalidateOnEvent('customer:updated', customerId)
}

/**
 * Invalidate cache when a user is created
 */
export async function invalidateOnUserCreate(): Promise<void> {
  await invalidateOnEvent('user:created')
}

/**
 * Invalidate cache when a user is updated
 */
export async function invalidateOnUserUpdate(userId: string): Promise<void> {
  await invalidateOnEvent('user:updated', userId)
}

/**
 * Invalidate a specific user's session
 */
export async function invalidateSession(sessionToken: string): Promise<void> {
  await invalidateOnEvent('session:invalidated', sessionToken)
}

/**
 * Invalidate all sessions for a user (e.g., on password change)
 */
export async function invalidateAllUserSessions(userId: string): Promise<void> {
  await invalidateOnEvent('session:all_invalidated', undefined, { userId })
}

/**
 * Invalidate instrument cache
 */
export async function invalidateOnInstrumentChange(instrumentId?: string): Promise<void> {
  if (instrumentId) {
    await invalidateOnEvent('instrument:updated', instrumentId)
  } else {
    await invalidateOnEvent('instrument:created')
  }
}

/**
 * Clear all cache (use sparingly, e.g., during deployments)
 */
export async function clearAllCache(): Promise<number> {
  return cache.deletePattern('*')
}
