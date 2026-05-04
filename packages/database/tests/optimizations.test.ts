import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the prisma client before importing the module under test
vi.mock('../src/client.js', () => {
  return {
    prisma: {
      certificate: {
        findMany: vi.fn(),
      },
      user: {
        findMany: vi.fn(),
      },
      $queryRaw: vi.fn(),
    },
  }
})

import { prisma } from '../src/client.js'
import {
  paginateCursor,
  getCertificatesPaginated,
  paginateOffset,
  batchLoadCertificates,
  batchLoadUsers,
  createBatchLoader,
  getDashboardStats,
  getUserWorkloadStats,
  withQueryCache,
  getDashboardStatsCached,
} from '../src/optimizations.js'
import type { PaginationParams, OffsetPaginationParams } from '../src/optimizations.js'

const mockPrisma = prisma as unknown as {
  certificate: {
    findMany: ReturnType<typeof vi.fn>
  }
  user: {
    findMany: ReturnType<typeof vi.fn>
  }
  $queryRaw: ReturnType<typeof vi.fn>
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ============================================================================
// paginateCursor
// ============================================================================

describe('paginateCursor', () => {
  const makeItems = (count: number) =>
    Array.from({ length: count }, (_, i) => ({
      id: `id-${i}`,
      createdAt: new Date(),
    }))

  it('returns items, nextCursor, hasMore for forward pagination', async () => {
    // findMany receives limit+1; returning limit+1 items means there is a next page
    const items = makeItems(21)
    const findMany = vi.fn().mockResolvedValue(items)

    const result = await paginateCursor(findMany, { limit: 20, direction: 'forward' })

    expect(findMany).toHaveBeenCalledWith({
      take: 21,
      orderBy: { createdAt: 'desc' },
    })
    expect(result.data).toHaveLength(20)
    expect(result.pageInfo.hasNextPage).toBe(true)
    expect(result.pageInfo.hasPreviousPage).toBe(false)
    expect(result.pageInfo.endCursor).toBe('id-19')
    expect(result.pageInfo.startCursor).toBe('id-0')
  })

  it('uses cursor and skip when cursor is provided', async () => {
    const items = makeItems(5)
    const findMany = vi.fn().mockResolvedValue(items)

    await paginateCursor(findMany, { cursor: 'cursor-abc', limit: 20 })

    expect(findMany).toHaveBeenCalledWith({
      take: 21,
      cursor: { id: 'cursor-abc' },
      skip: 1,
      orderBy: { createdAt: 'desc' },
    })
  })

  it('reports hasNextPage=false when fewer items returned than limit+1', async () => {
    const items = makeItems(10)
    const findMany = vi.fn().mockResolvedValue(items)

    const result = await paginateCursor(findMany, { limit: 20, direction: 'forward' })

    expect(result.data).toHaveLength(10)
    expect(result.pageInfo.hasNextPage).toBe(false)
  })

  it('backward pagination: uses negative take', async () => {
    const items = makeItems(21)
    const findMany = vi.fn().mockResolvedValue(items)

    const result = await paginateCursor(findMany, {
      limit: 20,
      direction: 'backward',
      cursor: 'some-cursor',
    })

    expect(findMany).toHaveBeenCalledWith({
      take: -21,
      cursor: { id: 'some-cursor' },
      skip: 1,
      orderBy: { createdAt: 'desc' },
    })
    // backward: hasNextPage = Boolean(cursor), hasPreviousPage = hasMore
    expect(result.pageInfo.hasNextPage).toBe(true) // cursor is truthy
    expect(result.pageInfo.hasPreviousPage).toBe(true) // 21 > 20
  })

  it('returns empty result with null cursors for empty dataset', async () => {
    const findMany = vi.fn().mockResolvedValue([])

    const result = await paginateCursor(findMany, { limit: 20 })

    expect(result.data).toHaveLength(0)
    expect(result.pageInfo.startCursor).toBeNull()
    expect(result.pageInfo.endCursor).toBeNull()
    expect(result.pageInfo.hasNextPage).toBe(false)
    expect(result.pageInfo.hasPreviousPage).toBe(false)
  })

  it('defaults limit to 20 and direction to forward', async () => {
    const findMany = vi.fn().mockResolvedValue([])

    await paginateCursor(findMany, {})

    expect(findMany).toHaveBeenCalledWith({
      take: 21, // 20 + 1
      orderBy: { createdAt: 'desc' },
    })
  })
})

// ============================================================================
// getCertificatesPaginated
// ============================================================================

describe('getCertificatesPaginated', () => {
  const makeCerts = (count: number) =>
    Array.from({ length: count }, (_, i) => ({
      id: `cert-${i}`,
      certificateNumber: `CN-${i}`,
      status: 'DRAFT',
      customerName: 'Acme',
      equipmentDescription: 'Gauge',
      createdAt: new Date(),
      updatedAt: new Date(),
      submittedAt: null,
      approvedAt: null,
      engineer: { id: 'eng-1', name: 'Engineer' },
    }))

  it('queries with tenantId and default limit', async () => {
    mockPrisma.certificate.findMany.mockResolvedValue(makeCerts(5))

    const result = await getCertificatesPaginated('tenant-1', {})

    expect(mockPrisma.certificate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 21, // default limit(20) + 1
        where: { tenantId: 'tenant-1' },
        orderBy: { createdAt: 'desc' },
      })
    )
    expect(result.data).toHaveLength(5)
    expect(result.pageInfo.hasNextPage).toBe(false)
    expect(result.pageInfo.hasPreviousPage).toBe(false)
  })

  it('applies status filter', async () => {
    mockPrisma.certificate.findMany.mockResolvedValue([])

    await getCertificatesPaginated('tenant-1', { status: 'APPROVED' })

    expect(mockPrisma.certificate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: 'tenant-1', status: 'APPROVED' },
      })
    )
  })

  it('applies customerId filter', async () => {
    mockPrisma.certificate.findMany.mockResolvedValue([])

    await getCertificatesPaginated('tenant-1', { customerId: 'cust-99' })

    expect(mockPrisma.certificate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: 'tenant-1', customerId: 'cust-99' },
      })
    )
  })

  it('combines cursor with filters', async () => {
    mockPrisma.certificate.findMany.mockResolvedValue(makeCerts(3))

    const result = await getCertificatesPaginated('tenant-1', {
      cursor: 'cert-abc',
      limit: 10,
      status: 'DRAFT',
      customerId: 'cust-5',
    })

    expect(mockPrisma.certificate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 11,
        cursor: { id: 'cert-abc' },
        skip: 1,
        where: {
          tenantId: 'tenant-1',
          status: 'DRAFT',
          customerId: 'cust-5',
        },
      })
    )
    expect(result.pageInfo.hasPreviousPage).toBe(true) // cursor is set
  })

  it('detects next page when items exceed limit', async () => {
    mockPrisma.certificate.findMany.mockResolvedValue(makeCerts(11))

    const result = await getCertificatesPaginated('tenant-1', { limit: 10 })

    expect(result.data).toHaveLength(10)
    expect(result.pageInfo.hasNextPage).toBe(true)
  })
})

