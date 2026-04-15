/**
 * Customer Portal API Integration Tests
 *
 * Tests customer-facing functionality with real database interactions.
 * Migrated from hta-calibration/tests/integration/api/customer.test.ts
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import {
  setupTestDatabase,
  teardownTestDatabase,
  cleanTestDatabase,
  prisma,
} from './setup/test-db'
import {
  createEngineerWithAdmin,
  createCustomerAccount,
  createCustomerUser,
  createTestCertificate,
  createTestTenant,
} from './setup/fixtures'

describe('Customer Portal API Integration', () => {
  beforeAll(async () => {
    await setupTestDatabase()
  })

  afterAll(async () => {
    await teardownTestDatabase()
  })

  beforeEach(async () => {
    await cleanTestDatabase()
  })

  describe('Customer Dashboard', () => {
    it('should retrieve pending certificates for customer', async () => {
      const { engineer, tenantId } = await createEngineerWithAdmin(prisma)
      const account = await createCustomerAccount(prisma, tenantId, {
        companyName: 'Test Company',
      })
      await createCustomerUser(prisma, tenantId, account.id)

      // Create certificate for this customer's company
      await prisma.certificate.create({
        data: {
          certificateNumber: 'HTA/PENDING/001',
          customerName: 'Test Company',
          status: 'PENDING_CUSTOMER_APPROVAL',
          createdById: engineer.id,
          lastModifiedById: engineer.id,
          tenantId,
        },
      })

      const pendingCerts = await prisma.certificate.findMany({
        where: {
          status: 'PENDING_CUSTOMER_APPROVAL',
        },
      })

      expect(pendingCerts.length).toBeGreaterThanOrEqual(1)
    })

    it('should retrieve authorized certificates for customer', async () => {
      const { engineer, tenantId } = await createEngineerWithAdmin(prisma)
      const companyName = 'Authorized Test Company'

      // Create authorized certificates
      await prisma.certificate.create({
        data: {
          certificateNumber: 'HTA/AUTH/001',
          customerName: companyName,
          status: 'AUTHORIZED',
          signedPdfPath: '/signed/001.pdf',
          createdById: engineer.id,
          lastModifiedById: engineer.id,
          tenantId,
        },
      })

      await prisma.certificate.create({
        data: {
          certificateNumber: 'HTA/AUTH/002',
          customerName: companyName,
          status: 'AUTHORIZED',
          signedPdfPath: '/signed/002.pdf',
          createdById: engineer.id,
          lastModifiedById: engineer.id,
          tenantId,
        },
      })

      const authorized = await prisma.certificate.findMany({
        where: {
          status: 'AUTHORIZED',
          customerName: companyName,
        },
      })

      expect(authorized).toHaveLength(2)
    })

    it('should count certificates by status for dashboard', async () => {
      const { engineer, tenantId } = await createEngineerWithAdmin(prisma)
      const companyName = 'Dashboard Stats Company'

      // Create certificates in various statuses
      await prisma.certificate.create({
        data: {
          certificateNumber: 'HTA/D/001',
          customerName: companyName,
          status: 'PENDING_CUSTOMER_APPROVAL',
          createdById: engineer.id,
          lastModifiedById: engineer.id,
          tenantId,
        },
      })

      await prisma.certificate.create({
        data: {
          certificateNumber: 'HTA/D/002',
          customerName: companyName,
          status: 'PENDING_ADMIN_AUTHORIZATION',
          createdById: engineer.id,
          lastModifiedById: engineer.id,
          tenantId,
        },
      })

      await prisma.certificate.create({
        data: {
          certificateNumber: 'HTA/D/003',
          customerName: companyName,
          status: 'AUTHORIZED',
          createdById: engineer.id,
          lastModifiedById: engineer.id,
          tenantId,
        },
      })

      const counts = {
        pending: await prisma.certificate.count({
          where: { customerName: companyName, status: 'PENDING_CUSTOMER_APPROVAL' },
        }),
        completed: await prisma.certificate.count({
          where: { customerName: companyName, status: 'PENDING_ADMIN_AUTHORIZATION' },
        }),
        authorized: await prisma.certificate.count({
          where: { customerName: companyName, status: 'AUTHORIZED' },
        }),
      }

      expect(counts.pending).toBe(1)
      expect(counts.completed).toBe(1)
      expect(counts.authorized).toBe(1)
    })
  })

  describe('Customer Certificate Review', () => {
    it('should allow customer to approve certificate', async () => {
      const { engineer, tenantId } = await createEngineerWithAdmin(prisma)
      const cert = await createTestCertificate(prisma, tenantId, engineer.id, {
        status: 'PENDING_CUSTOMER_APPROVAL',
      })

      // Simulate customer approval - update status
      const approved = await prisma.certificate.update({
        where: { id: cert.id },
        data: { status: 'APPROVED' },
      })

      expect(approved.status).toBe('APPROVED')
    })

    it('should allow customer to request revision', async () => {
      const { engineer, tenantId } = await createEngineerWithAdmin(prisma)
      const cert = await createTestCertificate(prisma, tenantId, engineer.id, {
        status: 'PENDING_CUSTOMER_APPROVAL',
      })

      // Simulate customer revision request
      const revised = await prisma.certificate.update({
        where: { id: cert.id },
        data: { status: 'CUSTOMER_REVISION_REQUIRED' },
      })

      expect(revised.status).toBe('CUSTOMER_REVISION_REQUIRED')
    })
  })

  describe('Customer Account Management', () => {
    it('should create customer account with company details', async () => {
      const tenant = await createTestTenant(prisma)
      const account = await createCustomerAccount(prisma, tenant.id, {
        companyName: 'New Customer Corp',
        address: '456 Business Ave, Suite 100',
        contactEmail: 'contact@newcustomer.com',
      })

      expect(account).toBeDefined()
      expect(account.companyName).toBe('New Customer Corp')
      expect(account.address).toBe('456 Business Ave, Suite 100')
    })

    it('should associate customer users with account', async () => {
      const tenant = await createTestTenant(prisma)
      const account = await createCustomerAccount(prisma, tenant.id)
      const user1 = await createCustomerUser(prisma, tenant.id, account.id, { name: 'User One' })
      const user2 = await createCustomerUser(prisma, tenant.id, account.id, { name: 'User Two' })

      const accountWithUsers = await prisma.customerAccount.findUnique({
        where: { id: account.id },
        include: { customerUsers: true },
      })

      expect(accountWithUsers?.customerUsers).toHaveLength(2)
      expect(accountWithUsers?.customerUsers.map(u => u.name)).toContain('User One')
      expect(accountWithUsers?.customerUsers.map(u => u.name)).toContain('User Two')
    })

    it('should link customer account to admin', async () => {
      const { admin, tenantId } = await createEngineerWithAdmin(prisma)
      const account = await createCustomerAccount(prisma, tenantId, {
        assignedAdminId: admin.id,
      })

      const accountWithAdmin = await prisma.customerAccount.findUnique({
        where: { id: account.id },
        include: { assignedAdmin: true },
      })

      expect(accountWithAdmin?.assignedAdminId).toBe(admin.id)
      expect(accountWithAdmin?.assignedAdmin?.role).toBe('ADMIN')
    })
  })

  describe('Customer Team Management', () => {
    it('should list team members', async () => {
      const tenant = await createTestTenant(prisma)
      const account = await createCustomerAccount(prisma, tenant.id, {
        companyName: 'Team Company',
      })

      await createCustomerUser(prisma, tenant.id, account.id, { name: 'Member 1' })
      await createCustomerUser(prisma, tenant.id, account.id, { name: 'Member 2' })
      await createCustomerUser(prisma, tenant.id, account.id, { name: 'Member 3' })

      const team = await prisma.customerUser.findMany({
        where: { customerAccountId: account.id },
      })

      expect(team).toHaveLength(3)
    })

    it('should find customer user by email', async () => {
      const tenant = await createTestTenant(prisma)
      const account = await createCustomerAccount(prisma, tenant.id)
      await createCustomerUser(prisma, tenant.id, account.id, {
        email: 'specific@customer.com',
        name: 'Specific User',
      })

      const user = await prisma.customerUser.findUnique({
        where: { email: 'specific@customer.com' },
      })

      expect(user).toBeDefined()
      expect(user?.name).toBe('Specific User')
    })
  })

  describe('Traceability Data', () => {
    it('should retrieve master instruments used in customer certificates', async () => {
      const { engineer, tenantId } = await createEngineerWithAdmin(prisma)
      const companyName = 'Traceability Company'

      const cert = await prisma.certificate.create({
        data: {
          certificateNumber: 'HTA/TRACE/001',
          customerName: companyName,
          status: 'AUTHORIZED',
          createdById: engineer.id,
          lastModifiedById: engineer.id,
          tenantId,
        },
      })

      // Create master instrument link
      await prisma.certificateMasterInstrument.create({
        data: {
          masterInstrumentId: 'MI-001',
          certificateId: cert.id,
          description: 'Reference Multimeter',
          serialNumber: 'SN12345',
          category: 'Electro-Technical',
          sopReference: 'SOP/CAL/001',
        },
      })

      const instruments = await prisma.certificateMasterInstrument.findMany({
        where: { certificateId: cert.id },
      })

      expect(instruments).toHaveLength(1)
      expect(instruments[0].description).toBe('Reference Multimeter')
    })
  })

  describe('Certificate Download', () => {
    it('should create download token for authorized certificate', async () => {
      const { engineer, tenantId } = await createEngineerWithAdmin(prisma)
      const cert = await createTestCertificate(prisma, tenantId, engineer.id, {
        status: 'AUTHORIZED',
      })

      const token = await prisma.downloadToken.create({
        data: {
          token: 'download-token-123',
          certificateId: cert.id,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
        },
      })

      expect(token).toBeDefined()
      expect(token.token).toBe('download-token-123')
    })

    it('should find valid download token', async () => {
      const { engineer, tenantId } = await createEngineerWithAdmin(prisma)
      const cert = await createTestCertificate(prisma, tenantId, engineer.id, {
        status: 'AUTHORIZED',
      })

      await prisma.downloadToken.create({
        data: {
          token: 'valid-download-token',
          certificateId: cert.id,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      })

      const token = await prisma.downloadToken.findUnique({
        where: { token: 'valid-download-token' },
        include: { certificate: true },
      })

      expect(token).toBeDefined()
      expect(token?.certificate.id).toBe(cert.id)
    })
  })
})
