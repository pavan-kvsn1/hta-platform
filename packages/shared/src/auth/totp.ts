/**
 * @hta/shared - TOTP (Time-based One-Time Password) Authentication
 *
 * Provides 2FA functionality using TOTP (RFC 6238) compatible with
 * Google Authenticator, Authy, and other authenticator apps.
 *
 * Usage:
 *   import { generateTOTPSecret, verifyTOTP, generateBackupCodes } from '@hta/shared/auth'
 *
 *   // Setup: Generate secret and show QR code to user
 *   const { secret, otpauthUrl } = generateTOTPSecret(user.email)
 *
 *   // Verify: Check user-provided code
 *   const isValid = verifyTOTP(userCode, storedSecret)
 */

import { createLogger } from '../logger/index.js'
import { randomBytes, createHmac, timingSafeEqual } from 'crypto'

const logger = createLogger('totp')

// TOTP configuration
const TOTP_CONFIG = {
  issuer: 'HTA Calibr8s',
  algorithm: 'SHA1',
  digits: 6,
  period: 30, // seconds
  window: 1, // Allow 1 period before/after for clock drift
}

/**
 * Generate a random base32 secret
 */
export function generateSecret(length: number = 20): string {
  const buffer = randomBytes(length)
  return base32Encode(buffer)
}

/**
 * Generate TOTP secret with otpauth URL for QR code generation
 */
export function generateTOTPSecret(
  accountName: string,
  issuer: string = TOTP_CONFIG.issuer
): {
  secret: string
  otpauthUrl: string
} {
  const secret = generateSecret()

  // otpauth URL format for authenticator apps
  const otpauthUrl = `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(accountName)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=${TOTP_CONFIG.algorithm}&digits=${TOTP_CONFIG.digits}&period=${TOTP_CONFIG.period}`

  logger.info({ accountName, issuer }, 'Generated TOTP secret')

  return { secret, otpauthUrl }
}

/**
 * Generate TOTP code for current time
 */
export function generateTOTP(secret: string, timestamp: number = Date.now()): string {
  const counter = Math.floor(timestamp / 1000 / TOTP_CONFIG.period)
  return generateHOTP(secret, counter)
}

/**
 * Verify a TOTP token
 * Allows for clock drift by checking adjacent time windows
 */
export function verifyTOTP(
  token: string,
  secret: string,
  timestamp: number = Date.now()
): boolean {
  if (!token || !secret) {
    return false
  }

  // Normalize token (remove spaces, ensure 6 digits)
  const normalizedToken = token.replace(/\s/g, '').padStart(TOTP_CONFIG.digits, '0')

  if (normalizedToken.length !== TOTP_CONFIG.digits || !/^\d+$/.test(normalizedToken)) {
    return false
  }

  const counter = Math.floor(timestamp / 1000 / TOTP_CONFIG.period)

  // Check current and adjacent windows for clock drift tolerance
  for (let i = -TOTP_CONFIG.window; i <= TOTP_CONFIG.window; i++) {
    const expectedToken = generateHOTP(secret, counter + i)
    if (timingSafeCompare(normalizedToken, expectedToken)) {
      logger.debug({ window: i }, 'TOTP verified')
      return true
    }
  }

  logger.debug('TOTP verification failed')
  return false
}

/**
 * Generate HOTP (HMAC-based One-Time Password)
 * Used internally by TOTP
 */
function generateHOTP(secret: string, counter: number): string {
  const decodedSecret = base32Decode(secret)

  // Convert counter to 8-byte buffer (big endian)
  const counterBuffer = Buffer.alloc(8)
  counterBuffer.writeBigInt64BE(BigInt(counter))

  // Generate HMAC-SHA1
  const hmac = createHmac('sha1', decodedSecret)
  hmac.update(counterBuffer)
  const hmacResult = hmac.digest()

  // Dynamic truncation (RFC 4226)
  const offset = hmacResult[hmacResult.length - 1] & 0x0f
  const binary =
    ((hmacResult[offset] & 0x7f) << 24) |
    ((hmacResult[offset + 1] & 0xff) << 16) |
    ((hmacResult[offset + 2] & 0xff) << 8) |
    (hmacResult[offset + 3] & 0xff)

  const otp = binary % Math.pow(10, TOTP_CONFIG.digits)
  return otp.toString().padStart(TOTP_CONFIG.digits, '0')
}

/**
 * Generate backup codes for account recovery
 */
export function generateBackupCodes(count: number = 10): string[] {
  const codes: string[] = []

  for (let i = 0; i < count; i++) {
    // Generate 8-character alphanumeric code (format: XXXX-XXXX)
    const bytes = randomBytes(4)
    const code = bytes.toString('hex').toUpperCase()
    codes.push(`${code.slice(0, 4)}-${code.slice(4, 8)}`)
  }

  logger.info({ count }, 'Generated backup codes')
  return codes
}

/**
 * Hash a backup code for secure storage
 */
export function hashBackupCode(code: string): string {
  const normalized = code.replace(/-/g, '').toUpperCase()
  const hmac = createHmac('sha256', process.env.BACKUP_CODE_SECRET || 'default-secret')
  hmac.update(normalized)
  return hmac.digest('hex')
}

/**
 * Verify a backup code against stored hashes
 * Returns the index of the matching code, or -1 if not found
 */
export function verifyBackupCode(code: string, hashedCodes: string[]): number {
  const codeHash = hashBackupCode(code)

  for (let i = 0; i < hashedCodes.length; i++) {
    if (timingSafeCompare(codeHash, hashedCodes[i])) {
      logger.info({ codeIndex: i }, 'Backup code verified')
      return i
    }
  }

  logger.debug('Backup code verification failed')
  return -1
}

/**
 * Timing-safe string comparison
 */
function timingSafeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false
  }

  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)

  return timingSafeEqual(bufA, bufB)
}

// Base32 encoding/decoding (RFC 4648)
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

function base32Encode(buffer: Buffer): string {
  let result = ''
  let bits = 0
  let value = 0

  for (const byte of buffer) {
    value = (value << 8) | byte
    bits += 8

    while (bits >= 5) {
      bits -= 5
      result += BASE32_ALPHABET[(value >>> bits) & 0x1f]
    }
  }

  if (bits > 0) {
    result += BASE32_ALPHABET[(value << (5 - bits)) & 0x1f]
  }

  return result
}

function base32Decode(encoded: string): Buffer {
  const cleaned = encoded.toUpperCase().replace(/[^A-Z2-7]/g, '')
  const bytes: number[] = []
  let bits = 0
  let value = 0

  for (const char of cleaned) {
    const index = BASE32_ALPHABET.indexOf(char)
    if (index === -1) continue

    value = (value << 5) | index
    bits += 5

    if (bits >= 8) {
      bits -= 8
      bytes.push((value >>> bits) & 0xff)
    }
  }

  return Buffer.from(bytes)
}

/**
 * Check if TOTP is properly configured
 */
export function isTOTPConfigured(): boolean {
  return true // TOTP doesn't require external configuration
}

export default {
  generateSecret,
  generateTOTPSecret,
  generateTOTP,
  verifyTOTP,
  generateBackupCodes,
  hashBackupCode,
  verifyBackupCode,
  isTOTPConfigured,
}