// ============================================================================
// paginateOffset
// ============================================================================

describe('paginateOffset', () => {
  it('returns items, total, page, and totalPages', async () => {
    const items = [{ id: '1' }, { id: '2' }]
    const findMany = vi.fn().mockResolvedValue(items)
    const count = vi.fn().mockResolvedValue(50)

    const result = await paginateOffset(findMany, count, { page: 1, limit: 20 })

    expect(findMany).toHaveBeenCalledWith({ skip: 0, take: 20 })
    expect(count).toHaveBeenCalled()
    expect(result.data).toEqual(items)
    expect(result.pagination.page).toBe(1)
    expect(result.pagination.limit).toBe(20)
    expect(result.pagination.totalCount).toBe(50)
    expect(result.pagination.totalPages).toBe(3)
    expect(result.pagination.hasNextPage).toBe(true)
    expect(result.pagination.hasPreviousPage).toBe(false)
  })

  it('returns empty data when page exceeds total pages', async () => {
    const findMany = vi.fn().mockResolvedValue([])
    const count = vi.fn().mockResolvedValue(5)

    const result = await paginateOffset(findMany, count, { page: 10, limit: 20 })

    expect(result.data).toEqual([])
    expect(result.pagination.page).toBe(10)
    expect(result.pagination.totalPages).toBe(1)
    expect(result.pagination.hasNextPage).toBe(false)
    expect(result.pagination.hasPreviousPage).toBe(true)
  })

  it('computes totalPages correctly for partial last page', async () => {
    const findMany = vi.fn().mockResolvedValue([{ id: '1' }])
    const count = vi.fn().mockResolvedValue(21) // 21 items / 20 per page = 2 pages

    const result = await paginateOffset(findMany, count, { page: 2, limit: 20 })

    expect(result.pagination.totalPages).toBe(2)
    expect(result.pagination.hasNextPage).toBe(false)
    expect(result.pagination.hasPreviousPage).toBe(true)
  })

  it('uses default page=1 and limit=20', async () => {
    const findMany = vi.fn().mockResolvedValue([])
    const count = vi.fn().mockResolvedValue(0)

    await paginateOffset(findMany, count, {})

    expect(findMany).toHaveBeenCalledWith({ skip: 0, take: 20 })
  })

  it('calculates correct skip for page > 1', async () => {
    const findMany = vi.fn().mockResolvedValue([])
    const count = vi.fn().mockResolvedValue(100)

    await paginateOffset(findMany, count, { page: 3, limit: 10 })

    expect(findMany).toHaveBeenCalledWith({ skip: 20, take: 10 })
  })

  it('handles zero totalCount correctly', async () => {
    const findMany = vi.fn().mockResolvedValue([])
    const count = vi.fn().mockResolvedValue(0)

    const result = await paginateOffset(findMany, count, { page: 1, limit: 20 })

    expect(result.pagination.totalPages).toBe(0)
    expect(result.pagination.hasNextPage).toBe(false)
    expect(result.pagination.hasPreviousPage).toBe(false)
  })
})

