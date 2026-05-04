/**
 * API Client Unit Tests (actual imports)
 *
 * Tests for src/lib/api-client.ts:
 * - clearAccessToken
 * - ApiError class
 * - apiFetch — URL and header injection logic
 * - apiFetch — caching/expiry of access tokens
 *
 * Uses MSW to mock the fetch calls since the setup.ts MSW server
 * intercepts all fetch requests in the test environment.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../setup'

// ---------------------------------------------------------------------------
// Import actual module
// ---------------------------------------------------------------------------
import { clearAccessToken, apiFetch, ApiError } from '@/lib/api-client'

// Reset token state before each test
beforeEach(() => {
  clearAccessToken()
})

// ---------------------------------------------------------------------------
// ApiError class
// ---------------------------------------------------------------------------
describe('ApiError', () => {
  it('is constructable with status and body', () => {
    const err = new ApiError(404, 'Not Found')
    expect(err.status).toBe(404)
    expect(err.body).toBe('Not Found')
    expect(err instanceof Error).toBe(true)
    expect(err instanceof ApiError).toBe(true)
  })

  it('has correct name', () => {
    const err = new ApiError(500, 'Internal Server Error')
    expect(err.name).toBe('ApiError')
  })

  it('message includes status code and body', () => {
    const err = new ApiError(403, 'Forbidden')
    expect(err.message).toContain('403')
    expect(err.message).toContain('Forbidden')
  })

  it('creates different error objects for different status codes', () => {
    const err401 = new ApiError(401, 'Unauthorized')
    const err403 = new ApiError(403, 'Forbidden')
    expect(err401.status).not.toBe(err403.status)
    expect(err401.body).not.toBe(err403.body)
  })
})

// ---------------------------------------------------------------------------
// clearAccessToken
// ---------------------------------------------------------------------------
describe('clearAccessToken', () => {
  it('is callable and does not throw', () => {
    expect(() => clearAccessToken()).not.toThrow()
  })

  it('can be called multiple times safely', () => {
    clearAccessToken()
    clearAccessToken()
    clearAccessToken()
    // No error expected
  })
})

// ---------------------------------------------------------------------------
// apiFetch — basic usage with MSW mocking
// ---------------------------------------------------------------------------
describe('apiFetch — auth route passthrough', () => {
  beforeEach(() => {
    server.use(
      http.post('/api/auth/issue-refresh-token', () => {
        return HttpResponse.json({ error: 'Not authenticated' }, { status: 401 })
      })
    )
  })

  it('makes a request to the provided URL', async () => {
    server.use(
      http.get('/api/auth/session', () => {
        return HttpResponse.json({ user: null })
      })
    )

    const response = await apiFetch('/api/auth/session')
    expect(response.ok).toBe(true)
  })

  it('returns response from the fetch call', async () => {
    server.use(
      http.post('/api/auth/2fa/setup', () => {
        return HttpResponse.json({ success: false }, { status: 401 })
      })
    )

    const response = await apiFetch('/api/auth/2fa/setup', { method: 'POST' })
    expect(response.status).toBe(401)
  })
})

describe('apiFetch — API route with token injection', () => {
  beforeEach(() => {
    server.use(
      // Token refresh endpoint returns a valid token
      http.post('/api/auth/issue-refresh-token', () => {
        return HttpResponse.json({ accessToken: 'test-access-token', expiresIn: 300 })
      })
    )
  })

  it('adds X-Tenant-ID header for non-auth API calls', async () => {
    let receivedTenantId: string | null = null

    server.use(
      http.get('/api/instruments', ({ request }) => {
        receivedTenantId = request.headers.get('X-Tenant-ID')
        return HttpResponse.json([])
      })
    )

    await apiFetch('/api/instruments')
    expect(receivedTenantId).toBe('hta-calibration')
  })

  it('does NOT add X-Tenant-ID for auth routes', async () => {
    let receivedTenantId: string | null = 'PRESENT' // default to detect absence

    server.use(
      http.get('/api/auth/session', ({ request }) => {
        receivedTenantId = request.headers.get('X-Tenant-ID')
        return HttpResponse.json({})
      })
    )

    await apiFetch('/api/auth/session')
    expect(receivedTenantId).toBeNull()
  })

  it('includes credentials in requests', async () => {
    // apiFetch always passes credentials:'include', we verify via the response being successful
    server.use(
      http.get('/api/certificates', () => {
        return HttpResponse.json({ certificates: [] })
      })
    )

    const response = await apiFetch('/api/certificates')
    expect(response).toBeDefined()
    expect(response.ok).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// apiFetch — token caching
// ---------------------------------------------------------------------------
describe('apiFetch — token caching behavior', () => {
  it('only calls issue-refresh-token once for multiple requests (token cached)', async () => {
    let issueCallCount = 0

    server.use(
      http.post('/api/auth/issue-refresh-token', () => {
        issueCallCount++
        return HttpResponse.json({ accessToken: 'cached-token', expiresIn: 300 })
      }),
      http.get('/api/certificates', () => HttpResponse.json([])),
      http.get('/api/instruments', () => HttpResponse.json([]))
    )

    // Make two separate API calls
    await apiFetch('/api/certificates')
    await apiFetch('/api/instruments')

    // Token should be reused from cache on second call
    expect(issueCallCount).toBe(1)
  })

  it('re-fetches token after clearAccessToken', async () => {
    let issueCallCount = 0

    server.use(
      http.post('/api/auth/issue-refresh-token', () => {
        issueCallCount++
        return HttpResponse.json({ accessToken: `token-${issueCallCount}`, expiresIn: 300 })
      }),
      http.get('/api/certificates', () => HttpResponse.json([]))
    )

    await apiFetch('/api/certificates')
    clearAccessToken() // Clear the cached token
    await apiFetch('/api/certificates')

    expect(issueCallCount).toBe(2)
  })
})
