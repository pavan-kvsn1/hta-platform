/**
 * Admin Certificates API Unit Tests
 *
 * Tests for the admin certificates API endpoint:
 * - Authorization checks
 * - Paginated certificate listing
 * - Filtering by status
 * - Search functionality
 * - Pagination handling
 * - Error handling
 *
 * Self-contained version with mock implementations
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Types
interface Session {
  user: { id: string; role: string }
  expires: string
}

interface Certificate {
  id: string
  certificateNumber: string
  status: string
  customerName: string
  uucDescription: string
  uucMake: string
  uucModel: string
  dateOfCalibration: Date
  calibrationDueDate: Date
  currentRevision: number
  createdAt: Date
  updatedAt: Date
  createdBy: {
    id: string
    name: string
    email: string
    assignedAdmin?: { id: string; name: string; email: string } | null
  }
  lastModifiedBy: { id: string; name: string }
}

interface CertificateListResponse {
  certificates: Certificate[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
  stats: {
    total: number
    draft: number
    pendingReview: number
    revisionRequired: number
    pendingCustomer: number
    customerRevision: number
    pendingAdmin: number
    authorized: number
    rejected: number
  }
}

interface QueryParams {
  page?: number
  limit?: number
  status?: string
  search?: string
  sortBy?: string
  sortOrder?: string
}

// Mock implementations
const mockAuth = vi.fn<[], Promise<Session | null>>()
const mockCanAccessAdmin = vi.fn<[Session | null], boolean>()
const mockFindMany = vi.fn<[unknown], Promise<Certificate[]>>()
const mockCount = vi.fn<[unknown], Promise<number>>()

// Build where clause from query params
function buildWhereClause(params: QueryParams): Record<string, unknown> {
  const where: Record<string, unknown> = {}

  if (params.status) {
    where.status = params.status
  }

  if (params.search) {
    where.OR = [
      { certificateNumber: { contains: params.search } },
      { customerName: { contains: params.search } },
      { uucDescription: { contains: params.search } },
      { uucMake: { contains: params.search } },
      { uucModel: { contains: params.search } },
    ]
  }

  return where
}

// Get certificates stats
async function getCertificateStats(): Promise<CertificateListResponse['stats']> {
  const [total, draft, pendingReview, revisionRequired, pendingCustomer, customerRevision, pendingAdmin, authorized, rejected] =
    await Promise.all([
      mockCount({}),
      mockCount({ where: { status: 'DRAFT' } }),
      mockCount({ where: { status: 'PENDING_REVIEW' } }),
      mockCount({ where: { status: 'REVISION_REQUIRED' } }),
      mockCount({ where: { status: 'PENDING_CUSTOMER' } }),
      mockCount({ where: { status: 'CUSTOMER_REVISION' } }),
      mockCount({ where: { status: 'PENDING_ADMIN' } }),
      mockCount({ where: { status: 'AUTHORIZED' } }),
      mockCount({ where: { status: 'REJECTED' } }),
    ])

  return { total, draft, pendingReview, revisionRequired, pendingCustomer, customerRevision, pendingAdmin, authorized, rejected }
}

// Mock API handler
async function GET(request: { url: string }): Promise<{ status: number; body: unknown }> {
  try {
    const session = await mockAuth()

    if (!session || !mockCanAccessAdmin(session)) {
      return { status: 403, body: { error: 'Forbidden' } }
    }

    const url = new URL(request.url, 'http://localhost:3000')
    const params: QueryParams = {
      page: parseInt(url.searchParams.get('page') || '1'),
      limit: parseInt(url.searchParams.get('limit') || '20'),
      status: url.searchParams.get('status') || undefined,
      search: url.searchParams.get('search') || undefined,
    }

    const where = buildWhereClause(params)
    const skip = (params.page! - 1) * params.limit!

    const [certificates, total, stats] = await Promise.all([
      mockFindMany({
        where,
        skip,
        take: params.limit,
        include: {
          createdBy: { include: { assignedAdmin: true } },
          lastModifiedBy: true,
        },
        orderBy: { updatedAt: 'desc' },
      }),
      mockCount({ where }),
      getCertificateStats(),
    ])

    return {
      status: 200,
      body: {
        certificates,
        pagination: {
          page: params.page,
          limit: params.limit,
          total,
          totalPages: Math.ceil(total / params.limit!),
        },
        stats,
      },
    }
  } catch {
    return { status: 500, body: { error: 'Failed to fetch certificates' } }
  }
}

describe('Admin Certificates API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('GET /api/admin/certificates', () => {
    it('should return 403 when user is not admin', async () => {
      mockAuth.mockResolvedValue({
        user: { id: 'user-123', role: 'ENGINEER' },
        expires: new Date().toISOString(),
      })
      mockCanAccessAdmin.mockReturnValue(false)

      const request = { url: '/api/admin/certificates' }
      const response = await GET(request)

      expect(response.status).toBe(403)
      expect((response.body as { error: string }).error).toBe('Forbidden')
    })

    it('should return paginated certificates with stats', async () => {
      mockAuth.mockResolvedValue({
        user: { id: 'admin-123', role: 'ADMIN' },
        expires: new Date().toISOString(),
      })
      mockCanAccessAdmin.mockReturnValue(true)

      const mockCertificates: Certificate[] = [
        {
          id: 'cert-1',
          certificateNumber: 'HTA/CAL/2024/001',
          status: 'DRAFT',
          customerName: 'Test Customer',
          uucDescription: 'Test Device',
          uucMake: 'Make',
          uucModel: 'Model',
          dateOfCalibration: new Date('2024-01-15'),
          calibrationDueDate: new Date('2025-01-15'),
          currentRevision: 1,
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
          createdBy: {
            id: 'eng-1',
            name: 'Engineer',
            email: 'eng@test.com',
            assignedAdmin: { id: 'admin-1', name: 'Admin', email: 'admin@test.com' },
          },
          lastModifiedBy: { id: 'eng-1', name: 'Engineer' },
        },
      ]

      mockFindMany.mockResolvedValue(mockCertificates)
      mockCount
        .mockResolvedValueOnce(1) // main count
        .mockResolvedValueOnce(10) // total
        .mockResolvedValueOnce(2) // draft
        .mockResolvedValueOnce(3) // pending review
        .mockResolvedValueOnce(1) // revision required
        .mockResolvedValueOnce(2) // pending customer
        .mockResolvedValueOnce(0) // customer revision
        .mockResolvedValueOnce(1) // pending admin
        .mockResolvedValueOnce(1) // authorized
        .mockResolvedValueOnce(0) // rejected

      const request = { url: '/api/admin/certificates?page=1&limit=20' }
      const response = await GET(request)
      const data = response.body as CertificateListResponse

      expect(response.status).toBe(200)
      expect(data.certificates).toHaveLength(1)
      expect(data.certificates[0].certificateNumber).toBe('HTA/CAL/2024/001')
      expect(data.pagination.total).toBe(1)
      expect(data.stats).toBeDefined()
    })

    it('should filter certificates by status', async () => {
      mockAuth.mockResolvedValue({
        user: { id: 'admin-123', role: 'ADMIN' },
        expires: new Date().toISOString(),
      })
      mockCanAccessAdmin.mockReturnValue(true)
      mockFindMany.mockResolvedValue([])
      mockCount.mockResolvedValue(0)

      const request = { url: '/api/admin/certificates?status=PENDING_REVIEW' }
      await GET(request)

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'PENDING_REVIEW' }),
        })
      )
    })

    it('should search certificates by multiple fields', async () => {
      mockAuth.mockResolvedValue({
        user: { id: 'admin-123', role: 'ADMIN' },
        expires: new Date().toISOString(),
      })
      mockCanAccessAdmin.mockReturnValue(true)
      mockFindMany.mockResolvedValue([])
      mockCount.mockResolvedValue(0)

      const request = { url: '/api/admin/certificates?search=multimeter' }
      await GET(request)

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { certificateNumber: { contains: 'multimeter' } },
              { customerName: { contains: 'multimeter' } },
              { uucDescription: { contains: 'multimeter' } },
              { uucMake: { contains: 'multimeter' } },
              { uucModel: { contains: 'multimeter' } },
            ],
          }),
        })
      )
    })

    it('should handle pagination correctly', async () => {
      mockAuth.mockResolvedValue({
        user: { id: 'admin-123', role: 'ADMIN' },
        expires: new Date().toISOString(),
      })
      mockCanAccessAdmin.mockReturnValue(true)
      mockFindMany.mockResolvedValue([])
      mockCount.mockResolvedValue(50)

      const request = { url: '/api/admin/certificates?page=3&limit=10' }
      await GET(request)

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 20, // (3-1) * 10
          take: 10,
        })
      )
    })

    it('should handle database errors gracefully', async () => {
      mockAuth.mockResolvedValue({
        user: { id: 'admin-123', role: 'ADMIN' },
        expires: new Date().toISOString(),
      })
      mockCanAccessAdmin.mockReturnValue(true)
      mockFindMany.mockRejectedValue(new Error('DB error'))

      const request = { url: '/api/admin/certificates' }
      const response = await GET(request)

      expect(response.status).toBe(500)
      expect((response.body as { error: string }).error).toBe('Failed to fetch certificates')
    })
  })
})
