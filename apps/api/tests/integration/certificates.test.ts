/**
 * Certificate API Integration Tests
 *
 * Tests certificate CRUD operations with real database interactions.
 * Migrated from hta-calibration/tests/integration/api/certificates.test.ts
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import {
  setupTestDatabase,
  teardownTestDatabase,
  cleanTestDatabase,
  prisma,
} from './setup/test-db'
import {
  createTestUser,
  createEngineerWithAdmin,
  createTestCertificate,
  createTestParameter,
  createCalibrationResults,
} from './setup/fixtures'

describe('Certificate API Integration', () => {
  beforeAll(async () => {
    await setupTestDatabase()
  })

  afterAll(async () => {
    await teardownTestDatabase()
  })

  beforeEach(async () => {
    await cleanTestDatabase()
  })

  describe('Certificate CRUD Operations', () => {
    it('should create a certificate with all required fields', async () => {
      const { engineer, tenantId } = await createEngineerWithAdmin(prisma)

      const certificate = await createTestCertificate(prisma, tenantId, engineer.id, {
        customerName: 'Integration Test Company',
        uucDescription: 'Test Multimeter',
      })

      expect(certificate).toBeDefined()
      expect(certificate.id).toBeDefined()
      expect(certificate.certificateNumber).toMatch(/^HTA\/CAL\//)
      expect(certificate.customerName).toBe('Integration Test Company')
      expect(certificate.status).toBe('DRAFT')
    })

    it('should retrieve a certificate with all relations', async () => {
      const { engineer, tenantId } = await createEngineerWithAdmin(prisma)
      const certificate = await createTestCertificate(prisma, tenantId, engineer.id)
      const parameter = await createTestParameter(prisma, certificate.id)
      await createCalibrationResults(prisma, parameter.id, 3)

      const retrieved = await prisma.certificate.findUnique({
        where: { id: certificate.id },
        include: {
          createdBy: true,
          parameters: {
            include: { results: true },
          },
        },
      })

      expect(retrieved).toBeDefined()
      expect(retrieved?.createdBy.id).toBe(engineer.id)
      expect(retrieved?.parameters).toHaveLength(1)
      expect(retrieved?.parameters[0].results).toHaveLength(3)
    })

    it('should update certificate status', async () => {
      const { engineer, tenantId } = await createEngineerWithAdmin(prisma)
      const certificate = await createTestCertificate(prisma, tenantId, engineer.id)

      const updated = await prisma.certificate.update({
        where: { id: certificate.id },
        data: { status: 'PENDING_REVIEW' },
      })

      expect(updated.status).toBe('PENDING_REVIEW')
    })

    it('should cascade delete certificate relations', async () => {
      const { engineer, tenantId } = await createEngineerWithAdmin(prisma)
      const certificate = await createTestCertificate(prisma, tenantId, engineer.id)
      const parameter = await createTestParameter(prisma, certificate.id)
      await createCalibrationResults(prisma, parameter.id, 3)

      // Delete the certificate
      await prisma.certificate.delete({
        where: { id: certificate.id },
      })

      // Verify parameters and results are also deleted
      const deletedParam = await prisma.parameter.findUnique({
        where: { id: parameter.id },
      })
      expect(deletedParam).toBeNull()

      const results = await prisma.calibrationResult.findMany({
        where: { parameterId: parameter.id },
      })
      expect(results).toHaveLength(0)
    })

    it('should enforce unique certificate numbers', async () => {
      const { engineer, tenantId } = await createEngineerWithAdmin(prisma)
      const certNumber = `HTA/CAL/TEST/UNIQUE-001`

      await createTestCertificate(prisma, tenantId, engineer.id, {
        certificateNumber: certNumber,
      })

      // Attempt to create another with same number
      await expect(
        createTestCertificate(prisma, tenantId, engineer.id, {
          certificateNumber: certNumber,
        })
      ).rejects.toThrow()
    })
  })

  describe('Certificate Query Operations', () => {
    it('should filter certificates by status', async () => {
      const { engineer, tenantId } = await createEngineerWithAdmin(prisma)

      await createTestCertificate(prisma, tenantId, engineer.id, { status: 'DRAFT' })
      await createTestCertificate(prisma, tenantId, engineer.id, { status: 'DRAFT' })
      await createTestCertificate(prisma, tenantId, engineer.id, { status: 'PENDING_REVIEW' })

      const drafts = await prisma.certificate.findMany({
        where: { status: 'DRAFT' },
      })

      expect(drafts).toHaveLength(2)
    })

    it('should filter certificates by creator', async () => {
      const { engineer: engineer1, admin, tenantId } = await createEngineerWithAdmin(prisma)
      const engineer2 = await createTestUser(prisma, {
        name: 'Engineer 2',
        role: 'ENGINEER',
        assignedAdminId: admin.id,
        tenantId,
      })

      await createTestCertificate(prisma, tenantId, engineer1.id)
      await createTestCertificate(prisma, tenantId, engineer1.id)
      await createTestCertificate(prisma, tenantId, engineer2.id)

      const engineer1Certs = await prisma.certificate.findMany({
        where: { createdById: engineer1.id },
      })

      expect(engineer1Certs).toHaveLength(2)
    })

    it('should paginate certificate results', async () => {
      const { engineer, tenantId } = await createEngineerWithAdmin(prisma)

      // Create 15 certificates
      for (let i = 0; i < 15; i++) {
        await createTestCertificate(prisma, tenantId, engineer.id)
      }

      const page1 = await prisma.certificate.findMany({
        take: 10,
        skip: 0,
        orderBy: { createdAt: 'desc' },
      })

      const page2 = await prisma.certificate.findMany({
        take: 10,
        skip: 10,
        orderBy: { createdAt: 'desc' },
      })

      expect(page1).toHaveLength(10)
      expect(page2).toHaveLength(5)
    })

    it('should search certificates by customer name', async () => {
      const { engineer, tenantId } = await createEngineerWithAdmin(prisma)

      await createTestCertificate(prisma, tenantId, engineer.id, { customerName: 'ACME Corporation' })
      await createTestCertificate(prisma, tenantId, engineer.id, { customerName: 'ACME Industries' })
      await createTestCertificate(prisma, tenantId, engineer.id, { customerName: 'Other Company' })

      const acmeCerts = await prisma.certificate.findMany({
        where: {
          customerName: {
            contains: 'ACME',
          },
        },
      })

      expect(acmeCerts).toHaveLength(2)
    })
  })

  describe('Certificate Status Workflow', () => {
    it('should support DRAFT → PENDING_REVIEW transition', async () => {
      const { engineer, tenantId } = await createEngineerWithAdmin(prisma)
      const certificate = await createTestCertificate(prisma, tenantId, engineer.id, { status: 'DRAFT' })

      const updated = await prisma.certificate.update({
        where: { id: certificate.id },
        data: { status: 'PENDING_REVIEW' },
      })

      expect(updated.status).toBe('PENDING_REVIEW')
    })

    it('should support PENDING_REVIEW → APPROVED transition', async () => {
      const { engineer, tenantId } = await createEngineerWithAdmin(prisma)
      const certificate = await createTestCertificate(prisma, tenantId, engineer.id, { status: 'PENDING_REVIEW' })

      const updated = await prisma.certificate.update({
        where: { id: certificate.id },
        data: { status: 'APPROVED' },
      })

      expect(updated.status).toBe('APPROVED')
    })

    it('should support PENDING_REVIEW → REVISION transition', async () => {
      const { engineer, tenantId } = await createEngineerWithAdmin(prisma)
      const certificate = await createTestCertificate(prisma, tenantId, engineer.id, { status: 'PENDING_REVIEW' })

      const updated = await prisma.certificate.update({
        where: { id: certificate.id },
        data: { status: 'REVISION' },
      })

      expect(updated.status).toBe('REVISION')
    })
  })

  describe('Certificate Parameters', () => {
    it('should add multiple parameters to a certificate', async () => {
      const { engineer, tenantId } = await createEngineerWithAdmin(prisma)
      const certificate = await createTestCertificate(prisma, tenantId, engineer.id)

      await createTestParameter(prisma, certificate.id, { parameterName: 'Voltage', parameterUnit: 'V' })
      await createTestParameter(prisma, certificate.id, { parameterName: 'Current', parameterUnit: 'A' })
      await createTestParameter(prisma, certificate.id, { parameterName: 'Resistance', parameterUnit: 'Ω' })

      const certWithParams = await prisma.certificate.findUnique({
        where: { id: certificate.id },
        include: { parameters: true },
      })

      expect(certWithParams?.parameters).toHaveLength(3)
    })

    it('should delete parameters when certificate is deleted', async () => {
      const { engineer, tenantId } = await createEngineerWithAdmin(prisma)
      const certificate = await createTestCertificate(prisma, tenantId, engineer.id)
      const param = await createTestParameter(prisma, certificate.id)

      await prisma.certificate.delete({
        where: { id: certificate.id },
      })

      const deletedParam = await prisma.parameter.findUnique({
        where: { id: param.id },
      })

      expect(deletedParam).toBeNull()
    })
  })

  describe('Calibration Results', () => {
    it('should store calibration results with correct data', async () => {
      const { engineer, tenantId } = await createEngineerWithAdmin(prisma)
      const certificate = await createTestCertificate(prisma, tenantId, engineer.id)
      const parameter = await createTestParameter(prisma, certificate.id)

      const result = await prisma.calibrationResult.create({
        data: {
          parameterId: parameter.id,
          pointNumber: 1,
          standardReading: '100.00',
          beforeAdjustment: '100.05',
          errorObserved: 0.05,
          isOutOfLimit: false,
        },
      })

      expect(result.standardReading).toBe('100.00')
      expect(result.beforeAdjustment).toBe('100.05')
      expect(result.errorObserved).toBe(0.05)
      expect(result.isOutOfLimit).toBe(false)
    })

    it('should flag out-of-limit results', async () => {
      const { engineer, tenantId } = await createEngineerWithAdmin(prisma)
      const certificate = await createTestCertificate(prisma, tenantId, engineer.id)
      const parameter = await createTestParameter(prisma, certificate.id)

      const result = await prisma.calibrationResult.create({
        data: {
          parameterId: parameter.id,
          pointNumber: 1,
          standardReading: '100.00',
          beforeAdjustment: '105.00',
          errorObserved: 5.0,
          isOutOfLimit: true,
        },
      })

      expect(result.isOutOfLimit).toBe(true)
    })
  })
})
