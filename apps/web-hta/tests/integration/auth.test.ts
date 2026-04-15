/**
 * Authentication Integration Tests
 *
 * Tests authentication flows against the real PostgreSQL database.
 * Covers user registration, login, password reset, and 2FA.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { hash, compare } from 'bcryptjs'
import {
  prisma,
  createTestUser,
  createTestCustomerUser,
  createTestAdmin,
  cleanupTestData,
  getTestTenant,
} from './setup/test-helpers'

describe('Authentication Integration Tests', () => {
  beforeEach(async () => {
    await cleanupTestData()
  })

  describe('Staff User Authentication', () => {
    it('should create user with hashed password', async () => {
      const tenant = await getTestTenant()
      const password = 'SecurePassword123!'
      const passwordHash = await hash(password, 10)

      const user = await prisma.user.create({
        data: {
          tenant: { connect: { id: tenant.id } },
          email: 'staff@example.com',
          name: 'Staff User',
          role: 'ENGINEER',
          passwordHash,
          isActive: true,
          authProvider: 'PASSWORD',
        },
      })

      expect(user.passwordHash).not.toBe(password)
      expect(await compare(password, user.passwordHash!)).toBe(true)
    })

    it('should verify password during login', async () => {
      const password = 'TestPassword123!'
      const user = await createTestUser({
        email: 'login-test@example.com',
        password,
      })

      // Fetch user for login
      const dbUser = await prisma.user.findUnique({
        where: { id: user.id },
      })

      expect(dbUser).toBeDefined()
      expect(dbUser!.isActive).toBe(true)
      expect(await compare(password, dbUser!.passwordHash!)).toBe(true)
    })

    it('should reject wrong password', async () => {
      const user = await createTestUser({
        email: 'wrong-pass@example.com',
        password: 'CorrectPassword123!',
      })

      const dbUser = await prisma.user.findUnique({
        where: { id: user.id },
      })

      expect(await compare('WrongPassword123!', dbUser!.passwordHash!)).toBe(false)
    })

    it('should reject inactive users', async () => {
      const user = await createTestUser({
        email: 'inactive@example.com',
        isActive: false,
      })

      const dbUser = await prisma.user.findUnique({
        where: { id: user.id },
      })

      expect(dbUser!.isActive).toBe(false)
    })

    it('should find user by email and tenant', async () => {
      const tenant = await getTestTenant()
      const user = await createTestUser({
        email: 'findme@example.com',
      })

      const found = await prisma.user.findFirst({
        where: {
          tenantId: tenant.id,
          email: 'findme@example.com',
          isActive: true,
        },
      })

      expect(found).toBeDefined()
      expect(found!.id).toBe(user.id)
    })
  })

  describe('Customer User Authentication', () => {
    it('should create customer user with password', async () => {
      const password = 'CustomerPass123!'
      const customer = await createTestCustomerUser({
        email: 'customer@example.com',
        name: 'Customer Name',
        companyName: 'Customer Company',
        password,
      })

      const dbCustomer = await prisma.customerUser.findUnique({
        where: { id: customer.id },
      })

      expect(dbCustomer).toBeDefined()
      expect(await compare(password, dbCustomer!.passwordHash!)).toBe(true)
    })

    it('should enforce unique customer email per tenant', async () => {
      await createTestCustomerUser({
        email: 'duplicate@example.com',
      })

      // Attempt to create duplicate
      const tenant = await getTestTenant()
      await expect(
        prisma.customerUser.create({
          data: {
            tenant: { connect: { id: tenant.id } },
            email: 'duplicate@example.com',
            name: 'Another Customer',
          },
        })
      ).rejects.toThrow()
    })

    it('should activate customer with token', async () => {
      const tenant = await getTestTenant()
      const activationToken = 'activation-token-123'

      const customer = await prisma.customerUser.create({
        data: {
          tenant: { connect: { id: tenant.id } },
          email: 'pending@example.com',
          name: 'Pending Customer',
          isActive: false,
          activationToken,
          activationExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      })

      // Simulate activation
      const activated = await prisma.customerUser.update({
        where: { activationToken },
        data: {
          isActive: true,
          activatedAt: new Date(),
          activationToken: null,
          activationExpiry: null,
        },
      })

      expect(activated.isActive).toBe(true)
      expect(activated.activatedAt).toBeDefined()
      expect(activated.activationToken).toBeNull()
    })
  })

  describe('Password Reset Flow', () => {
    it('should create password reset token', async () => {
      const user = await createTestUser({
        email: 'reset@example.com',
      })

      const resetToken = await prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          token: 'reset-token-123',
          expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
        },
      })

      expect(resetToken.token).toBe('reset-token-123')
      expect(resetToken.expiresAt.getTime()).toBeGreaterThan(Date.now())
    })

    it('should validate reset token', async () => {
      const user = await createTestUser({
        email: 'validate-reset@example.com',
      })

      const token = 'valid-token-123'
      await prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          token,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        },
      })

      const found = await prisma.passwordResetToken.findFirst({
        where: {
          token,
          expiresAt: { gt: new Date() },
        },
        include: { user: true },
      })

      expect(found).toBeDefined()
      expect(found!.user.id).toBe(user.id)
    })

    it('should reject expired reset token', async () => {
      const user = await createTestUser({
        email: 'expired-reset@example.com',
      })

      const token = 'expired-token-123'
      await prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          token,
          expiresAt: new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago
        },
      })

      const found = await prisma.passwordResetToken.findFirst({
        where: {
          token,
          expiresAt: { gt: new Date() },
        },
      })

      expect(found).toBeNull()
    })

    it('should update password and delete token', async () => {
      const user = await createTestUser({
        email: 'update-pass@example.com',
        password: 'OldPassword123!',
      })

      const token = 'update-token-123'
      await prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          token,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        },
      })

      // Simulate password reset
      const newPassword = 'NewPassword456!'
      const newPasswordHash = await hash(newPassword, 10)

      await prisma.$transaction([
        prisma.user.update({
          where: { id: user.id },
          data: { passwordHash: newPasswordHash },
        }),
        prisma.passwordResetToken.deleteMany({
          where: { userId: user.id },
        }),
      ])

      // Verify
      const updatedUser = await prisma.user.findUnique({
        where: { id: user.id },
      })

      const remainingTokens = await prisma.passwordResetToken.findMany({
        where: { userId: user.id },
      })

      expect(await compare(newPassword, updatedUser!.passwordHash!)).toBe(true)
      expect(remainingTokens).toHaveLength(0)
    })
  })

  describe('Two-Factor Authentication', () => {
    it('should enable 2FA for user', async () => {
      const user = await createTestUser({
        email: '2fa@example.com',
      })

      // Simulate 2FA setup
      const totpSecret = 'JBSWY3DPEHPK3PXP' // Example base32 secret

      const updated = await prisma.user.update({
        where: { id: user.id },
        data: {
          totpSecret,
          totpEnabled: true,
          totpVerifiedAt: new Date(),
        },
      })

      expect(updated.totpEnabled).toBe(true)
      expect(updated.totpSecret).toBe(totpSecret)
      expect(updated.totpVerifiedAt).toBeDefined()
    })

    it('should generate and store backup codes', async () => {
      const user = await createTestUser({
        email: 'backup-codes@example.com',
      })

      // Generate hashed backup codes
      const backupCodes = [
        await hash('ABC12345', 10),
        await hash('DEF67890', 10),
        await hash('GHI11111', 10),
      ]

      const updated = await prisma.user.update({
        where: { id: user.id },
        data: {
          backupCodes,
          totpEnabled: true,
        },
      })

      expect(updated.backupCodes).toHaveLength(3)
    })

    it('should disable 2FA', async () => {
      const user = await createTestUser({
        email: 'disable-2fa@example.com',
      })

      // First enable
      await prisma.user.update({
        where: { id: user.id },
        data: {
          totpSecret: 'JBSWY3DPEHPK3PXP',
          totpEnabled: true,
          totpVerifiedAt: new Date(),
          backupCodes: ['hashed1', 'hashed2'],
        },
      })

      // Then disable
      const disabled = await prisma.user.update({
        where: { id: user.id },
        data: {
          totpSecret: null,
          totpEnabled: false,
          totpVerifiedAt: null,
          backupCodes: [],
        },
      })

      expect(disabled.totpEnabled).toBe(false)
      expect(disabled.totpSecret).toBeNull()
      expect(disabled.backupCodes).toHaveLength(0)
    })
  })

  describe('User Roles and Authorization', () => {
    it('should create users with different roles', async () => {
      const engineer = await createTestUser({ role: 'ENGINEER' })
      const hod = await createTestAdmin({ adminType: 'HOD' })
      const superAdmin = await createTestAdmin({ adminType: 'SUPER_ADMIN' })

      expect(engineer.role).toBe('ENGINEER')
      expect(hod.role).toBe('ADMIN')
      expect(superAdmin.role).toBe('ADMIN')

      // Verify admin types
      const hodUser = await prisma.user.findUnique({
        where: { id: hod.id },
      })
      const superAdminUser = await prisma.user.findUnique({
        where: { id: superAdmin.id },
      })

      expect(hodUser!.adminType).toBe('HOD')
      expect(superAdminUser!.adminType).toBe('SUPER_ADMIN')
    })

    it('should assign engineer to admin', async () => {
      const admin = await createTestAdmin({ adminType: 'HOD' })
      const engineer = await createTestUser({ role: 'ENGINEER' })

      // Assign engineer to admin
      const assigned = await prisma.user.update({
        where: { id: engineer.id },
        data: { assignedAdminId: admin.id },
      })

      expect(assigned.assignedAdminId).toBe(admin.id)

      // Verify relationship
      const adminWithEngineers = await prisma.user.findUnique({
        where: { id: admin.id },
        include: { engineers: true },
      })

      expect(adminWithEngineers!.engineers).toHaveLength(1)
      expect(adminWithEngineers!.engineers[0].id).toBe(engineer.id)
    })
  })

  describe('Audit Logging', () => {
    it('should log authentication events', async () => {
      const user = await createTestUser({
        email: 'audit@example.com',
      })

      // Log login event
      const loginLog = await prisma.auditLog.create({
        data: {
          actorId: user.id,
          action: 'LOGIN',
          actorType: 'USER',
          entityType: 'User',
          entityId: user.id,
          changes: JSON.stringify({
            ipAddress: '192.168.1.1',
            userAgent: 'Mozilla/5.0',
          }),
        },
      })

      expect(loginLog.action).toBe('LOGIN')

      // Query audit logs
      const logs = await prisma.auditLog.findMany({
        where: {
          actorId: user.id,
          action: 'LOGIN',
        },
        orderBy: { createdAt: 'desc' },
      })

      expect(logs.length).toBeGreaterThanOrEqual(1)
    })

    it('should log password changes', async () => {
      const user = await createTestUser({
        email: 'pass-change-audit@example.com',
      })

      // Log password change
      await prisma.auditLog.create({
        data: {
          actorId: user.id,
          action: 'PASSWORD_CHANGE',
          actorType: 'USER',
          entityType: 'User',
          entityId: user.id,
          changes: JSON.stringify({
            method: 'reset',
            ipAddress: '192.168.1.1',
          }),
        },
      })

      const logs = await prisma.auditLog.findMany({
        where: {
          actorId: user.id,
          action: 'PASSWORD_CHANGE',
        },
      })

      expect(logs).toHaveLength(1)
    })
  })
})
