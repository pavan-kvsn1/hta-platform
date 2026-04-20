/**
 * @hta/database - Query Optimizations
 *
 * Provides optimized query patterns for common operations:
 * - Batch loading to avoid N+1 queries
 * - Cursor-based pagination for large datasets
 * - Dashboard stats with efficient aggregation
 */

import { prisma } from './client.js'
import { Prisma } from '@prisma/client'

// ============================================================================
// Pagination Types
// ============================================================================

export interface PaginationParams {
  cursor?: string
  limit?: number
  direction?: 'forward' | 'backward'
}

export interface PaginatedResult<T> {
  data: T[]
  pageInfo: {
    hasNextPage: boolean
    hasPreviousPage: boolean
    startCursor: string | null
    endCursor: string | null
    totalCount?: number
  }
}

export interface OffsetPaginationParams {
  page?: number
  limit?: number
}

export interface OffsetPaginatedResult<T> {
  data: T[]
  pagination: {
    page: number
    limit: number
    totalPages: number
    totalCount: number
    hasNextPage: boolean
    hasPreviousPage: boolean
  }
}

// ============================================================================
// Cursor-Based Pagination
// ============================================================================

/**
 * Generic cursor-based pagination for any model
 * Uses cursor pagination for efficient querying of large datasets
 */
export async function paginateCursor<T extends { id: string }>(
  findMany: (args: {
    take: number
    skip?: number
    cursor?: { id: string }
    orderBy: { createdAt: 'desc' } | { id: 'desc' }
  }) => Promise<T[]>,
  params: PaginationParams
): Promise<PaginatedResult<T>> {
  const { cursor, limit = 20, direction = 'forward' } = params

  // Fetch one extra to determine if there's more
  const take = direction === 'forward' ? limit + 1 : -(limit + 1)

  const items = await findMany({
    take,
    ...(cursor && {
      cursor: { id: cursor },
      skip: 1, // Skip the cursor itself
    }),
    orderBy: { createdAt: 'desc' },
  })

  // Check if there are more items
  const hasMore = items.length > limit
  const data = hasMore ? items.slice(0, limit) : items

  return {
    data,
    pageInfo: {
      hasNextPage: direction === 'forward' ? hasMore : Boolean(cursor),
      hasPreviousPage: direction === 'forward' ? Boolean(cursor) : hasMore,
      startCursor: data[0]?.id ?? null,
      endCursor: data[data.length - 1]?.id ?? null,
    },
  }
}

/**
 * Paginate certificates with cursor
 */
export async function getCertificatesPaginated(
  tenantId: string,
  params: PaginationParams & {
    status?: string
    customerId?: string
  }
): Promise<PaginatedResult<Prisma.CertificateGetPayload<{ select: typeof certificateListSelect }>>> {
  const { cursor, limit = 20, status, customerId } = params

  const where: Prisma.CertificateWhereInput = {
    tenantId,
    ...(status && { status: status as any }),
    ...(customerId && { customerId }),
  }

  const items = await prisma.certificate.findMany({
    take: limit + 1,
    ...(cursor && {
      cursor: { id: cursor },
      skip: 1,
    }),
    where,
    orderBy: { createdAt: 'desc' },
    select: certificateListSelect,
  })

  const hasNextPage = items.length > limit
  const data = hasNextPage ? items.slice(0, limit) : items

  return {
    data,
    pageInfo: {
      hasNextPage,
      hasPreviousPage: Boolean(cursor),
      startCursor: data[0]?.id ?? null,
      endCursor: data[data.length - 1]?.id ?? null,
    },
  }
}

// Optimized select for certificate lists (avoid over-fetching)
const certificateListSelect = {
  id: true,
  certificateNumber: true,
  status: true,
  customerName: true,
  equipmentDescription: true,
  createdAt: true,
  updatedAt: true,
  submittedAt: true,
  approvedAt: true,
  engineer: {
    select: {
      id: true,
      name: true,
    },
  },
} as const

// ============================================================================
// Offset-Based Pagination (for UI with page numbers)
// ============================================================================

/**
 * Offset-based pagination with total count
 * Use for smaller datasets where page numbers are needed
 */