// ============================================================================
// batchLoadCertificates
// ============================================================================

describe('batchLoadCertificates', () => {
  it('returns certificates for given IDs', async () => {
    const certs = [
      { id: 'c1', tenantId: 't1' },
      { id: 'c2', tenantId: 't1' },
    ]
    mockPrisma.certificate.findMany.mockResolvedValue(certs)

    const result = await batchLoadCertificates(['c1', 'c2'], 't1')

    expect(mockPrisma.certificate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: { in: ['c1', 'c2'] },
          tenantId: 't1',
        },
      })
    )
    expect(result).toEqual(certs)
  })

  it('returns empty array for empty IDs', async () => {
    const result = await batchLoadCertificates([], 't1')

    expect(result).toEqual([])
    expect(mockPrisma.certificate.findMany).not.toHaveBeenCalled()
  })

  it('includes related user selects and parameters', async () => {
    mockPrisma.certificate.findMany.mockResolvedValue([])

    await batchLoadCertificates(['c1'], 't1')

    expect(mockPrisma.certificate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          createdBy: expect.objectContaining({ select: expect.any(Object) }),
          reviewer: expect.objectContaining({ select: expect.any(Object) }),
          lastModifiedBy: expect.objectContaining({ select: expect.any(Object) }),
          parameters: expect.objectContaining({
            orderBy: { sortOrder: 'asc' },
            include: expect.objectContaining({
              results: expect.objectContaining({
                orderBy: { pointNumber: 'asc' },
              }),
            }),
          }),
        }),
      })
    )
  })
})

// ============================================================================
// batchLoadUsers
// ============================================================================

