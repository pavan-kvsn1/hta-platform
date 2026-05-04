import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHash } from 'crypto'

vi.mock('@hta/database', () => ({
  prisma: {
    refreshToken: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
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
      mockedPrisma.refreshToken.create.mockResolvedValue({
        id: 'tok-1',
        tokenHash: 'hash',
        userId: 'user-1',
        userType: 'CUSTOMER',
        tokenType: 'web',
        deviceId: null,
        expiresAt: new Date('2026-05-11T00:00:00.000Z'),
        revokedAt: null,
        revokedReason: null,
        createdAt: new Date(),
      } as any)

      const result = await createRefreshToken({
        userId: 'user-1',
        userType: 'CUSTOMER',
        tokenType: 'web',
      })

      expect(mockedPrisma.refreshToken.create).toHaveBeenCalledOnce()
      const createCall = mockedPrisma.refreshToken.create.mock.calls[0][0] as any
      const expiresAt = new Date(createCall.data.expiresAt)
      const expectedExpiry = new Date('2026-05-11T00:00:00.000Z') // 7 days from now
      expect(expiresAt.getTime()).toBe(expectedExpiry.getTime())
      expect(createCall.data.tokenType).toBe('web')
      expect(createCall.data.deviceId).toBeUndefined()
      expect(result).toHaveProperty('token')
    })

    it('creates a desktop token with 30-day expiry and deviceId', async () => {
      mockedPrisma.refreshToken.create.mockResolvedValue({
        id: 'tok-2',
        tokenHash: 'hash',
        userId: 'user-1',
        userType: 'STAFF',
        tokenType: 'desktop',
        deviceId: 'device-abc',
        expiresAt: new Date('2026-06-03T00:00:00.000Z'),
        revokedAt: null,
        revokedReason: null,
        createdAt: new Date(),
      } as any)

      const result = await createRefreshToken({
        userId: 'user-1',
        userType: 'STAFF',
        tokenType: 'desktop',
        deviceId: 'device-abc',
      })

      expect(mockedPrisma.refreshToken.create).toHaveBeenCalledOnce()
      const createCall = mockedPrisma.refreshToken.create.mock.calls[0][0] as any
      const expiresAt = new Date(createCall.data.expiresAt)
      const expectedExpiry = new Date('2026-06-03T00:00:00.000Z') // 30 days from now
      expect(expiresAt.getTime()).toBe(expectedExpiry.getTime())
      expect(createCall.data.tokenType).toBe('desktop')
      expect(createCall.data.deviceId).toBe('device-abc')
      expect(result).toHaveProperty('token')
    })

    it('generates unique token strings on successive calls', async () => {
      mockedPrisma.refreshToken.create.mockResolvedValue({
        id: 'tok-x',
        tokenHash: 'hash',
        userId: 'user-1',
        userType: 'CUSTOMER',
        tokenType: 'web',
        deviceId: null,
        expiresAt: new Date(),
        revokedAt: null,
        revokedReason: null,
        createdAt: new Date(),
      } as any)

      const first = await createRefreshToken({
        userId: 'user-1',
        userType: 'CUSTOMER',
        tokenType: 'web',
      })

      const second = await createRefreshToken({
        userId: 'user-1',
        userType: 'CUSTOMER',
        tokenType: 'web',
      })

      expect(first.token).not.toBe(second.token)
      // 256-bit entropy in base64url = 43 chars
      expect(first.token.length).toBeGreaterThanOrEqual(43)
      expect(second.token.length).toBeGreaterThanOrEqual(43)
    })
  })

  // ── validateRefreshToken ────────────────────────────────────────

  describe('validateRefreshToken', () => {
    it('returns valid token data for a good token', async () => {
      const rawToken = 'valid-test-token-base64url'
      const tokenHash = hashToken(rawToken)

      mockedPrisma.refreshToken.findFirst.mockResolvedValue({
        id: 'tok-1',
        tokenHash,
        userId: 'user-1',
        userType: 'CUSTOMER',
        tokenType: 'web',
        deviceId: null,
        expiresAt: new Date('2026-05-10T00:00:00.000Z'), // not expired
        revokedAt: null,
        revokedReason: null,
        createdAt: new Date(),
      } as any)

      const result = await validateRefreshToken({ token: rawToken })

      expect(result).toBeDefined()
      expect(result.userId).toBe('user-1')
      expect(result.userType).toBe('CUSTOMER')
    })

    it('rejects expired tokens', async () => {
      const rawToken = 'expired-test-token'
      const tokenHash = hashToken(rawToken)

      mockedPrisma.refreshToken.findFirst.mockResolvedValue({
        id: 'tok-2',
        tokenHash,
        userId: 'user-1',
        userType: 'CUSTOMER',
        tokenType: 'web',
        deviceId: null,
        expiresAt: new Date('2026-05-01T00:00:00.000Z'), // already expired
        revokedAt: null,
        revokedReason: null,
        createdAt: new Date(),
      } as any)

      await expect(
        validateRefreshToken({ token: rawToken })
      ).rejects.toThrow()
    })

    it('rejects revoked tokens', async () => {
      const rawToken = 'revoked-test-token'
      const tokenHash = hashToken(rawToken)

      mockedPrisma.refreshToken.findFirst.mockResolvedValue({
        id: 'tok-3',
        tokenHash,
        userId: 'user-1',
        userType: 'STAFF',
        tokenType: 'web',
        deviceId: null,
        expiresAt: new Date('2026-05-10T00:00:00.000Z'),
        revokedAt: new Date('2026-05-03T00:00:00.000Z'),
        revokedReason: 'manual',
        createdAt: new Date(),
      } as any)

      await expect(
        validateRefreshToken({ token: rawToken })
      ).rejects.toThrow()
    })

    it('rejects mismatched deviceId for desktop tokens', async () => {
      const rawToken = 'desktop-test-token'
      const tokenHash = hashToken(rawToken)

      mockedPrisma.refreshToken.findFirst.mockResolvedValue({
        id: 'tok-4',
        tokenHash,
        userId: 'user-1',
        userType: 'STAFF',
        tokenType: 'desktop',
        deviceId: 'device-abc',
        expiresAt: new Date('2026-06-01T00:00:00.000Z'),
        revokedAt: null,
        revokedReason: null,
        createdAt: new Date(),
      } as any)

      await expect(
        validateRefreshToken({ token: rawToken, deviceId: 'wrong-device' })
      ).rejects.toThrow()
    })
  })

  // ── rotateRefreshToken ──────────────────────────────────────────

  describe('rotateRefreshToken', () => {
    it('revokes the old token and creates a new one', async () => {
      const oldToken = 'old-refresh-token'
      const oldTokenHash = hashToken(oldToken)

      // Mock the validation lookup (findFirst for the old token)
      mockedPrisma.refreshToken.findFirst.mockResolvedValue({
        id: 'tok-old',
        tokenHash: oldTokenHash,
        userId: 'user-1',
        userType: 'CUSTOMER',
        tokenType: 'web',
        deviceId: null,
        expiresAt: new Date('2026-05-10T00:00:00.000Z'),
        revokedAt: null,
        revokedReason: null,
        createdAt: new Date(),
      } as any)

      // Mock revoking the old token
      mockedPrisma.refreshToken.update.mockResolvedValue({
        id: 'tok-old',
        revokedAt: new Date(),
        revokedReason: 'rotated',
      } as any)

      // Mock creating the new token
      mockedPrisma.refreshToken.create.mockResolvedValue({
        id: 'tok-new',
        tokenHash: 'new-hash',
        userId: 'user-1',
        userType: 'CUSTOMER',
        tokenType: 'web',
        deviceId: null,
        expiresAt: new Date('2026-05-11T00:00:00.000Z'),
        revokedAt: null,
        revokedReason: null,
        createdAt: new Date(),
      } as any)

      const result = await rotateRefreshToken({ token: oldToken })

      // Old token should be revoked
      expect(mockedPrisma.refreshToken.update).toHaveBeenCalled()
      const updateCall = mockedPrisma.refreshToken.update.mock.calls[0][0] as any
      expect(updateCall.where.id).toBe('tok-old')
      expect(updateCall.data.revokedAt).toBeDefined()

      // New token should be created
      expect(mockedPrisma.refreshToken.create).toHaveBeenCalledOnce()
      expect(result).toHaveProperty('token')
      expect(result.token).toBeDefined()
    })
  })

  // ── revokeRefreshToken ──────────────────────────────────────────

  describe('revokeRefreshToken', () => {
    it('marks a token as revoked with the given reason', async () => {
      mockedPrisma.refreshToken.update.mockResolvedValue({
        id: 'tok-1',
        revokedAt: new Date(),
        revokedReason: 'logout',
      } as any)

      await revokeRefreshToken({ tokenId: 'tok-1', reason: 'logout' })

      expect(mockedPrisma.refreshToken.update).toHaveBeenCalledWith({
        where: { id: 'tok-1' },
        data: expect.objectContaining({
          revokedAt: expect.any(Date),
          revokedReason: 'logout',
        }),
      })
    })
  })

  // ── revokeAllUserTokens ─────────────────────────────────────────

  describe('revokeAllUserTokens', () => {
    it('revokes all refresh tokens for a given user', async () => {
      mockedPrisma.refreshToken.updateMany.mockResolvedValue({ count: 3 } as any)

      await revokeAllUserTokens({ userId: 'user-1' })

      expect(mockedPrisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: expect.objectContaining({ userId: 'user-1' }),
        data: expect.objectContaining({
          revokedAt: expect.any(Date),
        }),
      })
    })
  })
})
