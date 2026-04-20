/**
 * API Client with Authentication
 *
 * Provides authenticated fetch for Fastify API calls.
 * Automatically handles token refresh and adds Authorization header.
 */

// API base URL (Fastify server)
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'

// Token storage (in-memory for security, refreshed on page load)
let accessToken: string | null = null
let tokenExpiresAt: number = 0

/**
 * Get or refresh access token
 */
async function getAccessToken(): Promise<string | null> {
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
      return null
    }

    const data = await response.json()
    accessToken = data.accessToken
    tokenExpiresAt = Date.now() + (data.expiresIn * 1000)
    return accessToken
  } catch (error) {
    console.error('Failed to refresh token:', error)
    accessToken = null
    tokenExpiresAt = 0
    return null
  }
}

/**
 * Clear stored token (call on logout)
 */
export function clearAccessToken(): void {
  accessToken = null
  tokenExpiresAt = 0
}

/**
 * Authenticated fetch for API calls
 * Automatically adds Authorization header with JWT
 * Prepends API_BASE_URL if path starts with /api/
 */
export async function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const token = await getAccessToken()

  const headers = new Headers(init?.headers)

  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  // Resolve URL - prepend API base for /api/ paths (except auth routes)
  let url: RequestInfo | URL = input
  if (typeof input === 'string' && input.startsWith('/api/') && !input.startsWith('/api/auth/')) {
    url = `${API_BASE_URL}${input}`
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
