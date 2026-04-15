/**
 * Consent Text Constants Tests
 *
 * Tests for consent-related constants used in signing workflows.
 * Ensures consistency of consent text across the application.
 */
import { describe, it, expect } from 'vitest'
import {
  CONSENT_VERSION,
  CONSENT_STATEMENTS,
  CONSENT_TEXT,
} from '@/lib/constants/consent-text'

describe('Consent Constants', () => {
  describe('CONSENT_VERSION', () => {
    it('is a valid semantic version string', () => {
      expect(CONSENT_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
    })

    it('is currently version 1.0.0', () => {
      expect(CONSENT_VERSION).toBe('1.0.0')
    })
  })

  describe('CONSENT_STATEMENTS', () => {
    it('is a readonly array', () => {
      expect(Array.isArray(CONSENT_STATEMENTS)).toBe(true)
      // TypeScript enforces readonly, but at runtime we verify it's a tuple
      expect(CONSENT_STATEMENTS.length).toBe(4)
    })

    it('contains certificate review statement', () => {
      expect(CONSENT_STATEMENTS).toContain(
        'I have reviewed the certificate in full.'
      )
    })

    it('contains details confirmation statement', () => {
      expect(CONSENT_STATEMENTS).toContain(
        'I confirm the details are correct and accepted as issued.'
      )
    })

    it('contains electronic signing consent', () => {
      expect(CONSENT_STATEMENTS).toContain(
        'I consent to signing this document electronically.'
      )
    })

    it('contains authorization statement', () => {
      expect(CONSENT_STATEMENTS).toContain(
        'I am authorized to sign on behalf of the indicated party.'
      )
    })

    it('all statements are non-empty strings', () => {
      for (const statement of CONSENT_STATEMENTS) {
        expect(typeof statement).toBe('string')
        expect(statement.length).toBeGreaterThan(0)
      }
    })

    it('all statements end with a period', () => {
      for (const statement of CONSENT_STATEMENTS) {
        expect(statement.endsWith('.')).toBe(true)
      }
    })
  })

  describe('CONSENT_TEXT', () => {
    it('is a joined string of all statements', () => {
      const expectedText = CONSENT_STATEMENTS.join(' ')
      expect(CONSENT_TEXT).toBe(expectedText)
    })

    it('contains all individual statements', () => {
      for (const statement of CONSENT_STATEMENTS) {
        expect(CONSENT_TEXT).toContain(statement)
      }
    })

    it('is a single continuous string', () => {
      expect(CONSENT_TEXT.includes('\n')).toBe(false)
    })

    it('has reasonable length for display', () => {
      // Should be long enough to be meaningful but not excessive
      expect(CONSENT_TEXT.length).toBeGreaterThan(100)
      expect(CONSENT_TEXT.length).toBeLessThan(500)
    })
  })
})
