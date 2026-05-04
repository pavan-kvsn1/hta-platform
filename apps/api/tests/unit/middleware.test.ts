/**
 * Middleware Unit Tests
 *
 * Tests for error-handler and tenant middleware.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ZodError, ZodIssue } from 'zod'

// ── Mock Prisma ───────────────────────────────────────────────────────────────
vi.mock('@hta/database', () => ({
  prisma: {
    tenant: { findUnique: vi.fn() },
  },
}))

import { prisma } from '@hta/database'
import { errorHandler } from '../../src/middleware/error-handler.js'
import { tenantMiddleware } from '../../src/middleware/tenant.js'

const mockedPrisma = vi.mocked(prisma)

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeReply() {
  const reply = {
    statusCode: 200,
    _body: null as unknown,
    status: vi.fn(function (this: typeof reply, code: number) {
      this.statusCode = code
      return this
    }),
    send: vi.fn(function (this: typeof reply, data: unknown) {
      this._body = data
      return this
    }),
    code: vi.fn(function (this: typeof reply, code: number) {
      this.statusCode = code
      return this
    }),
  }
  reply.status = reply.status.bind(reply)
  reply.send = reply.send.bind(reply)
  reply.code = reply.code.bind(reply)
  return reply
}

function makeRequest(overrides: Record<string, unknown> = {}) {
  return {
    id: 'req-001',
    url: '/test',
    method: 'GET',
    headers: {},
    log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
    ...overrides,
  } as any
}

// ── errorHandler ─────────────────────────────────────────────────────────────

describe('errorHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NODE_ENV = 'test'
  })

  it('returns 400 for ZodError validation errors', () => {
    const zodError = new ZodError([
      {
        code: 'invalid_type',
        expected: 'string',
        received: 'undefined',
        path: ['email'],
        message: 'Email is required',
      } as ZodIssue,
    ])

    const req = makeRequest()
    const reply = makeReply()

    errorHandler(zodError as any, req, reply as any)

    expect(reply.statusCode).toBe(400)
    expect(reply._body).toMatchObject({
      error: 'Validation Error',
      message: 'Email is required',
      requestId: 'req-001',
    })
  })

  it('returns 401 for JWT expired token error', () => {
    const error = { code: 'FST_JWT_AUTHORIZATION_TOKEN_EXPIRED', message: 'Token expired' } as any
    const req = makeRequest()
    const reply = makeReply()

    errorHandler(error, req, reply as any)

    expect(reply.statusCode).toBe(401)
    expect(reply._body).toMatchObject({
      error: 'Token Expired',
      message: 'Access token has expired. Please refresh your token.',
    })
  })

  it('returns 401 for missing authorization header', () => {
    const error = { code: 'FST_JWT_NO_AUTHORIZATION_IN_HEADER', message: 'No auth' } as any
    const req = makeRequest()
    const reply = makeReply()

    errorHandler(error, req, reply as any)

    expect(reply.statusCode).toBe(401)
    expect(reply._body).toMatchObject({
      error: 'Unauthorized',
      message: 'Authorization header is required',
    })
  })

  it('returns 401 for invalid token', () => {
    const error = { code: 'FST_JWT_AUTHORIZATION_TOKEN_INVALID', message: 'Invalid token' } as any
    const req = makeRequest()
    const reply = makeReply()

    errorHandler(error, req, reply as any)

    expect(reply.statusCode).toBe(401)
    expect(reply._body).toMatchObject({ error: 'Invalid Token' })
  })

  it('returns 429 with rate limit error', () => {
    const error = { statusCode: 429, message: 'Too many requests' } as any
    const req = makeRequest()
    const reply = makeReply()

    errorHandler(error, req, reply as any)

    expect(reply.statusCode).toBe(429)
    expect(reply._body).toMatchObject({
      error: 'Too Many Requests',
      message: 'Rate limit exceeded. Please try again later.',
    })
  })

  it('returns 409 for Prisma unique constraint violation (P2002)', () => {
    const error = {
      name: 'PrismaClientKnownRequestError',
      code: 'P2002',
      meta: { target: ['email'] },
      message: 'Unique constraint failed',
    } as any
    const req = makeRequest()
    const reply = makeReply()

    errorHandler(error, req, reply as any)

    expect(reply.statusCode).toBe(409)
    expect(reply._body).toMatchObject({
      error: 'Conflict',
      message: 'A record with this email already exists',
    })
  })

  it('returns 404 for Prisma record not found (P2025)', () => {
    const error = {
      name: 'PrismaClientKnownRequestError',
      code: 'P2025',
      message: 'Record not found',
    } as any
    const req = makeRequest()
    const reply = makeReply()

    errorHandler(error, req, reply as any)

    expect(reply.statusCode).toBe(404)
    expect(reply._body).toMatchObject({
      error: 'Not Found',
      message: 'The requested resource was not found',
    })
  })

  it('returns 500 for unknown errors and does not leak stack trace', () => {
    const error = { message: 'Something broke', statusCode: 500 } as any
    const req = makeRequest()
    const reply = makeReply()

    errorHandler(error, req, reply as any)

    expect(reply.statusCode).toBe(500)
    const body = reply._body as any
    expect(body.error).toBe('Internal Server Error')
    expect(body).not.toHaveProperty('stack')
  })

  it('uses error.statusCode for non-500 custom errors', () => {
    const error = { message: 'Custom error', statusCode: 422 } as any
    const req = makeRequest()
    const reply = makeReply()

    errorHandler(error, req, reply as any)

    expect(reply.statusCode).toBe(422)
  })

  it('includes requestId in all responses', () => {
    const error = { code: 'FST_JWT_AUTHORIZATION_TOKEN_EXPIRED', message: '' } as any
    const req = makeRequest({ id: 'test-request-id-123' })
    const reply = makeReply()

    errorHandler(error, req, reply as any)

    expect((reply._body as any).requestId).toBe('test-request-id-123')
  })

  it('in production mode does not expose error message for unknown errors', () => {
    const original = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'

    const error = { message: 'db password in error', statusCode: 500 } as any
    const req = makeRequest()
    const reply = makeReply()

    errorHandler(error, req, reply as any)

    expect((reply._body as any).message).toBe('An unexpected error occurred')

    process.env.NODE_ENV = original
  })
})

// ── tenantMiddleware ──────────────────────────────────────────────────────────

describe('tenantMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.NODE_ENV
  })

  const activeTenant = {
    id: 'tenant-abc',
    slug: 'acme',
    name: 'Acme Corp',
    isActive: true,
    settings: {},
  }

  it('extracts tenant from X-Tenant-ID header and sets request.tenantId', async () => {
    mockedPrisma.tenant.findUnique.mockResolvedValue(activeTenant as any)

    const req: any = {
      headers: { 'x-tenant-id': 'acme' },
      log: { warn: vi.fn() },
    }
    const reply = makeReply()

    await tenantMiddleware(req, reply as any)

    expect(mockedPrisma.tenant.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { slug: 'acme' } })
    )
    expect(req.tenantId).toBe('tenant-abc')
    expect(req.tenant).toMatchObject({ id: 'tenant-abc', slug: 'acme' })
  })

  it('extracts tenant from subdomain (app.acme.com)', async () => {
    mockedPrisma.tenant.findUnique.mockResolvedValue(activeTenant as any)

    const req: any = {
      headers: { host: 'app.acme.com' },
      log: { warn: vi.fn() },
    }
    const reply = makeReply()

    await tenantMiddleware(req, reply as any)

    expect(mockedPrisma.tenant.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { slug: 'acme' } })
    )
    expect(req.tenantId).toBe('tenant-abc')
  })

  it('extracts tenant from direct domain (acme.com)', async () => {
    mockedPrisma.tenant.findUnique.mockResolvedValue(activeTenant as any)

    const req: any = {
      headers: { host: 'acme.com' },
      log: { warn: vi.fn() },
    }
    const reply = makeReply()

    await tenantMiddleware(req, reply as any)

    expect(mockedPrisma.tenant.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { slug: 'acme' } })
    )
  })

  it('X-Tenant-ID header takes precedence over subdomain', async () => {
    mockedPrisma.tenant.findUnique.mockResolvedValue(activeTenant as any)

    const req: any = {
      headers: { 'x-tenant-id': 'acme', host: 'app.other.com' },
      log: { warn: vi.fn() },
    }
    const reply = makeReply()

    await tenantMiddleware(req, reply as any)

    expect(mockedPrisma.tenant.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { slug: 'acme' } })
    )
  })

  it('rejects with 400 when no tenant can be identified', async () => {
    const req: any = {
      headers: {},
      log: { warn: vi.fn() },
    }
    const reply = makeReply()

    await tenantMiddleware(req, reply as any)

    expect(reply.statusCode).toBe(400)
    expect(reply._body).toMatchObject({
      error: 'Tenant identification required',
    })
    expect(mockedPrisma.tenant.findUnique).not.toHaveBeenCalled()
  })

  it('rejects with 404 when tenant slug not found in database', async () => {
    mockedPrisma.tenant.findUnique.mockResolvedValue(null)

    const req: any = {
      headers: { 'x-tenant-id': 'unknown-tenant' },
      log: { warn: vi.fn() },
    }
    const reply = makeReply()

    await tenantMiddleware(req, reply as any)

    expect(reply.statusCode).toBe(404)
    expect(reply._body).toMatchObject({
      error: 'Tenant not found',
    })
  })

  it('rejects with 403 when tenant is inactive', async () => {
    mockedPrisma.tenant.findUnique.mockResolvedValue({
      ...activeTenant,
      isActive: false,
    } as any)

    const req: any = {
      headers: { 'x-tenant-id': 'acme' },
      log: { warn: vi.fn() },
    }
    const reply = makeReply()

    await tenantMiddleware(req, reply as any)

    expect(reply.statusCode).toBe(403)
    expect(reply._body).toMatchObject({ error: 'Tenant inactive' })
  })

  it('defaults to hta-calibration in development mode', async () => {
    process.env.NODE_ENV = 'development'
    mockedPrisma.tenant.findUnique.mockResolvedValue({
      ...activeTenant,
      slug: 'hta-calibration',
    } as any)

    const req: any = {
      headers: {},
      log: { warn: vi.fn() },
    }
    const reply = makeReply()

    await tenantMiddleware(req, reply as any)

    expect(mockedPrisma.tenant.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { slug: 'hta-calibration' } })
    )
  })

  it('strips port from host header before parsing', async () => {
    mockedPrisma.tenant.findUnique.mockResolvedValue(activeTenant as any)

    const req: any = {
      headers: { host: 'app.acme.com:3000' },
      log: { warn: vi.fn() },
    }
    const reply = makeReply()

    await tenantMiddleware(req, reply as any)

    expect(mockedPrisma.tenant.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { slug: 'acme' } })
    )
  })
})
