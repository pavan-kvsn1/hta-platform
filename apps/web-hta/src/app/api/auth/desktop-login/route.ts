/**
 * Desktop Login API Route
 *
 * Only available when HTA_DESKTOP=1 (Electron context).
 * Proxies email/password to the Fastify API, then creates a NextAuth-compatible
 * session cookie so the rest of the app works without a local PostgreSQL database.
 */

import { NextRequest, NextResponse } from 'next/server'
import { encode } from 'next-auth/jwt'
import { cookies } from 'next/headers'

const API_BASE = process.env.HTA_API_URL || 'http://localhost:4000'
const SESSION_COOKIE = '__Secure-authjs.session-token'
const SESSION_MAX_AGE = 4 * 60 * 60 // 4 hours (matches auth config)

export async function POST(request: NextRequest) {
  if (process.env.HTA_DESKTOP !== '1') {
    return NextResponse.json({ error: 'Not available' }, { status: 404 })
  }

  const { email, password } = await request.json()

  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password required' }, { status: 400 })
  }

  // Authenticate against the Fastify API
  let apiRes: Response
  try {
    apiRes = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, userType: 'STAFF' }),
    })
  } catch (err) {
    return NextResponse.json(
      { error: 'Cannot reach API server. Please check your connection.' },
      { status: 503 }
    )
  }

  if (!apiRes.ok) {
    const body = await apiRes.json().catch(() => ({}))
    return NextResponse.json(
      { error: body.error || 'Invalid credentials' },
      { status: apiRes.status }
    )
  }

  const data = await apiRes.json()
  const { user, refreshToken, accessToken } = data

  // Create NextAuth-compatible session token
  const secret = process.env.AUTH_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'AUTH_SECRET not configured' }, { status: 500 })
  }

  const sessionToken = await encode({
    token: {
      sub: user.sub,
      id: user.sub,
      email: user.email,
      name: user.name,
      role: user.role,
      isAdmin: user.isAdmin ?? false,
      adminType: user.adminType ?? null,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE,
    },
    secret,
    salt: SESSION_COOKIE,
  })

  // Set the session cookie and clear any stale non-secure cookie
  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    secure: true, // Chromium treats localhost as secure context
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  })
  cookieStore.delete('authjs.session-token')

  // Return user data and tokens for Electron PIN setup
  return NextResponse.json({
    user: {
      id: user.sub,
      email: user.email,
      name: user.name,
      role: user.role,
      isAdmin: user.isAdmin ?? false,
      adminType: user.adminType ?? null,
      tenantId: user.tenantId,
    },
    refreshToken,
    accessToken,
  })
}
