/**
 * Customer Portal Integration Tests
 *
 * Tests customer-facing functionality against the real PostgreSQL database.
 * Covers registration, certificate access, approval workflow, and notifications.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { hash } from 'bcryptjs'
import {
  prisma,
  createTestUser,
  createTestAdmin,
  createTestCustomerUser,
  createTestCustomerAccount,
  createTestCertificate,
  cleanupTestData,
  getTestTenant,
} from './setup/test-helpers'

describe('Customer Portal Integration Tests', () => {
  beforeEach(async () => {
    await cleanupTestData()
  })

  describe('Customer Registration', () => {
    it('should create pending registration request', async () => {
      const account = await createTestCustomerAccount({
        companyName: 'Test Company Ltd',
      })

      const registration = await prisma.customerRegistration.create({
        data: {
          email: 'newuser@testcompany.com',
          name: 'New User',
          passwordHash: await hash('Password123!', 10),
          customerAccountId: account.id,
          status: 'PENDING',
        },
      })

      expect(registration.status).toBe('PENDING')
      expect(registration.email).toBe('newuser@testcompany.com')
      expect(registration.reviewedById).toBeNull()
    })

    it('should approve registration and create customer user', async () => {
      const admin = await createTestAdmin()
      const account = await createTestCustomerAccount()

      const registration = await prisma.customerRegistration.create({
        data: {
          email: 'approved@testcompany.com',
          name: 'Approved User',
          passwordHash: await hash('Password123!', 10),
          customerAccountId: account.id,
          status: 'PENDING',
        },
      })

      // Simulate approval
      const tenant = await getTestTenant()

      // Create customer user
      const customerUser = await prisma.customerUser.create({
        data: {
          tenant: { connect: { id: tenant.id } },
          email: registration.email,
          name: registration.name,
          passwordHash: registration.passwordHash,
          customerAccount: { connect: { id: account.id } },
          isActive: true,
          activatedAt: new Date(),
        },
      })

      // Update registration status
      const approved = await prisma.customerRegistration.update({
        where: { id: registration.id },
        data: {
          status: 'APPROVED',
          reviewedById: admin.id,
          reviewedAt: new Date(),
        },
      })

      expect(approved.status).toBe('APPROVED')
      expect(approved.reviewedById).toBe(admin.id)
      expect(customerUser.isActive).toBe(true)
    })

    it('should reject registration with reason', async () => {
      const admin = await createTestAdmin()
      const account = await createTestCustomerAccount()

      const registration = await prisma.customerRegistration.create({
        data: {
          email: 'rejected@testcompany.com',
          name: 'Rejected User',
          passwordHash: await hash('Password123!', 10),
          customerAccountId: account.id,
          status: 'PENDING',
        },
      })

      // Reject registration
      const rejected = await prisma.customerRegistration.update({
        where: { id: registration.id },
        data: {
          status: 'REJECTED',
          reviewedById: admin.id,
          reviewedAt: new Date(),
          rejectionReason: 'Email domain not recognized',
        },
      })

      expect(rejected.status).toBe('REJECTED')
      expect(rejected.rejectionReason).toBe('Email domain not recognized')
    })
  })

  describe('Customer Account Management', () => {
    it('should assign admin to customer account', async () => {
      const admin = await createTestAdmin({ adminType: 'HOD' })
      const account = await createTestCustomerAccount()

      const updated = await prisma.customerAccount.update({
        where: { id: account.id },
        data: { assignedAdminId: admin.id },
      })

      expect(updated.assignedAdminId).toBe(admin.id)
    })

    it('should set primary POC for account', async () => {
      const account = await createTestCustomerAccount()
      const customer = await createTestCustomerUser({
        customerAccountId: account.id,
      })

      // Set as primary POC
      const updated = await prisma.customerAccount.update({
        where: { id: account.id },
        data: { primaryPocId: customer.id },
      })

      // Also update customer user
      await prisma.customerUser.update({
        where: { id: customer.id },
        data: { isPoc: true },
      })

      const accountWithPoc = await prisma.customerAccount.findUnique({
        where: { id: account.id },
        include: { primaryPoc: true },
      })

      expect(accountWithPoc!.primaryPocId).toBe(customer.id)
      expect(accountWithPoc!.primaryPoc!.isPoc).toBe(true)
    })

    it('should list all users in customer account', async () => {
      const account = await createTestCustomerAccount()

      // Create multiple users for the account
      await createTestCustomerUser({
        email: 'user1@account.com',
        customerAccountId: account.id,
      })
      await createTestCustomerUser({
        email: 'user2@account.com',
        customerAccountId: account.id,
      })
      await createTestCustomerUser({
        email: 'user3@account.com',
        customerAccountId: account.id,
      })

      const accountWithUsers = await prisma.customerAccount.findUnique({
        where: { id: account.id },
        include: { users: true },
      })

      expect(accountWithUsers!.users).toHaveLength(3)
    })
  })

  describe('Certificate Access for Customers', () => {
    it('should list certificates for customer company', async () => {
      const engineer = await createTestUser()
      const account = await createTestCustomerAccount({
        companyName: 'Customer Corp',
      })
      const customer = await createTestCustomerUser({
        customerAccountId: account.id,
      })

      // Create certificates for the customer
      await createTestCertificate({
        customerName: 'Customer Corp',
        status: 'APPROVED',
        createdById: engineer.id,
      })
      await createTestCertificate({
        customerName: 'Customer Corp',
        status: 'APPROVED',
        createdById: engineer.id,
      })
      await createTestCertificate({
        customerName: 'Other Company',
        status: 'APPROVED',
        createdById: engineer.id,
      })

      // Query certificates for customer
      const customerCerts = await prisma.certificate.findMany({
        where: {
          customerName: 'Customer Corp',
          status: 'APPROVED',
        },
      })

      expect(customerCerts).toHaveLength(2)
    })

    it('should generate download token for certificate', async () => {
      const admin = await createTestAdmin()
      const certificate = await createTestCertificate({ status: 'APPROVED' })

      const downloadToken = await prisma.downloadToken.create({
        data: {
          certificate: { connect: { id: certificate.id } },
          token: `download-${Date.now()}`,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
          sentBy: { connect: { id: admin.id } },
          customerEmail: 'customer@example.com',
          customerName: 'Customer Name',
        },
      })

      expect(downloadToken.token).toBeDefined()
      expect(downloadToken.expiresAt.getTime()).toBeGreaterThan(Date.now())
    })

    it('should validate download token', async () => {
      const admin = await createTestAdmin()
      const certificate = await createTestCertificate({ status: 'APPROVED' })
      const token = `valid-token-${Date.now()}`

      await prisma.downloadToken.create({
        data: {
          certificate: { connect: { id: certificate.id } },
          token,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          sentBy: { connect: { id: admin.id } },
          customerEmail: 'customer@example.com',
          customerName: 'Customer Name',
        },
      })

      // Validate token
      const valid = await prisma.downloadToken.findFirst({
        where: {
          token,
          expiresAt: { gt: new Date() },
        },
        include: { certificate: true },
      })

      expect(valid).toBeDefined()
      expect(valid!.certificate.id).toBe(certificate.id)
    })

    it('should reject expired download token', async () => {
      const admin = await createTestAdmin()
      const certificate = await createTestCertificate({ status: 'APPROVED' })
      const token = `expired-token-${Date.now()}`

      await prisma.downloadToken.create({
        data: {
          certificate: { connect: { id: certificate.id } },
          token,
          expiresAt: new Date(Date.now() - 60 * 60 * 1000), // Expired 1 hour ago
          sentBy: { connect: { id: admin.id } },
          customerEmail: 'customer@example.com',
          customerName: 'Customer Name',
        },
      })

      const expired = await prisma.downloadToken.findFirst({
        where: {
          token,
          expiresAt: { gt: new Date() },
        },
      })

      expect(expired).toBeNull()
    })
  })

  describe('Customer Approval Workflow', () => {
    it('should create approval token for customer signature', async () => {
      const customer = await createTestCustomerUser()
      const certificate = await createTestCertificate({ status: 'PENDING_CUSTOMER' })

      const approvalToken = await prisma.approvalToken.create({
        data: {
          certificate: { connect: { id: certificate.id } },
          customer: { connect: { id: customer.id } },
          token: `approval-${Date.now()}`,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        },
      })

      expect(approvalToken.token).toBeDefined()
      expect(approvalToken.customerId).toBe(customer.id)
    })

    it('should record customer signature', async () => {
      const customer = await createTestCustomerUser()
      const certificate = await createTestCertificate({ status: 'PENDING_CUSTOMER' })

      // Create signature
      const signature = await prisma.signature.create({
        data: {
          certificate: { connect: { id: certificate.id } },
          customer: { connect: { id: customer.id } },
          signerType: 'CUSTOMER',
          signerName: customer.name,
          signerEmail: customer.email,
          signatureData: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg...',
          signedAt: new Date(),
        },
      })

      // Update certificate status
      const approved = await prisma.certificate.update({
        where: { id: certificate.id },
        data: { status: 'CUSTOMER_SIGNED' },
      })

      expect(signature.signerType).toBe('CUSTOMER')
      expect(signature.signerName).toBe(customer.name)
      expect(approved.status).toBe('CUSTOMER_SIGNED')
    })

    it('should track all signatures for certificate', async () => {
      const engineer = await createTestUser({ role: 'ENGINEER' })
      const reviewer = await createTestAdmin({ adminType: 'HOD' })
      const customer = await createTestCustomerUser()
      const certificate = await createTestCertificate()

      // Create all signatures
      await prisma.signature.createMany({
        data: [
          {
            certificateId: certificate.id,
            signerId: engineer.id,
            signerType: 'ASSIGNEE',
            signerName: engineer.name,
            signerEmail: engineer.email,
            signatureData: 'data:image/png;base64,engineer...',
            signedAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
          },
          {
            certificateId: certificate.id,
            signerId: reviewer.id,
            signerType: 'REVIEWER',
            signerName: reviewer.name,
            signerEmail: reviewer.email,
            signatureData: 'data:image/png;base64,reviewer...',
            signedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
          },
          {
            certificateId: certificate.id,
            customerId: customer.id,
            signerType: 'CUSTOMER',
            signerName: customer.name,
            signerEmail: customer.email,
            signatureData: 'data:image/png;base64,customer...',
            signedAt: new Date(),
          },
        ],
      })

      const signatures = await prisma.signature.findMany({
        where: { certificateId: certificate.id },
        orderBy: { signedAt: 'asc' },
      })

      expect(signatures).toHaveLength(3)
      expect(signatures[0].signerType).toBe('ASSIGNEE')
      expect(signatures[1].signerType).toBe('REVIEWER')
      expect(signatures[2].signerType).toBe('CUSTOMER')
    })
  })

  describe('Customer Requests', () => {
    it('should create user addition request', async () => {
      const customer = await createTestCustomerUser()
      const account = await createTestCustomerAccount()

      await prisma.customerUser.update({
        where: { id: customer.id },
        data: { customerAccount: { connect: { id: account.id } } },
      })

      const request = await prisma.customerRequest.create({
        data: {
          customerAccount: { connect: { id: account.id } },
          requestedBy: { connect: { id: customer.id } },
          type: 'USER_ADDITION',
          status: 'PENDING',
          data: JSON.stringify({
            email: 'newuser@company.com',
            name: 'New User',
            requestedDate: new Date().toISOString(),
          }),
        },
      })

      expect(request.type).toBe('USER_ADDITION')
      expect(request.status).toBe('PENDING')
    })

    it('should assign request to admin for review', async () => {
      const admin = await createTestAdmin()
      const customer = await createTestCustomerUser()
      const account = await createTestCustomerAccount()

      const request = await prisma.customerRequest.create({
        data: {
          customerAccount: { connect: { id: account.id } },
          requestedBy: { connect: { id: customer.id } },
          type: 'POC_CHANGE',
          status: 'PENDING',
          data: JSON.stringify({ newPocEmail: 'newpoc@company.com' }),
        },
      })

      // Assign to admin
      const assigned = await prisma.customerRequest.update({
        where: { id: request.id },
        data: {
          reviewedBy: { connect: { id: admin.id } },
        },
      })

      expect(assigned.reviewedById).toBe(admin.id)
    })

    it('should approve customer request', async () => {
      const admin = await createTestAdmin()
      const customer = await createTestCustomerUser()
      const account = await createTestCustomerAccount()

      const request = await prisma.customerRequest.create({
        data: {
          customerAccount: { connect: { id: account.id } },
          requestedBy: { connect: { id: customer.id } },
          type: 'USER_ADDITION',
          status: 'PENDING',
          data: JSON.stringify({ email: 'user@company.com' }),
        },
      })

      // Approve the request
      const approved = await prisma.customerRequest.update({
        where: { id: request.id },
        data: {
          status: 'APPROVED',
          reviewedAt: new Date(),
          reviewedBy: { connect: { id: admin.id } },
        },
      })

      expect(approved.status).toBe('APPROVED')
      expect(approved.reviewedById).toBe(admin.id)
    })
  })

  describe('Customer Notifications', () => {
    it('should create notification for customer user', async () => {
      const customer = await createTestCustomerUser()

      const notification = await prisma.notification.create({
        data: {
          customer: { connect: { id: customer.id } },
          type: 'CERTIFICATE_READY',
          title: 'Certificate Ready for Download',
          message: 'Your calibration certificate HTA-001 is ready.',
          read: false,
        },
      })

      expect(notification.customerId).toBe(customer.id)
      expect(notification.read).toBe(false)
    })

    it('should mark notifications as read', async () => {
      const customer = await createTestCustomerUser()

      // Create multiple notifications
      await prisma.notification.createMany({
        data: [
          {
            customerId: customer.id,
            type: 'INFO',
            title: 'Notification 1',
            message: 'Message 1',
            read: false,
          },
          {
            customerId: customer.id,
            type: 'INFO',
            title: 'Notification 2',
            message: 'Message 2',
            read: false,
          },
        ],
      })

      // Mark all as read
      await prisma.notification.updateMany({
        where: {
          customerId: customer.id,
          read: false,
        },
        data: { read: true },
      })

      const unread = await prisma.notification.count({
        where: {
          customerId: customer.id,
          read: false,
        },
      })

      expect(unread).toBe(0)
    })
  })
})