export async function paginateOffset<T>(
  findMany: (args: { skip: number; take: number }) => Promise<T[]>,
  count: () => Promise<number>,
  params: OffsetPaginationParams
): Promise<OffsetPaginatedResult<T>> {
  const { page = 1, limit = 20 } = params
  const skip = (page - 1) * limit

  const [data, totalCount] = await Promise.all([
    findMany({ skip, take: limit }),
    count(),
  ])

  const totalPages = Math.ceil(totalCount / limit)

  return {
    data,
    pagination: {
      page,
      limit,
      totalPages,
      totalCount,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  }
}

// ============================================================================
// Batch Loading (N+1 Prevention)
// ============================================================================

/**
 * Batch load certificates with all relations
 * Use when you need full certificate details for multiple IDs
 */
export async function batchLoadCertificates(
  certificateIds: string[],
  tenantId: string
) {
  if (certificateIds.length === 0) return []

  return prisma.certificate.findMany({
    where: {
      id: { in: certificateIds },
      tenantId,
    },
    include: {
      createdBy: {
        select: { id: true, name: true, email: true },
      },
      reviewer: {
        select: { id: true, name: true, email: true },
      },
      lastModifiedBy: {
        select: { id: true, name: true, email: true },
      },
      parameters: {
        orderBy: { sortOrder: 'asc' },
        include: {
          results: {
            orderBy: { pointNumber: 'asc' },
          },
        },
      },
    },
  })
}

/**
 * Batch load users by IDs
 */
export async function batchLoadUsers(
  userIds: string[],
  tenantId: string
) {
  if (userIds.length === 0) return []

  return prisma.user.findMany({
    where: {
      id: { in: userIds },
      tenantId,
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
    },
  })
}

/**
 * Create a DataLoader-style batch function
 * Returns a map for O(1) lookups
 */
export async function createBatchLoader<T extends { id: string }>(
  ids: string[],
  fetchFn: (ids: string[]) => Promise<T[]>
): Promise<Map<string, T>> {
  const items = await fetchFn(ids)
  return new Map(items.map(item => [item.id, item]))
}

// ============================================================================
// Dashboard Stats (Efficient Aggregation)
// ============================================================================

export interface DashboardStats {
  certificates: {
    draft: number
    pendingReview: number
    pendingAuthorization: number
    approved: number
    rejected: number
    total: number
  }
  recentActivity: {
    createdThisWeek: number
    createdThisMonth: number
    approvedThisWeek: number
  }
  performance: {
    avgProcessingTimeMs: number | null
  }
}

/**
 * Get dashboard stats with a single efficient query
 * Uses raw SQL for optimal performance
 */
export async function getDashboardStats(tenantId: string): Promise<DashboardStats> {
  const now = new Date()
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

  const result = await prisma.$queryRaw<Array<{
    draft_count: bigint
    pending_review_count: bigint
    pending_auth_count: bigint
    approved_count: bigint
    rejected_count: bigint
    total_count: bigint
    created_this_week: bigint
    created_this_month: bigint
    approved_this_week: bigint
    avg_processing_time_ms: number | null
  }>>`
    SELECT
      COUNT(*) FILTER (WHERE status = 'DRAFT') as draft_count,
      COUNT(*) FILTER (WHERE status = 'PENDING_REVIEW') as pending_review_count,
      COUNT(*) FILTER (WHERE status = 'PENDING_AUTHORIZATION') as pending_auth_count,
      COUNT(*) FILTER (WHERE status = 'APPROVED') as approved_count,
      COUNT(*) FILTER (WHERE status = 'REJECTED') as rejected_count,
      COUNT(*) as total_count,
      COUNT(*) FILTER (WHERE "createdAt" > ${oneWeekAgo}) as created_this_week,
      COUNT(*) FILTER (WHERE "createdAt" > ${oneMonthAgo}) as created_this_month,
      COUNT(*) FILTER (WHERE "approvedAt" > ${oneWeekAgo}) as approved_this_week,
      AVG(
        CASE
          WHEN "approvedAt" IS NOT NULL AND "submittedAt" IS NOT NULL
          THEN EXTRACT(EPOCH FROM ("approvedAt" - "submittedAt")) * 1000
          ELSE NULL
        END
      ) as avg_processing_time_ms
    FROM "Certificate"
    WHERE "tenantId" = ${tenantId}
  `

  const stats = result[0]

  return {
    certificates: {
      draft: Number(stats?.draft_count ?? 0),
      pendingReview: Number(stats?.pending_review_count ?? 0),
      pendingAuthorization: Number(stats?.pending_auth_count ?? 0),
      approved: Number(stats?.approved_count ?? 0),
      rejected: Number(stats?.rejected_count ?? 0),
      total: Number(stats?.total_count ?? 0),
    },
    recentActivity: {
      createdThisWeek: Number(stats?.created_this_week ?? 0),
      createdThisMonth: Number(stats?.created_this_month ?? 0),
      approvedThisWeek: Number(stats?.approved_this_week ?? 0),
    },
    performance: {
      avgProcessingTimeMs: stats?.avg_processing_time_ms ?? null,
    },
  }
}

/**
 * Get user workload stats
 */
export async function getUserWorkloadStats(tenantId: string) {
  return prisma.$queryRaw<Array<{
    user_id: string
    user_name: string
    assigned_count: bigint
    completed_this_week: bigint
    avg_completion_time_hours: number | null
  }>>`
    SELECT
      u.id as user_id,
      u.name as user_name,
      COUNT(*) FILTER (WHERE c.status NOT IN ('APPROVED', 'REJECTED')) as assigned_count,
      COUNT(*) FILTER (WHERE c."approvedAt" > NOW() - INTERVAL '7 days') as completed_this_week,
      AVG(
        CASE
          WHEN c."approvedAt" IS NOT NULL AND c."createdAt" IS NOT NULL
          THEN EXTRACT(EPOCH FROM (c."approvedAt" - c."createdAt")) / 3600
          ELSE NULL
        END
      ) as avg_completion_time_hours
    FROM "User" u
    LEFT JOIN "Certificate" c ON c."engineerId" = u.id
    WHERE u."tenantId" = ${tenantId}
      AND u."isActive" = true
      AND u.role IN ('ENGINEER', 'SENIOR_ENGINEER')
    GROUP BY u.id, u.name
    ORDER BY assigned_count DESC
  `
}

// ============================================================================
// Cache-Aware Queries
// ============================================================================

/**
 * Wrapper for queries that should use caching
 * Note: Caching should be applied at the API layer using @hta/shared/cache
 * This is a pass-through that can be wrapped with caching at the call site
 */
export async function withQueryCache<T>(
  _key: string,
  queryFn: () => Promise<T>,
  _ttlSeconds: number = 300
): Promise<T> {
  // Pass through - actual caching should be done at API layer
  // to avoid circular dependency between @hta/database and @hta/shared
  return queryFn()
}

/**
 * Get dashboard stats with caching
 */
export async function getDashboardStatsCached(tenantId: string): Promise<DashboardStats> {
  return withQueryCache(
    `dashboard:stats:${tenantId}`,
    () => getDashboardStats(tenantId),
    60 // 1 minute cache
  )
}
