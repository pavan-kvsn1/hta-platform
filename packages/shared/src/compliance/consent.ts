/**
 * Consent Management
 *
 * GDPR Article 7 - Conditions for Consent
 * Manages user consent for data processing activities.
 */

import { createLogger } from '../logger/index.js'
import { logConsentChange } from './audit-logger.js'
import type { ConsentType, ConsentRecord } from './types.js'

const logger = createLogger('consent')

// Current consent policy versions
export const CONSENT_VERSIONS: Record<ConsentType, string> = {
  essential_cookies: '1.0',
  analytics: '1.0',
  marketing_email: '1.0',
  third_party_sharing: '1.0',
  data_processing: '1.0',
}

// In-memory consent store (in production, this would be in database)
// For now, we store in localStorage on client and this is for server-side API
const consentStore = new Map<string, ConsentRecord>()

function getConsentKey(userId: string, type: ConsentType): string {
  return `${userId}:${type}`
}

/**
 * Record a consent decision
 */
export async function recordConsent(
  consent: Omit<ConsentRecord, 'grantedAt' | 'revokedAt'>,
  context: {
    tenantId?: string
    service?: 'web' | 'api' | 'worker'
  } = {}
): Promise<void> {
  const key = getConsentKey(consent.userId, consent.type)
  const now = new Date()

  const record: ConsentRecord = {
    ...consent,
    version: consent.version || CONSENT_VERSIONS[consent.type],
    grantedAt: consent.granted ? now : undefined,
    revokedAt: consent.granted ? undefined : now,
  }

  consentStore.set(key, record)

  logger.info(
    { userId: consent.userId, type: consent.type, granted: consent.granted },
    'Consent recorded'
  )

  await logConsentChange(consent.userId, consent.type, consent.granted, {
    service: context.service || 'api',
    tenantId: context.tenantId,
    ipAddress: consent.ipAddress,
    version: record.version,
  })
}

/**
 * Check if a user has granted consent for a specific type
 */
export async function checkConsent(
  userId: string,
  type: ConsentType
): Promise<boolean> {
  const key = getConsentKey(userId, type)
  const record = consentStore.get(key)

  if (!record) {
    return false
  }

  // Check if consent is still valid (same version)
  if (record.version !== CONSENT_VERSIONS[type]) {
    // Consent needs to be renewed for new version
    return false
  }

  return record.granted
}

/**
 * Get all consents for a user
 */
export async function getUserConsents(userId: string): Promise<ConsentRecord[]> {
  const consents: ConsentRecord[] = []

  for (const [key, record] of consentStore.entries()) {
    if (key.startsWith(`${userId}:`)) {
      consents.push(record)
    }
  }

  return consents
}

/**
 * Revoke all consents for a user
 */
export async function revokeAllConsents(
  userId: string,
  context: {
    tenantId?: string
    ipAddress?: string
    service?: 'web' | 'api' | 'worker'
  } = {}
): Promise<void> {
  const consentTypes: ConsentType[] = [
    'essential_cookies',
    'analytics',
    'marketing_email',
    'third_party_sharing',
    'data_processing',
  ]

  for (const type of consentTypes) {
    const key = getConsentKey(userId, type)
    const existing = consentStore.get(key)

    if (existing?.granted) {
      await recordConsent(
        {
          userId,
          userType: existing.userType,
          type,
          granted: false,
          version: CONSENT_VERSIONS[type],
          ipAddress: context.ipAddress,
        },
        context
      )
    }
  }

  logger.info({ userId }, 'All consents revoked')
}

/**
 * Check if consent is required for a processing activity
 */
export function isConsentRequired(
  processingActivity: string
): { required: boolean; consentType?: ConsentType } {
  // Map processing activities to consent types
  const consentMap: Record<string, ConsentType> = {
    'analytics': 'analytics',
    'marketing_email': 'marketing_email',
    'third_party_sharing': 'third_party_sharing',
  }

  const consentType = consentMap[processingActivity]

  if (consentType) {
    return { required: true, consentType }
  }

  // Contract-based processing doesn't require consent
  return { required: false }
}

/**
 * Get consent status summary for a user
 */
export async function getConsentStatus(userId: string): Promise<{
  hasAllRequired: boolean
  consents: Array<{
    type: ConsentType
    granted: boolean
    version: string
    currentVersion: string
    needsRenewal: boolean
    grantedAt?: Date
  }>
}> {
  const consents: Array<{
    type: ConsentType
    granted: boolean
    version: string
    currentVersion: string
    needsRenewal: boolean
    grantedAt?: Date
  }> = []

  const allTypes: ConsentType[] = [
    'essential_cookies',
    'analytics',
    'marketing_email',
    'third_party_sharing',
    'data_processing',
  ]

  for (const type of allTypes) {
    const record = consentStore.get(getConsentKey(userId, type))
    const currentVersion = CONSENT_VERSIONS[type]

    consents.push({
      type,
      granted: record?.granted ?? false,
      version: record?.version ?? '0.0',
      currentVersion,
      needsRenewal: record ? record.version !== currentVersion : false,
      grantedAt: record?.grantedAt,
    })
  }

  // Check if all required consents are granted
  // Essential cookies and data processing are required
  const requiredTypes: ConsentType[] = ['essential_cookies', 'data_processing']
  const hasAllRequired = requiredTypes.every(type =>
    consents.find(c => c.type === type)?.granted
  )

  return { hasAllRequired, consents }
}

/**
 * Validate consent requirements before processing
 */
export async function validateConsentForProcessing(
  userId: string,
  processingActivity: string
): Promise<{ allowed: boolean; reason?: string }> {
  const { required, consentType } = isConsentRequired(processingActivity)

  if (!required) {
    return { allowed: true }
  }

  if (!consentType) {
    return { allowed: true }
  }

  const hasConsent = await checkConsent(userId, consentType)

  if (!hasConsent) {
    return {
      allowed: false,
      reason: `Consent required for ${consentType} but not granted`,
    }
  }

  return { allowed: true }
}
