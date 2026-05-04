/**
 * Offline Challenge-Response Code Utility
 *
 * Generates key-value pairs for offline 2FA. The engineer prints
 * a grid card; the desktop app shows a random key (challenge) and
 * the engineer enters the matching value (response).
 *
 * Pairs are reusable for the 30-day batch lifetime.
 */

import { randomBytes, createHash } from 'crypto'

// Alphanumeric characters excluding ambiguous ones (0/O, 1/I/L)
const CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

// Grid layout: rows A-E, columns 1-10 → 50 pairs
const ROW_LABELS = ['A', 'B', 'C', 'D', 'E']
const COLS = 10

/**
 * Generate a random value of the given length from CHARSET.
 */
function generateValue(length: number): string {
  const bytes = randomBytes(length)
  let value = ''
  for (let i = 0; i < length; i++) {
    value += CHARSET[bytes[i] % CHARSET.length]
  }
  return value
}

/**
 * SHA-256 hash a value (normalized: uppercase, whitespace stripped).
 */
export function hashCode(value: string): string {
  const normalized = value.toUpperCase().replace(/\s/g, '')
  return createHash('sha256').update(normalized).digest('hex')
}

export interface GeneratedPair {
  sequence: number
  key: string       // Challenge label (e.g., "A7")
  value: string     // Plaintext response (e.g., "KX9P") — shown once, never stored
  valueHash: string // SHA-256 hash — stored in DB
}

/**
 * Generate a grid of challenge-response pairs.
 *
 * Default: 5 rows x 10 cols = 50 pairs.
 * Keys: A1–A10, B1–B10, ..., E1–E10
 * Values: 4-char alphanumeric codes
 *
 * @returns Array of { sequence, key, value, valueHash }
 */
export function generateChallengeResponsePairs(count: number = 50): GeneratedPair[] {
  const pairs: GeneratedPair[] = []
  const totalRows = Math.min(Math.ceil(count / COLS), ROW_LABELS.length)

  let seq = 1
  for (let r = 0; r < totalRows; r++) {
    const colsInRow = Math.min(COLS, count - r * COLS)
    for (let c = 1; c <= colsInRow; c++) {
      const key = `${ROW_LABELS[r]}${c}`
      const value = generateValue(4)
      pairs.push({
        sequence: seq++,
        key,
        value,
        valueHash: hashCode(value),
      })
    }
  }

  return pairs
}
