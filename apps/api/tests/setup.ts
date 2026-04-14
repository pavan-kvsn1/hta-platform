/**
 * API Test Setup
 *
 * Configures the test environment for API tests including:
 * - Mock database connection
 * - Test utilities
 * - Global test helpers
 */

import { vi, beforeAll, afterAll, afterEach } from 'vitest'

// Mock environment variables
process.env.NODE_ENV = 'test'
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test'
process.env.REDIS_URL = 'redis://localhost:6379'
process.env.JWT_SECRET = 'test-secret-key'

// Global test utilities
beforeAll(async () => {
  // Setup before all tests
})

afterEach(() => {
  // Clean up after each test
  vi.clearAllMocks()
})

afterAll(async () => {
  // Cleanup after all tests
})

// Export test utilities
export const createMockRequest = (options: {
  method?: string
  url?: string
  headers?: Record<string, string>
  body?: unknown
}) => ({
  method: options.method || 'GET',
  url: options.url || '/',
  headers: options.headers || {},
  body: options.body,
})

export const createMockReply = () => {
  const reply = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: null as unknown,
    status: vi.fn((code: number) => {
      reply.statusCode = code
      return reply
    }),
    send: vi.fn((data: unknown) => {
      reply.body = data
      return reply
    }),
    header: vi.fn((key: string, value: string) => {
      reply.headers[key] = value
      return reply
    }),
  }
  return reply
}
