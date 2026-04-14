/**
 * Worker Test Setup
 *
 * Configures the test environment for worker tests including:
 * - Mock Redis connection
 * - Mock job processors
 * - Global test helpers
 */

import { vi, beforeAll, afterAll, afterEach } from 'vitest'

// Mock environment variables
process.env.NODE_ENV = 'test'
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test'
process.env.REDIS_URL = 'redis://localhost:6379'
process.env.RESEND_API_KEY = 'test-resend-key'

// Mock BullMQ
vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation(() => ({
    add: vi.fn(),
    close: vi.fn(),
  })),
  Worker: vi.fn().mockImplementation(() => ({
    close: vi.fn(),
    on: vi.fn(),
  })),
  Job: vi.fn(),
}))

// Mock Resend
vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: {
      send: vi.fn().mockResolvedValue({ data: { id: 'test-email-id' } }),
    },
  })),
}))

beforeAll(async () => {
  // Setup before all tests
})

afterEach(() => {
  vi.clearAllMocks()
})

afterAll(async () => {
  // Cleanup after all tests
})

// Export test utilities
export const createMockJob = <T>(data: T, opts?: { id?: string; name?: string }) => ({
  id: opts?.id || 'test-job-id',
  name: opts?.name || 'test-job',
  data,
  progress: vi.fn(),
  log: vi.fn(),
  updateProgress: vi.fn(),
})
