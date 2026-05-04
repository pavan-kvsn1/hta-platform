/**
 * Desktop Auth API Routes Unit Tests
 *
 * Tests for Next.js Route Handlers:
 * - POST /api/auth/desktop-login — Proxies credentials to Fastify API, creates NextAuth session
 * - POST /api/auth/desktop-session — Creates session from stored user profile
 *
 * Mocks: next-auth/jwt encode, global fetch, next/headers cookies
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ─── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('next-auth/jwt', () => ({
  encode: vi.fn().mockResolvedValue('mock-jwt-token'),
}))

const mockCookieSet = vi.fn()
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({
    set: mockCookieSet,
  }),
}))

// We need to mock fetch AFTER MSW has set up (setup.ts patches global.fetch).
// Use vi.spyOn to intercept calls reliably.
const mockFetch = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  // Spy on global fetch so our mock takes precedence over MSW
  vi.stubGlobal('fetch', mockFetch)
  process.env.HTA_DESKTOP = '1'
  process.env.HTA_API_URL = 'http://localhost:4000'
  process.env.AUTH_SECRET = 'test-secret-key'
})

// ─── desktop-login route ────────────────────────────────────────────────────

describe('POST /api/auth/desktop-login', () => {
  async function importRoute() {
    // Re-import to pick up fresh env and the stubbed fetch
    vi.resetModules()
    vi.mock('next-auth/jwt', () => ({
      encode: vi.fn().mockResolvedValue('mock-jwt-token'),
    }))
    vi.mock('next/headers', () => ({
      cookies: vi.fn().mockResolvedValue({ set: mockCookieSet }),
    }))
    // Re-stub fetch after resetModules since it may have been restored
    vi.stubGlobal('fetch', mockFetch)
    const mod = await import('@/app/api/auth/desktop-login/route')
    return mod.POST
  }

  it('returns session cookie on valid credentials', async () => {
    const apiUser = {
      sub: 'user-123',
      email: 'engineer@htaipl.com',
      name: 'Test Engineer',
      role: 'ENGINEER',
      isAdmin: false,
      adminType: null,
      tenantId: 'tenant-1',
    }

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          user: apiUser,
          refreshToken: 'refresh-abc',
          accessToken: 'access-xyz',
        }),
    })

    const POST = await importRoute()
    const request = new NextRequest('http://localhost:3000/api/auth/desktop-login', {
      method: 'POST',
      body: JSON.stringify({ email: 'engineer@htaipl.com', password: 'correct-pw' }),
      headers: { 'Content-Type': 'application/json' },
    })

    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.user.email).toBe('engineer@htaipl.com')
    expect(body.user.id).toBe('user-123')
    expect(body.refreshToken).toBe('refresh-abc')
    expect(body.accessToken).toBe('access-xyz')
    expect(mockCookieSet).toHaveBeenCalledWith(
      'authjs.session-token',
      'mock-jwt-token',
      expect.objectContaining({ httpOnly: true, path: '/' })
    )
  })

  it('returns 401 on invalid credentials', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: 'Invalid credentials' }),
    })

    const POST = await importRoute()
    const request = new NextRequest('http://localhost:3000/api/auth/desktop-login', {
      method: 'POST',
      body: JSON.stringify({ email: 'engineer@htaipl.com', password: 'wrong-pw' }),
      headers: { 'Content-Type': 'application/json' },
    })

    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body.error).toBe('Invalid credentials')
  })

  it('returns 503 when API is unreachable', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'))

    const POST = await importRoute()
    const request = new NextRequest('http://localhost:3000/api/auth/desktop-login', {
      method: 'POST',
      body: JSON.stringify({ email: 'engineer@htaipl.com', password: 'any-pw' }),
      headers: { 'Content-Type': 'application/json' },
    })

    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(503)
    expect(body.error).toContain('Cannot reach API server')
  })
})

// ─── desktop-session route ──────────────────────────────────────────────────

describe('POST /api/auth/desktop-session', () => {
  async function importRoute() {
    vi.resetModules()
    vi.mock('next-auth/jwt', () => ({
      encode: vi.fn().mockResolvedValue('mock-jwt-token'),
    }))
    vi.mock('next/headers', () => ({
      cookies: vi.fn().mockResolvedValue({ set: mockCookieSet }),
    }))
    const mod = await import('@/app/api/auth/desktop-session/route')
    return mod.POST
  }

  it('creates session from stored profile', async () => {
    const POST = await importRoute()
    const request = new NextRequest('http://localhost:3000/api/auth/desktop-session', {
      method: 'POST',
      body: JSON.stringify({
        userProfile: {
          id: 'user-123',
          email: 'engineer@htaipl.com',
          name: 'Test Engineer',
          role: 'ENGINEER',
          isAdmin: false,
          adminType: null,
        },
      }),
      headers: { 'Content-Type': 'application/json' },
    })

    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.success).toBe(true)
    expect(mockCookieSet).toHaveBeenCalledWith(
      'authjs.session-token',
      'mock-jwt-token',
      expect.objectContaining({ httpOnly: true, path: '/' })
    )
  })

  it('returns 400 on missing profile data', async () => {
    const POST = await importRoute()
    const request = new NextRequest('http://localhost:3000/api/auth/desktop-session', {
      method: 'POST',
      body: JSON.stringify({ userProfile: { name: 'No ID or email' } }),
      headers: { 'Content-Type': 'application/json' },
    })

    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toContain('Valid user profile required')
  })
})
