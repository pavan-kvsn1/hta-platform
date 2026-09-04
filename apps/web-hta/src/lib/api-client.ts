/**
 * API Client with Authentication
 *
 * Provides authenticated fetch for Fastify API calls.
 * Automatically handles token refresh and adds Authorization header.
 *
 * In production: Set NEXT_PUBLIC_API_URL for direct browser-to-API calls
 * In CI/dev: Leave unset to use Next.js rewrite proxy (avoids CORS issues)
 */

// ElectronAPI types are declared in src/types/electron.d.ts

// If NEXT_PUBLIC_API_URL is set, use direct API calls; otherwise use proxy
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || ''

// Token storage (in-memory for security, refreshed on page load)
let accessToken: string | null = null
let tokenExpiresAt: number = 0

/**
 * Get or refresh access token
 */
/**
 * Why the last attempt to mint an access token failed, if it did.
 *
 * Without this the reason is thrown away at the one point it is known: the request goes
 * out with no Authorization header, the API answers 401, and every caller reports
 * "401 Unauthorized" - which describes the second failure and not the first. The
 * distinction matters to the reader: a signed-out session is fixed by signing in, and
 * nothing else is.
 */
let lastTokenFailure: 'signed out' | 'unreachable' | null = null

/** Whether the API refused us because there is no session to act on. */
export function isSignedOut(): boolean {
  return lastTokenFailure === 'signed out'
}

async function getAccessToken(): Promise<string | null> {
  // In Electron, get token from main process (no database needed)
  const electronApi = typeof window !== 'undefined'
    ? (window as unknown as { electronAPI?: { getAccessToken?: () => Promise<string | null> } }).electronAPI
    : undefined
  if (electronApi?.getAccessToken) {
    try {
      return await electronApi.getAccessToken()
    } catch {
      return null
    }
  }

  // Return cached token if still valid (with 30s buffer)
  if (accessToken && Date.now() < tokenExpiresAt - 30000) {
    return accessToken
  }

  // Refresh token
  try {
    const response = await fetch('/api/auth/issue-refresh-token', {
      method: 'POST',
      credentials: 'include',
    })

    if (!response.ok) {
      accessToken = null
      tokenExpiresAt = 0
      // 401 here means NextAuth has no session to mint against - the person is signed
      // out. Anything else is the mint itself being unavailable.
      lastTokenFailure = response.status === 401 ? 'signed out' : 'unreachable'
      return null
    }

    const data = await response.json()
    accessToken = data.accessToken
    tokenExpiresAt = Date.now() + (data.expiresIn * 1000)
    lastTokenFailure = null
    return accessToken
  } catch (error) {
    console.error('Failed to refresh token:', error)
    accessToken = null
    tokenExpiresAt = 0
    lastTokenFailure = 'unreachable'
    return null
  }
}

/**
 * Clear stored token (call on logout)
 */
export function clearAccessToken(): void {
  lastTokenFailure = null
  accessToken = null
  tokenExpiresAt = 0
}

/**
 * Authenticated fetch for API calls
 * Automatically adds Authorization header with JWT
 * Prepends API_BASE_URL if path starts with /api/
 */
/**
 * Route patterns the Electron app can handle offline (local SQLite).
 * Only exact patterns — list/search endpoints must go to the real API.
 */
const OFFLINE_ROUTE_PATTERNS = [
  /^\/api\/certificates\/[^/?]+$/,   // GET/PUT /api/certificates/:id
  /^\/api\/certificates\/?$/,         // POST /api/certificates
]

// Cache API reachability check result to avoid async in the hot path
let _apiReachable = true
let _apiCheckPending = false

function checkApiReachability(): void {
  const api = typeof window !== 'undefined'
    ? (window as unknown as { electronAPI?: { isApiReachable?: () => Promise<boolean> } }).electronAPI
    : undefined
  if (api?.isApiReachable && !_apiCheckPending) {
    _apiCheckPending = true
    api.isApiReachable().then((reachable) => {
      _apiReachable = reachable
    }).catch(() => {
      _apiReachable = false
    }).finally(() => {
      _apiCheckPending = false
    })
  }
}

function isElectronOffline(): boolean {
  if (typeof window === 'undefined') return false
  const api = (window as unknown as { electronAPI?: { isApiReachable?: () => Promise<boolean> } }).electronAPI
  if (!api) return false

  // Trigger async reachability check for next call
  checkApiReachability()
  return !_apiReachable
}

function isDraftRoute(url: string): boolean {
  // Strip query string for pattern matching
  const path = url.split('?')[0]
  return OFFLINE_ROUTE_PATTERNS.some((r) => r.test(path))
}

