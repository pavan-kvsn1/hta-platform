import { randomBytes, createHash } from 'crypto'
import { prisma } from './prisma'

// Configuration
export const REFRESH_TOKEN_CONFIG = {
  // Refresh token expires in 7 days
  expiresInMs: 7 * 24 * 60 * 60 * 1000,
  // Access token (JWT) expires in 15 minutes (industry standard)
  accessTokenExpiresInMs: 15 * 60 * 1000,
  // Token byte length (32 bytes = 256 bits of entropy)
  tokenBytes: 32,
}

// Types
export interface RefreshTokenPayload {
  tenantId: string
  userId?: string
  customerId?: string
  userType: 'STAFF' | 'CUSTOMER'
  userAgent?: string
  ipAddress?: string
}

export interface RefreshTokenResult {
  refreshToken: string  // Raw token to send to client
  expiresAt: Date
}

export interface ValidatedToken {
  userId?: string
  customerId?: string
  userType: 'STAFF' | 'CUSTOMER'
  tokenId: string
}

/**
 * Hash a refresh token for storage
 * We store hashed tokens so even if the DB is compromised,
 * attackers can't use the tokens directly
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
 * Create a new refresh token for a user
 */
export async function createRefreshToken(
  payload: RefreshTokenPayload
): Promise<RefreshTokenResult> {
  const rawToken = generateToken()
  const hashedToken = hashToken(rawToken)
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_CONFIG.expiresInMs)

  await prisma.refreshToken.create({
    data: {
      tenantId: payload.tenantId,
      token: hashedToken,
      userId: payload.userId,
      customerId: payload.customerId,
      userType: payload.userType,
      expiresAt,
      userAgent: payload.userAgent,
      ipAddress: payload.ipAddress,
    },
  })

  return {
    refreshToken: rawToken,
    expiresAt,
  }
}

/**
 * Validate a refresh token and return user info if valid
 */
export async function validateRefreshToken(
  rawToken: string
): Promise<ValidatedToken | null> {
  const hashedToken = hashToken(rawToken)

  const tokenRecord = await prisma.refreshToken.findUnique({
    where: { token: hashedToken },
  })

  // Token not found
  if (!tokenRecord) {
    return null
  }

  // Token has been revoked
  if (tokenRecord.revokedAt) {
    return null
  }

  // Token has expired
  if (tokenRecord.expiresAt < new Date()) {
    return null
  }

  return {
    userId: tokenRecord.userId || undefined,
    customerId: tokenRecord.customerId || undefined,
    userType: tokenRecord.userType as 'STAFF' | 'CUSTOMER',
    tokenId: tokenRecord.id,
  }
}

/**
 * Rotate a refresh token (invalidate old, create new)
 * This is a security best practice - each refresh token can only be used once
 */
export async function rotateRefreshToken(
  oldRawToken: string,
  payload: RefreshTokenPayload
): Promise<RefreshTokenResult | null> {
  const oldHashedToken = hashToken(oldRawToken)

  // Find and validate old token
  const oldToken = await prisma.refreshToken.findUnique({
    where: { token: oldHashedToken },
  })

  if (!oldToken || oldToken.revokedAt || oldToken.expiresAt < new Date()) {
    return null
  }

  // Create new token
  const newRawToken = generateToken()
  const newHashedToken = hashToken(newRawToken)
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_CONFIG.expiresInMs)

  // Atomic transaction: revoke old token and create new one
  const newToken = await prisma.$transaction(async (tx) => {
    // Revoke old token
    await tx.refreshToken.update({
      where: { id: oldToken.id },
      data: {
        revokedAt: new Date(),
        revokedReason: 'TOKEN_ROTATION',
      },
    })

    // Create new token
    const created = await tx.refreshToken.create({
      data: {
        tenantId: payload.tenantId,
        token: newHashedToken,
        userId: payload.userId,
        customerId: payload.customerId,
        userType: payload.userType,
        expiresAt,
        userAgent: payload.userAgent,
        ipAddress: payload.ipAddress,
      },
    })

    // Link old token to new one (for audit trail)
    await tx.refreshToken.update({
      where: { id: oldToken.id },
      data: { replacedById: created.id },
    })

    return created
  })

  return {
    refreshToken: newRawToken,
    expiresAt: newToken.expiresAt,
  }
}

/**
 * Revoke a specific refresh token
 */
export async function revokeRefreshToken(
  rawToken: string,
  reason: 'LOGOUT' | 'PASSWORD_CHANGE' | 'ADMIN_REVOKE' = 'LOGOUT'
): Promise<boolean> {
  const hashedToken = hashToken(rawToken)

  try {
    await prisma.refreshToken.update({
      where: { token: hashedToken },
      data: {
        revokedAt: new Date(),
        revokedReason: reason,
      },
    })
    return true
  } catch {
    return false
  }
}

/**
 * Revoke all refresh tokens for a user
 * Used when: password change, account compromise, admin action
 */
export async function revokeAllUserTokens(
  userId: string,
  userType: 'STAFF' | 'CUSTOMER',
  reason: 'PASSWORD_CHANGE' | 'ADMIN_REVOKE' | 'LOGOUT_ALL' = 'LOGOUT_ALL'
): Promise<number> {
  const where = userType === 'STAFF'
    ? { userId, revokedAt: null }
    : { customerId: userId, revokedAt: null }

  const result = await prisma.refreshToken.updateMany({
    where,
    data: {
      revokedAt: new Date(),
      revokedReason: reason,
    },
  })

  return result.count
}

/**
 * Clean up expired tokens (run periodically via cron)
 * Keeps last 30 days of revoked tokens for audit purposes
 */
export async function cleanupExpiredTokens(): Promise<number> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  const result = await prisma.refreshToken.deleteMany({
    where: {
      OR: [
        // Delete expired tokens older than 30 days
        { expiresAt: { lt: thirtyDaysAgo } },
        // Delete revoked tokens older than 30 days
        { revokedAt: { lt: thirtyDaysAgo } },
      ],
    },
  })

  return result.count
}

/**
 * Get active sessions for a user (for "manage sessions" UI)
 */
export async function getUserActiveSessions(
  userId: string,
  userType: 'STAFF' | 'CUSTOMER'
) {
  const where = userType === 'STAFF'
    ? { userId, revokedAt: null, expiresAt: { gt: new Date() } }
    : { customerId: userId, revokedAt: null, expiresAt: { gt: new Date() } }

  return prisma.refreshToken.findMany({
    where,
    select: {
      id: true,
      createdAt: true,
      expiresAt: true,
      userAgent: true,
      ipAddress: true,
    },
    orderBy: { createdAt: 'desc' },
  })
}

/**
 * Revoke a specific session by ID (for "manage sessions" UI)
 */
export async function revokeSessionById(
  sessionId: string,
  userId: string,
  userType: 'STAFF' | 'CUSTOMER'
): Promise<boolean> {
  const where = userType === 'STAFF'
    ? { userId }
    : { customerId: userId }

  try {
    await prisma.refreshToken.update({
      where: {
        id: sessionId,
        ...where,
      },
      data: {
        revokedAt: new Date(),
        revokedReason: 'LOGOUT',
      },
    })
    return true
  } catch {
    return false
  }
}
