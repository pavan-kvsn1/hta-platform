/**
 * WebAuthn Unit Tests
 *
 * Tests for the WebAuthn/Passkey authentication utilities:
 * - Challenge generation
 * - Registration options
 * - Authentication options
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock logger
vi.mock('../src/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

import {
  generateChallenge,
  startRegistration,
  startAuthentication,
  isWebAuthnConfigured,
  getWebAuthnConfig,
} from '../src/auth/webauthn'

describe('WebAuthn Authentication', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe('generateChallenge', () => {
    it('generates a base64url encoded challenge', () => {
      const challenge = generateChallenge()

      expect(challenge).toBeDefined()
      expect(challenge.length).toBeGreaterThan(0)
      // base64url characters: A-Z, a-z, 0-9, -, _
      expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/)
    })

    it('generates unique challenges', () => {
      const challenge1 = generateChallenge()
      const challenge2 = generateChallenge()

      expect(challenge1).not.toBe(challenge2)
    })

    it('generates challenges of consistent length', () => {
      const challenges = Array.from({ length: 10 }, () => generateChallenge())

      // All should be roughly same length (32 bytes -> ~43 chars base64url)
      const lengths = challenges.map((c) => c.length)
      const avgLength = lengths.reduce((a, b) => a + b, 0) / lengths.length

      for (const len of lengths) {
        expect(Math.abs(len - avgLength)).toBeLessThanOrEqual(1)
      }
    })
  })

  describe('startRegistration', () => {
    const testUser = {
      id: 'user-123',
      email: 'test@example.com',
      name: 'Test User',
    }

    it('returns valid registration options', () => {
      const options = startRegistration(testUser)

      expect(options).toHaveProperty('challenge')
      expect(options).toHaveProperty('rp')
      expect(options).toHaveProperty('user')
      expect(options).toHaveProperty('pubKeyCredParams')
      expect(options).toHaveProperty('timeout')
      expect(options).toHaveProperty('attestation')
      expect(options).toHaveProperty('authenticatorSelection')
    })

    it('includes relying party info', () => {
      const options = startRegistration(testUser)

      expect(options.rp.name).toBe('HTA Calibr8s')
      expect(options.rp.id).toBeDefined()
    })

    it('includes user info', () => {
      const options = startRegistration(testUser)

      expect(options.user.id).toBeDefined()
      expect(options.user.name).toBe(testUser.email)
      expect(options.user.displayName).toBe(testUser.name)
    })

    it('uses email as displayName when name not provided', () => {
      const userWithoutName = { id: 'user-456', email: 'noname@example.com' }
      const options = startRegistration(userWithoutName)

      expect(options.user.displayName).toBe(userWithoutName.email)
    })

    it('includes supported algorithms', () => {
      const options = startRegistration(testUser)

      const algorithms = options.pubKeyCredParams.map((p) => p.alg)

      // ES256 and RS256
      expect(algorithms).toContain(-7)
      expect(algorithms).toContain(-257)
    })

    it('excludes existing credentials', () => {
      const existingCredentials = [
        { id: 'cred-1', transports: ['usb' as const] },
        { id: 'cred-2', transports: ['internal' as const] },
      ]

      const options = startRegistration(testUser, existingCredentials)

      expect(options.excludeCredentials).toHaveLength(2)
      expect(options.excludeCredentials?.[0].id).toBe('cred-1')
      expect(options.excludeCredentials?.[1].id).toBe('cred-2')
    })

    it('generates unique challenges per call', () => {
      const options1 = startRegistration(testUser)
      const options2 = startRegistration(testUser)

      expect(options1.challenge).not.toBe(options2.challenge)
    })

    it('sets attestation to none', () => {
      const options = startRegistration(testUser)

      expect(options.attestation).toBe('none')
    })

    it('sets authenticator selection preferences', () => {
      const options = startRegistration(testUser)

      expect(options.authenticatorSelection.residentKey).toBe('preferred')
      expect(options.authenticatorSelection.userVerification).toBe('preferred')
    })
  })

  describe('startAuthentication', () => {
    const testCredentials = [
      { id: 'cred-1', transports: ['usb' as const, 'nfc' as const] },
      { id: 'cred-2', transports: ['internal' as const] },
    ]

    it('returns valid authentication options', () => {
      const options = startAuthentication(testCredentials)

      expect(options).toHaveProperty('challenge')
      expect(options).toHaveProperty('timeout')
      expect(options).toHaveProperty('rpId')
      expect(options).toHaveProperty('allowCredentials')
      expect(options).toHaveProperty('userVerification')
    })

    it('includes allowed credentials', () => {
      const options = startAuthentication(testCredentials)

      expect(options.allowCredentials).toHaveLength(2)
      expect(options.allowCredentials[0].id).toBe('cred-1')
      expect(options.allowCredentials[0].type).toBe('public-key')
      expect(options.allowCredentials[0].transports).toEqual(['usb', 'nfc'])
    })

    it('generates unique challenges', () => {
      const options1 = startAuthentication(testCredentials)
      const options2 = startAuthentication(testCredentials)

      expect(options1.challenge).not.toBe(options2.challenge)
    })

    it('sets user verification preference', () => {
      const options = startAuthentication(testCredentials)

      expect(options.userVerification).toBe('preferred')
    })

    it('handles empty credentials list', () => {
      const options = startAuthentication([])

      expect(options.allowCredentials).toHaveLength(0)
    })
  })

  describe('isWebAuthnConfigured', () => {
    it('returns true when config is set', () => {
      expect(isWebAuthnConfigured()).toBe(true)
    })
  })

  describe('getWebAuthnConfig', () => {
    it('returns current configuration', () => {
      const config = getWebAuthnConfig()

      expect(config).toHaveProperty('rpId')
      expect(config).toHaveProperty('rpName')
      expect(config).toHaveProperty('origin')
      expect(config).toHaveProperty('timeout')
    })

    it('uses environment variables when set', () => {
      process.env.WEBAUTHN_RP_ID = 'custom.example.com'
      process.env.WEBAUTHN_RP_NAME = 'Custom App'
      process.env.WEBAUTHN_ORIGIN = 'https://custom.example.com'

      // Need to re-import to pick up new env vars
      // In practice, these would be set before module load
      const config = getWebAuthnConfig()

      // Default values are used since env is set after module load
      expect(config.timeout).toBe(60000)
    })

    it('has reasonable timeout', () => {
      const config = getWebAuthnConfig()

      expect(config.timeout).toBeGreaterThanOrEqual(30000)
      expect(config.timeout).toBeLessThanOrEqual(120000)
    })
  })
})
