/**
 * Worker Test Setup
 *
 * Configures the test environment for worker tests including:
 * - Mock Redis connection
 * - Mock job processors
 * - Mock database (Prisma)
 * - Global test helpers
 */

import { vi, beforeAll, afterAll, afterEach } from 'vitest'

// Mock environment variables
process.env.NODE_ENV = 'test'
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test'
process.env.REDIS_URL = 'redis://localhost:6379'
process.env.RESEND_API_KEY = 'test-resend-key'
process.env.EMAIL_FROM = 'HTA Test <test@htacalibration.com>'

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
      send: vi.fn().mockResolvedValue({ data: { id: 'test-email-id' }, error: null }),
    },
  })),
}))

// Mock @hta/database
vi.mock('@hta/database', () => ({
  prisma: {
    passwordResetToken: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    notification: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      create: vi.fn().mockResolvedValue({ id: 'test-notification-id' }),
    },
    certificateImage: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}))

// Mock @hta/emails
vi.mock('@hta/emails', () => ({
  renderEmail: vi.fn().mockResolvedValue({
    html: '<html><body>Test email</body></html>',
    subject: 'Test Subject',
  }),
}))

// Mock @hta/shared/notifications
vi.mock('@hta/shared/notifications', () => ({
  createNotification: vi.fn().mockResolvedValue({
    id: 'test-notification-id',
    userId: null,
    customerId: null,
    type: 'CERTIFICATE_APPROVED',
    title: 'Test',
    message: 'Test message',
    read: false,
    readAt: null,
    certificateId: null,
    data: null,
    createdAt: new Date(),
  }),
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
