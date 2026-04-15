/**
 * Route Guards Unit Tests
 *
 * Tests for authentication and authorization route guards.
 * Tests role-based access control, admin tier checks, and
 * certificate access permissions.
 *
 * Migrated from hta-calibration/src/lib/__tests__/route-guards.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Types
interface User {
  id: string
  email: string
  name: string
  role: string
  adminType?: 'MASTER' | 'WORKER' | null
}

interface Certificate {
  createdById?: string
  reviewerId?: string
}

// Mock auth function
let mockSession: { user: User | null } | null = null

async function auth(): Promise<{ user: User | null } | null> {
  return mockSession
}

// Helper functions
function isMasterAdmin(user: User | null): boolean {
  return user?.role === 'ADMIN' && user?.adminType === 'MASTER'
}

function isWorkerAdmin(user: User | null): boolean {
  return user?.role === 'ADMIN' && user?.adminType === 'WORKER'
}

function isAdmin(user: User | null): boolean {
  return user?.role === 'ADMIN'
}

function canReviewCertificate(user: User | null, cert: Certificate): boolean {
  if (!user) return false
  if (user.role === 'ADMIN') return true
  return cert.reviewerId === user.id
}

// Route guard implementations
class RedirectError extends Error {
  constructor(public url: string) {
    super(`REDIRECT:${url}`)
  }
}

async function requireAuth(): Promise<User> {
  const session = await auth()
  if (!session?.user) {
    throw new RedirectError('/login')
  }
  return session.user
}

async function requireCustomerAuth(): Promise<User> {
  const session = await auth()
  if (!session?.user || session.user.role !== 'CUSTOMER') {
    throw new RedirectError('/customer/login')
  }
  return session.user
}

async function requireEngineer(): Promise<User> {
  const session = await auth()
  if (!session?.user) {
    throw new RedirectError('/login')
  }
  if (session.user.role !== 'ENGINEER' && session.user.role !== 'ADMIN') {
    throw new RedirectError('/dashboard')
  }
  return session.user
}

async function requireAdmin(): Promise<User> {
  const session = await auth()
  if (!session?.user) {
    throw new RedirectError('/login')
  }
  if (session.user.role !== 'ADMIN') {
    throw new RedirectError('/dashboard')
  }
  return session.user
}

async function requireMasterAdmin(): Promise<User> {
  const session = await auth()
  if (!session?.user) {
    throw new RedirectError('/login')
  }
  if (!isAdmin(session.user)) {
    throw new RedirectError('/dashboard')
  }
  if (!isMasterAdmin(session.user)) {
    throw new RedirectError('/admin')
  }
  return session.user
}

const MASTER_ONLY_ROUTES = ['/admin/customers', '/admin/registrations']

async function requireAdminWithTierCheck(pathname: string): Promise<User> {
  const session = await auth()
  if (!session?.user) {
    throw new RedirectError('/login')
  }
  if (!isAdmin(session.user)) {
    throw new RedirectError('/dashboard')
  }
  if (isWorkerAdmin(session.user)) {
    const isRestricted = MASTER_ONLY_ROUTES.some(
      (route) => pathname === route || pathname.startsWith(route + '/')
    )
    if (isRestricted) {
      throw new RedirectError('/admin')
    }
  }
  return session.user
}

async function requireReviewAccess(cert: Certificate): Promise<User> {
  const session = await auth()
  if (!session?.user) {
    throw new RedirectError('/login')
  }
  if (!canReviewCertificate(session.user, cert)) {
    throw new RedirectError('/dashboard')
  }
  return session.user
}

async function requireAssigneeAccess(cert: { createdById: string }): Promise<User> {
  const session = await auth()
  if (!session?.user) {
    throw new RedirectError('/login')
  }
  if (isAdmin(session.user) || cert.createdById === session.user.id) {
    return session.user
  }
  throw new RedirectError('/dashboard')
}

async function requireCertificateAccess(cert: Certificate): Promise<User> {
  const session = await auth()
  if (!session?.user) {
    throw new RedirectError('/login')
  }
  if (
    isAdmin(session.user) ||
    cert.createdById === session.user.id ||
    cert.reviewerId === session.user.id
  ) {
    return session.user
  }
  throw new RedirectError('/dashboard')
}

function getRoleDisplayName(user: User): string {
  if (user.role === 'ADMIN') {
    if (user.adminType === 'MASTER') return 'Master Admin'
    if (user.adminType === 'WORKER') return 'Worker Admin'
    return 'Admin'
  }
  if (user.role === 'ENGINEER') return 'Engineer'
  if (user.role === 'CUSTOMER') return 'Customer'
  return user.role
}

function isNewWorkflowEnabled(): boolean {
  return process.env.FEATURE_NEW_WORKFLOW === 'true'
}

describe('Route Guards', () => {
  beforeEach(() => {
    mockSession = null
  })

  describe('requireAuth', () => {
    it('returns user when authenticated', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test', role: 'ENGINEER' }
      mockSession = { user: mockUser }

      const result = await requireAuth()

      expect(result).toEqual(mockUser)
    })

    it('redirects to /login when not authenticated', async () => {
      mockSession = null

      await expect(requireAuth()).rejects.toThrow('REDIRECT:/login')
    })

    it('redirects to /login when session has no user', async () => {
      mockSession = { user: null }

      await expect(requireAuth()).rejects.toThrow('REDIRECT:/login')
    })
  })

  describe('requireCustomerAuth', () => {
    it('returns user when authenticated as customer', async () => {
      const mockUser = {
        id: 'cust-1',
        email: 'cust@example.com',
        name: 'Customer',
        role: 'CUSTOMER',
      }
      mockSession = { user: mockUser }

      const result = await requireCustomerAuth()

      expect(result).toEqual(mockUser)
    })

    it('redirects to /customer/login when not authenticated', async () => {
      mockSession = null

      await expect(requireCustomerAuth()).rejects.toThrow('REDIRECT:/customer/login')
    })

    it('redirects to /customer/login when not a customer', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test', role: 'ENGINEER' }
      mockSession = { user: mockUser }

      await expect(requireCustomerAuth()).rejects.toThrow('REDIRECT:/customer/login')
    })
  })

  describe('requireEngineer', () => {
    it('returns user when authenticated as engineer', async () => {
      const mockUser = { id: 'eng-1', email: 'eng@example.com', name: 'Engineer', role: 'ENGINEER' }
      mockSession = { user: mockUser }

      const result = await requireEngineer()

      expect(result).toEqual(mockUser)
    })

    it('returns user when authenticated as admin', async () => {
      const mockUser = { id: 'admin-1', email: 'admin@example.com', name: 'Admin', role: 'ADMIN' }
      mockSession = { user: mockUser }

      const result = await requireEngineer()

      expect(result).toEqual(mockUser)
    })

    it('redirects to /dashboard when not engineer or admin', async () => {
      const mockUser = {
        id: 'cust-1',
        email: 'cust@example.com',
        name: 'Customer',
        role: 'CUSTOMER',
      }
      mockSession = { user: mockUser }

      await expect(requireEngineer()).rejects.toThrow('REDIRECT:/dashboard')
    })
  })

  describe('requireAdmin', () => {
    it('returns user when authenticated as admin', async () => {
      const mockUser = { id: 'admin-1', email: 'admin@example.com', name: 'Admin', role: 'ADMIN' }
      mockSession = { user: mockUser }

      const result = await requireAdmin()

      expect(result).toEqual(mockUser)
    })

    it('redirects to /dashboard when not admin', async () => {
      const mockUser = { id: 'eng-1', email: 'eng@example.com', name: 'Engineer', role: 'ENGINEER' }
      mockSession = { user: mockUser }

      await expect(requireAdmin()).rejects.toThrow('REDIRECT:/dashboard')
    })
  })

  describe('requireMasterAdmin', () => {
    it('returns user when authenticated as master admin', async () => {
      const mockUser = {
        id: 'admin-1',
        email: 'admin@example.com',
        name: 'Admin',
        role: 'ADMIN',
        adminType: 'MASTER' as const,
      }
      mockSession = { user: mockUser }

      const result = await requireMasterAdmin()

      expect(result).toEqual(mockUser)
    })

    it('redirects to /admin when worker admin', async () => {
      const mockUser = {
        id: 'admin-1',
        email: 'admin@example.com',
        name: 'Admin',
        role: 'ADMIN',
        adminType: 'WORKER' as const,
      }
      mockSession = { user: mockUser }

      await expect(requireMasterAdmin()).rejects.toThrow('REDIRECT:/admin')
    })

    it('redirects to /dashboard when not admin', async () => {
      const mockUser = { id: 'eng-1', email: 'eng@example.com', name: 'Engineer', role: 'ENGINEER' }
      mockSession = { user: mockUser }

      await expect(requireMasterAdmin()).rejects.toThrow('REDIRECT:/dashboard')
    })
  })

  describe('requireAdminWithTierCheck', () => {
    it('returns user for master admin on any route', async () => {
      const mockUser = {
        id: 'admin-1',
        email: 'admin@example.com',
        name: 'Admin',
        role: 'ADMIN',
        adminType: 'MASTER' as const,
      }
      mockSession = { user: mockUser }

      const result = await requireAdminWithTierCheck('/admin/customers')

      expect(result).toEqual(mockUser)
    })

    it('returns user for worker admin on non-restricted route', async () => {
      const mockUser = {
        id: 'admin-1',
        email: 'admin@example.com',
        name: 'Admin',
        role: 'ADMIN',
        adminType: 'WORKER' as const,
      }
      mockSession = { user: mockUser }

      const result = await requireAdminWithTierCheck('/admin/certificates')

      expect(result).toEqual(mockUser)
    })

    it('redirects worker admin from /admin/customers', async () => {
      const mockUser = {
        id: 'admin-1',
        email: 'admin@example.com',
        name: 'Admin',
        role: 'ADMIN',
        adminType: 'WORKER' as const,
      }
      mockSession = { user: mockUser }

      await expect(requireAdminWithTierCheck('/admin/customers')).rejects.toThrow('REDIRECT:/admin')
    })

    it('redirects worker admin from /admin/registrations', async () => {
      const mockUser = {
        id: 'admin-1',
        email: 'admin@example.com',
        name: 'Admin',
        role: 'ADMIN',
        adminType: 'WORKER' as const,
      }
      mockSession = { user: mockUser }

      await expect(requireAdminWithTierCheck('/admin/registrations')).rejects.toThrow(
        'REDIRECT:/admin'
      )
    })

    it('redirects worker admin from nested customer routes', async () => {
      const mockUser = {
        id: 'admin-1',
        email: 'admin@example.com',
        name: 'Admin',
        role: 'ADMIN',
        adminType: 'WORKER' as const,
      }
      mockSession = { user: mockUser }

      await expect(requireAdminWithTierCheck('/admin/customers/123')).rejects.toThrow(
        'REDIRECT:/admin'
      )
    })
  })

  describe('requireReviewAccess', () => {
    it('returns user when user can review certificate', async () => {
      const mockUser = {
        id: 'reviewer-1',
        email: 'rev@example.com',
        name: 'Reviewer',
        role: 'ADMIN',
      }
      mockSession = { user: mockUser }

      const result = await requireReviewAccess({ reviewerId: 'other' })

      expect(result).toEqual(mockUser)
    })

    it('returns user when user is the assigned reviewer', async () => {
      const mockUser = {
        id: 'reviewer-1',
        email: 'rev@example.com',
        name: 'Reviewer',
        role: 'ENGINEER',
      }
      mockSession = { user: mockUser }

      const result = await requireReviewAccess({ reviewerId: 'reviewer-1' })

      expect(result).toEqual(mockUser)
    })

    it('redirects when user cannot review certificate', async () => {
      const mockUser = {
        id: 'other-1',
        email: 'other@example.com',
        name: 'Other',
        role: 'ENGINEER',
      }
      mockSession = { user: mockUser }

      await expect(requireReviewAccess({ reviewerId: 'reviewer-1' })).rejects.toThrow(
        'REDIRECT:/dashboard'
      )
    })
  })

  describe('requireAssigneeAccess', () => {
    it('returns user when user is admin', async () => {
      const mockUser = { id: 'admin-1', email: 'admin@example.com', name: 'Admin', role: 'ADMIN' }
      mockSession = { user: mockUser }

      const result = await requireAssigneeAccess({ createdById: 'other' })

      expect(result).toEqual(mockUser)
    })

    it('returns user when user is the creator', async () => {
      const mockUser = {
        id: 'creator-1',
        email: 'creator@example.com',
        name: 'Creator',
        role: 'ENGINEER',
      }
      mockSession = { user: mockUser }

      const result = await requireAssigneeAccess({ createdById: 'creator-1' })

      expect(result).toEqual(mockUser)
    })

    it('redirects when user is not creator or admin', async () => {
      const mockUser = {
        id: 'other-1',
        email: 'other@example.com',
        name: 'Other',
        role: 'ENGINEER',
      }
      mockSession = { user: mockUser }

      await expect(requireAssigneeAccess({ createdById: 'creator-1' })).rejects.toThrow(
        'REDIRECT:/dashboard'
      )
    })
  })

  describe('requireCertificateAccess', () => {
    it('returns user when user is admin', async () => {
      const mockUser = { id: 'admin-1', email: 'admin@example.com', name: 'Admin', role: 'ADMIN' }
      mockSession = { user: mockUser }

      const result = await requireCertificateAccess({ createdById: 'other', reviewerId: 'other2' })

      expect(result).toEqual(mockUser)
    })

    it('returns user when user is the creator', async () => {
      const mockUser = {
        id: 'creator-1',
        email: 'creator@example.com',
        name: 'Creator',
        role: 'ENGINEER',
      }
      mockSession = { user: mockUser }

      const result = await requireCertificateAccess({ createdById: 'creator-1', reviewerId: 'other' })

      expect(result).toEqual(mockUser)
    })

    it('returns user when user is the reviewer', async () => {
      const mockUser = {
        id: 'reviewer-1',
        email: 'rev@example.com',
        name: 'Reviewer',
        role: 'ENGINEER',
      }
      mockSession = { user: mockUser }

      const result = await requireCertificateAccess({
        createdById: 'other',
        reviewerId: 'reviewer-1',
      })

      expect(result).toEqual(mockUser)
    })

    it('redirects when user has no access', async () => {
      const mockUser = {
        id: 'other-1',
        email: 'other@example.com',
        name: 'Other',
        role: 'ENGINEER',
      }
      mockSession = { user: mockUser }

      await expect(
        requireCertificateAccess({ createdById: 'creator-1', reviewerId: 'reviewer-1' })
      ).rejects.toThrow('REDIRECT:/dashboard')
    })
  })

  describe('getRoleDisplayName', () => {
    it('returns "Master Admin" for ADMIN with MASTER adminType', () => {
      const user = {
        id: '1',
        email: 'a@b.com',
        name: 'Test',
        role: 'ADMIN',
        adminType: 'MASTER' as const,
      }
      expect(getRoleDisplayName(user)).toBe('Master Admin')
    })

    it('returns "Worker Admin" for ADMIN with WORKER adminType', () => {
      const user = {
        id: '1',
        email: 'a@b.com',
        name: 'Test',
        role: 'ADMIN',
        adminType: 'WORKER' as const,
      }
      expect(getRoleDisplayName(user)).toBe('Worker Admin')
    })

    it('returns "Admin" for ADMIN without adminType', () => {
      const user = { id: '1', email: 'a@b.com', name: 'Test', role: 'ADMIN', adminType: null }
      expect(getRoleDisplayName(user)).toBe('Admin')
    })

    it('returns "Engineer" for ENGINEER role', () => {
      const user = { id: '1', email: 'a@b.com', name: 'Test', role: 'ENGINEER' }
      expect(getRoleDisplayName(user)).toBe('Engineer')
    })

    it('returns "Customer" for CUSTOMER role', () => {
      const user = { id: '1', email: 'a@b.com', name: 'Test', role: 'CUSTOMER' }
      expect(getRoleDisplayName(user)).toBe('Customer')
    })

    it('returns role as-is for unknown roles', () => {
      const user = { id: '1', email: 'a@b.com', name: 'Test', role: 'UNKNOWN' }
      expect(getRoleDisplayName(user)).toBe('UNKNOWN')
    })
  })

  describe('isNewWorkflowEnabled', () => {
    const originalEnv = process.env.FEATURE_NEW_WORKFLOW

    afterEach(() => {
      process.env.FEATURE_NEW_WORKFLOW = originalEnv
    })

    it('returns true when FEATURE_NEW_WORKFLOW is "true"', () => {
      process.env.FEATURE_NEW_WORKFLOW = 'true'
      expect(isNewWorkflowEnabled()).toBe(true)
    })

    it('returns false when FEATURE_NEW_WORKFLOW is "false"', () => {
      process.env.FEATURE_NEW_WORKFLOW = 'false'
      expect(isNewWorkflowEnabled()).toBe(false)
    })

    it('returns false when FEATURE_NEW_WORKFLOW is undefined', () => {
      delete process.env.FEATURE_NEW_WORKFLOW
      expect(isNewWorkflowEnabled()).toBe(false)
    })
  })
})