describe('batchLoadUsers', () => {
  it('returns users for given IDs', async () => {
    const users = [
      { id: 'u1', name: 'Alice', email: 'a@test.com', role: 'ENGINEER', isActive: true },
    ]
    mockPrisma.user.findMany.mockResolvedValue(users)

    const result = await batchLoadUsers(['u1'], 't1')

    expect(mockPrisma.user.findMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['u1'] },
        tenantId: 't1',
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
      },
    })
    expect(result).toEqual(users)
  })

  it('returns empty array for empty userIds', async () => {
    const result = await batchLoadUsers([], 't1')

    expect(result).toEqual([])
    expect(mockPrisma.user.findMany).not.toHaveBeenCalled()
  })
})

// ============================================================================
// createBatchLoader
// ============================================================================

describe('createBatchLoader', () => {
  it('returns a Map keyed by ID', async () => {
    const items = [
      { id: 'a', value: 1 },
      { id: 'b', value: 2 },
    ]
    const fetchFn = vi.fn().mockResolvedValue(items)

    const map = await createBatchLoader(['a', 'b'], fetchFn)

    expect(fetchFn).toHaveBeenCalledWith(['a', 'b'])
    expect(map).toBeInstanceOf(Map)
    expect(map.get('a')).toEqual({ id: 'a', value: 1 })
    expect(map.get('b')).toEqual({ id: 'b', value: 2 })
  })

  it('handles missing IDs (returns undefined for keys not in result)', async () => {
    const items = [{ id: 'a', value: 1 }]
    const fetchFn = vi.fn().mockResolvedValue(items)

    const map = await createBatchLoader(['a', 'missing'], fetchFn)

    expect(map.get('a')).toBeDefined()
    expect(map.get('missing')).toBeUndefined()
  })

  it('handles empty input', async () => {
    const fetchFn = vi.fn().mockResolvedValue([])

    const map = await createBatchLoader([], fetchFn)

    expect(map.size).toBe(0)
  })
})

// ============================================================================
// getDashboardStats
// ============================================================================

describe('getDashboardStats', () => {
  const makeRawResult = (overrides = {}) => [{
    draft_count: BigInt(5),
    pending_review_count: BigInt(3),
    pending_auth_count: BigInt(2),
    approved_count: BigInt(10),
    rejected_count: BigInt(1),
    total_count: BigInt(21),
    created_this_week: BigInt(4),
    created_this_month: BigInt(12),
    approved_this_week: BigInt(2),
    avg_processing_time_ms: 3600000,
    ...overrides,
  }]

  it('returns all stat fields', async () => {
    mockPrisma.$queryRaw.mockResolvedValue(makeRawResult())

    const result = await getDashboardStats('tenant-1')

    expect(result.certificates.draft).toBe(5)
    expect(result.certificates.pendingReview).toBe(3)
    expect(result.certificates.pendingAuthorization).toBe(2)
    expect(result.certificates.approved).toBe(10)
    expect(result.certificates.rejected).toBe(1)
    expect(result.certificates.total).toBe(21)
    expect(result.recentActivity.createdThisWeek).toBe(4)
    expect(result.recentActivity.createdThisMonth).toBe(12)
    expect(result.recentActivity.approvedThisWeek).toBe(2)
    expect(result.performance.avgProcessingTimeMs).toBe(3600000)
  })

  it('handles zero-count tenant', async () => {
    mockPrisma.$queryRaw.mockResolvedValue(makeRawResult({
      draft_count: BigInt(0),
      pending_review_count: BigInt(0),
      pending_auth_count: BigInt(0),
      approved_count: BigInt(0),
      rejected_count: BigInt(0),
      total_count: BigInt(0),
      created_this_week: BigInt(0),
      created_this_month: BigInt(0),
      approved_this_week: BigInt(0),
      avg_processing_time_ms: null,
    }))

    const result = await getDashboardStats('empty-tenant')

    expect(result.certificates.total).toBe(0)
    expect(result.certificates.draft).toBe(0)
    expect(result.performance.avgProcessingTimeMs).toBeNull()
  })

  it('handles empty query result (undefined stats)', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([])

    const result = await getDashboardStats('nonexistent')

    // When stats is undefined, all fields default to 0/null
    expect(result.certificates.total).toBe(0)
    expect(result.performance.avgProcessingTimeMs).toBeNull()
  })
})

