/**
 * TOTP (2FA) Unit Tests
 *
 * Tests for the TOTP authentication utilities:
 * - Secret generation
 * - TOTP code generation and verification
 * - Backup codes
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

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
  generateSecret,
  generateTOTPSecret,
  generateTOTP,
  verifyTOTP,
  generateBackupCodes,
  hashBackupCode,
  verifyBackupCode,
  isTOTPConfigured,
} from '../src/auth/totp'

describe('TOTP Authentication', () => {
  describe('generateSecret', () => {
    it('generates a base32 encoded secret', () => {
      const secret = generateSecret()

      expect(secret).toBeDefined()
      expect(secret.length).toBeGreaterThan(0)
      // Base32 alphabet: A-Z, 2-7
      expect(secret).toMatch(/^[A-Z2-7]+$/)
    })

    it('generates unique secrets', () => {
      const secret1 = generateSecret()
      const secret2 = generateSecret()

      expect(secret1).not.toBe(secret2)
    })

    it('generates secrets of specified length', () => {
      const secret10 = generateSecret(10)
      const secret32 = generateSecret(32)

      // Base32 encoding increases length by ~1.6x
      expect(secret10.length).toBeLessThan(secret32.length)
    })
  })

  describe('generateTOTPSecret', () => {
    it('generates secret and otpauth URL', () => {
      const result = generateTOTPSecret('user@example.com')

      expect(result.secret).toBeDefined()
      expect(result.otpauthUrl).toBeDefined()
      expect(result.otpauthUrl).toContain('otpauth://totp/')
      expect(result.otpauthUrl).toContain('user%40example.com')
      expect(result.otpauthUrl).toContain('HTA%20Calibr8s')
    })

    it('includes custom issuer in URL', () => {
      const result = generateTOTPSecret('user@example.com', 'Custom App')

      expect(result.otpauthUrl).toContain('Custom%20App')
    })

    it('includes required parameters in URL', () => {
      const result = generateTOTPSecret('user@example.com')

      expect(result.otpauthUrl).toContain('secret=')
      expect(result.otpauthUrl).toContain('issuer=')
      expect(result.otpauthUrl).toContain('algorithm=SHA1')
      expect(result.otpauthUrl).toContain('digits=6')
      expect(result.otpauthUrl).toContain('period=30')
    })
  })

  describe('generateTOTP', () => {
    it('generates a 6-digit code', () => {
      const secret = generateSecret()
      const code = generateTOTP(secret)

      expect(code).toMatch(/^\d{6}$/)
    })

    it('generates same code for same time window', () => {
      const secret = generateSecret()
      // Use a fixed time well within a 30-second window to avoid flakiness
      const windowStart = Math.floor(Date.now() / 30000) * 30000
      const timeInWindow = windowStart + 5000 // 5 seconds into the window

      const code1 = generateTOTP(secret, timeInWindow)
      const code2 = generateTOTP(secret, timeInWindow + 1000) // 1 second later, still in same window

      expect(code1).toBe(code2)
    })

    it('generates different codes for different secrets', () => {
      const secret1 = generateSecret()
      const secret2 = generateSecret()
      const now = Date.now()

      const code1 = generateTOTP(secret1, now)
      const code2 = generateTOTP(secret2, now)

      expect(code1).not.toBe(code2)
    })

    it('generates different codes for different time periods', () => {
      const secret = generateSecret()
      const now = Date.now()

      const code1 = generateTOTP(secret, now)
      const code2 = generateTOTP(secret, now + 35000) // 35 seconds later (next period)

      expect(code1).not.toBe(code2)
    })
  })

  describe('verifyTOTP', () => {
    it('verifies correct code', () => {
      const secret = generateSecret()
      const code = generateTOTP(secret)

      const isValid = verifyTOTP(code, secret)

      expect(isValid).toBe(true)
    })

    it('rejects incorrect code', () => {
      const secret = generateSecret()

      const isValid = verifyTOTP('000000', secret)

      expect(isValid).toBe(false)
    })

    it('rejects empty token', () => {
      const secret = generateSecret()

      expect(verifyTOTP('', secret)).toBe(false)
      expect(verifyTOTP(null as unknown as string, secret)).toBe(false)
    })

    it('rejects empty secret', () => {
      expect(verifyTOTP('123456', '')).toBe(false)
      expect(verifyTOTP('123456', null as unknown as string)).toBe(false)
    })

    it('normalizes token with spaces', () => {
      const secret = generateSecret()
      const code = generateTOTP(secret)
      const codeWithSpaces = code.slice(0, 3) + ' ' + code.slice(3)

      const isValid = verifyTOTP(codeWithSpaces, secret)

      expect(isValid).toBe(true)
    })

    it('allows clock drift within window', () => {
      const secret = generateSecret()
      const now = Date.now()

      // Generate code for previous period (30 seconds ago)
      const previousCode = generateTOTP(secret, now - 30000)

      // Should still be valid due to window tolerance
      const isValid = verifyTOTP(previousCode, secret, now)

      expect(isValid).toBe(true)
    })

    it('rejects codes outside window', () => {
      const secret = generateSecret()
      const now = Date.now()

      // Generate code for 2 periods ago (60+ seconds)
      const oldCode = generateTOTP(secret, now - 65000)

      const isValid = verifyTOTP(oldCode, secret, now)

      expect(isValid).toBe(false)
    })

    it('rejects non-numeric codes', () => {
      const secret = generateSecret()

      expect(verifyTOTP('abcdef', secret)).toBe(false)
      expect(verifyTOTP('12ab56', secret)).toBe(false)
    })
  })

  describe('generateBackupCodes', () => {
    it('generates specified number of codes', () => {
      const codes = generateBackupCodes(10)
      expect(codes).toHaveLength(10)

      const codes5 = generateBackupCodes(5)
      expect(codes5).toHaveLength(5)
    })

    it('generates codes in XXXX-XXXX format', () => {
      const codes = generateBackupCodes(5)

      for (const code of codes) {
        expect(code).toMatch(/^[A-F0-9]{4}-[A-F0-9]{4}$/)
      }
    })

    it('generates unique codes', () => {
      const codes = generateBackupCodes(100)
      const uniqueCodes = new Set(codes)

      expect(uniqueCodes.size).toBe(codes.length)
    })
  })

  describe('hashBackupCode', () => {
    it('hashes backup codes consistently', () => {
      const code = 'ABCD-1234'

      const hash1 = hashBackupCode(code)
      const hash2 = hashBackupCode(code)

      expect(hash1).toBe(hash2)
    })

    it('produces different hashes for different codes', () => {
      const hash1 = hashBackupCode('ABCD-1234')
      const hash2 = hashBackupCode('EFGH-5678')

      expect(hash1).not.toBe(hash2)
    })

    it('normalizes codes (removes dashes, uppercases)', () => {
      const hash1 = hashBackupCode('ABCD-1234')
      const hash2 = hashBackupCode('abcd1234')

      expect(hash1).toBe(hash2)
    })
  })

  describe('verifyBackupCode', () => {
    it('returns index of matching code', () => {
      const codes = generateBackupCodes(5)
      const hashedCodes = codes.map(hashBackupCode)

      const index = verifyBackupCode(codes[2], hashedCodes)

      expect(index).toBe(2)
    })

    it('returns -1 for non-matching code', () => {
      const codes = generateBackupCodes(5)
      const hashedCodes = codes.map(hashBackupCode)

      const index = verifyBackupCode('XXXX-YYYY', hashedCodes)

      expect(index).toBe(-1)
    })

    it('handles empty hash list', () => {
      const index = verifyBackupCode('ABCD-1234', [])

      expect(index).toBe(-1)
    })
  })

  describe('isTOTPConfigured', () => {
    it('returns true (TOTP is always available)', () => {
      expect(isTOTPConfigured()).toBe(true)
    })
  })
})
