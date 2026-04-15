/**
 * Issue Refresh Token API
 *
 * Bridges NextAuth sessions to Fastify API JWT tokens.
 * Called after successful NextAuth login to create tokens
 * that the Fastify API can validate.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { SignJWT } from 'jose'
import { prisma, getDefaultTenantId } from '@/lib/prisma'
import { randomBytes, createHash } from 'crypto'
import { cookies } from 'next/headers'

// Token configuration (must match Fastify API)
const REFRESH_TOKEN_CONFIG = {
  expiresInMs: 7 * 24 * 60 * 60 * 1000, // 7 days
  accessTokenExpiresInMs: 4 * 60 * 60 * 1000, // 4 hours (matches NextAuth session)
  tokenBytes: 32,
}

const COOKIE_NAME = 'hta-refresh-token'

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
 * Get JWT secret as Uint8Array for jose
 */
function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET || process.env.AUTH_SECRET
  if (!secret) {
    throw new Error('JWT_SECRET or AUTH_SECRET must be configured')
  }
  return new TextEncoder().encode(secret)
}

export async function POST(request: NextRequest) {
  try {
    // Verify NextAuth session
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Not authenticated' },
        { status: 401 }
      )
    }

    const tenantId = await getDefaultTenantId()
    const user = session.user

    // Determine user type
    const userType = user.role === 'CUSTOMER' ? 'CUSTOMER' : 'STAFF'
    const isStaff = userType === 'STAFF'

    // Create refresh token
    const rawToken = generateToken()
    const hashedToken = hashToken(rawToken)
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_CONFIG.expiresInMs)

    // Get request info
    const userAgent = request.headers.get('user-agent') || undefined
    const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0] ||
      request.headers.get('x-real-ip') ||
      undefined

    // Store refresh token in database
    await prisma.refreshToken.create({
      data: {
        token: hashedToken,
        tenantId,
        userId: isStaff ? user.id : undefined,
        customerId: !isStaff ? user.id : undefined,
        userType,
        expiresAt,
        userAgent,
        ipAddress,
      },
    })

    // Create JWT payload (must match Fastify JWTPayload structure)
    const jwtPayload = {
      sub: user.id,
      email: user.email || '',
      name: user.name || '',
      role: user.role || 'ENGINEER',
      userType,
      tenantId,
      isAdmin: user.isAdmin || false,
      adminType: user.adminType || null,
    }

    // Sign JWT with same secret as Fastify
    const accessToken = await new SignJWT(jwtPayload)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(`${REFRESH_TOKEN_CONFIG.accessTokenExpiresInMs / 1000}s`)
      .sign(getJwtSecret())

    // Set refresh token in HTTP-only cookie
    const cookieStore = await cookies()
    cookieStore.set(COOKIE_NAME, rawToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: REFRESH_TOKEN_CONFIG.expiresInMs / 1000,
    })

    return NextResponse.json({
      accessToken,
      expiresIn: REFRESH_TOKEN_CONFIG.accessTokenExpiresInMs / 1000,
    })
  } catch (error) {
    console.error('Failed to issue refresh token:', error)
    return NextResponse.json(
      { error: 'Internal error', message: 'Failed to issue token' },
      { status: 500 }
    )
  }
}