// ============================================================================
// getUserWorkloadStats
// ============================================================================

describe('getUserWorkloadStats', () => {
  it('returns per-user workload metrics', async () => {
    const rawResult = [
      {
        user_id: 'u1',
        user_name: 'Alice',
        assigned_count: BigInt(5),
        completed_this_week: BigInt(2),
        avg_completion_time_hours: 24.5,
      },
      {
        user_id: 'u2',
        user_name: 'Bob',
        assigned_count: BigInt(3),
        completed_this_week: BigInt(1),
        avg_completion_time_hours: 18.0,
      },
    ]
    mockPrisma.$queryRaw.mockResolvedValue(rawResult)

    const result = await getUserWorkloadStats('tenant-1')

    expect(mockPrisma.$queryRaw).toHaveBeenCalled()
    expect(result).toHaveLength(2)
    expect(result[0].user_id).toBe('u1')
    expect(result[1].user_name).toBe('Bob')
  })

  it('handles empty result (no engineers)', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([])

    const result = await getUserWorkloadStats('tenant-empty')

    expect(result).toEqual([])
  })

  it('handles user with no assignments (null avg)', async () => {
    const rawResult = [{
      user_id: 'u1',
      user_name: 'New Engineer',
      assigned_count: BigInt(0),
      completed_this_week: BigInt(0),
      avg_completion_time_hours: null,
    }]
    mockPrisma.$queryRaw.mockResolvedValue(rawResult)

    const result = await getUserWorkloadStats('tenant-1')

    expect(result[0].avg_completion_time_hours).toBeNull()
    expect(result[0].assigned_count).toBe(BigInt(0))
  })
})

// ============================================================================
// withQueryCache
// ============================================================================

describe('withQueryCache', () => {
  it('executes the query function and returns its result', async () => {
    const queryFn = vi.fn().mockResolvedValue({ data: 'test' })

    const result = await withQueryCache('test-key', queryFn, 60)

    expect(queryFn).toHaveBeenCalledOnce()
    expect(result).toEqual({ data: 'test' })
  })

  it('calls queryFn on every invocation (pass-through, no actual cache)', async () => {
    let callCount = 0
    const queryFn = vi.fn().mockImplementation(async () => {
      callCount++
      return { count: callCount }
    })

    const result1 = await withQueryCache('key', queryFn)
    const result2 = await withQueryCache('key', queryFn)

    expect(queryFn).toHaveBeenCalledTimes(2)
    expect(result1).toEqual({ count: 1 })
    expect(result2).toEqual({ count: 2 })
  })

  it('uses default TTL of 300 when not specified', async () => {
    const queryFn = vi.fn().mockResolvedValue('ok')

    // Just verify it does not throw when ttl is omitted
    const result = await withQueryCache('key', queryFn)
    expect(result).toBe('ok')
  })
})

// ============================================================================
// getDashboardStatsCached
// ============================================================================

describe('getDashboardStatsCached', () => {
  it('delegates to getDashboardStats via withQueryCache', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{
      draft_count: BigInt(1),
      pending_review_count: BigInt(0),
      pending_auth_count: BigInt(0),
      approved_count: BigInt(0),
      rejected_count: BigInt(0),
      total_count: BigInt(1),
      created_this_week: BigInt(1),
      created_this_month: BigInt(1),
      approved_this_week: BigInt(0),
      avg_processing_time_ms: null,
    }])

    const result = await getDashboardStatsCached('tenant-x')

    expect(mockPrisma.$queryRaw).toHaveBeenCalled()
    expect(result.certificates.total).toBe(1)
    expect(result.certificates.draft).toBe(1)
  })
})
