/**
 * Web Frontend Test Setup
 *
 * Configures the test environment for React component tests including:
 * - JSDOM environment setup
 * - MSW (Mock Service Worker) for API mocking
 * - React Testing Library utilities
 *
 * Mirrors setup from hta-calibration for consistency.
 */

/// <reference types="@testing-library/jest-dom" />
import '@testing-library/jest-dom'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'

// Every authenticated call goes through api-client, which first asks for an access
// token. Left unhandled, MSW only warns and lets that request through to the real
// network - in jsdom it resolves against localhost:3000 and the test then sits there
// until it times out, taking the rest of the file with it because renderHook has
// already returned. Answering 401 by default matches the unauthenticated next-auth
// mock below, and any test that wants a real token overrides this with server.use().
export const server = setupServer(
  http.post('/api/auth/issue-refresh-token', () =>
    HttpResponse.json({ error: 'Unauthenticated' }, { status: 401 }),
  ),
)

// Start server before all tests
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))

// Reset handlers after each test
afterEach(() => server.resetHandlers())

// Clean up after all tests
afterAll(() => server.close())

// Mock Next.js router
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}))

// Mock next-auth
vi.mock('next-auth/react', () => ({
  useSession: () => ({
    data: null,
    status: 'unauthenticated',
  }),
  signIn: vi.fn(),
  signOut: vi.fn(),
}))
