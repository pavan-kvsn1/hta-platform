/**
 * Authentication Integration Tests
 *
 * Tests authentication flows with real database interactions.
 * Migrated from hta-calibration/tests/integration/api/auth.test.ts
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import bcrypt from 'bcryptjs'
import {
  setupTestDatabase,
  teardownTestDatabase,
  cleanTestDatabase,
  prisma,
} from './setup/test-db'
import {
  createTestUser,
  createEngineerWithAdmin,
  createCustomerAccount,
  createCustomerUser,
  createTestTenant,
  TEST_PASSWORD,
} from './setup/fixtures'

describe('Authentication Integration', () => {
  beforeAll(async () => {
    await setupTestDatabase()
  })

  afterAll(async () => {
    await teardownTestDatabase()
  })

  beforeEach(async () => {
    await cleanTestDatabase()
  })

  describe('User Authentication', () => {
    it('should verify correct password', async () => {
      const password = 'securePassword123'
      const passwordHash = bcrypt.hashSync(password, 10)

      const user = await createTestUser(prisma, {
        email: 'auth-test@example.com',
        passwordHash,
      })

      const isValid = bcrypt.compareSync(password, user.passwordHash!)
      expect(isValid).toBe(true)
    })

    it('should reject incorrect password', async () => {
      const password = 'securePassword123'
      const passwordHash = bcrypt.hashSync(password, 10)

      const user = await createTestUser(prisma, {
        email: 'auth-test@example.com',
        passwordHash,
      })

      const isValid = bcrypt.compareSync('wrongPassword', user.passwordHash!)
      expect(isValid).toBe(false)
    })

    it('should find user by email', async () => {
      await createTestUser(prisma, {
        email: 'findme@example.com',
        name: 'Find Me User',
      })

      const user = await prisma.user.findFirst({
        where: { email: 'findme@example.com' },
      })

      expect(user).toBeDefined()
      expect(user?.name).toBe('Find Me User')
    })

    it('should handle inactive users', async () => {
      await createTestUser(prisma, {
        email: 'inactive@example.com',
        isActive: false,
      })

      const activeUser = await prisma.user.findFirst({
        where: {
          email: 'inactive@example.com',
          isActive: true,
        },
      })

      expect(activeUser).toBeNull()

      // But user exists when not filtering by isActive
      const anyUser = await prisma.user.findFirst({
        where: { email: 'inactive@example.com' },
      })
      expect(anyUser).toBeDefined()
      expect(anyUser?.isActive).toBe(false)
    })

    it('should use default test password from fixtures', async () => {
      const user = await createTestUser(prisma, {
        email: 'default-pass@example.com',
      })

      const isValid = bcrypt.compareSync(TEST_PASSWORD, user.passwordHash!)
      expect(isValid).toBe(true)
    })
  })

  describe('Customer Authentication', () => {
    it('should authenticate customer user', async () => {
      const password = 'customerPass123'
      const passwordHash = bcrypt.hashSync(password, 10)

      const tenant = await createTestTenant(prisma)
      const account = await createCustomerAccount(prisma, tenant.id)
      const customer = await createCustomerUser(prisma, tenant.id, account.id, {
        email: 'customer@company.com',
        passwordHash,
      })

      const isValid = bcrypt.compareSync(password, customer.passwordHash)
      expect(isValid).toBe(true)
    })

    it('should link customer to company account', async () => {
      const tenant = await createTestTenant(prisma)
      const account = await createCustomerAccount(prisma, tenant.id, {
        companyName: 'Test Corp',
      })
      const customer = await createCustomerUser(prisma, tenant.id, account.id)

      const customerWithAccount = await prisma.customerUser.findUnique({
        where: { id: customer.id },
        include: { customerAccount: true },
      })

      expect(customerWithAccount?.customerAccount?.companyName).toBe('Test Corp')
    })
  })

  describe('Role-Based Access', () => {
    it('should identify admin users', async () => {
      const admin = await createTestUser(prisma, {
        role: 'ADMIN',
        isAdmin: true,
      })

      const retrieved = await prisma.user.findUnique({
        where: { id: admin.id },
      })

      expect(retrieved?.role).toBe('ADMIN')
      expect(retrieved?.isAdmin).toBe(true)
    })

    it('should link engineer to assigned admin', async () => {
      const { engineer, admin } = await createEngineerWithAdmin(prisma)

      const engineerWithAdmin = await prisma.user.findUnique({
        where: { id: engineer.id },
        include: { assignedAdmin: true },
      })

      expect(engineerWithAdmin?.assignedAdminId).toBe(admin.id)
      expect(engineerWithAdmin?.assignedAdmin?.role).toBe('ADMIN')
    })

    it('should list engineers under an admin', async () => {
      const tenant = await createTestTenant(prisma)
      const admin = await createTestUser(prisma, {
        name: 'Department Admin',
        role: 'ADMIN',
        isAdmin: true,
        tenantId: tenant.id,
      })

      await createTestUser(prisma, {
        name: 'Engineer 1',
        role: 'ENGINEER',
        assignedAdminId: admin.id,
        tenantId: tenant.id,
      })
      await createTestUser(prisma, {
        name: 'Engineer 2',
        role: 'ENGINEER',
        assignedAdminId: admin.id,
        tenantId: tenant.id,
      })
      await createTestUser(prisma, {
        name: 'Other Engineer',
        role: 'ENGINEER',
        assignedAdminId: null,
        tenantId: tenant.id,
      })

      const adminWithEngineers = await prisma.user.findUnique({
        where: { id: admin.id },
        include: { engineers: true },
      })

      expect(adminWithEngineers?.engineers).toHaveLength(2)
    })
  })

  describe('User Roles', () => {
    it('should support ENGINEER role', async () => {
      const user = await createTestUser(prisma, { role: 'ENGINEER' })
      expect(user.role).toBe('ENGINEER')
    })

    it('should support ADMIN role', async () => {
      const user = await createTestUser(prisma, { role: 'ADMIN', isAdmin: true })
      expect(user.role).toBe('ADMIN')
      expect(user.isAdmin).toBe(true)
    })

    it('should support REVIEWER role', async () => {
      const user = await createTestUser(prisma, { role: 'REVIEWER' })
      expect(user.role).toBe('REVIEWER')
    })
  })
})
