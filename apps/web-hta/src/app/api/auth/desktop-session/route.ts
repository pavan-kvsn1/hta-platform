/**
 * Desktop Session Restoration API Route
 *
 * Only available when HTA_DESKTOP=1 (Electron context).
 * Creates a NextAuth-compatible session cookie from stored user profile data.
 * Called after PIN unlock to restore the session without re-entering credentials.
 */

import { NextRequest, NextResponse } from 'next/server'
import { encode } from 'next-auth/jwt'
import { cookies } from 'next/headers'

const SESSION_COOKIE = 'authjs.session-token'
const SESSION_MAX_AGE = 4 * 60 * 60 // 4 hours

export async function POST(request: NextRequest) {
  if (process.env.HTA_DESKTOP !== '1') {
    return NextResponse.json({ error: 'Not available' }, { status: 404 })
  }

  const { userProfile } = await request.json()

  if (!userProfile?.id || !userProfile?.email) {
    return NextResponse.json({ error: 'Valid user profile required' }, { status: 400 })
  }

  const secret = process.env.AUTH_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'AUTH_SECRET not configured' }, { status: 500 })
  }

  const sessionToken = await encode({
    token: {
      sub: userProfile.id,
      id: userProfile.id,
      email: userProfile.email,
      name: userProfile.name,
      role: userProfile.role,
      isAdmin: userProfile.isAdmin ?? false,
      adminType: userProfile.adminType ?? null,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE,
    },
    secret,
    salt: SESSION_COOKIE,
  })

  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    secure: false,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  })

  return NextResponse.json({ success: true })
}
