/**
 * Consent Management Unit Tests
 *
 * Tests for GDPR Article 7 - Conditions for Consent
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the logger
vi.mock('../src/logger/index.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}))

// Mock the audit-logger (used by consent module)
vi.mock('../src/compliance/audit-logger.js', () => ({
  logConsentChange: vi.fn().mockResolvedValue(undefined),
}))

import {
  CONSENT_VERSIONS,
  recordConsent,
  checkConsent,
  getUserConsents,
  revokeAllConsents,
  isConsentRequired,
  getConsentStatus,
  validateConsentForProcessing,
  _resetConsentStore,
} from '../src/compliance/consent'

describe('Consent Management', () => {
  beforeEach(() => {
    _resetConsentStore()
    vi.clearAllMocks()
  })

  describe('CONSENT_VERSIONS', () => {
    it('has versions for all consent types', () => {
      expect(CONSENT_VERSIONS).toHaveProperty('essential_cookies')
      expect(CONSENT_VERSIONS).toHaveProperty('analytics')
      expect(CONSENT_VERSIONS).toHaveProperty('marketing_email')
      expect(CONSENT_VERSIONS).toHaveProperty('third_party_sharing')
      expect(CONSENT_VERSIONS).toHaveProperty('data_processing')
    })

    it('all versions are non-empty strings', () => {
      for (const version of Object.values(CONSENT_VERSIONS)) {
        expect(typeof version).toBe('string')
        expect(version.length).toBeGreaterThan(0)
      }
    })
  })

  describe('recordConsent', () => {
    it('records a granted consent', async () => {
      await recordConsent({
        userId: 'user-1',
        userType: 'user',
        type: 'analytics',
        granted: true,
        version: '1.0',
      })

      const hasConsent = await checkConsent('user-1', 'analytics')
      expect(hasConsent).toBe(true)
    })

    it('records a revoked consent', async () => {
      await recordConsent({
        userId: 'user-1',
        userType: 'user',
        type: 'analytics',
        granted: true,
        version: '1.0',
      })

      await recordConsent({
        userId: 'user-1',
        userType: 'user',
        type: 'analytics',
        granted: false,
        version: '1.0',
      })

      const hasConsent = await checkConsent('user-1', 'analytics')
      expect(hasConsent).toBe(false)
    })

    it('uses default version from CONSENT_VERSIONS when not provided', async () => {
      await recordConsent({
        userId: 'user-1',
        userType: 'user',
        type: 'essential_cookies',
        granted: true,
        version: '',
      })

      // It uses consent.version || CONSENT_VERSIONS[type]
      // Since we pass empty string which is falsy, it should use the default
      const consents = await getUserConsents('user-1')
      expect(consents[0].version).toBe(CONSENT_VERSIONS.essential_cookies)
    })
  })

  describe('checkConsent', () => {
    it('returns false when no consent record exists', async () => {
      const result = await checkConsent('user-1', 'analytics')
      expect(result).toBe(false)
    })

    it('returns true when consent is granted with current version', async () => {
      await recordConsent({
        userId: 'user-1',
        userType: 'user',
        type: 'analytics',
        granted: true,
        version: CONSENT_VERSIONS.analytics,
      })

      const result = await checkConsent('user-1', 'analytics')
      expect(result).toBe(true)
    })

    it('returns false when consent version differs from current', async () => {
      await recordConsent({
        userId: 'user-1',
        userType: 'user',
        type: 'analytics',
        granted: true,
        version: '0.5', // old version
      })

      const result = await checkConsent('user-1', 'analytics')
      expect(result).toBe(false)
    })

    it('returns false when consent was revoked', async () => {
      await recordConsent({
        userId: 'user-1',
        userType: 'user',
        type: 'analytics',
        granted: false,
        version: CONSENT_VERSIONS.analytics,
      })

      const result = await checkConsent('user-1', 'analytics')
      expect(result).toBe(false)
    })
  })

  describe('getUserConsents', () => {
    it('returns empty array when no consents recorded', async () => {
      const consents = await getUserConsents('user-1')
      expect(consents).toEqual([])
    })

    it('returns all consents for a user', async () => {
      await recordConsent({
        userId: 'user-1',
        userType: 'user',
        type: 'analytics',
        granted: true,
        version: '1.0',
      })
      await recordConsent({
        userId: 'user-1',
        userType: 'user',
        type: 'marketing_email',
        granted: false,
        version: '1.0',
      })

      const consents = await getUserConsents('user-1')
      expect(consents).toHaveLength(2)
    })

    it('does not return consents for other users', async () => {
      await recordConsent({
        userId: 'user-1',
        userType: 'user',
        type: 'analytics',
        granted: true,
        version: '1.0',
      })
      await recordConsent({
        userId: 'user-2',
        userType: 'user',
        type: 'analytics',
        granted: true,
        version: '1.0',
      })

      const consents = await getUserConsents('user-1')
      expect(consents).toHaveLength(1)
    })
  })

  describe('revokeAllConsents', () => {
    it('revokes all granted consents for a user', async () => {
      await recordConsent({
        userId: 'user-1',
        userType: 'user',
        type: 'analytics',
        granted: true,
        version: CONSENT_VERSIONS.analytics,
      })
      await recordConsent({
        userId: 'user-1',
        userType: 'user',
        type: 'marketing_email',
        granted: true,
        version: CONSENT_VERSIONS.marketing_email,
      })

      await revokeAllConsents('user-1')

      expect(await checkConsent('user-1', 'analytics')).toBe(false)
      expect(await checkConsent('user-1', 'marketing_email')).toBe(false)
    })

    it('handles user with no existing consents', async () => {
      await expect(revokeAllConsents('user-no-consents')).resolves.not.toThrow()
    })
  })

  describe('isConsentRequired', () => {
    it('requires consent for analytics', () => {
      const result = isConsentRequired('analytics')
      expect(result.required).toBe(true)
      expect(result.consentType).toBe('analytics')
    })

    it('requires consent for marketing_email', () => {
      const result = isConsentRequired('marketing_email')
      expect(result.required).toBe(true)
      expect(result.consentType).toBe('marketing_email')
    })

    it('requires consent for third_party_sharing', () => {
      const result = isConsentRequired('third_party_sharing')
      expect(result.required).toBe(true)
      expect(result.consentType).toBe('third_party_sharing')
    })

    it('does not require consent for contract-based processing', () => {
      const result = isConsentRequired('certificate-processing')
      expect(result.required).toBe(false)
      expect(result.consentType).toBeUndefined()
    })
  })

  describe('getConsentStatus', () => {
    it('returns status for all consent types', async () => {
      const status = await getConsentStatus('user-1')
      expect(status.consents).toHaveLength(5) // All consent types
    })

    it('shows hasAllRequired as false when no consents', async () => {
      const status = await getConsentStatus('user-1')
      expect(status.hasAllRequired).toBe(false)
    })

    it('shows hasAllRequired as true when required consents granted', async () => {
      await recordConsent({
        userId: 'user-1',
        userType: 'user',
        type: 'essential_cookies',
        granted: true,
        version: CONSENT_VERSIONS.essential_cookies,
      })
      await recordConsent({
        userId: 'user-1',
        userType: 'user',
        type: 'data_processing',
        granted: true,
        version: CONSENT_VERSIONS.data_processing,
      })

      const status = await getConsentStatus('user-1')
      expect(status.hasAllRequired).toBe(true)
    })

    it('identifies consents needing renewal', async () => {
      await recordConsent({
        userId: 'user-1',
        userType: 'user',
        type: 'analytics',
        granted: true,
        version: '0.5', // old version
      })

      const status = await getConsentStatus('user-1')
      const analyticsConsent = status.consents.find(c => c.type === 'analytics')
      expect(analyticsConsent?.needsRenewal).toBe(true)
    })
  })

  describe('validateConsentForProcessing', () => {
    it('allows processing that does not require consent', async () => {
      const result = await validateConsentForProcessing('user-1', 'certificate-processing')
      expect(result.allowed).toBe(true)
    })

    it('disallows analytics without consent', async () => {
      const result = await validateConsentForProcessing('user-1', 'analytics')
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain('Consent required')
    })

    it('allows analytics with consent', async () => {
      await recordConsent({
        userId: 'user-1',
        userType: 'user',
        type: 'analytics',
        granted: true,
        version: CONSENT_VERSIONS.analytics,
      })

      const result = await validateConsentForProcessing('user-1', 'analytics')
      expect(result.allowed).toBe(true)
    })
  })
})
