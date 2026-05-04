import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createHash } from 'crypto'

vi.mock('@hta/database', () => ({
  prisma: {
    refreshToken: {
      create: vi.fn(),
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}))

import { prisma } from '@hta/database'
import {
  createRefreshToken,
  validateRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllUserTokens,
  REFRESH_TOKEN_CONFIG,
} from '../../src/services/refresh-token'

const mockedPrisma = vi.mocked(prisma)

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

describe('refresh-token service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-04T00:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ── createRefreshToken ──────────────────────────────────────────

  describe('createRefreshToken', () => {
    it('creates a web token with 7-day expiry', async () => {
      mockedPrisma.refreshToken.create.mockResolvedValue({} as any)

      const result = await createRefreshToken({
        userId: 'user-1',
        userType: 'CUSTOMER',
        tenantId: 'tenant-1',
        tokenType: 'web',
      })

      expect(mockedPrisma.refreshToken.create).toHaveBeenCalledOnce()
      const createCall = mockedPrisma.refreshToken.create.mock.calls[0][0] as any
      const expiresAt = new Date(createCall.data.expiresAt)
      const expectedExpiry = new Date('2026-05-11T00:00:00.000Z') // 7 days
      expect(expiresAt.getTime()).toBe(expectedExpiry.getTime())
      expect(createCall.data.userId).toBe('user-1')
      expect(createCall.data.deviceId).toBeNull()
      expect(result).toHaveProperty('refreshToken')
      expect(result).toHaveProperty('expiresAt')
    })

    it('creates a desktop token with 30-day expiry and deviceId', async () => {
      mockedPrisma.refreshToken.create.mockResolvedValue({} as any)

      const result = await createRefreshToken({
        userId: 'user-1',
        userType: 'STAFF',
        tenantId: 'tenant-1',
        tokenType: 'desktop',
        deviceId: 'device-abc',
      })

      expect(mockedPrisma.refreshToken.create).toHaveBeenCalledOnce()
      const createCall = mockedPrisma.refreshToken.create.mock.calls[0][0] as any
      const expiresAt = new Date(createCall.data.expiresAt)
      const expectedExpiry = new Date('2026-06-03T00:00:00.000Z') // 30 days
      expect(expiresAt.getTime()).toBe(expectedExpiry.getTime())
      expect(createCall.data.deviceId).toBe('device-abc')
      expect(result.refreshToken).toBeDefined()
    })

    it('generates unique token strings on successive calls', async () => {
      mockedPrisma.refreshToken.create.mockResolvedValue({} as any)

      const first = await createRefreshToken({
        userId: 'user-1',
        userType: 'CUSTOMER',
        tenantId: 'tenant-1',
      })

      const second = await createRefreshToken({
        userId: 'user-1',
        userType: 'CUSTOMER',
        tenantId: 'tenant-1',
      })

      expect(first.refreshToken).not.toBe(second.refreshToken)
      // 256-bit entropy in base64url = 43 chars
      expect(first.refreshToken.length).toBeGreaterThanOrEqual(43)
    })
  })

  // ── validateRefreshToken ────────────────────────────────────────

  describe('validateRefreshToken', () => {
    it('returns valid token data for a good token', async () => {
      const rawToken = 'valid-test-token-base64url'

      mockedPrisma.refreshToken.findFirst.mockResolvedValue({
        id: 'tok-1',
        token: hashToken(rawToken),
        userId: 'user-1',
        customerId: null,
        userType: 'CUSTOMER',
        tenantId: 'tenant-1',
        deviceId: null,
        expiresAt: new Date('2026-05-10T00:00:00.000Z'),
        isRevoked: false,
        revokedAt: null,
        revokedReason: null,
        createdAt: new Date(),
      } as any)

      const result = await validateRefreshToken(rawToken)

      expect(result).toBeDefined()
      expect(result!.userId).toBe('user-1')
      expect(result!.userType).toBe('CUSTOMER')
      expect(result!.tenantId).toBe('tenant-1')
      expect(result!.tokenId).toBe('tok-1')
    })

    it('returns null when no matching token is found', async () => {
      mockedPrisma.refreshToken.findFirst.mockResolvedValue(null)

      const result = await validateRefreshToken('nonexistent-token')

      expect(result).toBeNull()
    })

    it('returns null for mismatched deviceId on desktop tokens', async () => {
      const rawToken = 'desktop-test-token'

      mockedPrisma.refreshToken.findFirst.mockResolvedValue({
        id: 'tok-4',
        token: hashToken(rawToken),
        userId: 'user-1',
        customerId: null,
        userType: 'STAFF',
        tenantId: 'tenant-1',
        deviceId: 'device-abc',
        expiresAt: new Date('2026-06-01T00:00:00.000Z'),
        isRevoked: false,
        revokedAt: null,
        revokedReason: null,
        createdAt: new Date(),
      } as any)

      const result = await validateRefreshToken(rawToken, 'wrong-device')

      expect(result).toBeNull()
    })
  })

  // ── rotateRefreshToken ──────────────────────────────────────────

  describe('rotateRefreshToken', () => {
    it('revokes the old token and creates a new one', async () => {
      const oldToken = 'old-refresh-token'

      // Mock revoking the old token via updateMany
      mockedPrisma.refreshToken.updateMany.mockResolvedValue({ count: 1 } as any)

      // Mock creating the new token
      mockedPrisma.refreshToken.create.mockResolvedValue({} as any)

      const result = await rotateRefreshToken(oldToken, {
        userId: 'user-1',
        userType: 'CUSTOMER',
        tenantId: 'tenant-1',
        tokenType: 'web',
      })

      // Old token should be revoked via updateMany
      expect(mockedPrisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: {
          token: hashToken(oldToken),
          isRevoked: false,
        },
        data: expect.objectContaining({
          isRevoked: true,
          revokedReason: 'ROTATION',
        }),
      })

      // New token should be created
      expect(mockedPrisma.refreshToken.create).toHaveBeenCalledOnce()
      expect(result).not.toBeNull()
      expect(result!.refreshToken).toBeDefined()
    })
  })

  // ── revokeRefreshToken ──────────────────────────────────────────

  describe('revokeRefreshToken', () => {
    it('marks a token as revoked with the given reason', async () => {
      const rawToken = 'token-to-revoke'
      mockedPrisma.refreshToken.updateMany.mockResolvedValue({ count: 1 } as any)

      const result = await revokeRefreshToken(rawToken, 'logout')

      expect(mockedPrisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: {
          token: hashToken(rawToken),
          isRevoked: false,
        },
        data: expect.objectContaining({
          isRevoked: true,
          revokedReason: 'logout',
        }),
      })
      expect(result).toBe(true)
    })
  })

  // ── revokeAllUserTokens ─────────────────────────────────────────

  describe('revokeAllUserTokens', () => {
    it('revokes all refresh tokens for a staff user', async () => {
      mockedPrisma.refreshToken.updateMany.mockResolvedValue({ count: 3 } as any)

      const count = await revokeAllUserTokens('user-1', 'STAFF')

      expect(mockedPrisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', isRevoked: false },
        data: expect.objectContaining({
          isRevoked: true,
          revokedReason: 'LOGOUT_ALL',
        }),
      })
      expect(count).toBe(3)
    })

    it('revokes all refresh tokens for a customer user', async () => {
      mockedPrisma.refreshToken.updateMany.mockResolvedValue({ count: 2 } as any)

      const count = await revokeAllUserTokens('cust-1', 'CUSTOMER')

      expect(mockedPrisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { customerId: 'cust-1', isRevoked: false },
        data: expect.objectContaining({
          isRevoked: true,
          revokedReason: 'LOGOUT_ALL',
        }),
      })
      expect(count).toBe(2)
    })
  })
})
