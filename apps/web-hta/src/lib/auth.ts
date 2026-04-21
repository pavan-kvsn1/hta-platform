import NextAuth, { NextAuthConfig, NextAuthResult } from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { prisma } from './prisma'
import { REFRESH_TOKEN_CONFIG } from './refresh-token'
import {
  isAccountLocked,
  recordFailedLoginAttempt,
  clearFailedLoginAttempts,
} from './security'
import { verifyTOTP } from '@hta/shared/auth'

// Determine if we're in production
// CI runs on HTTP, so we need non-secure cookies even in production mode
const isProduction = process.env.NODE_ENV === 'production'
const isCI = process.env.CI === 'true'
const useSecureCookies = isProduction && !isCI

// Cookie configuration based on environment
const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  secure: useSecureCookies, // true in production (HTTPS), false in development/CI (HTTP)
}

const authConfig: NextAuthConfig = {
  trustHost: true,  // Required when behind load balancer/proxy
  useSecureCookies, // Secure cookies in production, but not in CI (HTTP)
  cookies: {
    csrfToken: {
      name: useSecureCookies ? '__Host-authjs.csrf-token' : 'authjs.csrf-token',
      options: cookieOptions,
    },
    callbackUrl: {
      name: useSecureCookies ? '__Secure-authjs.callback-url' : 'authjs.callback-url',
      options: cookieOptions,
    },
    sessionToken: {
      name: useSecureCookies ? '__Secure-authjs.session-token' : 'authjs.session-token',
      options: cookieOptions,
    },
  },
  providers: [
    Credentials({
      id: 'staff-credentials',
      name: 'Staff Login',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
        totpCode: { label: '2FA Code', type: 'text' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null
        }

        const email = (credentials.email as string).toLowerCase()
        const accountKey = `staff:${email}`

        // Check if account is locked due to too many failed attempts
        const lockStatus = await isAccountLocked(accountKey)
        if (lockStatus.locked) {
          // Account is locked - don't even check credentials
          return null
        }

        const user = await prisma.user.findFirst({
          where: { email },
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            isAdmin: true,
            adminType: true,
            isActive: true,
            passwordHash: true,
            totpEnabled: true,
            totpSecret: true,
          },
        })

        if (!user || !user.isActive || !user.passwordHash) {
          // Record failed attempt even for non-existent users (prevents enumeration)
          await recordFailedLoginAttempt(accountKey)
          return null
        }

        const isPasswordValid = await bcrypt.compare(
          credentials.password as string,
          user.passwordHash
        )

        if (!isPasswordValid) {
          // Record failed login attempt
          await recordFailedLoginAttempt(accountKey)
          return null
        }

        // Check if 2FA is enabled
        if (user.totpEnabled && user.totpSecret) {
          const totpCode = credentials.totpCode as string | undefined

          if (!totpCode) {
            // Password valid but 2FA required - return with flag
            // The frontend will redirect to 2FA verification page
            return {
              id: user.id,
              email: user.email,
              name: user.name,
              role: user.role,
              isAdmin: user.isAdmin,
              adminType: user.adminType as 'MASTER' | 'WORKER' | null,
              requires2FA: true,
            }
          }

          // Verify TOTP code
          const is2FAValid = verifyTOTP(totpCode, user.totpSecret)
          if (!is2FAValid) {
            // Invalid 2FA code - record as failed attempt
            await recordFailedLoginAttempt(accountKey)
            return null
          }
        }

        // Successful login - clear any failed attempts
        await clearFailedLoginAttempts(accountKey)

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          isAdmin: user.isAdmin,
          adminType: user.adminType as 'MASTER' | 'WORKER' | null,
          requires2FA: false,
        }
      },
    }),
    Credentials({
      id: 'customer-credentials',
      name: 'Customer Login',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null
        }

        const email = (credentials.email as string).toLowerCase()
        const accountKey = `customer:${email}`

        // Check if account is locked due to too many failed attempts
        const lockStatus = await isAccountLocked(accountKey)
        if (lockStatus.locked) {
          // Account is locked - don't even check credentials
          return null
        }

        const customer = await prisma.customerUser.findFirst({
          where: { email },
          include: {
            customerAccount: true,
          },
        })

        if (!customer || !customer.isActive) {
          // Record failed attempt even for non-existent users (prevents enumeration)
          await recordFailedLoginAttempt(accountKey)
          return null
        }

        // If no password hash, account not yet activated
        if (!customer.passwordHash) {
          await recordFailedLoginAttempt(accountKey)
          return null
        }

        const isPasswordValid = await bcrypt.compare(
          credentials.password as string,
          customer.passwordHash
        )

        if (!isPasswordValid) {
          // Record failed login attempt
          await recordFailedLoginAttempt(accountKey)
          return null
        }

        // Successful login - clear any failed attempts
        await clearFailedLoginAttempts(accountKey)

        // Get company name and account ID from customerAccount if available
        const companyName = customer.customerAccount?.companyName || customer.companyName || undefined
        const customerAccountId = customer.customerAccountId || undefined
        // Check if user is the primary POC
        const isPrimaryPoc = customer.customerAccount?.primaryPocId === customer.id

        return {
          id: customer.id,
          email: customer.email,
          name: customer.name,
          role: 'CUSTOMER',
          companyName,
          customerAccountId,
          isPrimaryPoc,
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user) {
        token.id = user.id
        token.role = user.role
        if ('isAdmin' in user) {
          token.isAdmin = user.isAdmin
        }
        if ('adminType' in user) {
          token.adminType = user.adminType
        }
        if ('companyName' in user) {
          token.companyName = user.companyName
        }
        if ('customerAccountId' in user) {
          token.customerAccountId = user.customerAccountId
        }
        if ('isPrimaryPoc' in user) {
          token.isPrimaryPoc = user.isPrimaryPoc
        }
        if ('requires2FA' in user) {
          token.requires2FA = user.requires2FA
        }
      }
      // Allow clearing requires2FA flag after 2FA verification
      if (trigger === 'update' && token.requires2FA) {
        token.requires2FA = false
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        session.user.role = token.role as string
        if (token.isAdmin !== undefined) {
          session.user.isAdmin = token.isAdmin as boolean
        }
        if (token.adminType !== undefined) {
          session.user.adminType = token.adminType as 'MASTER' | 'WORKER' | null
        }
        if (token.companyName) {
          session.user.companyName = token.companyName as string
        }
        if (token.customerAccountId) {
          session.user.customerAccountId = token.customerAccountId as string
        }
        if (token.isPrimaryPoc !== undefined) {
          session.user.isPrimaryPoc = token.isPrimaryPoc as boolean
        }
        if (token.requires2FA !== undefined) {
          session.user.requires2FA = token.requires2FA as boolean
        }
      }
      return session
    },
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  session: {
    strategy: 'jwt',
    // Access token expires in 4 hours (short-lived for security)
    // Refresh token (handled separately) expires in 7 days
    maxAge: REFRESH_TOKEN_CONFIG.accessTokenExpiresInMs / 1000, // 4 hours in seconds
  },
}

