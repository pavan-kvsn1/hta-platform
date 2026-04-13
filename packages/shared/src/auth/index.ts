/**
 * @hta/shared - Auth Utilities
 *
 * Core authentication utilities that can be shared across services.
 * Framework-specific auth (NextAuth, etc.) lives in the apps.
 */

import bcrypt from 'bcryptjs'
import { randomBytes } from 'crypto'

const SALT_ROUNDS = 12

/**
 * Hash a password using bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS)
}

/**
 * Verify a password against a hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

/**
 * Generate a secure random token
 */
export function generateToken(length: number = 32): string {
  return randomBytes(length).toString('hex')
}

/**
 * Generate a URL-safe token
 */
export function generateUrlSafeToken(length: number = 32): string {
  return randomBytes(length).toString('base64url')
}

/**
 * Calculate token expiry date
 */
export function calculateExpiry(durationSeconds: number): Date {
  return new Date(Date.now() + durationSeconds * 1000)
}

/**
 * Check if a date is expired
 */
export function isExpired(expiryDate: Date | string | null): boolean {
  if (!expiryDate) return true
  const expiry = typeof expiryDate === 'string' ? new Date(expiryDate) : expiryDate
  return expiry.getTime() < Date.now()
}

/**
 * User roles
 */
export const UserRoles = {
  ENGINEER: 'ENGINEER',
  REVIEWER: 'REVIEWER',
  HOD: 'HOD',
  ADMIN: 'ADMIN',
} as const

export type UserRole = (typeof UserRoles)[keyof typeof UserRoles]

/**
 * Admin types
 */
export const AdminTypes = {
  SUPER: 'SUPER',
  HOD: 'HOD',
} as const

export type AdminType = (typeof AdminTypes)[keyof typeof AdminTypes]

/**
 * Check if a role can perform reviewer actions
 */
export function canReview(role: string): boolean {
  return ['REVIEWER', 'HOD'].includes(role)
}

/**
 * Check if a role can perform admin actions
 */
export function canAdmin(role: string, isAdmin: boolean): boolean {
  return isAdmin || role === 'HOD'
}

/**
 * Password validation
 */
export function validatePassword(password: string): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (password.length < 8) {
    errors.push('Password must be at least 8 characters')
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter')
  }
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter')
  }
  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number')
  }

  return { valid: errors.length === 0, errors }
}
