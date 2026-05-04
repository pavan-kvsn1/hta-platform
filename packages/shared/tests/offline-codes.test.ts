/**
 * Offline Challenge-Response Code Utility Tests
 */

import { describe, it, expect } from 'vitest'
import { generateChallengeResponsePairs, hashCode } from '../src/offline-codes/index'

describe('hashCode', () => {
  it('should produce a consistent SHA-256 hex string', () => {
    const hash = hashCode('KX9P')
    expect(hash).toMatch(/^[a-f0-9]{64}$/)
    expect(hashCode('KX9P')).toBe(hash)
  })

  it('should normalize to uppercase before hashing', () => {
    expect(hashCode('kx9p')).toBe(hashCode('KX9P'))
    expect(hashCode('Kx9p')).toBe(hashCode('KX9P'))
  })

  it('should strip whitespace before hashing', () => {
    expect(hashCode(' KX9P ')).toBe(hashCode('KX9P'))
    expect(hashCode('K X 9 P')).toBe(hashCode('KX9P'))
    expect(hashCode('KX9P\t')).toBe(hashCode('KX9P'))
  })

  it('should produce different hashes for different values', () => {
    expect(hashCode('AAAA')).not.toBe(hashCode('BBBB'))
  })
})

describe('generateChallengeResponsePairs', () => {
  it('should generate 50 pairs by default', () => {
    const pairs = generateChallengeResponsePairs()
    expect(pairs).toHaveLength(50)
  })

  it('should generate a custom number of pairs', () => {
    const pairs = generateChallengeResponsePairs(10)
    expect(pairs).toHaveLength(10)
  })

  it('should produce sequential sequence numbers starting at 1', () => {
    const pairs = generateChallengeResponsePairs(20)
    pairs.forEach((p, i) => {
      expect(p.sequence).toBe(i + 1)
    })
  })

  it('should produce keys in grid format (A1-A10, B1-B10, ...)', () => {
    const pairs = generateChallengeResponsePairs(50)
    // Row A
    expect(pairs[0].key).toBe('A1')
    expect(pairs[9].key).toBe('A10')
    // Row B
    expect(pairs[10].key).toBe('B1')
    // Row E
    expect(pairs[40].key).toBe('E1')
    expect(pairs[49].key).toBe('E10')
  })

  it('should produce 4-character values from restricted charset', () => {
    const CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
    const pairs = generateChallengeResponsePairs(50)
    for (const p of pairs) {
      expect(p.value).toHaveLength(4)
      for (const ch of p.value) {
        expect(CHARSET).toContain(ch)
      }
    }
  })

  it('should not contain ambiguous characters (0, O, 1, I, L)', () => {
    // Generate a large batch to increase probability of catching violations
    const pairs = generateChallengeResponsePairs(50)
    const allValues = pairs.map((p) => p.value).join('')
    expect(allValues).not.toMatch(/[01OIL]/)
  })

  it('should include a valid SHA-256 valueHash for each pair', () => {
    const pairs = generateChallengeResponsePairs(10)
    for (const p of pairs) {
      expect(p.valueHash).toMatch(/^[a-f0-9]{64}$/)
      expect(p.valueHash).toBe(hashCode(p.value))
    }
  })

  it('should produce unique values within a batch', () => {
    const pairs = generateChallengeResponsePairs(50)
    const values = pairs.map((p) => p.value)
    const unique = new Set(values)
    // With 30^4 = 810,000 possible values and 50 samples, collisions are near-zero
    // but we allow up to 1 collision to avoid flaky tests
    expect(unique.size).toBeGreaterThanOrEqual(49)
  })

  it('should handle partial last row', () => {
    const pairs = generateChallengeResponsePairs(13)
    expect(pairs).toHaveLength(13)
    // Row A: 10 pairs, Row B: 3 pairs
    expect(pairs[10].key).toBe('B1')
    expect(pairs[12].key).toBe('B3')
  })

  it('should cap at 5 rows (50 pairs max for grid layout)', () => {
    const pairs = generateChallengeResponsePairs(50)
    const lastKey = pairs[pairs.length - 1].key
    expect(lastKey).toBe('E10')
  })

  it('should return GeneratedPair objects with all required fields', () => {
    const pairs = generateChallengeResponsePairs(1)
    expect(pairs[0]).toEqual({
      sequence: expect.any(Number),
      key: expect.any(String),
      value: expect.any(String),
      valueHash: expect.any(String),
    })
  })
})