const nextAuth: NextAuthResult = NextAuth(authConfig)

export const handlers: NextAuthResult['handlers'] = nextAuth.handlers
export const signIn: NextAuthResult['signIn'] = nextAuth.signIn
export const signOut: NextAuthResult['signOut'] = nextAuth.signOut
export const auth: NextAuthResult['auth'] = nextAuth.auth

// Type extensions are in src/types/next-auth.d.ts

// Helper functions
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12)
}

export async function verifyPassword(
  password: string,
  hashedPassword: string
): Promise<boolean> {
  return bcrypt.compare(password, hashedPassword)
}

// Get current user from session
export async function getCurrentUser() {
  const session = await auth()
  return session?.user || null
}

// Check if user has required role
export function hasRole(user: { role: string } | null, allowedRoles: string[]): boolean {
  if (!user) return false
  return allowedRoles.includes(user.role)
}

// Check if user can access admin features
export function canAccessAdmin(user: { role: string } | null | undefined): boolean {
  if (!user) return false
  return user.role === 'ADMIN'
}

// ====================
// NEW: Admin Tier Helpers
// ====================

// Check if user is a Master Admin
export function isMasterAdmin(user: { role: string; adminType?: string | null } | null | undefined): boolean {
  if (!user) return false
  return user.role === 'ADMIN' && user.adminType === 'MASTER'
}

// Check if user is a Worker Admin
export function isWorkerAdmin(user: { role: string; adminType?: string | null } | null | undefined): boolean {
  if (!user) return false
  return user.role === 'ADMIN' && user.adminType === 'WORKER'
}

// Check if user is any type of Admin
export function isAdmin(user: { role: string } | null | undefined): boolean {
  if (!user) return false
  return user.role === 'ADMIN'
}

// ====================
// NEW: Reviewer Permission Helpers
// ====================

// Check if user can review a specific certificate
export function canReviewCertificate(
  user: { id: string; role: string } | null | undefined,
  certificate: { reviewerId?: string | null }
): boolean {
  if (!user) return false
  // Admins can review any certificate
  if (user.role === 'ADMIN') return true
  // Engineers can review certificates assigned to them
  return certificate.reviewerId === user.id
}

// Check if user is the assignee (creator) of a certificate
export function isAssignee(
  user: { id: string } | null | undefined,
  certificate: { createdById: string }
): boolean {
  if (!user) return false
  return user.id === certificate.createdById
}

// Check if user is the reviewer of a certificate
export function isReviewer(
  user: { id: string } | null | undefined,
  certificate: { reviewerId?: string | null }
): boolean {
  if (!user) return false
  return certificate.reviewerId === user.id
}

// Check if user can access a chat thread
export function canAccessChatThread(
  user: { id: string; role: string } | null | undefined,
  certificate: { createdById: string; reviewerId?: string | null },
  threadType: 'ASSIGNEE_REVIEWER' | 'REVIEWER_CUSTOMER'
): boolean {
  if (!user) return false

  // Admins can access all threads
  if (user.role === 'ADMIN') return true

  if (threadType === 'ASSIGNEE_REVIEWER') {
    // Assignee or Reviewer can access
    return user.id === certificate.createdById || user.id === certificate.reviewerId
  }

  if (threadType === 'REVIEWER_CUSTOMER') {
    // Reviewer or Customer can access
    return user.id === certificate.reviewerId || user.role === 'CUSTOMER'
  }

  return false
}
