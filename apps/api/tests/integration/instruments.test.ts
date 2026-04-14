/**
 * Instruments API Integration Tests
 *
 * Tests master instrument management with real database interactions.
 * Migrated from hta-calibration/tests/integration/api/instruments.test.ts
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { randomUUID } from 'crypto'
import {
  setupTestDatabase,
  teardownTestDatabase,
  cleanTestDatabase,
  prisma,
} from './setup/test-db'
import {
  createEngineerWithAdmin,
  createMasterInstrument,
  createTestCertificate,
} from './setup/fixtures'

describe('Instruments API Integration', () => {
  beforeAll(async () => {
    await setupTestDatabase()
  })

  afterAll(async () => {
    await teardownTestDatabase()
  })

  beforeEach(async () => {
    await cleanTestDatabase()
  })

  describe('Master Instrument CRUD', () => {
    it('should create a master instrument', async () => {
      const { admin } = await createEngineerWithAdmin(prisma)

      const instrument = await createMasterInstrument(prisma, admin.id, {
        category: 'Electro-Technical',
        description: 'Digital Multimeter',
        make: 'Fluke',
        model: '87V',
      })

      expect(instrument).toBeDefined()
      expect(instrument.id).toBeDefined()
      expect(instrument.category).toBe('Electro-Technical')
    })

    it('should list all master instruments', async () => {
      const { admin } = await createEngineerWithAdmin(prisma)

      await createMasterInstrument(prisma, admin.id, { description: 'Instrument 1' })
      await createMasterInstrument(prisma, admin.id, { description: 'Instrument 2' })
      await createMasterInstrument(prisma, admin.id, { description: 'Instrument 3' })

      const instruments = await prisma.masterInstrument.findMany({
        where: { isLatest: true },
      })

      expect(instruments.length).toBeGreaterThanOrEqual(3)
    })

    it('should filter instruments by category', async () => {
      const { admin } = await createEngineerWithAdmin(prisma)

      await createMasterInstrument(prisma, admin.id, { category: 'Electro-Technical' })
      await createMasterInstrument(prisma, admin.id, { category: 'Mechanical' })
      await createMasterInstrument(prisma, admin.id, { category: 'Electro-Technical' })

      const electroTech = await prisma.masterInstrument.findMany({
        where: { category: 'Electro-Technical', isLatest: true },
      })

      expect(electroTech.length).toBeGreaterThanOrEqual(2)
    })

    it('should search instruments by description', async () => {
      const { admin } = await createEngineerWithAdmin(prisma)

      await createMasterInstrument(prisma, admin.id, { description: 'Digital Multimeter' })
      await createMasterInstrument(prisma, admin.id, { description: 'Pressure Gauge' })
      await createMasterInstrument(prisma, admin.id, { description: 'Digital Thermometer' })

      const results = await prisma.masterInstrument.findMany({
        where: {
          description: { contains: 'Digital' },
          isLatest: true,
        },
      })

      expect(results).toHaveLength(2)
    })

    it('should update master instrument via versioning', async () => {
      const { admin } = await createEngineerWithAdmin(prisma)

      const instrument = await createMasterInstrument(prisma, admin.id, {
        description: 'Original Description',
      })

      // In versioned system, we create a new version
      const newVersion = await prisma.masterInstrument.create({
        data: {
          instrumentId: instrument.instrumentId,
          category: instrument.category,
          description: 'Updated Description',
          make: instrument.make,
          model: instrument.model,
          assetNumber: instrument.assetNumber,
          serialNumber: instrument.serialNumber,
          version: instrument.version + 1,
          isLatest: true,
          createdById: admin.id,
        },
      })

      // Mark old version as not latest
      await prisma.masterInstrument.update({
        where: { id: instrument.id },
        data: { isLatest: false },
      })

      expect(newVersion.version).toBe(2)
      expect(newVersion.description).toBe('Updated Description')
    })
  })

  describe('Instrument Versioning', () => {
    it('should maintain version history', async () => {
      const { admin } = await createEngineerWithAdmin(prisma)
      const instrumentId = randomUUID()

      // Create version 1
      await prisma.masterInstrument.create({
        data: {
          instrumentId,
          category: 'Electro-Technical',
          description: 'Version 1',
          make: 'Test Make',
          model: 'Test Model',
          assetNumber: 'AST-001',
          serialNumber: 'SN-001',
          version: 1,
          isLatest: false,
          createdById: admin.id,
        },
      })

      // Create version 2
      await prisma.masterInstrument.create({
        data: {
          instrumentId,
          category: 'Electro-Technical',
          description: 'Version 2',
          make: 'Test Make',
          model: 'Test Model',
          assetNumber: 'AST-001',
          serialNumber: 'SN-001',
          version: 2,
          isLatest: false,
          createdById: admin.id,
        },
      })

      // Create version 3 (current)
      await prisma.masterInstrument.create({
        data: {
          instrumentId,
          category: 'Electro-Technical',
          description: 'Version 3',
          make: 'Test Make',
          model: 'Test Model',
          assetNumber: 'AST-001',
          serialNumber: 'SN-001',
          version: 3,
          isLatest: true,
          createdById: admin.id,
        },
      })

      const allVersions = await prisma.masterInstrument.findMany({
        where: { instrumentId },
        orderBy: { version: 'asc' },
      })

      expect(allVersions).toHaveLength(3)
      expect(allVersions[0].version).toBe(1)
      expect(allVersions[2].version).toBe(3)
      expect(allVersions[2].isLatest).toBe(true)
    })

    it('should only return latest version by default', async () => {
      const { admin } = await createEngineerWithAdmin(prisma)
      const instrumentId = randomUUID()

      await prisma.masterInstrument.create({
        data: {
          instrumentId,
          category: 'Test',
          description: 'Old',
          make: 'Test Make',
          model: 'Test Model',
          assetNumber: 'AST-002',
          serialNumber: 'SN-002',
          version: 1,
          isLatest: false,
          createdById: admin.id,
        },
      })

      await prisma.masterInstrument.create({
        data: {
          instrumentId,
          category: 'Test',
          description: 'Current',
          make: 'Test Make',
          model: 'Test Model',
          assetNumber: 'AST-002',
          serialNumber: 'SN-002',
          version: 2,
          isLatest: true,
          createdById: admin.id,
        },
      })

      const latest = await prisma.masterInstrument.findMany({
        where: { instrumentId, isLatest: true },
      })

      expect(latest).toHaveLength(1)
      expect(latest[0].description).toBe('Current')
    })
  })

  describe('Instrument-Certificate Association', () => {
    it('should link instrument to certificate', async () => {
      const { engineer, admin } = await createEngineerWithAdmin(prisma)

      const instrument = await createMasterInstrument(prisma, admin.id, {
        description: 'Reference Standard',
      })

      const cert = await createTestCertificate(prisma, engineer.id)

      await prisma.certificateMasterInstrument.create({
        data: {
          masterInstrumentId: instrument.instrumentId,
          certificateId: cert.id,
          description: instrument.description,
          serialNumber: instrument.serialNumber,
          category: instrument.category,
          sopReference: 'SOP/CAL/001',
        },
      })

      const certInstruments = await prisma.certificateMasterInstrument.findMany({
        where: { certificateId: cert.id },
      })

      expect(certInstruments).toHaveLength(1)
    })

    it('should list certificates using an instrument', async () => {
      const { engineer, admin } = await createEngineerWithAdmin(prisma)

      const instrument = await createMasterInstrument(prisma, admin.id)

      const cert1 = await createTestCertificate(prisma, engineer.id)
      const cert2 = await createTestCertificate(prisma, engineer.id)

      await prisma.certificateMasterInstrument.create({
        data: {
          masterInstrumentId: instrument.instrumentId,
          certificateId: cert1.id,
          description: instrument.description,
          sopReference: 'SOP/CAL/001',
        },
      })

      await prisma.certificateMasterInstrument.create({
        data: {
          masterInstrumentId: instrument.instrumentId,
          certificateId: cert2.id,
          description: instrument.description,
          sopReference: 'SOP/CAL/001',
        },
      })

      const usage = await prisma.certificateMasterInstrument.findMany({
        where: { masterInstrumentId: instrument.instrumentId },
        include: { certificate: true },
      })

      expect(usage).toHaveLength(2)
    })
  })

  describe('Instrument Calibration Tracking', () => {
    it('should track calibration due dates', async () => {
      const { admin } = await createEngineerWithAdmin(prisma)

      const futureDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) // 90 days
      const pastDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // 30 days ago

      await prisma.masterInstrument.create({
        data: {
          instrumentId: randomUUID(),
          category: 'Test',
          description: 'Not Due',
          make: 'Test Make',
          model: 'Test Model',
          assetNumber: 'AST-FUTURE',
          serialNumber: 'SN-FUTURE',
          calibrationDueDate: futureDate,
          version: 1,
          isLatest: true,
          createdById: admin.id,
        },
      })

      await prisma.masterInstrument.create({
        data: {
          instrumentId: randomUUID(),
          category: 'Test',
          description: 'Overdue',
          make: 'Test Make',
          model: 'Test Model',
          assetNumber: 'AST-OVERDUE',
          serialNumber: 'SN-OVERDUE',
          calibrationDueDate: pastDate,
          version: 1,
          isLatest: true,
          createdById: admin.id,
        },
      })

      const overdue = await prisma.masterInstrument.findMany({
        where: {
          isLatest: true,
          calibrationDueDate: { lt: new Date() },
        },
      })

      expect(overdue.length).toBeGreaterThanOrEqual(1)
      expect(overdue[0].description).toBe('Overdue')
    })

    it('should find instruments due for calibration soon', async () => {
      const { admin } = await createEngineerWithAdmin(prisma)

      const soon = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
      const later = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) // 90 days

      await prisma.masterInstrument.create({
        data: {
          instrumentId: randomUUID(),
          category: 'Test',
          description: 'Due Soon',
          make: 'Test Make',
          model: 'Test Model',
          assetNumber: 'AST-SOON',
          serialNumber: 'SN-SOON',
          calibrationDueDate: soon,
          version: 1,
          isLatest: true,
          createdById: admin.id,
        },
      })

      await prisma.masterInstrument.create({
        data: {
          instrumentId: randomUUID(),
          category: 'Test',
          description: 'Due Later',
          make: 'Test Make',
          model: 'Test Model',
          assetNumber: 'AST-LATER',
          serialNumber: 'SN-LATER',
          calibrationDueDate: later,
          version: 1,
          isLatest: true,
          createdById: admin.id,
        },
      })

      const dueSoon = await prisma.masterInstrument.findMany({
        where: {
          isLatest: true,
          calibrationDueDate: {
            gte: new Date(),
            lte: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // Next 14 days
          },
        },
      })

      expect(dueSoon.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('Instrument Export', () => {
    it('should export instrument data', async () => {
      const { admin } = await createEngineerWithAdmin(prisma)

      await createMasterInstrument(prisma, admin.id, {
        description: 'Export Test 1',
        serialNumber: 'SN001',
      })

      await createMasterInstrument(prisma, admin.id, {
        description: 'Export Test 2',
        serialNumber: 'SN002',
      })

      const instruments = await prisma.masterInstrument.findMany({
        where: { isLatest: true },
        select: {
          instrumentId: true,
          category: true,
          description: true,
          make: true,
          model: true,
          assetNumber: true,
          serialNumber: true,
          calibrationDueDate: true,
        },
      })

      expect(instruments.length).toBeGreaterThanOrEqual(2)
      expect(instruments[0]).toHaveProperty('description')
      expect(instruments[0]).toHaveProperty('serialNumber')
    })
  })

  describe('Instrument Pagination', () => {
    it('should paginate instrument list', async () => {
      const { admin } = await createEngineerWithAdmin(prisma)

      for (let i = 0; i < 10; i++) {
        await createMasterInstrument(prisma, admin.id, {
          description: `Instrument ${i + 1}`,
        })
      }

      const page1 = await prisma.masterInstrument.findMany({
        where: { isLatest: true },
        orderBy: { description: 'asc' },
        take: 5,
        skip: 0,
      })

      const page2 = await prisma.masterInstrument.findMany({
        where: { isLatest: true },
        orderBy: { description: 'asc' },
        take: 5,
        skip: 5,
      })

      expect(page1).toHaveLength(5)
      expect(page2).toHaveLength(5)
    })

    it('should return total count for pagination', async () => {
      const { admin } = await createEngineerWithAdmin(prisma)

      for (let i = 0; i < 7; i++) {
        await createMasterInstrument(prisma, admin.id)
      }

      const total = await prisma.masterInstrument.count({
        where: { isLatest: true },
      })

      expect(total).toBeGreaterThanOrEqual(7)
    })
  })

  describe('Instrument Categories', () => {
    it('should list unique categories', async () => {
      const { admin } = await createEngineerWithAdmin(prisma)

      await createMasterInstrument(prisma, admin.id, { category: 'Electro-Technical' })
      await createMasterInstrument(prisma, admin.id, { category: 'Mechanical' })
      await createMasterInstrument(prisma, admin.id, { category: 'Thermal' })
      await createMasterInstrument(prisma, admin.id, { category: 'Electro-Technical' })

      const categories = await prisma.masterInstrument.findMany({
        where: { isLatest: true },
        select: { category: true },
        distinct: ['category'],
      })

      const uniqueCategories = categories.map((c) => c.category)
      expect(uniqueCategories).toContain('Electro-Technical')
      expect(uniqueCategories).toContain('Mechanical')
      expect(uniqueCategories).toContain('Thermal')
    })
  })
})
