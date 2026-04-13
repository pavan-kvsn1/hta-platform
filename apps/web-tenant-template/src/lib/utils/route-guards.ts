/**
 * Route Guard Utilities
 *
 * Server-side utilities for protecting routes based on user roles and permissions.
 * Use these in page.tsx files and layouts for authorization checks.
 */

import { redirect } from 'next/navigation'
import { auth, isMasterAdmin, isWorkerAdmin, isAdmin, canReviewCertificate } from '@/lib/auth'

type SessionUser = {
  id: string
  email: string
  name: string
  role: string
  isAdmin?: boolean
  adminType?: 'MASTER' | 'WORKER' | null
  companyName?: string
  customerAccountId?: string
}

/**
 * Require user to be authenticated. Redirects to login if not.
 * Returns the session user if authenticated.
 */
export async function requireAuth(): Promise<SessionUser> {
  const session = await auth()

  if (!session?.user) {
    redirect('/login')
  }

  return session.user
}

/**
 * Require user to be a customer. Redirects to customer login if not.
 * Returns the session user if authenticated as customer.
 */
export async function requireCustomerAuth(): Promise<SessionUser> {
  const session = await auth()

  if (!session?.user) {
    redirect('/customer/login')
  }

  if (session.user.role !== 'CUSTOMER') {
    redirect('/customer/login')
  }

  return session.user
}

/**
 * Require user to be an engineer. Redirects to dashboard if not.
 * Returns the session user if authenticated as engineer.
 */
export async function requireEngineer(): Promise<SessionUser> {
  const user = await requireAuth()

  if (user.role !== 'ENGINEER' && user.role !== 'ADMIN') {
    redirect('/dashboard')
  }

  return user
}

/**
 * Require user to be any type of admin. Redirects to dashboard if not.
 * Returns the session user if authenticated as admin.
 */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireAuth()

  if (!isAdmin(user)) {
    redirect('/dashboard')
  }

  return user
}

/**
 * Require user to be a Master Admin. Redirects to admin dashboard if Worker Admin,
 * or to main dashboard if not admin at all.
 * Returns the session user if authenticated as Master Admin.
 */
export async function requireMasterAdmin(): Promise<SessionUser> {
  const user = await requireAuth()

  if (!isAdmin(user)) {
    redirect('/dashboard')
  }

  if (!isMasterAdmin(user)) {
    // Worker admin trying to access master-only route
    redirect('/admin')
  }

  return user
}

/**
 * Check if current user can access a specific admin route based on tier.
 * Master admins can access all routes.
 * Worker admins are restricted from certain routes.
 *
 * Master-only routes:
 * - /admin/customers/*
 * - /admin/registrations/*
 */
export async function requireAdminWithTierCheck(pathname: string): Promise<SessionUser> {
  const user = await requireAdmin()

  // Master-only routes
  const masterOnlyPatterns = [
    '/admin/customers',
    '/admin/registrations',
  ]

  const isMasterOnlyRoute = masterOnlyPatterns.some(pattern =>
    pathname.startsWith(pattern)
  )

  if (isMasterOnlyRoute && !isMasterAdmin(user)) {
    redirect('/admin')
  }

  return user
}

/**
 * Require user to be able to review a specific certificate.
 * Used for reviewer pages.
 */
export async function requireReviewAccess(
  certificate: { reviewerId?: string | null }
): Promise<SessionUser> {
  const user = await requireAuth()

  if (!canReviewCertificate(user, certificate)) {
    redirect('/dashboard')
  }

  return user
}

/**
 * Require user to be the assignee (creator) of a certificate.
 * Used for certificate editing pages.
 */
export async function requireAssigneeAccess(
  certificate: { createdById: string }
): Promise<SessionUser> {
  const user = await requireAuth()

  // Admins can access any certificate
  if (isAdmin(user)) {
    return user
  }

  // Only the creator can access
  if (certificate.createdById !== user.id) {
    redirect('/dashboard')
  }

  return user
}

/**
 * Require user to be either the assignee or reviewer of a certificate.
 * Used for certificate view pages.
 */
export async function requireCertificateAccess(
  certificate: { createdById: string; reviewerId?: string | null }
): Promise<SessionUser> {
  const user = await requireAuth()

  // Admins can access any certificate
  if (isAdmin(user)) {
    return user
  }

  // Assignee or reviewer can access
  if (certificate.createdById !== user.id && certificate.reviewerId !== user.id) {
    redirect('/dashboard')
  }

  return user
}

/**
 * Get the user's role display name
 */
export function getRoleDisplayName(user: SessionUser): string {
  if (user.role === 'ADMIN') {
    if (user.adminType === 'MASTER') return 'Master Admin'
    if (user.adminType === 'WORKER') return 'Worker Admin'
    return 'Admin'
  }
  if (user.role === 'ENGINEER') return 'Engineer'
  if (user.role === 'CUSTOMER') return 'Customer'
  return user.role
}

/**
 * Check if the new workflow is enabled
 */
export function isNewWorkflowEnabled(): boolean {
  return process.env.FEATURE_NEW_WORKFLOW === 'true'
}
