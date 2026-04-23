/**
 * Refresh Token API
 *
 * Uses the refresh token cookie to issue a new access token.
 * Called automatically when the user returns to the tab or
 * before the access token expires.
 */

import { NextRequest, NextResponse } from 'next/server'
import { SignJWT } from 'jose'
import { cookies } from 'next/headers'
import { prisma, getDefaultTenantId } from '@/lib/prisma'
import { validateRefreshToken, rotateRefreshToken } from '@/lib/refresh-token'

const REFRESH_TOKEN_CONFIG = {
  expiresInMs: 7 * 24 * 60 * 60 * 1000, // 7 days
  accessTokenExpiresInMs: 4 * 60 * 60 * 1000, // 4 hours
}

const COOKIE_NAME = 'hta-refresh-token'

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET || process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET
  if (!secret) {
    throw new Error('JWT_SECRET, AUTH_SECRET, or NEXTAUTH_SECRET must be configured')
  }
  return new TextEncoder().encode(secret)
}

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const rawToken = cookieStore.get(COOKIE_NAME)?.value

    if (!rawToken) {
      return NextResponse.json(
        { error: 'No refresh token' },
        { status: 401 }
      )
    }

    // Validate the refresh token
    const validated = await validateRefreshToken(rawToken)
    if (!validated) {
      // Clear invalid cookie
      cookieStore.delete(COOKIE_NAME)
      return NextResponse.json(
        { error: 'Invalid or expired refresh token' },
        { status: 401 }
      )
    }

    const tenantId = await getDefaultTenantId()
    const userId = validated.userId || validated.customerId
    if (!userId) {
      return NextResponse.json(
        { error: 'Invalid token data' },
        { status: 401 }
      )
    }

    // Look up user details for JWT payload
    let jwtPayload: Record<string, unknown>

    if (validated.userType === 'STAFF') {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, name: true, role: true, isAdmin: true, adminType: true, isActive: true },
      })
      if (!user || !user.isActive) {
        cookieStore.delete(COOKIE_NAME)
        return NextResponse.json({ error: 'User not found or inactive' }, { status: 401 })
      }
      jwtPayload = {
        sub: user.id,
        email: user.email,
        name: user.name || '',
        role: user.role,
        userType: 'STAFF',
        tenantId,
        isAdmin: user.isAdmin,
        adminType: user.adminType,
      }
    } else {
      const customer = await prisma.customerUser.findUnique({
        where: { id: userId },
        select: { id: true, email: true, name: true, isActive: true, customerAccountId: true },
      })
      if (!customer || !customer.isActive) {
        cookieStore.delete(COOKIE_NAME)
        return NextResponse.json({ error: 'Customer not found or inactive' }, { status: 401 })
      }
      jwtPayload = {
        sub: customer.id,
        email: customer.email,
        name: customer.name || '',
        role: 'CUSTOMER',
        userType: 'CUSTOMER',
        tenantId,
        customerAccountId: customer.customerAccountId,
      }
    }

    // Rotate the refresh token (old one is revoked, new one created)
    const userAgent = request.headers.get('user-agent') || undefined
    const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0] ||
      request.headers.get('x-real-ip') || undefined

    const newToken = await rotateRefreshToken(rawToken, {
      tenantId,
      userId: validated.userType === 'STAFF' ? userId : undefined,
      customerId: validated.userType === 'CUSTOMER' ? userId : undefined,
      userType: validated.userType,
      userAgent,
      ipAddress,
    })

    if (!newToken) {
      cookieStore.delete(COOKIE_NAME)
      return NextResponse.json({ error: 'Token rotation failed' }, { status: 401 })
    }

    // Sign new access token
    const accessToken = await new SignJWT(jwtPayload)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(`${REFRESH_TOKEN_CONFIG.accessTokenExpiresInMs / 1000}s`)
      .sign(getJwtSecret())

    // Set new refresh token cookie
    cookieStore.set(COOKIE_NAME, newToken.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: REFRESH_TOKEN_CONFIG.expiresInMs / 1000,
    })

    return NextResponse.json({
      accessToken,
      expiresIn: REFRESH_TOKEN_CONFIG.accessTokenExpiresInMs / 1000,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_CONFIG.accessTokenExpiresInMs).toISOString(),
    })
  } catch (error) {
    console.error('Token refresh error:', error)
    return NextResponse.json(
      { error: 'Internal error' },
      { status: 500 }
    )
  }
}
