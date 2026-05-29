/**
 * Desktop Login API Route
 *
 * Only available when HTA_DESKTOP=1 (Electron context).
 * Proxies email/password to the Fastify API for first-time desktop setup.
 * It intentionally does not create a browser session; after the encrypted
 * local cache is created, the app must pass offline challenge unlock first.
 */

import { NextRequest, NextResponse } from 'next/server'

function getApiBase(): string {
  return (process.env.HTA_API_URL || process.env.API_URL || 'http://localhost:4000').replace(/\/+$/, '')
}
const DESKTOP_LOGIN_TIMEOUT_MS = 10000

export async function POST(request: NextRequest) {
  if (process.env.HTA_DESKTOP !== '1') {
    return NextResponse.json({ error: 'Not available' }, { status: 404 })
  }

  let payload: { email?: string; password?: string }
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON request body' }, { status: 400 })
  }

  const { email, password } = payload

  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password required' }, { status: 400 })
  }

  // Authenticate against the Fastify API
  let apiRes: Response
  const apiBase = getApiBase()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), DESKTOP_LOGIN_TIMEOUT_MS)
  try {
    apiRes = await fetch(`${apiBase}/api/auth/login`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', 'X-Tenant-ID': 'hta-calibration' },
      body: JSON.stringify({ email, password, userType: 'STAFF' }),
    })
  } catch (err) {
    const message = err instanceof Error && err.name === 'AbortError'
      ? `API login timed out after ${DESKTOP_LOGIN_TIMEOUT_MS / 1000}s`
      : 'Cannot reach API server. Please check your connection.'

    return NextResponse.json(
      {
        error: message,
        diagnostic: {
          apiBase,
          cause: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
        },
      },
      { status: 503 }
    )
  } finally {
    clearTimeout(timeout)
  }

  if (!apiRes.ok) {
    const rawBody = await apiRes.text().catch(() => '')
    let body: { error?: string; message?: string } = {}
    try {
      body = rawBody ? JSON.parse(rawBody) : {}
    } catch {
      body = {}
    }
    return NextResponse.json(
      {
        error: body.error || body.message || 'Invalid credentials',
        diagnostic: {
          apiBase,
          apiStatus: apiRes.status,
          apiBody: rawBody.slice(0, 300),
        },
      },
      { status: apiRes.status }
    )
  }

  const data = await apiRes.json()
  const { user, refreshToken, accessToken } = data

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
