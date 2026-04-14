/**
 * Certificate Number Unit Tests
 *
 * Tests for certificate number generation and validation
 * Certificate number format: HTA/CXXXXX/MM/YY
 * Example: HTA/C50608/02/26
 *
 * Migrated from hta-calibration/src/lib/__tests__/certificate-number.test.ts
 */
import { describe, it, expect } from 'vitest'

// Certificate number format: HTA/CXXXXX/MM/YY
// Example: HTA/C50608/02/26

function generateCertificateNumber(sequenceNumber: number, date: Date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = String(date.getFullYear()).slice(-2)
  const sequence = String(sequenceNumber).padStart(5, '0')
  return `HTA/C${sequence}/${month}/${year}`
}

function parseCertificateNumber(certNumber: string): {
  valid: boolean
  sequence?: number
  month?: number
  year?: number
} {
  const regex = /^HTA\/C(\d{5})\/(\d{2})\/(\d{2})$/
  const match = certNumber.match(regex)

  if (!match) {
    return { valid: false }
  }

  return {
    valid: true,
    sequence: parseInt(match[1], 10),
    month: parseInt(match[2], 10),
    year: parseInt(match[3], 10),
  }
}

function isValidCertificateNumber(certNumber: string): boolean {
  const parsed = parseCertificateNumber(certNumber)
  if (!parsed.valid) return false

  // Validate month is 1-12
  if (parsed.month! < 1 || parsed.month! > 12) return false

  return true
}

describe('Certificate Number', () => {
  describe('generateCertificateNumber', () => {
    it('generates correct format', () => {
      const date = new Date('2026-02-15')
      const result = generateCertificateNumber(50608, date)
      expect(result).toBe('HTA/C50608/02/26')
    })

    it('pads sequence number to 5 digits', () => {
      const date = new Date('2026-01-01')
      expect(generateCertificateNumber(1, date)).toBe('HTA/C00001/01/26')
      expect(generateCertificateNumber(123, date)).toBe('HTA/C00123/01/26')
      expect(generateCertificateNumber(99999, date)).toBe('HTA/C99999/01/26')
    })

    it('handles different months', () => {
      expect(generateCertificateNumber(1, new Date('2026-01-01'))).toContain('/01/')
      expect(generateCertificateNumber(1, new Date('2026-12-01'))).toContain('/12/')
    })

    it('handles year correctly', () => {
      expect(generateCertificateNumber(1, new Date('2025-01-01'))).toContain('/25')
      expect(generateCertificateNumber(1, new Date('2030-01-01'))).toContain('/30')
    })
  })

  describe('parseCertificateNumber', () => {
    it('parses valid certificate number', () => {
      const result = parseCertificateNumber('HTA/C50608/02/26')
      expect(result.valid).toBe(true)
      expect(result.sequence).toBe(50608)
      expect(result.month).toBe(2)
      expect(result.year).toBe(26)
    })

    it('returns invalid for wrong prefix', () => {
      const result = parseCertificateNumber('ABC/C50608/02/26')
      expect(result.valid).toBe(false)
    })

    it('returns invalid for missing C', () => {
      const result = parseCertificateNumber('HTA/50608/02/26')
      expect(result.valid).toBe(false)
    })

    it('returns invalid for wrong sequence length', () => {
      expect(parseCertificateNumber('HTA/C5060/02/26').valid).toBe(false)
      expect(parseCertificateNumber('HTA/C506081/02/26').valid).toBe(false)
    })

    it('returns invalid for non-numeric values', () => {
      expect(parseCertificateNumber('HTA/CABCDE/02/26').valid).toBe(false)
      expect(parseCertificateNumber('HTA/C50608/AB/26').valid).toBe(false)
    })
  })

  describe('isValidCertificateNumber', () => {
    it('returns true for valid certificate numbers', () => {
      expect(isValidCertificateNumber('HTA/C50608/02/26')).toBe(true)
      expect(isValidCertificateNumber('HTA/C00001/01/25')).toBe(true)
      expect(isValidCertificateNumber('HTA/C99999/12/30')).toBe(true)
    })

    it('returns false for invalid month', () => {
      expect(isValidCertificateNumber('HTA/C50608/00/26')).toBe(false)
      expect(isValidCertificateNumber('HTA/C50608/13/26')).toBe(false)
    })

    it('returns false for invalid format', () => {
      expect(isValidCertificateNumber('invalid')).toBe(false)
      expect(isValidCertificateNumber('')).toBe(false)
      expect(isValidCertificateNumber('HTA/C5060/02/26')).toBe(false)
    })
  })
})
