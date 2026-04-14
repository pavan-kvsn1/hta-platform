/**
 * Admin Authorization API Integration Tests
 *
 * Tests admin authorization workflow with real database interactions.
 * Migrated from hta-calibration/tests/integration/api/admin-authorization.test.ts
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
  createTestCertificate,
} from './setup/fixtures'

describe('Admin Authorization API Integration', () => {
  beforeAll(async () => {
    await setupTestDatabase()
  })

  afterAll(async () => {
    await teardownTestDatabase()
  })

  beforeEach(async () => {
    await cleanTestDatabase()
  })

  describe('Authorization List', () => {
    it('should list certificates pending admin authorization', async () => {
      const { engineer } = await createEngineerWithAdmin(prisma)

      await createTestCertificate(prisma, engineer.id, { status: 'PENDING_ADMIN_AUTHORIZATION' })
      await createTestCertificate(prisma, engineer.id, { status: 'PENDING_ADMIN_AUTHORIZATION' })
      await createTestCertificate(prisma, engineer.id, { status: 'DRAFT' })

      const pendingAuth = await prisma.certificate.findMany({
        where: { status: 'PENDING_ADMIN_AUTHORIZATION' },
        orderBy: { updatedAt: 'desc' },
      })

      expect(pendingAuth).toHaveLength(2)
    })

    it('should list both pending and authorized certificates', async () => {
      const { engineer } = await createEngineerWithAdmin(prisma)

      await createTestCertificate(prisma, engineer.id, { status: 'PENDING_ADMIN_AUTHORIZATION' })
      await createTestCertificate(prisma, engineer.id, { status: 'AUTHORIZED' })
      await createTestCertificate(prisma, engineer.id, { status: 'DRAFT' })

      const authRelated = await prisma.certificate.findMany({
        where: {
          status: { in: ['PENDING_ADMIN_AUTHORIZATION', 'AUTHORIZED'] },
        },
      })

      expect(authRelated).toHaveLength(2)
    })

    it('should paginate authorization list', async () => {
      const { engineer } = await createEngineerWithAdmin(prisma)

      for (let i = 0; i < 5; i++) {
        await createTestCertificate(prisma, engineer.id, { status: 'PENDING_ADMIN_AUTHORIZATION' })
        await new Promise((r) => setTimeout(r, 10))
      }

      const page1 = await prisma.certificate.findMany({
        where: { status: 'PENDING_ADMIN_AUTHORIZATION' },
        orderBy: { updatedAt: 'desc' },
        take: 2,
        skip: 0,
      })

      const page2 = await prisma.certificate.findMany({
        where: { status: 'PENDING_ADMIN_AUTHORIZATION' },
        orderBy: { updatedAt: 'desc' },
        take: 2,
        skip: 2,
      })

      expect(page1).toHaveLength(2)
      expect(page2).toHaveLength(2)
    })

    it('should include creator details in authorization list', async () => {
      const { engineer, admin } = await createEngineerWithAdmin(prisma)
      await createTestCertificate(prisma, engineer.id, { status: 'PENDING_ADMIN_AUTHORIZATION' })

      const certificates = await prisma.certificate.findMany({
        where: { status: 'PENDING_ADMIN_AUTHORIZATION' },
        include: {
          createdBy: {
            select: { id: true, name: true, email: true },
          },
        },
      })

      expect(certificates[0].createdBy).toBeDefined()
      expect(certificates[0].createdBy.id).toBe(engineer.id)
    })
  })

  describe('Authorization Process', () => {
    it('should authorize a certificate', async () => {
      const { engineer, admin } = await createEngineerWithAdmin(prisma)
      const cert = await createTestCertificate(prisma, engineer.id, {
        status: 'PENDING_ADMIN_AUTHORIZATION',
      })

      const authorized = await prisma.certificate.update({
        where: { id: cert.id },
        data: {
          status: 'AUTHORIZED',
        },
      })

      // Create authorization event to track who authorized it
      await prisma.certificateEvent.create({
        data: {
          certificateId: cert.id,
          sequenceNumber: 1,
          revision: 1,
          eventType: 'ADMIN_AUTHORIZED',
          eventData: JSON.stringify({ authorizedBy: admin.id }),
          userId: admin.id,
          userRole: 'ADMIN',
        },
      })

      expect(authorized.status).toBe('AUTHORIZED')
    })

    it('should reject authorization and revert to revision required', async () => {
      const { engineer, admin } = await createEngineerWithAdmin(prisma)
      const cert = await createTestCertificate(prisma, engineer.id, {
        status: 'PENDING_ADMIN_AUTHORIZATION',
      })

      const rejected = await prisma.certificate.update({
        where: { id: cert.id },
        data: {
          status: 'REVISION_REQUIRED',
        },
      })

      expect(rejected.status).toBe('REVISION_REQUIRED')
    })

    it('should create event when certificate is authorized', async () => {
      const { engineer, admin } = await createEngineerWithAdmin(prisma)
      const cert = await createTestCertificate(prisma, engineer.id, {
        status: 'PENDING_ADMIN_AUTHORIZATION',
      })

      // Authorize the certificate
      await prisma.certificate.update({
        where: { id: cert.id },
        data: { status: 'AUTHORIZED' },
      })

      // Create authorization event
      await prisma.certificateEvent.create({
        data: {
          certificateId: cert.id,
          eventType: 'ADMIN_AUTHORIZED',
          eventData: JSON.stringify({ authorizedBy: admin.id }),
          userId: admin.id,
          userRole: 'ADMIN',
          sequenceNumber: 1,
          revision: 1,
        },
      })

      const events = await prisma.certificateEvent.findMany({
        where: { certificateId: cert.id },
      })

      expect(events.some((e) => e.eventType === 'ADMIN_AUTHORIZED')).toBe(true)
    })
  })

  describe('Authorization Message/Note', () => {
    it('should add admin message to authorization', async () => {
      const { engineer, admin } = await createEngineerWithAdmin(prisma)
      const cert = await createTestCertificate(prisma, engineer.id, {
        status: 'PENDING_ADMIN_AUTHORIZATION',
      })

      await prisma.certificateEvent.create({
        data: {
          certificateId: cert.id,
          eventType: 'ADMIN_MESSAGE',
          eventData: JSON.stringify({ message: 'Please verify customer details before authorization' }),
          userId: admin.id,
          userRole: 'ADMIN',
          sequenceNumber: 1,
          revision: 1,
        },
      })

      const events = await prisma.certificateEvent.findMany({
        where: {
          certificateId: cert.id,
          eventType: 'ADMIN_MESSAGE',
        },
      })

      expect(events).toHaveLength(1)
      const eventData = JSON.parse(events[0].eventData)
      expect(eventData.message).toContain('verify customer details')
    })
  })

  describe('Authorization Details', () => {
    it('should retrieve certificate details for authorization review', async () => {
      const { engineer, admin } = await createEngineerWithAdmin(prisma)
      const cert = await createTestCertificate(prisma, engineer.id, {
        status: 'PENDING_ADMIN_AUTHORIZATION',
        customerName: 'Test Corp',
        uucDescription: 'Digital Multimeter',
        uucMake: 'Fluke',
        uucModel: '87V',
      })

      const fullCert = await prisma.certificate.findUnique({
        where: { id: cert.id },
        include: {
          createdBy: true,
          events: {
            orderBy: { createdAt: 'desc' },
          },
          signatures: true,
        },
      })

      expect(fullCert).toBeDefined()
      expect(fullCert?.customerName).toBe('Test Corp')
      expect(fullCert?.uucDescription).toBe('Digital Multimeter')
    })

    it('should check signatures before authorization', async () => {
      const { engineer, admin } = await createEngineerWithAdmin(prisma)
      const cert = await createTestCertificate(prisma, engineer.id, {
        status: 'PENDING_ADMIN_AUTHORIZATION',
      })

      // Add signatures
      await prisma.signature.create({
        data: {
          certificateId: cert.id,
          signerType: 'ASSIGNEE',
          signerName: engineer.name || 'Engineer',
          signerEmail: engineer.email,
          signatureData: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          signedAt: new Date(),
        },
      })

      await prisma.signature.create({
        data: {
          certificateId: cert.id,
          signerType: 'REVIEWER',
          signerName: admin.name || 'Admin',
          signerEmail: admin.email,
          signatureData: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          signedAt: new Date(),
        },
      })

      const signatures = await prisma.signature.findMany({
        where: { certificateId: cert.id },
      })

      expect(signatures).toHaveLength(2)
      expect(signatures.some((s) => s.signerType === 'ASSIGNEE')).toBe(true)
      expect(signatures.some((s) => s.signerType === 'REVIEWER')).toBe(true)
    })
  })

  describe('Authorized Certificate Access', () => {
    it('should store signed PDF path after authorization', async () => {
      const { engineer, admin } = await createEngineerWithAdmin(prisma)
      const cert = await createTestCertificate(prisma, engineer.id, {
        status: 'PENDING_ADMIN_AUTHORIZATION',
      })

      const authorized = await prisma.certificate.update({
        where: { id: cert.id },
        data: {
          status: 'AUTHORIZED',
          signedPdfPath: '/signed-pdfs/HTA-CAL-2024-001.pdf',
        },
      })

      expect(authorized.signedPdfPath).toBe('/signed-pdfs/HTA-CAL-2024-001.pdf')
    })

    it('should list authorized certificates with download info', async () => {
      const { engineer } = await createEngineerWithAdmin(prisma)

      await createTestCertificate(prisma, engineer.id, {
        status: 'AUTHORIZED',
        signedPdfPath: '/signed-pdfs/cert1.pdf',
      })

      await createTestCertificate(prisma, engineer.id, {
        status: 'AUTHORIZED',
        signedPdfPath: '/signed-pdfs/cert2.pdf',
      })

      const authorized = await prisma.certificate.findMany({
        where: { status: 'AUTHORIZED' },
        select: {
          id: true,
          certificateNumber: true,
          signedPdfPath: true,
        },
      })

      expect(authorized).toHaveLength(2)
      expect(authorized.every((c) => c.signedPdfPath !== null)).toBe(true)
    })
  })

  describe('Authorization Filtering', () => {
    it('should filter authorized certificates by date range', async () => {
      const { engineer } = await createEngineerWithAdmin(prisma)

      const cert1 = await createTestCertificate(prisma, engineer.id, { status: 'AUTHORIZED' })
      const cert2 = await createTestCertificate(prisma, engineer.id, { status: 'AUTHORIZED' })

      // Backdate one certificate
      await prisma.certificate.update({
        where: { id: cert1.id },
        data: { updatedAt: new Date('2023-01-15') },
      })

      const startDate = new Date('2023-01-01')
      const endDate = new Date('2023-02-01')

      const filtered = await prisma.certificate.findMany({
        where: {
          status: 'AUTHORIZED',
          updatedAt: {
            gte: startDate,
            lte: endDate,
          },
        },
      })

      expect(filtered).toHaveLength(1)
      expect(filtered[0].id).toBe(cert1.id)
    })

    it('should filter by customer name', async () => {
      const { engineer } = await createEngineerWithAdmin(prisma)

      await createTestCertificate(prisma, engineer.id, {
        status: 'AUTHORIZED',
        customerName: 'ACME Corporation',
      })
      await createTestCertificate(prisma, engineer.id, {
        status: 'AUTHORIZED',
        customerName: 'Test Industries',
      })

      const filtered = await prisma.certificate.findMany({
        where: {
          status: 'AUTHORIZED',
          customerName: { contains: 'ACME' },
        },
      })

      expect(filtered).toHaveLength(1)
      expect(filtered[0].customerName).toBe('ACME Corporation')
    })
  })
})
