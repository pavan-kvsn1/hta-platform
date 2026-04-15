/**
 * Sentry Integration Unit Tests
 *
 * Tests for the Sentry integration utilities:
 * - Initialization
 * - User context
 * - Error capturing
 * - Span tracking
 * - Wrapper functions
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock @sentry/node
const mockSentry = {
  init: vi.fn(),
  setUser: vi.fn(),
  setTags: vi.fn(),
  setContext: vi.fn(),
  captureException: vi.fn().mockReturnValue('event-id-123'),
  captureMessage: vi.fn().mockReturnValue('event-id-456'),
  startSpan: vi.fn((opts, callback) => callback(undefined)),
  flush: vi.fn().mockResolvedValue(true),
  httpIntegration: vi.fn().mockReturnValue({ name: 'http' }),
  expressIntegration: vi.fn().mockReturnValue({ name: 'express' }),
  prismaIntegration: vi.fn().mockReturnValue({ name: 'prisma' }),
}

vi.mock('@sentry/node', () => mockSentry)

// Reset module state between tests
let sentryModule: typeof import('../src/sentry/index.js')

describe('Sentry Integration', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    // Reset the module to get fresh state
    vi.resetModules()
    sentryModule = await import('../src/sentry/index.js')
  })

  describe('initSentry', () => {
    it('initializes Sentry with DSN from config', () => {
      sentryModule.initSentry('api', { dsn: 'https://test@sentry.io/123' })

      expect(mockSentry.init).toHaveBeenCalledWith(
        expect.objectContaining({
          dsn: 'https://test@sentry.io/123',
          serverName: 'api',
        })
      )
    })

    it('skips initialization without DSN', () => {
      const originalEnv = process.env.SENTRY_DSN
      delete process.env.SENTRY_DSN

      sentryModule.initSentry('web')

      expect(mockSentry.init).not.toHaveBeenCalled()

      process.env.SENTRY_DSN = originalEnv
    })

    it('uses environment variable DSN', () => {
      const originalEnv = process.env.SENTRY_DSN
      process.env.SENTRY_DSN = 'https://env@sentry.io/456'

      sentryModule.initSentry('worker')

      expect(mockSentry.init).toHaveBeenCalledWith(
        expect.objectContaining({
          dsn: 'https://env@sentry.io/456',
        })
      )

      process.env.SENTRY_DSN = originalEnv
    })

    it('does not reinitialize if already initialized', async () => {
      sentryModule.initSentry('api', { dsn: 'https://test@sentry.io/123' })
      sentryModule.initSentry('api', { dsn: 'https://test@sentry.io/123' })

      expect(mockSentry.init).toHaveBeenCalledTimes(1)
    })

    it('sets custom sample rates', () => {
      sentryModule.initSentry('api', {
        dsn: 'https://test@sentry.io/123',
        sampleRate: 0.5,
        tracesSampleRate: 0.2,
      })

      expect(mockSentry.init).toHaveBeenCalledWith(
        expect.objectContaining({
          sampleRate: 0.5,
          tracesSampleRate: 0.2,
        })
      )
    })
  })

  describe('isSentryInitialized', () => {
    it('returns false before initialization', () => {
      expect(sentryModule.isSentryInitialized()).toBe(false)
    })

    it('returns true after initialization', () => {
      sentryModule.initSentry('api', { dsn: 'https://test@sentry.io/123' })
      expect(sentryModule.isSentryInitialized()).toBe(true)
    })
  })

  describe('setUser', () => {
    it('sets user context', () => {
      sentryModule.setUser({ id: 'user-123', email: 'test@example.com', role: 'admin' })

      expect(mockSentry.setUser).toHaveBeenCalledWith({
        id: 'user-123',
        email: 'test@example.com',
        role: 'admin',
      })
    })

    it('clears user context with null', () => {
      sentryModule.setUser(null)

      expect(mockSentry.setUser).toHaveBeenCalledWith(null)
    })

    it('handles partial user data', () => {
      sentryModule.setUser({ id: 'user-456' })

      expect(mockSentry.setUser).toHaveBeenCalledWith({
        id: 'user-456',
        email: undefined,
        role: undefined,
      })
    })
  })

  describe('setTags', () => {
    it('sets tags on current scope', () => {
      sentryModule.setTags({ tenant: 'acme', version: '1.0.0' })

      expect(mockSentry.setTags).toHaveBeenCalledWith({
        tenant: 'acme',
        version: '1.0.0',
      })
    })
  })

  describe('setContext', () => {
    it('sets context on current scope', () => {
      sentryModule.setContext('certificate', { id: 'cert-123', status: 'pending' })

      expect(mockSentry.setContext).toHaveBeenCalledWith('certificate', {
        id: 'cert-123',
        status: 'pending',
      })
    })
  })

  describe('captureException', () => {
    it('captures exception and returns event ID', () => {
      const error = new Error('Test error')
      const eventId = sentryModule.captureException(error)

      expect(mockSentry.captureException).toHaveBeenCalledWith(error, {
        tags: undefined,
        extra: undefined,
      })
      expect(eventId).toBe('event-id-123')
    })

    it('captures exception with context', () => {
      const error = new Error('Test error')
      sentryModule.captureException(error, {
        tags: { component: 'auth' },
        extra: { userId: 'user-123' },
      })

      expect(mockSentry.captureException).toHaveBeenCalledWith(error, {
        tags: { component: 'auth' },
        extra: { userId: 'user-123' },
      })
    })
  })

  describe('captureMessage', () => {
    it('captures message with default level', () => {
      const eventId = sentryModule.captureMessage('Something happened')

      expect(mockSentry.captureMessage).toHaveBeenCalledWith('Something happened', 'info')
      expect(eventId).toBe('event-id-456')
    })

    it('captures message with custom level', () => {
      sentryModule.captureMessage('Critical issue', 'fatal')

      expect(mockSentry.captureMessage).toHaveBeenCalledWith('Critical issue', 'fatal')
    })
  })

  describe('startSpan', () => {
    it('starts a span and executes callback', () => {
      const result = sentryModule.startSpan({ name: 'test-operation' }, () => 'result')

      expect(mockSentry.startSpan).toHaveBeenCalledWith(
        { name: 'test-operation', op: 'function', attributes: undefined },
        expect.any(Function)
      )
      expect(result).toBe('result')
    })

    it('passes custom operation type', () => {
      sentryModule.startSpan({ name: 'db-query', op: 'db' }, () => {})

      expect(mockSentry.startSpan).toHaveBeenCalledWith(
        expect.objectContaining({ op: 'db' }),
        expect.any(Function)
      )
    })

    it('passes attributes', () => {
      sentryModule.startSpan(
        { name: 'api-call', attributes: { endpoint: '/users', method: 'GET' } },
        () => {}
      )

      expect(mockSentry.startSpan).toHaveBeenCalledWith(
        expect.objectContaining({
          attributes: { endpoint: '/users', method: 'GET' },
        }),
        expect.any(Function)
      )
    })
  })

  describe('withSentry', () => {
    it('wraps async function with span', async () => {
      const fn = vi.fn().mockResolvedValue('async-result')
      const result = await sentryModule.withSentry('async-operation', fn)

      expect(result).toBe('async-result')
      expect(fn).toHaveBeenCalled()
    })

    it('captures errors by default', async () => {
      const error = new Error('Async error')
      const fn = vi.fn().mockRejectedValue(error)

      await expect(sentryModule.withSentry('failing-op', fn)).rejects.toThrow('Async error')
      expect(mockSentry.captureException).toHaveBeenCalledWith(error, {
        extra: { operation: 'failing-op' },
      })
    })

    it('skips error capture when disabled', async () => {
      const error = new Error('Async error')
      const fn = vi.fn().mockRejectedValue(error)

      await expect(
        sentryModule.withSentry('failing-op', fn, { captureError: false })
      ).rejects.toThrow('Async error')
      expect(mockSentry.captureException).not.toHaveBeenCalled()
    })

    it('uses custom operation type', async () => {
      await sentryModule.withSentry('db-operation', async () => 'result', { op: 'db.query' })

      expect(mockSentry.startSpan).toHaveBeenCalledWith(
        expect.objectContaining({ op: 'db.query' }),
        expect.any(Function)
      )
    })
  })

  describe('flush', () => {
    it('flushes pending events', async () => {
      const result = await sentryModule.flush()

      expect(mockSentry.flush).toHaveBeenCalledWith(2000)
      expect(result).toBe(true)
    })

    it('uses custom timeout', async () => {
      await sentryModule.flush(5000)

      expect(mockSentry.flush).toHaveBeenCalledWith(5000)
    })
  })

  describe('Sentry re-export', () => {
    it('re-exports Sentry module', () => {
      expect(sentryModule.Sentry).toBeDefined()
    })
  })
})
