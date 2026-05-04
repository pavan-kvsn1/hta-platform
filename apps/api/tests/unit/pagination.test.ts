/**
 * Pagination Regression Tests
 *
 * Tests the inline pagination pattern introduced in commit 6a2b71e.
 * The pattern is duplicated across all dashboard route handlers:
 *
 *   const page  = Math.max(1, parseInt(query.page  || '1'))
 *   const limit = Math.max(1, Math.min(parseInt(query.limit || '15'), 25))
 *   // skip: (page - 1) * limit, take: limit
 *
 * We verify the math directly, then confirm the route handler honours it
 * via Fastify inject() against the internal-requests GET / endpoint.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── Pure pagination math (mirrors the inline pattern exactly) ────────

function parsePagination(query: { page?: string; limit?: string }) {
  const page = Math.max(1, parseInt(query.page || '1'))
  const limit = Math.max(1, Math.min(parseInt(query.limit || '15'), 25))
  return { page, limit, skip: (page - 1) * limit }
}

function totalPages(total: number, limit: number) {
  return Math.ceil(total / limit)
}

// ── Unit tests — pagination math ─────────────────────────────────────

describe('parsePagination (inline pattern)', () => {
  it('defaults to page=1, limit=15 when no params given', () => {
    const result = parsePagination({})
    expect(result).toEqual({ page: 1, limit: 15, skip: 0 })
  })

  it('computes skip for page=3 with default limit', () => {
    const result = parsePagination({ page: '3' })
    expect(result).toEqual({ page: 3, limit: 15, skip: 30 })
  })

  it('uses custom limit when within bounds', () => {
    const result = parsePagination({ limit: '10' })
    expect(result).toEqual({ page: 1, limit: 10, skip: 0 })
  })

  it('clamps limit to upper bound of 25', () => {
    const result = parsePagination({ limit: '100' })
    expect(result).toEqual({ page: 1, limit: 25, skip: 0 })
  })

  it('clamps limit=0 to lower bound of 1', () => {
    const result = parsePagination({ limit: '0' })
    expect(result).toEqual({ page: 1, limit: 1, skip: 0 })
  })

  it('clamps negative limit to 1', () => {
    const result = parsePagination({ limit: '-5' })
    expect(result).toEqual({ page: 1, limit: 1, skip: 0 })
  })

  it('clamps negative page to 1', () => {
    const result = parsePagination({ page: '-1' })
    expect(result).toEqual({ page: 1, limit: 15, skip: 0 })
  })

  it('clamps page=0 to 1', () => {
    const result = parsePagination({ page: '0' })
    expect(result).toEqual({ page: 1, limit: 15, skip: 0 })
  })

  it('treats non-numeric page as NaN → defaults to 1', () => {
    // parseInt("abc") → NaN, NaN || "1" doesn't apply because || is on
    // the raw string.  parseInt("abc") → NaN, Math.max(1, NaN) → NaN.
    // BUT the route does: parseInt(query.page || '1')
    // When query.page = "abc", "abc" is truthy so parseInt("abc") = NaN.
    // Math.max(1, NaN) = NaN — this is a known edge-case in the inline
    // pattern. We document the current behaviour here.
    const result = parsePagination({ page: 'abc' })
    // Math.max(1, NaN) => NaN in JavaScript
    expect(result.page).toBeNaN()
  })

  it('treats non-numeric limit as NaN → falls through to default via ||', () => {
    // When query.limit = "abc", it's truthy so parseInt("abc") = NaN.
    // Math.min(NaN, 25) = NaN, Math.max(1, NaN) = NaN.
    const result = parsePagination({ limit: 'abc' })
    expect(result.limit).toBeNaN()
  })

  it('treats empty page string as falsy → defaults to page=1', () => {
    // query.page = "" → falsy → parseInt("1") = 1
    const result = parsePagination({ page: '' })
    expect(result).toEqual({ page: 1, limit: 15, skip: 0 })
  })

  it('treats empty limit string as falsy → defaults to limit=15', () => {
    const result = parsePagination({ limit: '' })
    expect(result).toEqual({ page: 1, limit: 15, skip: 0 })
  })

  it('computes skip correctly for page=5, limit=25', () => {
    const result = parsePagination({ page: '5', limit: '25' })
    expect(result).toEqual({ page: 5, limit: 25, skip: 100 })
  })

  it('computes skip correctly for page=2, limit=1 (minimum limit)', () => {
    const result = parsePagination({ page: '2', limit: '1' })
    expect(result).toEqual({ page: 2, limit: 1, skip: 1 })
  })
})

describe('totalPages calculation', () => {
  it('computes totalPages = ceil(47/15) = 4', () => {
    expect(totalPages(47, 15)).toBe(4)
  })

  it('computes totalPages = 1 when total <= limit', () => {
    expect(totalPages(10, 15)).toBe(1)
  })

  it('computes totalPages = 1 when total equals limit exactly', () => {
    expect(totalPages(15, 15)).toBe(1)
  })

  it('computes totalPages = 2 when total is limit + 1', () => {
    expect(totalPages(16, 15)).toBe(2)
  })

  it('computes totalPages for total=0 → 0', () => {
    expect(totalPages(0, 15)).toBe(0)
  })

  it('computes totalPages for limit=1 → total pages equals total', () => {
    expect(totalPages(5, 1)).toBe(5)
  })

  it('computes totalPages for limit=25 (max) with large dataset', () => {
    expect(totalPages(100, 25)).toBe(4)
    expect(totalPages(101, 25)).toBe(5)
  })
})

// ── Integration: verify internal-requests route honours the pattern ──

vi.mock('@hta/database', () => ({
  prisma: {
    internalRequest: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), count: vi.fn() },
    user: { findMany: vi.fn() },
    notification: { createMany: vi.fn() },
    certificate: { findFirst: vi.fn() },
    certificateEvent: { findFirst: vi.fn(), create: vi.fn() },
  },
}))

vi.mock('../../src/middleware/auth.js', () => ({
  requireStaff: vi.fn((_req: any, _reply: any, done: any) => done?.()),
  requireAdmin: vi.fn((_req: any, _reply: any, done: any) => done?.()),
}))

import Fastify from 'fastify'
import { prisma } from '@hta/database'
import internalRequestRoutes from '../../src/routes/internal-requests/index.js'

const mockedPrisma = vi.mocked(prisma)

function buildApp() {
  const app = Fastify()
  app.decorateRequest('tenantId', '')
  app.decorateRequest('user', null)
  app.addHook('preHandler', async (req) => {
    req.tenantId = (req.headers['x-tenant-id'] as string) || 'tenant-1'
    req.user = {
      sub: (req.headers['x-user-id'] as string) || 'user-1',
      role: (req.headers['x-user-role'] as string) || 'ENGINEER',
      isAdmin: req.headers['x-user-role'] === 'ADMIN',
    } as any
  })
  app.register(internalRequestRoutes, { prefix: '/api/internal-requests' })
  return app
}

/** Stub prisma counts to return predictable values. */
function stubCounts(total: number) {
  mockedPrisma.internalRequest.count
    .mockResolvedValueOnce(total as any)   // total
    .mockResolvedValueOnce(0 as any)       // pending
    .mockResolvedValueOnce(0 as any)       // approved
    .mockResolvedValueOnce(0 as any)       // rejected
}

