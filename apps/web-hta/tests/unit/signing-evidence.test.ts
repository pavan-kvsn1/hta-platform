/**
 * Signing Evidence Unit Tests
 *
 * Tests for cryptographic hash chain validation
 * used in certificate signing workflow evidence records.
 *
 * Migrated from hta-calibration/src/lib/__tests__/signing-evidence.test.ts
 */
import { describe, it, expect } from 'vitest'
import crypto from 'crypto'

// Hash computation function (mirrors the one in signing-evidence.ts)
function computeHash(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex')
}

// Evidence chain validation
interface EvidenceRecord {
  sequenceNumber: number
  previousHash: string
  recordHash: string
  evidence: string
}

function validateEvidenceChain(records: EvidenceRecord[]): {
  valid: boolean
  brokenAt?: number
} {
  if (records.length === 0) {
    return { valid: true }
  }

  let expectedPreviousHash = 'GENESIS'

  for (const record of records) {
    // Check if previous hash matches expected
    if (record.previousHash !== expectedPreviousHash) {
      return { valid: false, brokenAt: record.sequenceNumber }
    }

    // Recompute hash from evidence
    const recomputedHash = computeHash(record.evidence + record.previousHash)
    if (record.recordHash !== recomputedHash) {
      return { valid: false, brokenAt: record.sequenceNumber }
    }

    expectedPreviousHash = record.recordHash
  }

  return { valid: true }
}

describe('Signing Evidence', () => {
  describe('computeHash', () => {
    it('produces consistent hash for same input', () => {
      const input = 'test data'
      const hash1 = computeHash(input)
      const hash2 = computeHash(input)
      expect(hash1).toBe(hash2)
    })

    it('produces different hash for different input', () => {
      const hash1 = computeHash('input 1')
      const hash2 = computeHash('input 2')
      expect(hash1).not.toBe(hash2)
    })

    it('produces 64-character hex string (SHA-256)', () => {
      const hash = computeHash('test')
      expect(hash).toHaveLength(64)
      expect(hash).toMatch(/^[a-f0-9]+$/)
    })
  })

  describe('validateEvidenceChain', () => {
    it('returns valid for empty chain', () => {
      const result = validateEvidenceChain([])
      expect(result.valid).toBe(true)
    })

    it('validates single record with GENESIS', () => {
      const evidence = JSON.stringify({ event: 'test' })
      const recordHash = computeHash(evidence + 'GENESIS')

      const records: EvidenceRecord[] = [
        {
          sequenceNumber: 1,
          previousHash: 'GENESIS',
          recordHash,
          evidence,
        },
      ]

      const result = validateEvidenceChain(records)
      expect(result.valid).toBe(true)
    })

    it('validates chain of multiple records', () => {
      const evidence1 = JSON.stringify({ event: 'signed', signer: 'engineer' })
      const hash1 = computeHash(evidence1 + 'GENESIS')

      const evidence2 = JSON.stringify({ event: 'signed', signer: 'hod' })
      const hash2 = computeHash(evidence2 + hash1)

      const evidence3 = JSON.stringify({ event: 'signed', signer: 'customer' })
      const hash3 = computeHash(evidence3 + hash2)

      const records: EvidenceRecord[] = [
        { sequenceNumber: 1, previousHash: 'GENESIS', recordHash: hash1, evidence: evidence1 },
        { sequenceNumber: 2, previousHash: hash1, recordHash: hash2, evidence: evidence2 },
        { sequenceNumber: 3, previousHash: hash2, recordHash: hash3, evidence: evidence3 },
      ]

      const result = validateEvidenceChain(records)
      expect(result.valid).toBe(true)
    })

    it('detects broken chain - wrong previous hash', () => {
      const evidence1 = JSON.stringify({ event: 'signed', signer: 'engineer' })
      const hash1 = computeHash(evidence1 + 'GENESIS')

      const evidence2 = JSON.stringify({ event: 'signed', signer: 'hod' })
      const hash2 = computeHash(evidence2 + hash1)

      const records: EvidenceRecord[] = [
        { sequenceNumber: 1, previousHash: 'GENESIS', recordHash: hash1, evidence: evidence1 },
        { sequenceNumber: 2, previousHash: 'WRONG_HASH', recordHash: hash2, evidence: evidence2 },
      ]

      const result = validateEvidenceChain(records)
      expect(result.valid).toBe(false)
      expect(result.brokenAt).toBe(2)
    })

    it('detects tampered evidence', () => {
      const evidence1 = JSON.stringify({ event: 'signed', signer: 'engineer' })
      const hash1 = computeHash(evidence1 + 'GENESIS')

      // Tampered evidence but keeping original hash
      const tamperedEvidence = JSON.stringify({ event: 'signed', signer: 'TAMPERED' })

      const records: EvidenceRecord[] = [
        {
          sequenceNumber: 1,
          previousHash: 'GENESIS',
          recordHash: hash1,
          evidence: tamperedEvidence,
        },
      ]

      const result = validateEvidenceChain(records)
      expect(result.valid).toBe(false)
      expect(result.brokenAt).toBe(1)
    })

    it('detects missing first record GENESIS', () => {
      const evidence = JSON.stringify({ event: 'test' })
      const recordHash = computeHash(evidence + 'WRONG_START')

      const records: EvidenceRecord[] = [
        { sequenceNumber: 1, previousHash: 'WRONG_START', recordHash, evidence },
      ]

      const result = validateEvidenceChain(records)
      expect(result.valid).toBe(false)
      expect(result.brokenAt).toBe(1)
    })
  })
})