export async function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  // Electron offline intercept: route draft-capable requests to local SQLite
  if (isElectronOffline() && typeof input === 'string' && isDraftRoute(input)) {
    const result = await window.electronAPI!.handleOfflineRequest(input, init)
    // Preload returns plain { status, body } — wrap into a real Response
    return new Response(JSON.stringify(result.body), {
      status: result.status,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  let response: Response
  let sentToken = false
  try {
    sentToken = (await peekAccessToken()) !== null
    response = await doApiFetch(input, init)
  } catch (err) {
    // Network error in Electron — try offline bridge for draft routes
    if (typeof input === 'string' && isDraftRoute(input) && window.electronAPI?.handleOfflineRequest) {
      _apiReachable = false
      const result = await window.electronAPI.handleOfflineRequest(input, init)
      return new Response(JSON.stringify(result.body), {
        status: result.status,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    throw err
  }

  // Electron: API returned 500+ for a draft route — likely proxy timeout, retry via offline bridge
  if (response.status >= 500 && typeof input === 'string' && isDraftRoute(input) && window.electronAPI?.handleOfflineRequest) {
    _apiReachable = false
    const result = await window.electronAPI.handleOfflineRequest(input, init)
    return new Response(JSON.stringify(result.body), {
      status: result.status,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Electron 401 retry: refresh token via IPC and retry once
  const electronApi = typeof window !== 'undefined'
    ? (window as unknown as { electronAPI?: { refreshAccessToken?: () => Promise<string | null> } }).electronAPI
    : undefined
  if (response.status === 401 && electronApi?.refreshAccessToken) {
    const newToken = await electronApi.refreshAccessToken()
    if (newToken) {
      return doApiFetch(input, init)
    }
    // Refresh failed — force fresh login (not unlock, which uses the same dead token)
    window.location.href = '/desktop/login?reauth=true'
  }

  /**
   * The same courtesy in a browser, which had none.
   *
   * An access token lives minutes and is cached with a 30-second buffer, so one can
   * pass that check here and still be expired by the time the API reads it - the two
   * clocks are not the same clock. That produced a 401 the reader had to recover from
   * by reloading, for a token the app could have replaced without being asked. Once
   * only, and only where a token was actually sent: retrying a request that went out
   * unauthenticated would just ask the same question twice.
   */
  if (response.status === 401 && !electronApi?.refreshAccessToken && sentToken) {
    accessToken = null
    tokenExpiresAt = 0
    const renewed = await getAccessToken()
    if (renewed) return doApiFetch(input, init)
  }

  return response
}

/** The token as it stands, without minting a new one. */
async function peekAccessToken(): Promise<string | null> {
  return getAccessToken()
}

async function doApiFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const token = await getAccessToken()

  const headers = new Headers(init?.headers)

  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  // Resolve URL for API calls (except auth routes which stay on Next.js)
  let url: RequestInfo | URL = input
  if (typeof input === 'string' && input.startsWith('/api/') && !input.startsWith('/api/auth/')) {
    // Add tenant header for Fastify API calls
    headers.set('X-Tenant-ID', 'hta-calibration')

    // If API_BASE_URL is set (production), use direct cross-origin calls
    // Otherwise (CI/dev), use relative URLs proxied through Next.js rewrites
    if (API_BASE_URL) {
      url = `${API_BASE_URL}${input}`
    }
  }

  return fetch(url, {
    ...init,
    headers,
    credentials: 'include',
  })
}

/**
 * Typed API response helper
 */
export async function apiGet<T>(url: string): Promise<T> {
  const response = await apiFetch(url)
  if (!response.ok) {
    throw new ApiError(response.status, await response.text())
  }
  return response.json()
}

export async function apiPost<T>(url: string, body?: unknown): Promise<T> {
  const response = await apiFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!response.ok) {
    throw new ApiError(response.status, await response.text())
  }
  return response.json()
}

export async function apiPut<T>(url: string, body?: unknown): Promise<T> {
  const response = await apiFetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!response.ok) {
    throw new ApiError(response.status, await response.text())
  }
  return response.json()
}

export async function apiDelete<T>(url: string): Promise<T> {
  const response = await apiFetch(url, {
    method: 'DELETE',
  })
  if (!response.ok) {
    throw new ApiError(response.status, await response.text())
  }
  return response.json()
}

/**
 * API Error class
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    public body: string
  ) {
    super(`API Error ${status}: ${body}`)
    this.name = 'ApiError'
  }
}