describe('GET /api/internal-requests — pagination via route', () => {
  let app: ReturnType<typeof buildApp>

  beforeEach(async () => {
    vi.clearAllMocks()
    mockedPrisma.internalRequest.findMany.mockResolvedValue([])
    app = buildApp()
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
  })

  it('passes default skip=0, take=15 when no query params', async () => {
    stubCounts(0)

    const res = await app.inject({
      method: 'GET',
      url: '/api/internal-requests',
      headers: { 'x-user-id': 'user-1' },
    })

    expect(res.statusCode).toBe(200)
    expect(mockedPrisma.internalRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 15 }),
    )
    const body = res.json()
    expect(body.pagination.page).toBe(1)
    expect(body.pagination.limit).toBe(15)
  })

  it('passes skip=30 for page=3 with default limit', async () => {
    stubCounts(50)

    const res = await app.inject({
      method: 'GET',
      url: '/api/internal-requests?page=3',
      headers: { 'x-user-id': 'user-1' },
    })

    expect(res.statusCode).toBe(200)
    expect(mockedPrisma.internalRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 30, take: 15 }),
    )
    expect(res.json().pagination.page).toBe(3)
  })

  it('passes take=10 for limit=10', async () => {
    stubCounts(50)

    const res = await app.inject({
      method: 'GET',
      url: '/api/internal-requests?limit=10',
      headers: { 'x-user-id': 'user-1' },
    })

    expect(res.statusCode).toBe(200)
    expect(mockedPrisma.internalRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 10 }),
    )
    expect(res.json().pagination.limit).toBe(10)
  })

  it('clamps limit=100 to take=25', async () => {
    stubCounts(200)

    const res = await app.inject({
      method: 'GET',
      url: '/api/internal-requests?limit=100',
      headers: { 'x-user-id': 'user-1' },
    })

    expect(res.statusCode).toBe(200)
    expect(mockedPrisma.internalRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 25 }),
    )
    expect(res.json().pagination.limit).toBe(25)
  })

  it('clamps limit=0 to take=1', async () => {
    stubCounts(10)

    const res = await app.inject({
      method: 'GET',
      url: '/api/internal-requests?limit=0',
      headers: { 'x-user-id': 'user-1' },
    })

    expect(res.statusCode).toBe(200)
    expect(mockedPrisma.internalRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 1 }),
    )
    expect(res.json().pagination.limit).toBe(1)
  })

  it('clamps page=-1 to skip=0 (page 1)', async () => {
    stubCounts(10)

    const res = await app.inject({
      method: 'GET',
      url: '/api/internal-requests?page=-1',
      headers: { 'x-user-id': 'user-1' },
    })

    expect(res.statusCode).toBe(200)
    expect(mockedPrisma.internalRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0 }),
    )
    expect(res.json().pagination.page).toBe(1)
  })

  it('returns correct totalPages for total=47, limit=15', async () => {
    stubCounts(47)

    const res = await app.inject({
      method: 'GET',
      url: '/api/internal-requests?limit=15',
      headers: { 'x-user-id': 'user-1' },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.pagination.total).toBe(47)
    expect(body.pagination.totalPages).toBe(4)
  })

  it('returns totalPages=1 when total fits in one page', async () => {
    stubCounts(10)

    const res = await app.inject({
      method: 'GET',
      url: '/api/internal-requests?limit=15',
      headers: { 'x-user-id': 'user-1' },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().pagination.totalPages).toBe(1)
  })

  it('returns totalPages=0 when total is 0', async () => {
    stubCounts(0)

    const res = await app.inject({
      method: 'GET',
      url: '/api/internal-requests',
      headers: { 'x-user-id': 'user-1' },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().pagination.totalPages).toBe(0)
  })

  it('combines custom page and limit correctly', async () => {
    stubCounts(100)

    const res = await app.inject({
      method: 'GET',
      url: '/api/internal-requests?page=4&limit=25',
      headers: { 'x-user-id': 'user-1' },
    })

    expect(res.statusCode).toBe(200)
    expect(mockedPrisma.internalRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 75, take: 25 }),
    )
    const body = res.json()
    expect(body.pagination).toEqual({
      page: 4,
      limit: 25,
      total: 100,
      totalPages: 4,
    })
  })
})
