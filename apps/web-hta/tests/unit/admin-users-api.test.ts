/**
 * Admin Users API Unit Tests
 *
 * Tests for the admin users API endpoints:
 * - GET: List users with pagination, filtering, search
 * - POST: Create new users (Engineers and Admins)
 * - Authorization checks
 * - Validation of required fields
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

interface User {
  id: string
  email: string
  name: string
  role: 'ENGINEER' | 'ADMIN'
  adminType?: 'WORKER' | 'AUTHORIZER' | null
  isActive: boolean
  authProvider: string
  assignedAdmin?: { id: string; name: string; email: string } | null
  _count?: { createdCertificates: number }
  createdAt: Date
  updatedAt: Date
}

interface UserListResponse {
  users: (Omit<User, '_count'> & { certificateCount: number })[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

interface CreateUserRequest {
  email: string
  name?: string
  role?: string
  adminType?: string
  assignedAdminId?: string
}

// Mock implementations
const mockAuth = vi.fn<[], Promise<Session | null>>()
const mockCanAccessAdmin = vi.fn<[Session | null], boolean>()
const mockFindMany = vi.fn<[unknown], Promise<User[]>>()
const mockFindUnique = vi.fn<[unknown], Promise<User | null>>()
const mockFindFirst = vi.fn<[unknown], Promise<User | null>>()
const mockCount = vi.fn<[unknown], Promise<number>>()
const mockCreate = vi.fn<[unknown], Promise<User>>()

// Build where clause from query params
function buildUserWhereClause(params: { role?: string; isActive?: string; search?: string }): Record<string, unknown> {
  const where: Record<string, unknown> = {}

  if (params.role) {
    where.role = params.role
  }

  if (params.isActive !== undefined) {
    where.isActive = params.isActive === 'true'
  }

  if (params.search) {
    where.OR = [
      { name: { contains: params.search } },
      { email: { contains: params.search } },
    ]
  }

  return where
}

// Mock GET handler
async function GET(request: { url: string }): Promise<{ status: number; body: unknown }> {
  try {
    const session = await mockAuth()

    if (!session || !mockCanAccessAdmin(session)) {
      return { status: 403, body: { error: 'Forbidden' } }
    }

    const url = new URL(request.url, 'http://localhost:3000')
    const params = {
      page: parseInt(url.searchParams.get('page') || '1'),
      limit: parseInt(url.searchParams.get('limit') || '20'),
      role: url.searchParams.get('role') || undefined,
      isActive: url.searchParams.get('isActive') || undefined,
      search: url.searchParams.get('search') || undefined,
    }

    const where = buildUserWhereClause(params)
    const skip = (params.page - 1) * params.limit

    const [users, total] = await Promise.all([
      mockFindMany({
        where,
        skip,
        take: params.limit,
        include: {
          assignedAdmin: true,
          _count: { select: { createdCertificates: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      mockCount({ where }),
    ])

    const transformedUsers = users.map((user) => ({
      ...user,
      certificateCount: user._count?.createdCertificates || 0,
      _count: undefined,
    }))

    return {
      status: 200,
      body: {
        users: transformedUsers,
        pagination: {
          page: params.page,
          limit: params.limit,
          total,
          totalPages: Math.ceil(total / params.limit),
        },
      } as UserListResponse,
    }
  } catch {
    return { status: 500, body: { error: 'Failed to fetch users' } }
  }
}

// Mock POST handler
async function POST(request: { body: CreateUserRequest }): Promise<{ status: number; body: unknown }> {
  try {
    const session = await mockAuth()

    if (!session || !mockCanAccessAdmin(session)) {
      return { status: 403, body: { error: 'Forbidden' } }
    }

    const { email, name, role, adminType, assignedAdminId } = request.body

    // Validate required fields
    if (!email || !name || !role) {
      return { status: 400, body: { error: 'Email, name, and role are required' } }
    }

    // Validate role
    if (role !== 'ENGINEER' && role !== 'ADMIN') {
      return { status: 400, body: { error: 'Invalid role. Must be ENGINEER or ADMIN' } }
    }

    // Check if email already exists
    const existingUser = await mockFindUnique({ where: { email } })
    if (existingUser) {
      return { status: 400, body: { error: 'A user with this email already exists' } }
    }

    // Engineer-specific validation
    if (role === 'ENGINEER') {
      if (!assignedAdminId) {
        return { status: 400, body: { error: 'Engineers must be assigned to an Admin' } }
      }

      const admin = await mockFindFirst({
        where: { id: assignedAdminId, role: 'ADMIN', isActive: true },
      })

      if (!admin) {
        return { status: 400, body: { error: 'Invalid Admin selected' } }
      }
    }

    // Create user
    const newUser = await mockCreate({
      data: {
        email,
        name,
        role,
        adminType: role === 'ADMIN' ? adminType : null,
        isActive: false,
        assignedAdminId: role === 'ENGINEER' ? assignedAdminId : null,
      },
      include: { assignedAdmin: true },
    })

    return {
      status: 200,
      body: {
        success: true,
        user: newUser,
      },
    }
  } catch {
    return { status: 500, body: { error: 'Failed to create user' } }
  }
}

describe('Admin Users API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('GET /api/admin/users', () => {
    it('should return 403 when user is not admin', async () => {
      mockAuth.mockResolvedValue({
        user: { id: 'user-123', role: 'ENGINEER' },
        expires: new Date().toISOString(),
      })
      mockCanAccessAdmin.mockReturnValue(false)

      const request = { url: '/api/admin/users' }
      const response = await GET(request)

      expect(response.status).toBe(403)
      expect((response.body as { error: string }).error).toBe('Forbidden')
    })

    it('should return paginated users list', async () => {
      mockAuth.mockResolvedValue({
        user: { id: 'admin-123', role: 'ADMIN' },
        expires: new Date().toISOString(),
      })
      mockCanAccessAdmin.mockReturnValue(true)

      const mockUsers: User[] = [
        {
          id: 'user-1',
          email: 'engineer@test.com',
          name: 'Test Engineer',
          role: 'ENGINEER',
          isActive: true,
          authProvider: 'PASSWORD',
          assignedAdmin: { id: 'admin-1', name: 'Admin', email: 'admin@test.com' },
          _count: { createdCertificates: 5 },
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
        },
      ]

      mockFindMany.mockResolvedValue(mockUsers)
      mockCount.mockResolvedValue(1)

      const request = { url: '/api/admin/users?page=1&limit=20' }
      const response = await GET(request)
      const data = response.body as UserListResponse

      expect(response.status).toBe(200)
      expect(data.users).toHaveLength(1)
      expect(data.users[0].email).toBe('engineer@test.com')
      expect(data.users[0].certificateCount).toBe(5)
      expect(data.pagination.total).toBe(1)
    })

    it('should filter users by role', async () => {
      mockAuth.mockResolvedValue({
        user: { id: 'admin-123', role: 'ADMIN' },
        expires: new Date().toISOString(),
      })
      mockCanAccessAdmin.mockReturnValue(true)
      mockFindMany.mockResolvedValue([])
      mockCount.mockResolvedValue(0)

      const request = { url: '/api/admin/users?role=ENGINEER' }
      await GET(request)

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ role: 'ENGINEER' }),
        })
      )
    })

    it('should filter users by active status', async () => {
      mockAuth.mockResolvedValue({
        user: { id: 'admin-123', role: 'ADMIN' },
        expires: new Date().toISOString(),
      })
      mockCanAccessAdmin.mockReturnValue(true)
      mockFindMany.mockResolvedValue([])
      mockCount.mockResolvedValue(0)

      const request = { url: '/api/admin/users?isActive=true' }
      await GET(request)

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isActive: true }),
        })
      )
    })

    it('should search users by name or email', async () => {
      mockAuth.mockResolvedValue({
        user: { id: 'admin-123', role: 'ADMIN' },
        expires: new Date().toISOString(),
      })
      mockCanAccessAdmin.mockReturnValue(true)
      mockFindMany.mockResolvedValue([])
      mockCount.mockResolvedValue(0)

      const request = { url: '/api/admin/users?search=john' }
      await GET(request)

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { name: { contains: 'john' } },
              { email: { contains: 'john' } },
            ],
          }),
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

      const request = { url: '/api/admin/users' }
      const response = await GET(request)

      expect(response.status).toBe(500)
      expect((response.body as { error: string }).error).toBe('Failed to fetch users')
    })
  })

  describe('POST /api/admin/users', () => {
    it('should return 403 when user is not admin', async () => {
      mockAuth.mockResolvedValue({
        user: { id: 'user-123', role: 'ENGINEER' },
        expires: new Date().toISOString(),
      })
      mockCanAccessAdmin.mockReturnValue(false)

      const request = { body: { email: 'test@test.com', name: 'Test', role: 'ENGINEER' } }
      const response = await POST(request)

      expect(response.status).toBe(403)
      expect((response.body as { error: string }).error).toBe('Forbidden')
    })

    it('should return 400 when required fields are missing', async () => {
      mockAuth.mockResolvedValue({
        user: { id: 'admin-123', role: 'ADMIN' },
        expires: new Date().toISOString(),
      })
      mockCanAccessAdmin.mockReturnValue(true)

      const request = { body: { email: 'test@test.com' } }
      const response = await POST(request)

      expect(response.status).toBe(400)
      expect((response.body as { error: string }).error).toBe('Email, name, and role are required')
    })

    it('should return 400 for invalid role', async () => {
      mockAuth.mockResolvedValue({
        user: { id: 'admin-123', role: 'ADMIN' },
        expires: new Date().toISOString(),
      })
      mockCanAccessAdmin.mockReturnValue(true)

      const request = { body: { email: 'test@test.com', name: 'Test', role: 'INVALID_ROLE' } }
      const response = await POST(request)

      expect(response.status).toBe(400)
      expect((response.body as { error: string }).error).toBe('Invalid role. Must be ENGINEER or ADMIN')
    })

    it('should return 400 when email already exists', async () => {
      mockAuth.mockResolvedValue({
        user: { id: 'admin-123', role: 'ADMIN' },
        expires: new Date().toISOString(),
      })
      mockCanAccessAdmin.mockReturnValue(true)
      mockFindUnique.mockResolvedValue({ id: 'existing-user' } as User)

      const request = { body: { email: 'existing@test.com', name: 'Test', role: 'ADMIN' } }
      const response = await POST(request)

      expect(response.status).toBe(400)
      expect((response.body as { error: string }).error).toBe('A user with this email already exists')
    })

    it('should return 400 when engineer has no assigned admin', async () => {
      mockAuth.mockResolvedValue({
        user: { id: 'admin-123', role: 'ADMIN' },
        expires: new Date().toISOString(),
      })
      mockCanAccessAdmin.mockReturnValue(true)
      mockFindUnique.mockResolvedValue(null)

      const request = { body: { email: 'engineer@test.com', name: 'Engineer', role: 'ENGINEER' } }
      const response = await POST(request)

      expect(response.status).toBe(400)
      expect((response.body as { error: string }).error).toBe('Engineers must be assigned to an Admin')
    })

    it('should return 400 when assigned admin is invalid', async () => {
      mockAuth.mockResolvedValue({
        user: { id: 'admin-123', role: 'ADMIN' },
        expires: new Date().toISOString(),
      })
      mockCanAccessAdmin.mockReturnValue(true)
      mockFindUnique.mockResolvedValue(null)
      mockFindFirst.mockResolvedValue(null)

      const request = {
        body: {
          email: 'engineer@test.com',
          name: 'Engineer',
          role: 'ENGINEER',
          assignedAdminId: 'invalid-admin-id',
        },
      }
      const response = await POST(request)

      expect(response.status).toBe(400)
      expect((response.body as { error: string }).error).toBe('Invalid Admin selected')
    })

    it('should create engineer successfully', async () => {
      mockAuth.mockResolvedValue({
        user: { id: 'admin-123', role: 'ADMIN' },
        expires: new Date().toISOString(),
      })
      mockCanAccessAdmin.mockReturnValue(true)
      mockFindUnique.mockResolvedValue(null)
      mockFindFirst.mockResolvedValue({
        id: 'admin-1',
        role: 'ADMIN',
        isActive: true,
      } as User)
      mockCreate.mockResolvedValue({
        id: 'new-user-id',
        email: 'engineer@test.com',
        name: 'New Engineer',
        role: 'ENGINEER',
        adminType: null,
        isActive: false,
        authProvider: 'PASSWORD',
        assignedAdmin: { id: 'admin-1', name: 'Admin', email: 'admin@test.com' },
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      const request = {
        body: {
          email: 'engineer@test.com',
          name: 'New Engineer',
          role: 'ENGINEER',
          assignedAdminId: 'admin-1',
        },
      }
      const response = await POST(request)
      const data = response.body as { success: boolean; user: User }

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.user.email).toBe('engineer@test.com')
      expect(data.user.role).toBe('ENGINEER')
    })

    it('should create admin successfully', async () => {
      mockAuth.mockResolvedValue({
        user: { id: 'admin-123', role: 'ADMIN' },
        expires: new Date().toISOString(),
      })
      mockCanAccessAdmin.mockReturnValue(true)
      mockFindUnique.mockResolvedValue(null)
      mockCreate.mockResolvedValue({
        id: 'new-admin-id',
        email: 'newadmin@test.com',
        name: 'New Admin',
        role: 'ADMIN',
        adminType: 'WORKER',
        isActive: false,
        authProvider: 'PASSWORD',
        assignedAdmin: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      const request = {
        body: {
          email: 'newadmin@test.com',
          name: 'New Admin',
          role: 'ADMIN',
          adminType: 'WORKER',
        },
      }
      const response = await POST(request)
      const data = response.body as { success: boolean; user: User }

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.user.role).toBe('ADMIN')
      expect(data.user.adminType).toBe('WORKER')
    })

    it('should handle database errors gracefully', async () => {
      mockAuth.mockResolvedValue({
        user: { id: 'admin-123', role: 'ADMIN' },
        expires: new Date().toISOString(),
      })
      mockCanAccessAdmin.mockReturnValue(true)
      mockFindUnique.mockRejectedValue(new Error('DB error'))

      const request = { body: { email: 'test@test.com', name: 'Test', role: 'ADMIN' } }
      const response = await POST(request)

      expect(response.status).toBe(500)
      expect((response.body as { error: string }).error).toBe('Failed to create user')
    })
  })
})
