import { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '@hta/database'
import { hashPassword, verifyPassword, validatePassword } from '@hta/shared/auth'
import { requireAuth, requireStaff, type JWTPayload, type JWTSignPayload } from '../../middleware/auth.js'
import {
  createRefreshToken,
  validateRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllUserTokens,
  REFRESH_TOKEN_CONFIG,
} from '../../services/refresh-token.js'
import { queuePasswordResetEmail, enqueueNotification } from '../../services/queue.js'

// =============================================================================
// SCHEMAS
// =============================================================================

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
  userType: z.enum(['STAFF', 'CUSTOMER']).default('STAFF'),
})

const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
})

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string().min(1, 'Confirm password is required'),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
})

const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
  userType: z.enum(['STAFF', 'CUSTOMER']).default('STAFF'),
})

const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string().min(1, 'Confirm password is required'),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
})

const activateSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string().min(1, 'Confirm password is required'),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
})

// =============================================================================
// ROUTES
// =============================================================================

const authRoutes: FastifyPluginAsync = async (fastify) => {

  // ---------------------------------------------------------------------------
  // POST /login - Authenticate and get tokens
  // ---------------------------------------------------------------------------
  fastify.post('/login', async (request, reply) => {
    const body = loginSchema.parse(request.body)
    const { email, password, userType } = body
    const normalizedEmail = email.toLowerCase().trim()
    const tenantId = request.tenantId

    let userData: JWTSignPayload
    let userId: string | undefined
    let customerId: string | undefined

    if (userType === 'STAFF') {
      const user = await prisma.user.findFirst({
        where: { tenantId, email: normalizedEmail },
      })

      if (!user || !user.isActive || !user.passwordHash) {
        return reply.status(401).send({ error: 'Invalid credentials' })
      }

      const isValid = await verifyPassword(password, user.passwordHash)
      if (!isValid) {
        return reply.status(401).send({ error: 'Invalid credentials' })
      }

      userId = user.id
      userData = {
        sub: user.id,
        email: user.email,
        name: user.name,
        role: user.role as JWTPayload['role'],
        userType: 'STAFF',
        tenantId,
        isAdmin: user.isAdmin,
        adminType: user.adminType as JWTPayload['adminType'],
      }
    } else {
      const customer = await prisma.customerUser.findFirst({
        where: { tenantId, email: normalizedEmail },
        include: { customerAccount: true },
      })

      if (!customer || !customer.isActive || !customer.passwordHash) {
        return reply.status(401).send({ error: 'Invalid credentials' })
      }

      const isValid = await verifyPassword(password, customer.passwordHash)
      if (!isValid) {
        return reply.status(401).send({ error: 'Invalid credentials' })
      }

      customerId = customer.id
      userData = {
        sub: customer.id,
        email: customer.email,
        name: customer.name,
        role: 'CUSTOMER',
        userType: 'CUSTOMER',
        tenantId,
      }
    }

    // Get request info
    const userAgent = request.headers['user-agent']
    const ipAddress = (request.headers['x-forwarded-for'] as string)?.split(',')[0] ||
      request.ip

    // Create refresh token
    const refreshResult = await createRefreshToken({
      userId,
      customerId,
      userType,
      tenantId,
      userAgent,
      ipAddress,
    })

    // Create access token (JWT)
    const accessToken = fastify.jwt.sign(userData)

    return {
      accessToken,
      refreshToken: refreshResult.refreshToken,
      expiresIn: REFRESH_TOKEN_CONFIG.accessTokenExpiresInMs / 1000,
      refreshExpiresAt: refreshResult.expiresAt.toISOString(),
      user: userData,
    }
  })

  // ---------------------------------------------------------------------------
  // POST /refresh - Refresh access token
  // ---------------------------------------------------------------------------
  fastify.post('/refresh', async (request, reply) => {
    const body = refreshSchema.parse(request.body)
    const { refreshToken } = body

    const validated = await validateRefreshToken(refreshToken)
    if (!validated) {
      return reply.status(401).send({ error: 'Invalid or expired refresh token' })
    }

    // Verify tenant matches
    if (validated.tenantId !== request.tenantId) {
      return reply.status(403).send({ error: 'Token tenant mismatch' })
    }

    // Get user data
    let userData: JWTSignPayload | null = null

    if (validated.userType === 'STAFF' && validated.userId) {
      const user = await prisma.user.findUnique({
        where: { id: validated.userId },
      })

      if (!user || !user.isActive) {
        await revokeRefreshToken(refreshToken, 'USER_DEACTIVATED')
        return reply.status(401).send({ error: 'User account is deactivated' })
      }

      userData = {
        sub: user.id,
        email: user.email,
        name: user.name,
        role: user.role as JWTPayload['role'],
        userType: 'STAFF',
        tenantId: validated.tenantId,
        isAdmin: user.isAdmin,
        adminType: user.adminType as JWTPayload['adminType'],
      }
    } else if (validated.userType === 'CUSTOMER' && validated.customerId) {
      const customer = await prisma.customerUser.findUnique({
        where: { id: validated.customerId },
        include: { customerAccount: true },
      })

      if (!customer || !customer.isActive) {
        await revokeRefreshToken(refreshToken, 'USER_DEACTIVATED')
        return reply.status(401).send({ error: 'Customer account is deactivated' })
      }

      userData = {
        sub: customer.id,
        email: customer.email,
        name: customer.name,
        role: 'CUSTOMER',
        userType: 'CUSTOMER',
        tenantId: validated.tenantId,
      }
    }

    if (!userData) {
      return reply.status(401).send({ error: 'User not found' })
    }

    // Rotate refresh token
    const userAgent = request.headers['user-agent']
    const ipAddress = (request.headers['x-forwarded-for'] as string)?.split(',')[0] ||
      request.ip

    const newRefreshToken = await rotateRefreshToken(refreshToken, {
      userId: validated.userId,
      customerId: validated.customerId,
      userType: validated.userType,
      tenantId: validated.tenantId,
      userAgent,
      ipAddress,
    })

    if (!newRefreshToken) {
      return reply.status(500).send({ error: 'Failed to rotate refresh token' })
    }

    // Create new access token
    const accessToken = fastify.jwt.sign(userData)

    return {
      accessToken,
      refreshToken: newRefreshToken.refreshToken,
      expiresIn: REFRESH_TOKEN_CONFIG.accessTokenExpiresInMs / 1000,
      refreshExpiresAt: newRefreshToken.expiresAt.toISOString(),
    }
  })

  // ---------------------------------------------------------------------------
  // POST /logout - Revoke refresh token
  // ---------------------------------------------------------------------------
  fastify.post('/logout', async (request) => {
    const body = refreshSchema.safeParse(request.body)

    if (body.success && body.data.refreshToken) {
      await revokeRefreshToken(body.data.refreshToken, 'LOGOUT')
    }

    return { success: true }
  })

  // ---------------------------------------------------------------------------
  // POST /logout-all - Revoke all refresh tokens for user
  // ---------------------------------------------------------------------------
  fastify.post('/logout-all', {
    preHandler: [requireAuth],
  }, async (request) => {
    const user = request.user!
    const count = await revokeAllUserTokens(
      user.sub,
      user.userType,
      'LOGOUT_ALL'
    )

    return { success: true, revokedCount: count }
  })

  // ---------------------------------------------------------------------------
  // POST /change-password - Change password (authenticated)
  // ---------------------------------------------------------------------------
  fastify.post('/change-password', {
    preHandler: [requireStaff],
  }, async (request, reply) => {
    const body = changePasswordSchema.parse(request.body)
    const { currentPassword, newPassword } = body
    const user = request.user!

    // Validate new password
    const validation = validatePassword(newPassword)
    if (!validation.valid) {
      return reply.status(400).send({
        error: 'Password does not meet requirements',
        details: validation.errors,
      })
    }

    // Get user with password
    const dbUser = await prisma.user.findUnique({
      where: { id: user.sub },
      select: { id: true, passwordHash: true, email: true, name: true },
    })

    if (!dbUser || !dbUser.passwordHash) {
      return reply.status(404).send({ error: 'User not found' })
    }

    // Verify current password
    const isCurrentValid = await verifyPassword(currentPassword, dbUser.passwordHash)
    if (!isCurrentValid) {
      return reply.status(400).send({ error: 'Current password is incorrect' })
    }

    // Check new password is different
    const isSame = await verifyPassword(newPassword, dbUser.passwordHash)
    if (isSame) {
      return reply.status(400).send({ error: 'New password must be different' })
    }

    // Update password
    const newHash = await hashPassword(newPassword)
    await prisma.user.update({
      where: { id: dbUser.id },
      data: { passwordHash: newHash },
    })

    // Revoke all refresh tokens
    const revokedCount = await revokeAllUserTokens(dbUser.id, 'STAFF', 'PASSWORD_CHANGE')

    // Audit log
    await prisma.auditLog.create({
      data: {
        entityType: 'User',
        entityId: dbUser.id,
        action: 'PASSWORD_CHANGED',
        actorId: dbUser.id,
        actorType: 'USER',
        changes: JSON.stringify({ sessionsRevoked: revokedCount }),
      },
    })

    enqueueNotification({
      type: 'create-notification',
      userId: dbUser.id,
      notificationType: 'PASSWORD_CHANGED',
      data: {},
    }).catch(() => {})

    return {
      success: true,
      message: 'Password changed successfully. Please log in again.',
    }
  })

  // ---------------------------------------------------------------------------
  // POST /forgot-password - Request password reset
  // ---------------------------------------------------------------------------
  fastify.post('/forgot-password', async (request) => {
    const body = forgotPasswordSchema.parse(request.body)
    const { email, userType } = body
    const normalizedEmail = email.toLowerCase().trim()
    const tenantId = request.tenantId

    // Always return success to prevent email enumeration
    const successResponse = {
      success: true,
      message: 'If an account exists, a reset link has been sent.',
    }

    if (userType === 'STAFF') {
      const user = await prisma.user.findFirst({
        where: { tenantId, email: normalizedEmail, isActive: true },
      })

      if (user && user.passwordHash) {
        // Check rate limit (3 per hour)
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
        const recentCount = await prisma.passwordResetToken.count({
          where: { userId: user.id, createdAt: { gte: oneHourAgo } },
        })

        if (recentCount < 3) {
          const token = crypto.randomUUID()
          const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

          await prisma.passwordResetToken.create({
            data: {
              token,
              userId: user.id,
              expiresAt,
            },
          })

          queuePasswordResetEmail({
            to: user.email,
            userName: user.name,
            token,
          }).catch(() => {})
        }
      }
    } else {
      const customer = await prisma.customerUser.findFirst({
        where: { tenantId, email: normalizedEmail, isActive: true },
      })

      if (customer && customer.passwordHash) {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
        const recentCount = await prisma.passwordResetToken.count({
          where: { customerId: customer.id, createdAt: { gte: oneHourAgo } },
        })

        if (recentCount < 3) {
          const token = crypto.randomUUID()
          const expiresAt = new Date(Date.now() + 60 * 60 * 1000)

          await prisma.passwordResetToken.create({
            data: {
              token,
              customerId: customer.id,
              expiresAt,
            },
          })

          queuePasswordResetEmail({
            to: customer.email,
            userName: customer.name,
            token,
            isCustomer: true,
          }).catch(() => {})
        }
      }
    }

    return successResponse
  })

  // ---------------------------------------------------------------------------
  // POST /reset-password - Reset password with token
  // ---------------------------------------------------------------------------
  fastify.post('/reset-password', async (request, reply) => {
    const body = resetPasswordSchema.parse(request.body)
    const { token, newPassword } = body

    // Validate password
    const validation = validatePassword(newPassword)
    if (!validation.valid) {
      return reply.status(400).send({
        error: 'Password does not meet requirements',
        details: validation.errors,
      })
    }

    // Find token
    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { token },
    })

    if (!resetToken) {
      return reply.status(400).send({ error: 'Invalid or expired reset token' })
    }

    if (resetToken.usedAt) {
      return reply.status(400).send({ error: 'Reset token has already been used' })
    }

    if (resetToken.expiresAt < new Date()) {
      return reply.status(400).send({ error: 'Reset token has expired' })
    }

    const newHash = await hashPassword(newPassword)

    if (resetToken.userId) {
      await prisma.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash: newHash },
      })

      await revokeAllUserTokens(resetToken.userId, 'STAFF', 'PASSWORD_RESET')

      enqueueNotification({
        type: 'create-notification',
        userId: resetToken.userId,
        notificationType: 'PASSWORD_CHANGED',
        data: {},
      }).catch(() => {})
    } else if (resetToken.customerId) {
      await prisma.customerUser.update({
        where: { id: resetToken.customerId },
        data: { passwordHash: newHash },
      })

      await revokeAllUserTokens(resetToken.customerId, 'CUSTOMER', 'PASSWORD_RESET')

      enqueueNotification({
        type: 'create-notification',
        customerId: resetToken.customerId,
        notificationType: 'PASSWORD_CHANGED',
        data: {},
      }).catch(() => {})
    }

    // Mark token as used
    await prisma.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { usedAt: new Date() },
    })

    return {
      success: true,
      message: 'Password has been reset. Please log in.',
    }
  })

  // ---------------------------------------------------------------------------
  // GET /me - Get current user info
  // ---------------------------------------------------------------------------
  fastify.get('/me', {
    preHandler: [requireAuth],
  }, async (request) => {
    const user = request.user!

    if (user.userType === 'STAFF') {
      const dbUser = await prisma.user.findUnique({
        where: { id: user.sub },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isAdmin: true,
          adminType: true,
          profileImageUrl: true,
          signatureUrl: true,
        },
      })

      return { user: dbUser }
    } else {
      const customer = await prisma.customerUser.findUnique({
        where: { id: user.sub },
        include: { customerAccount: true },
      })

      return {
        user: {
          id: customer?.id,
          email: customer?.email,
          name: customer?.name,
          role: 'CUSTOMER',
          companyName: customer?.customerAccount?.companyName || customer?.companyName,
          customerAccountId: customer?.customerAccountId,
          isPoc: customer?.isPoc,
        },
      }
    }
  })

  // ---------------------------------------------------------------------------
  // GET /activate?token=xxx - Validate activation token
  // ---------------------------------------------------------------------------
  fastify.get('/activate', async (request, reply) => {
    const query = request.query as { token?: string }
    const token = query.token

    if (!token) {
      return reply.status(400).send({ valid: false, error: 'Token is required' })
    }

    const user = await prisma.user.findUnique({
      where: { activationToken: token },
      select: {
        id: true,
        email: true,
        name: true,
        isActive: true,
        activationExpiry: true,
      },
    })

    if (!user) {
      return { valid: false, error: 'Invalid activation link' }
    }

    if (user.isActive) {
      return { valid: false, error: 'This account has already been activated' }
    }

    if (!user.activationExpiry || new Date() > user.activationExpiry) {
      return { valid: false, error: 'This activation link has expired' }
    }

    return {
      valid: true,
      email: user.email,
      name: user.name,
    }
  })

  // ---------------------------------------------------------------------------
  // POST /activate - Activate staff account with password
  // ---------------------------------------------------------------------------
  fastify.post('/activate', async (request, reply) => {
    const body = activateSchema.parse(request.body)
    const { token, password } = body

    // Validate password
    const validation = validatePassword(password)
    if (!validation.valid) {
      return reply.status(400).send({
        error: 'Password does not meet requirements',
        details: validation.errors,
      })
    }

    // Find user with this activation token
    const user = await prisma.user.findUnique({
      where: { activationToken: token },
    })

    if (!user) {
      return reply.status(400).send({ error: 'Invalid or expired activation link' })
    }

    if (user.isActive) {
      return reply.status(400).send({ error: 'This account has already been activated' })
    }

    if (!user.activationExpiry || new Date() > user.activationExpiry) {
      return reply.status(400).send({
        error: 'This activation link has expired. Please contact your administrator for a new link.',
      })
    }

    // Hash password and activate
    const passwordHash = await hashPassword(password)

    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          isActive: true,
          activatedAt: new Date(),
          activationToken: null,
          activationExpiry: null,
        },
      }),
      prisma.auditLog.create({
        data: {
          entityType: 'User',
          entityId: user.id,
          action: 'ACCOUNT_ACTIVATED',
          actorId: user.id,
          actorType: 'USER',
          changes: JSON.stringify({ event: 'account_activated_via_email' }),
        },
      }),
    ])

    return {
      success: true,
      message: 'Your account has been activated. You can now log in.',
    }
  })
}

export default authRoutes
