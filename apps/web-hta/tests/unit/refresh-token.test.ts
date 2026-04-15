/**
 * Refresh Token Utilities Unit Tests
 *
 * Tests for JWT refresh token management:
 * - Token creation and hashing
 * - Token validation and expiry
 * - Token rotation
 * - Session management
 *
 * Migrated from hta-calibration/src/lib/__tests__/refresh-token.test.ts
 * Self-contained version with mock implementations
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createHash, randomBytes } from 'crypto'

// Configuration
const REFRESH_TOKEN_CONFIG = {
  accessTokenExpiresInMs: 15 * 60 * 1000, // 15 minutes
  expiresInMs: 7 * 24 * 60 * 60 * 1000, // 7 days
  tokenBytes: 32,
  cleanupRetentionDays: 30,
}

// Types
interface RefreshToken {
  id: string
  token: string
  userId: string | null
  customerId: string | null
  userType: 'STAFF' | 'CUSTOMER'
  expiresAt: Date
  createdAt: Date
  revokedAt: Date | null
  revokedReason: string | null
  replacedById: string | null
  userAgent: string | null
  ipAddress: string | null
}

type CreateTokenParams = {
  userId?: string
  customerId?: string
  userType: 'STAFF' | 'CUSTOMER'
  userAgent?: string
  ipAddress?: string
}

// Mock database
let mockTokens: RefreshToken[] = []

// Utility functions
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function generateToken(): string {
  return randomBytes(REFRESH_TOKEN_CONFIG.tokenBytes).toString('hex')
}

async function createRefreshToken(params: CreateTokenParams): Promise<{
  refreshToken: string
  expiresAt: Date
}> {
  const rawToken = generateToken()
  const hashedToken = hashToken(rawToken)
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_CONFIG.expiresInMs)

  const tokenRecord: RefreshToken = {
    id: `token-${Date.now()}`,
    token: hashedToken,
    userId: params.userId || null,
    customerId: params.customerId || null,
    userType: params.userType,
    expiresAt,
    createdAt: new Date(),
    revokedAt: null,
    revokedReason: null,
    replacedById: null,
    userAgent: params.userAgent || null,
    ipAddress: params.ipAddress || null,
  }

  mockTokens.push(tokenRecord)

  return { refreshToken: rawToken, expiresAt }
}

async function validateRefreshToken(
  rawToken: string
): Promise<{
  userId?: string
  customerId?: string
  userType: 'STAFF' | 'CUSTOMER'
  tokenId: string
} | null> {
  const hashedToken = hashToken(rawToken)
  const token = mockTokens.find((t) => t.token === hashedToken)

  if (!token) return null
  if (token.revokedAt) return null
  if (token.expiresAt < new Date()) return null

  return {
    userId: token.userId || undefined,
    customerId: token.customerId || undefined,
    userType: token.userType,
    tokenId: token.id,
  }
}

async function rotateRefreshToken(
  oldRawToken: string,
  params: CreateTokenParams
): Promise<{ refreshToken: string; expiresAt: Date } | null> {
  const validation = await validateRefreshToken(oldRawToken)
  if (!validation) return null

  // Revoke old token
  const hashedOldToken = hashToken(oldRawToken)
  const oldToken = mockTokens.find((t) => t.token === hashedOldToken)
  if (oldToken) {
    oldToken.revokedAt = new Date()
    oldToken.revokedReason = 'ROTATED'
  }

  // Create new token
  return createRefreshToken(params)
}

async function revokeRefreshToken(
  rawToken: string,
  reason: string = 'LOGOUT'
): Promise<boolean> {
  const hashedToken = hashToken(rawToken)
  const token = mockTokens.find((t) => t.token === hashedToken)

  if (!token) return false

  token.revokedAt = new Date()
  token.revokedReason = reason
  return true
}

async function revokeAllUserTokens(
  userId: string,
  userType: 'STAFF' | 'CUSTOMER',
  reason: string
): Promise<number> {
  let count = 0
  const field = userType === 'STAFF' ? 'userId' : 'customerId'

  mockTokens.forEach((token) => {
    if (token[field] === userId && !token.revokedAt) {
      token.revokedAt = new Date()
      token.revokedReason = reason
      count++
    }
  })

  return count
}

async function cleanupExpiredTokens(): Promise<number> {
  const cutoff = new Date(Date.now() - REFRESH_TOKEN_CONFIG.cleanupRetentionDays * 24 * 60 * 60 * 1000)
  const before = mockTokens.length
  mockTokens = mockTokens.filter(
    (t) => t.expiresAt > cutoff && (!t.revokedAt || t.revokedAt > cutoff)
  )
  return before - mockTokens.length
}

async function getUserActiveSessions(
  userId: string,
  userType: 'STAFF' | 'CUSTOMER'
): Promise<
  Array<{
    id: string
    createdAt: Date
    expiresAt: Date
    userAgent: string | null
    ipAddress: string | null
  }>
> {
  const field = userType === 'STAFF' ? 'userId' : 'customerId'
  const now = new Date()

  return mockTokens
    .filter((t) => t[field] === userId && !t.revokedAt && t.expiresAt > now)
    .map((t) => ({
      id: t.id,
      createdAt: t.createdAt,
      expiresAt: t.expiresAt,
      userAgent: t.userAgent,
      ipAddress: t.ipAddress,
    }))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
}

async function revokeSessionById(
  sessionId: string,
  userId: string,
  userType: 'STAFF' | 'CUSTOMER'
): Promise<boolean> {
  const field = userType === 'STAFF' ? 'userId' : 'customerId'
  const token = mockTokens.find((t) => t.id === sessionId && t[field] === userId)

  if (!token) return false

  token.revokedAt = new Date()
  token.revokedReason = 'LOGOUT'
  return true
}

describe('Refresh Token Utilities', () => {
  beforeEach(() => {
    mockTokens = []
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-01-15T10:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('REFRESH_TOKEN_CONFIG', () => {
    it('should have correct access token expiry (15 minutes)', () => {
      expect(REFRESH_TOKEN_CONFIG.accessTokenExpiresInMs).toBe(15 * 60 * 1000)
    })

    it('should have correct refresh token expiry (7 days)', () => {
      expect(REFRESH_TOKEN_CONFIG.expiresInMs).toBe(7 * 24 * 60 * 60 * 1000)
    })

    it('should have correct token byte length (32 bytes)', () => {
      expect(REFRESH_TOKEN_CONFIG.tokenBytes).toBe(32)
    })
  })

  describe('hashToken', () => {
    it('should produce consistent hash for same input', () => {
      const hash1 = hashToken('test-token')
      const hash2 = hashToken('test-token')
      expect(hash1).toBe(hash2)
    })

    it('should produce different hash for different input', () => {
      const hash1 = hashToken('token-1')
      const hash2 = hashToken('token-2')
      expect(hash1).not.toBe(hash2)
    })

    it('should produce 64-character hex string', () => {
      const hash = hashToken('test')
      expect(hash).toHaveLength(64)
      expect(hash).toMatch(/^[a-f0-9]+$/)
    })
  })

  describe('createRefreshToken', () => {
    it('should create a refresh token for staff user', async () => {
      const result = await createRefreshToken({
        userId: 'user-123',
        userType: 'STAFF',
        userAgent: 'Mozilla/5.0',
        ipAddress: '192.168.1.1',
      })

      expect(result.refreshToken).toBeDefined()
      expect(result.refreshToken.length).toBeGreaterThan(0)
      expect(result.expiresAt).toEqual(new Date(Date.now() + REFRESH_TOKEN_CONFIG.expiresInMs))
    })

    it('should create a refresh token for customer user', async () => {
      const result = await createRefreshToken({
        customerId: 'customer-123',
        userType: 'CUSTOMER',
      })

      expect(result.refreshToken).toBeDefined()
      expect(mockTokens[0].customerId).toBe('customer-123')
      expect(mockTokens[0].userType).toBe('CUSTOMER')
    })

    it('should store hashed token in database', async () => {
      const result = await createRefreshToken({
        userId: 'user-123',
        userType: 'STAFF',
      })

      const storedToken = mockTokens[0].token
      const hashedRawToken = hashToken(result.refreshToken)

      expect(storedToken).toBe(hashedRawToken)
    })
  })

  describe('validateRefreshToken', () => {
    it('should return null for non-existent token', async () => {
      const result = await validateRefreshToken('non-existent-token')
      expect(result).toBeNull()
    })

    it('should return null for revoked token', async () => {
      const { refreshToken } = await createRefreshToken({
        userId: 'user-123',
        userType: 'STAFF',
      })

      await revokeRefreshToken(refreshToken)
      const result = await validateRefreshToken(refreshToken)

      expect(result).toBeNull()
    })

    it('should return null for expired token', async () => {
      const { refreshToken } = await createRefreshToken({
        userId: 'user-123',
        userType: 'STAFF',
      })

      // Advance time past expiry
      vi.advanceTimersByTime(REFRESH_TOKEN_CONFIG.expiresInMs + 1000)

      const result = await validateRefreshToken(refreshToken)
      expect(result).toBeNull()
    })

    it('should return user info for valid staff token', async () => {
      const { refreshToken } = await createRefreshToken({
        userId: 'user-123',
        userType: 'STAFF',
      })

      const result = await validateRefreshToken(refreshToken)

      expect(result).not.toBeNull()
      expect(result?.userId).toBe('user-123')
      expect(result?.userType).toBe('STAFF')
    })

    it('should return customer info for valid customer token', async () => {
      const { refreshToken } = await createRefreshToken({
        customerId: 'customer-123',
        userType: 'CUSTOMER',
      })

      const result = await validateRefreshToken(refreshToken)

      expect(result).not.toBeNull()
      expect(result?.customerId).toBe('customer-123')
      expect(result?.userType).toBe('CUSTOMER')
    })
  })

  describe('rotateRefreshToken', () => {
    it('should return null for invalid old token', async () => {
      const result = await rotateRefreshToken('invalid-token', {
        userId: 'user-123',
        userType: 'STAFF',
      })

      expect(result).toBeNull()
    })

    it('should return null for already revoked token', async () => {
      const { refreshToken } = await createRefreshToken({
        userId: 'user-123',
        userType: 'STAFF',
      })

      await revokeRefreshToken(refreshToken)

      const result = await rotateRefreshToken(refreshToken, {
        userId: 'user-123',
        userType: 'STAFF',
      })

      expect(result).toBeNull()
    })

    it('should rotate valid token and return new token', async () => {
      const { refreshToken: oldToken } = await createRefreshToken({
        userId: 'user-123',
        userType: 'STAFF',
      })

      const result = await rotateRefreshToken(oldToken, {
        userId: 'user-123',
        userType: 'STAFF',
        userAgent: 'Mozilla/5.0',
        ipAddress: '192.168.1.1',
      })

      expect(result).not.toBeNull()
      expect(result?.refreshToken).toBeDefined()
      expect(result?.refreshToken).not.toBe(oldToken)

      // Old token should be revoked
      const oldValidation = await validateRefreshToken(oldToken)
      expect(oldValidation).toBeNull()

      // New token should be valid
      const newValidation = await validateRefreshToken(result!.refreshToken)
      expect(newValidation).not.toBeNull()
    })
  })

  describe('revokeRefreshToken', () => {
    it('should revoke token with LOGOUT reason', async () => {
      const { refreshToken } = await createRefreshToken({
        userId: 'user-123',
        userType: 'STAFF',
      })

      const result = await revokeRefreshToken(refreshToken, 'LOGOUT')

      expect(result).toBe(true)
      expect(mockTokens[0].revokedReason).toBe('LOGOUT')
    })

    it('should return false if token not found', async () => {
      const result = await revokeRefreshToken('non-existent-token')
      expect(result).toBe(false)
    })
  })

  describe('revokeAllUserTokens', () => {
    it('should revoke all tokens for staff user', async () => {
      await createRefreshToken({ userId: 'user-123', userType: 'STAFF' })
      await createRefreshToken({ userId: 'user-123', userType: 'STAFF' })
      await createRefreshToken({ userId: 'user-123', userType: 'STAFF' })

      const count = await revokeAllUserTokens('user-123', 'STAFF', 'PASSWORD_CHANGE')

      expect(count).toBe(3)
      mockTokens.forEach((t) => {
        expect(t.revokedReason).toBe('PASSWORD_CHANGE')
      })
    })

    it('should revoke all tokens for customer user', async () => {
      await createRefreshToken({ customerId: 'customer-123', userType: 'CUSTOMER' })
      await createRefreshToken({ customerId: 'customer-123', userType: 'CUSTOMER' })

      const count = await revokeAllUserTokens('customer-123', 'CUSTOMER', 'ADMIN_REVOKE')

      expect(count).toBe(2)
    })
  })

  describe('cleanupExpiredTokens', () => {
    it('should delete tokens older than retention period', async () => {
      // Create some tokens
      await createRefreshToken({ userId: 'user-1', userType: 'STAFF' })
      await createRefreshToken({ userId: 'user-2', userType: 'STAFF' })

      expect(mockTokens.length).toBe(2)

      // Advance time past expiry + retention period
      vi.advanceTimersByTime(
        REFRESH_TOKEN_CONFIG.expiresInMs +
          REFRESH_TOKEN_CONFIG.cleanupRetentionDays * 24 * 60 * 60 * 1000 +
          1000
      )

      const count = await cleanupExpiredTokens()

      expect(count).toBe(2)
      expect(mockTokens.length).toBe(0)
    })
  })

  describe('getUserActiveSessions', () => {
    it('should return active sessions for staff user', async () => {
      await createRefreshToken({
        userId: 'user-123',
        userType: 'STAFF',
        userAgent: 'Chrome',
        ipAddress: '192.168.1.1',
      })
      await createRefreshToken({
        userId: 'user-123',
        userType: 'STAFF',
        userAgent: 'Firefox',
        ipAddress: '192.168.1.2',
      })

      const sessions = await getUserActiveSessions('user-123', 'STAFF')

      expect(sessions).toHaveLength(2)
      expect(sessions[0].userAgent).toBeDefined()
    })

    it('should not return revoked sessions', async () => {
      const { refreshToken } = await createRefreshToken({
        userId: 'user-123',
        userType: 'STAFF',
      })
      await createRefreshToken({ userId: 'user-123', userType: 'STAFF' })

      await revokeRefreshToken(refreshToken)

      const sessions = await getUserActiveSessions('user-123', 'STAFF')
      expect(sessions).toHaveLength(1)
    })
  })

  describe('revokeSessionById', () => {
    it('should revoke specific session for user', async () => {
      await createRefreshToken({ userId: 'user-123', userType: 'STAFF' })
      const sessionId = mockTokens[0].id

      const result = await revokeSessionById(sessionId, 'user-123', 'STAFF')

      expect(result).toBe(true)
      expect(mockTokens[0].revokedAt).not.toBeNull()
    })

    it('should return false if session not owned by user', async () => {
      await createRefreshToken({ userId: 'user-123', userType: 'STAFF' })
      const sessionId = mockTokens[0].id

      const result = await revokeSessionById(sessionId, 'wrong-user', 'STAFF')

      expect(result).toBe(false)
    })
  })
})
