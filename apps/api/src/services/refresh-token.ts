/**
 * Refresh Token Service
 *
 * Handles secure refresh token generation, validation, and rotation.
 * Tokens are stored hashed in the database.
 */

import { randomBytes, createHash } from 'crypto'
import { prisma } from '@hta/database'

// Configuration
export const REFRESH_TOKEN_CONFIG = {
  expiresInMs: 7 * 24 * 60 * 60 * 1000, // 7 days
  accessTokenExpiresInMs: 15 * 60 * 1000, // 15 minutes
  tokenBytes: 32, // 256 bits of entropy
}

export interface RefreshTokenPayload {
  userId?: string
  customerId?: string
  userType: 'STAFF' | 'CUSTOMER'
  tenantId: string
  userAgent?: string
  ipAddress?: string
}

export interface RefreshTokenResult {
  refreshToken: string
  expiresAt: Date
}

export interface ValidatedToken {
  userId?: string
  customerId?: string
  userType: 'STAFF' | 'CUSTOMER'
  tenantId: string
  tokenId: string
}

/**
 * Hash a refresh token for storage
 */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/**
 * Generate a cryptographically secure refresh token
 */
function generateToken(): string {
  return randomBytes(REFRESH_TOKEN_CONFIG.tokenBytes).toString('base64url')
}

/**
 * Create a new refresh token
 */
export async function createRefreshToken(
  payload: RefreshTokenPayload
): Promise<RefreshTokenResult> {
  const rawToken = generateToken()
  const hashedToken = hashToken(rawToken)
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_CONFIG.expiresInMs)

  await prisma.refreshToken.create({
    data: {
      token: hashedToken,
      userId: payload.userId,
      customerId: payload.customerId,
      userType: payload.userType,
      tenantId: payload.tenantId,
      expiresAt,
      userAgent: payload.userAgent,
      ipAddress: payload.ipAddress,
    },
  })

  return { refreshToken: rawToken, expiresAt }
}

/**
 * Validate a refresh token
 */
export async function validateRefreshToken(
  rawToken: string
): Promise<ValidatedToken | null> {
  const hashedToken = hashToken(rawToken)

  const token = await prisma.refreshToken.findFirst({
    where: {
      token: hashedToken,
      isRevoked: false,
      expiresAt: { gt: new Date() },
    },
  })

  if (!token) {
    return null
  }

  return {
    userId: token.userId || undefined,
    customerId: token.customerId || undefined,
    userType: token.userType as 'STAFF' | 'CUSTOMER',
    tenantId: token.tenantId,
    tokenId: token.id,
  }
}

/**
 * Rotate a refresh token (invalidate old, create new)
 */
export async function rotateRefreshToken(
  oldRawToken: string,
  payload: RefreshTokenPayload
): Promise<RefreshTokenResult | null> {
  const oldHashedToken = hashToken(oldRawToken)

  // Revoke old token
  const updated = await prisma.refreshToken.updateMany({
    where: {
      token: oldHashedToken,
      isRevoked: false,
    },
    data: {
      isRevoked: true,
      revokedAt: new Date(),
      revokedReason: 'ROTATION',
    },
  })

  if (updated.count === 0) {
    return null
  }

  // Create new token
  return createRefreshToken(payload)
}

/**
 * Revoke a refresh token
 */
export async function revokeRefreshToken(
  rawToken: string,
  reason: string = 'MANUAL'
): Promise<boolean> {
  const hashedToken = hashToken(rawToken)

  const updated = await prisma.refreshToken.updateMany({
    where: {
      token: hashedToken,
      isRevoked: false,
    },
    data: {
      isRevoked: true,
      revokedAt: new Date(),
      revokedReason: reason,
    },
  })

  return updated.count > 0
}

/**
 * Revoke all tokens for a user
 */
export async function revokeAllUserTokens(
  userId: string,
  userType: 'STAFF' | 'CUSTOMER',
  reason: string = 'LOGOUT_ALL'
): Promise<number> {
  const whereClause = userType === 'STAFF'
    ? { userId, isRevoked: false }
    : { customerId: userId, isRevoked: false }

  const updated = await prisma.refreshToken.updateMany({
    where: whereClause,
    data: {
      isRevoked: true,
      revokedAt: new Date(),
      revokedReason: reason,
    },
  })

  return updated.count
}
