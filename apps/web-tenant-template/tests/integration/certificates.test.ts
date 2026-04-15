/**
 * Certificate API Integration Tests
 *
 * Tests certificate operations against the real PostgreSQL database.
 * Covers CRUD operations, status transitions, and authorization.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  prisma,
  createTestUser,
  createTestAdmin,
  createTestCertificate,
  createTestCustomerAccount,
  cleanupTestData,
  getTestTenant,
} from './setup/test-helpers'

describe('Certificate Integration Tests', () => {
  beforeEach(async () => {
    await cleanupTestData()
  })

  describe('Certificate CRUD Operations', () => {
    it('should create a certificate with all required fields', async () => {
      const user = await createTestUser({ role: 'ENGINEER' })

      const certificate = await prisma.certificate.create({
        data: {
          tenant: { connect: { id: user.tenantId } },
          certificateNumber: 'HTA-2024-001',
          status: 'DRAFT',
          customerName: 'Test Customer Inc',
          customerAddress: '123 Test Street',
          uucDescription: 'Digital Multimeter',
          uucMake: 'Fluke',
          uucModel: '87V',
          uucSerialNumber: 'SN123456',
          createdBy: { connect: { id: user.id } },
          lastModifiedBy: { connect: { id: user.id } },
        },
      })

      expect(certificate).toBeDefined()
      expect(certificate.certificateNumber).toBe('HTA-2024-001')
      expect(certificate.status).toBe('DRAFT')
      expect(certificate.customerName).toBe('Test Customer Inc')
      expect(certificate.createdById).toBe(user.id)
    })

    it('should enforce unique certificate numbers within tenant', async () => {
      const user = await createTestUser()

      await createTestCertificate({
        certificateNumber: 'HTA-UNIQUE-001',
        createdById: user.id,
      })

      // Attempt to create duplicate
      await expect(
        prisma.certificate.create({
          data: {
            tenant: { connect: { id: user.tenantId } },
            certificateNumber: 'HTA-UNIQUE-001',
            status: 'DRAFT',
            createdBy: { connect: { id: user.id } },
            lastModifiedBy: { connect: { id: user.id } },
          },
        })
      ).rejects.toThrow()
    })

    it('should update certificate status', async () => {
      const certificate = await createTestCertificate({ status: 'DRAFT' })

      const updated = await prisma.certificate.update({
        where: { id: certificate.id },
        data: { status: 'PENDING_REVIEW' },
      })

      expect(updated.status).toBe('PENDING_REVIEW')
    })

    it('should soft-delete certificate by changing status', async () => {
      const certificate = await createTestCertificate({ status: 'DRAFT' })

      await prisma.certificate.update({
        where: { id: certificate.id },
        data: { status: 'DELETED' },
      })

      const found = await prisma.certificate.findFirst({
        where: {
          id: certificate.id,
          status: { not: 'DELETED' },
        },
      })

      expect(found).toBeNull()
    })
  })

  describe('Certificate Status Transitions', () => {
    it('should track status changes via modifiedById', async () => {
      const engineer = await createTestUser({ role: 'ENGINEER' })
      const reviewer = await createTestAdmin({ adminType: 'HOD' })

      const certificate = await createTestCertificate({
        status: 'DRAFT',
        createdById: engineer.id,
      })

      // Simulate submission
      const submitted = await prisma.certificate.update({
        where: { id: certificate.id },
        data: {
          status: 'PENDING_REVIEW',
          lastModifiedBy: { connect: { id: engineer.id } },
        },
      })

      expect(submitted.status).toBe('PENDING_REVIEW')
      expect(submitted.lastModifiedById).toBe(engineer.id)

      // Simulate review approval
      const approved = await prisma.certificate.update({
        where: { id: certificate.id },
        data: {
          status: 'APPROVED',
          lastModifiedBy: { connect: { id: reviewer.id } },
          reviewer: { connect: { id: reviewer.id } },
        },
      })

      expect(approved.status).toBe('APPROVED')
      expect(approved.lastModifiedById).toBe(reviewer.id)
      expect(approved.reviewerId).toBe(reviewer.id)
    })

    it('should handle rejection workflow', async () => {
      const engineer = await createTestUser({ role: 'ENGINEER' })
      const reviewer = await createTestAdmin({ adminType: 'HOD' })

      const certificate = await createTestCertificate({
        status: 'PENDING_REVIEW',
        createdById: engineer.id,
      })

      // Reject with feedback
      const rejected = await prisma.certificate.update({
        where: { id: certificate.id },
        data: {
          status: 'CHANGES_REQUIRED',
          lastModifiedBy: { connect: { id: reviewer.id } },
        },
      })

      expect(rejected.status).toBe('CHANGES_REQUIRED')

      // Create feedback record
      const feedback = await prisma.reviewFeedback.create({
        data: {
          certificateId: certificate.id,
          userId: reviewer.id,
          revisionNumber: 1,
          feedbackType: 'REVISION_REQUIRED',
          comment: 'Please correct the measurement values',
        },
      })

      expect(feedback.comment).toBe('Please correct the measurement values')
      expect(feedback.feedbackType).toBe('REVISION_REQUIRED')
    })
  })

  describe('Certificate Queries', () => {
    it('should filter certificates by status', async () => {
      const user = await createTestUser()

      await createTestCertificate({ status: 'DRAFT', createdById: user.id })
      await createTestCertificate({ status: 'DRAFT', createdById: user.id })
      await createTestCertificate({ status: 'APPROVED', createdById: user.id })

      const draftCerts = await prisma.certificate.findMany({
        where: {
          tenantId: user.tenantId,
          status: 'DRAFT',
        },
      })

      expect(draftCerts).toHaveLength(2)
    })

    it('should filter certificates by customer', async () => {
      const user = await createTestUser()

      await createTestCertificate({
        customerName: 'Acme Corp',
        createdById: user.id,
      })
      await createTestCertificate({
        customerName: 'Acme Corp',
        createdById: user.id,
      })
      await createTestCertificate({
        customerName: 'Other Inc',
        createdById: user.id,
      })

      const acmeCerts = await prisma.certificate.findMany({
        where: {
          tenantId: user.tenantId,
          customerName: 'Acme Corp',
        },
      })

      expect(acmeCerts).toHaveLength(2)
    })

    it('should filter certificates by date range', async () => {
      const user = await createTestUser()

      // Create certificates with specific dates
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)

      const today = new Date()

      await prisma.certificate.create({
        data: {
          tenant: { connect: { id: user.tenantId } },
          certificateNumber: `CERT-${Date.now()}-1`,
          status: 'APPROVED',
          createdBy: { connect: { id: user.id } },
          lastModifiedBy: { connect: { id: user.id } },
          dateOfCalibration: yesterday,
        },
      })

      await prisma.certificate.create({
        data: {
          tenant: { connect: { id: user.tenantId } },
          certificateNumber: `CERT-${Date.now()}-2`,
          status: 'APPROVED',
          createdBy: { connect: { id: user.id } },
          lastModifiedBy: { connect: { id: user.id } },
          dateOfCalibration: today,
        },
      })

      const recentCerts = await prisma.certificate.findMany({
        where: {
          tenantId: user.tenantId,
          dateOfCalibration: {
            gte: yesterday,
          },
        },
      })

      expect(recentCerts.length).toBeGreaterThanOrEqual(2)
    })

    it('should include related data with includes', async () => {
      const user = await createTestUser()
      const certificate = await createTestCertificate({
        createdById: user.id,
      })

      // Add a parameter
      await prisma.parameter.create({
        data: {
          certificateId: certificate.id,
          parameterName: 'Temperature',
          parameterUnit: '°C',
          sortOrder: 1,
        },
      })

      const certWithParams = await prisma.certificate.findUnique({
        where: { id: certificate.id },
        include: {
          parameters: true,
          createdBy: {
            select: { id: true, name: true, email: true },
          },
        },
      })

      expect(certWithParams).toBeDefined()
      expect(certWithParams!.parameters).toHaveLength(1)
      expect(certWithParams!.parameters[0].parameterName).toBe('Temperature')
      expect(certWithParams!.createdBy.name).toBe(user.name)
    })
  })

  describe('Multi-tenant Isolation', () => {
    it('should isolate certificates by tenant', async () => {
      // Create first tenant and certificate
      const tenant1 = await getTestTenant()
      const user1 = await createTestUser()
      const cert1 = await createTestCertificate({
        certificateNumber: 'TENANT1-001',
        createdById: user1.id,
      })

      // Create second tenant
      const tenant2 = await prisma.tenant.create({
        data: {
          slug: `test-tenant-2-${Date.now()}`,
          name: 'Test Tenant 2',
          isActive: true,
        },
      })

      // Create user in second tenant
      const user2 = await prisma.user.create({
        data: {
          tenant: { connect: { id: tenant2.id } },
          email: `user2-${Date.now()}@example.com`,
          name: 'User 2',
          role: 'ENGINEER',
          isActive: true,
          authProvider: 'PASSWORD',
        },
      })

      // Create certificate in second tenant
      await prisma.certificate.create({
        data: {
          tenant: { connect: { id: tenant2.id } },
          certificateNumber: 'TENANT2-001',
          status: 'DRAFT',
          createdBy: { connect: { id: user2.id } },
          lastModifiedBy: { connect: { id: user2.id } },
        },
      })

      // Query tenant 1 certificates
      const tenant1Certs = await prisma.certificate.findMany({
        where: { tenantId: tenant1.id },
      })

      // Query tenant 2 certificates
      const tenant2Certs = await prisma.certificate.findMany({
        where: { tenantId: tenant2.id },
      })

      expect(tenant1Certs).toHaveLength(1)
      expect(tenant1Certs[0].certificateNumber).toBe('TENANT1-001')

      expect(tenant2Certs).toHaveLength(1)
      expect(tenant2Certs[0].certificateNumber).toBe('TENANT2-001')
    })
  })

  describe('Certificate Parameters and Results', () => {
    it('should create parameters with calibration results', async () => {
      const certificate = await createTestCertificate()

      // Create parameter
      const parameter = await prisma.parameter.create({
        data: {
          certificateId: certificate.id,
          parameterName: 'DC Voltage',
          parameterUnit: 'V',
          rangeMin: '0',
          rangeMax: '1000',
          rangeUnit: 'V',
          sortOrder: 1,
        },
      })

      // Create calibration results
      const results = await prisma.calibrationResult.createMany({
        data: [
          {
            parameterId: parameter.id,
            pointNumber: 1,
            standardReading: '100.00',
            beforeAdjustment: '100.02',
            errorObserved: 0.02,
            isOutOfLimit: false,
          },
          {
            parameterId: parameter.id,
            pointNumber: 2,
            standardReading: '500.00',
            beforeAdjustment: '500.05',
            errorObserved: 0.05,
            isOutOfLimit: false,
          },
          {
            parameterId: parameter.id,
            pointNumber: 3,
            standardReading: '1000.00',
            beforeAdjustment: '1000.12',
            errorObserved: 0.12,
            isOutOfLimit: true,
          },
        ],
      })

      expect(results.count).toBe(3)

      // Query parameter with results
      const paramWithResults = await prisma.parameter.findUnique({
        where: { id: parameter.id },
        include: { results: { orderBy: { pointNumber: 'asc' } } },
      })

      expect(paramWithResults!.results).toHaveLength(3)
      expect(paramWithResults!.results[2].isOutOfLimit).toBe(true)
    })
  })

  describe('Certificate Master Instruments', () => {
    it('should associate master instruments with certificate', async () => {
      const user = await createTestUser()
      const certificate = await createTestCertificate({ createdById: user.id })

      // Create master instrument
      const instrument = await prisma.masterInstrument.create({
        data: {
          tenant: { connect: { id: user.tenantId } },
          instrumentId: `INST-${Date.now()}`,
          description: 'Digital Multimeter Reference',
          category: 'ELECTRICAL',
          make: 'Fluke',
          model: '8846A',
          serialNumber: 'REF-001',
          assetNumber: 'ASSET-001',
          calibratedAtLocation: 'NABL Lab',
          reportNo: 'CAL-2024-001',
          calibrationDueDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          isActive: true,
        },
      })

      // Associate with certificate
      const certInstrument = await prisma.certificateMasterInstrument.create({
        data: {
          certificateId: certificate.id,
          masterInstrumentId: instrument.id,
          description: instrument.description,
          make: instrument.make,
          model: instrument.model,
          serialNumber: instrument.serialNumber,
          assetNo: instrument.assetNumber,
          calibratedAt: instrument.calibratedAtLocation,
          reportNo: instrument.reportNo || '',
          calibrationDueDate: instrument.calibrationDueDate?.toISOString() || '',
          category: instrument.category,
          sopReference: 'SOP-001',
        },
      })

      expect(certInstrument.masterInstrumentId).toBe(instrument.id)

      // Query certificate with instruments
      const certWithInstruments = await prisma.certificate.findUnique({
        where: { id: certificate.id },
        include: { masterInstruments: true },
      })

      expect(certWithInstruments!.masterInstruments).toHaveLength(1)
      expect(certWithInstruments!.masterInstruments[0].description).toBe('Digital Multimeter Reference')
    })
  })
})
