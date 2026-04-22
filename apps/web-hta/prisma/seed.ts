import * as dotenv from 'dotenv'
import * as path from 'path'

// Explicitly load .env from project root
dotenv.config({ path: path.resolve(__dirname, '../.env') })

import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import * as fs from 'fs'
import * as crypto from 'crypto'

const prisma = new PrismaClient()

// Certificate PDF source directory (within project)
const CERTIFICATE_PDF_SOURCE = path.resolve(__dirname, '../reference_docs/certificate_pdfs')
const CERTIFICATE_STORAGE_PATH = path.resolve(__dirname, '..', process.env.CERTIFICATE_STORAGE_PATH || './storage/master-instrument-certificates')

// Default tenant for HTA Calibration
const DEFAULT_TENANT = {
  slug: 'hta-calibration',
  name: 'HTA Calibration Services',
}

/**
 * Convert asset number to PDF filename
 * "149 HTAIPL/L" -> "149 HTAIPL L.pdf"
 */
function assetNumberToFileName(assetNumber: string): string {
  return assetNumber.replace(/\//g, ' ') + '.pdf'
}

// Interface for master instruments JSON
interface MasterInstrumentJson {
  id: number
  type: string
  instrument_desc: string
  make: string | { ind?: string; sen?: string }
  model: string | { ind?: string; sen?: string }
  asset_no: string
  instrument_sl_no: string | { ind?: string; sen?: string }
  usage?: string | null
  calibrated_at?: string | null
  report_no?: string | null
  next_due_on?: string | null
  range?: Array<{ referencedoc?: string; range?: string }> | null
  remarks?: string | null
}

// Helper to serialize composite values (e.g., { ind: "X", sen: "Y" } -> "Ind: X / Sen: Y")
function serializeCompositeValue(value: string | { ind?: string; sen?: string } | undefined): string {
  if (!value) return ''
  if (typeof value === 'string') return value
  const parts: string[] = []
  if (value.ind) parts.push(`Ind: ${value.ind}`)
  if (value.sen) parts.push(`Sen: ${value.sen}`)
  return parts.join(' / ') || ''
}

// Parse date from MM/DD/YYYY format
function parseDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null
  const parts = dateStr.split('/')
  if (parts.length !== 3) return null
  const [month, day, year] = parts.map(Number)
  return new Date(year, month - 1, day)
}

/**
 * Seed master instrument certificates from reference PDFs
 */
async function seedCertificates(tenantId: string, adminUserId: string) {
  console.log('\n--- Seeding Master Instrument Certificates ---')

  // Check if source directory exists
  if (!fs.existsSync(CERTIFICATE_PDF_SOURCE)) {
    console.log(`Certificate source directory not found: ${CERTIFICATE_PDF_SOURCE}`)
    console.log('Skipping certificate seeding')
    return
  }

  // Ensure storage directory exists
  if (!fs.existsSync(CERTIFICATE_STORAGE_PATH)) {
    fs.mkdirSync(CERTIFICATE_STORAGE_PATH, { recursive: true })
    console.log(`Created storage directory: ${CERTIFICATE_STORAGE_PATH}`)
  }

  // Check if certificates already exist
  const existingCerts = await prisma.masterInstrumentCertificate.count()
  if (existingCerts > 0) {
    console.log(`Skipping certificate seeding - ${existingCerts} certificates already exist`)
    return
  }

  // Get all master instruments
  const instruments = await prisma.masterInstrument.findMany({
    where: { tenantId, isActive: true, isLatest: true },
    select: { id: true, assetNumber: true, reportNo: true, calibrationDueDate: true },
  })

  console.log(`Found ${instruments.length} master instruments`)

  // Get all PDF files in source directory
  const pdfFiles = fs.readdirSync(CERTIFICATE_PDF_SOURCE)
    .filter(f => f.toLowerCase().endsWith('.pdf'))

  console.log(`Found ${pdfFiles.length} PDF files in source directory`)

  let successCount = 0
  let skippedCount = 0
  let errorCount = 0

  for (const instrument of instruments) {
    const expectedFileName = assetNumberToFileName(instrument.assetNumber)
    const sourcePath = path.join(CERTIFICATE_PDF_SOURCE, expectedFileName)

    // Check if PDF exists for this instrument
    if (!fs.existsSync(sourcePath)) {
      skippedCount++
      continue
    }

    try {
      // Read the source PDF
      const pdfBuffer = fs.readFileSync(sourcePath)
      const fileSize = pdfBuffer.length

      // Generate storage path (relative path for DB storage)
      const storagePath = `master-instruments/${expectedFileName}`
      const fullStoragePath = path.join(CERTIFICATE_STORAGE_PATH, expectedFileName)

      // Copy PDF to storage directory
      fs.writeFileSync(fullStoragePath, pdfBuffer)

      // Create certificate record
      await prisma.masterInstrumentCertificate.create({
        data: {
          masterInstrumentId: instrument.id,
          fileName: expectedFileName,
          fileSize,
          mimeType: 'application/pdf',
          storagePath,
          reportNo: instrument.reportNo,
          validUntil: instrument.calibrationDueDate,
          uploadedById: adminUserId,
          isLatest: true,
          isActive: true,
        },
      })

      successCount++
    } catch (err) {
      errorCount++
      console.error(`Failed to seed certificate for ${instrument.assetNumber}:`, err)
    }
  }

  console.log(`Certificate seeding complete:`)
  console.log(`  - Success: ${successCount}`)
  console.log(`  - Skipped (no PDF): ${skippedCount}`)
  console.log(`  - Errors: ${errorCount}`)
}

async function main() {
  console.log('Seeding database...\n')

  // ==================
  // CREATE TENANT
  // ==================
  console.log('--- Creating Tenant ---')

  let tenant = await prisma.tenant.findUnique({
    where: { slug: DEFAULT_TENANT.slug },
  })

  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: {
        slug: DEFAULT_TENANT.slug,
        name: DEFAULT_TENANT.name,
        isActive: true,
      },
    })
    console.log(`Created tenant: ${tenant.name} (${tenant.slug})`)
  } else {
    console.log(`Tenant already exists: ${tenant.name}`)
  }

  const tenantId = tenant.id

  // ==================
  // CREATE SUBSCRIPTION (INTERNAL tier for HTA)
  // ==================
  console.log('\n--- Creating Subscription ---')

  const existingSubscription = await prisma.tenantSubscription.findUnique({
    where: { tenantId },
  })

  if (!existingSubscription) {
    const now = new Date()
    const periodEnd = new Date(now.getFullYear() + 100, now.getMonth(), now.getDate()) // 100 years

    await prisma.tenantSubscription.create({
      data: {
        tenantId,
        tier: 'INTERNAL',
        status: 'ACTIVE',
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        basePriceInPaise: 0, // No charge for internal
        extraStaffSeats: 0,
        extraCustomerAccounts: 0,
        extraCustomerUserSeats: 0,
      },
    })
    console.log('Created INTERNAL subscription for HTA')

    // Create initial usage tracking
    await prisma.tenantUsage.create({
      data: {
        subscriptionId: (await prisma.tenantSubscription.findUnique({ where: { tenantId } }))!.id,
        periodStart: now,
        periodEnd: new Date(now.getFullYear(), now.getMonth() + 1, 1), // End of current month
        certificatesIssued: 0,
        staffUserCount: 0,
        customerAccountCount: 0,
        customerUserCount: 0,
        apiCallCount: 0,
        storageUsedMb: 0,
      },
    })
    console.log('Created initial usage tracking record')
  } else {
    console.log(`Subscription already exists: ${existingSubscription.tier}`)
  }

  // ==================
  // CREATE ADMIN
  // ==================
  console.log('\n--- Creating Admin ---')
  const adminPassword = await bcrypt.hash('admin123', 12)

  const masterAdmin = await prisma.user.upsert({
    where: { tenantId_email: { tenantId, email: 'admin@htaipl.com' } },
    update: {},
    create: {
      tenantId,
      email: 'hemanth@htaipl.com',
      name: 'Hemanth Kumar',
      passwordHash: adminPassword,
      role: 'ADMIN',
      adminType: 'MASTER',
      isAdmin: false,
      authProvider: 'PASSWORD',
      isActive: true,
    },
  })
  console.log('Created MASTER Admin:', masterAdmin.email)

  // ==================
  // CREATE ENGINEERS
  // ==================
  console.log('\n--- Creating Engineers ---')
  const engineerPassword = await bcrypt.hash('engineer123', 12)

  const engineers = [
    { email: 'kiran@htaipl.com', name: 'Kiran Kumar' },
    { email: 'rajesh@htaipl.com', name: 'Rajesh Sharma' },
    { email: 'thiyagarajan@htaipl.com', name: 'Thiyagarajan' },
    { email: 'chandrashekar@htaipl.com', name: 'Chandrashekar' },
  ]

  for (const eng of engineers) {
    const engineer = await prisma.user.upsert({
      where: { tenantId_email: { tenantId, email: eng.email } },
      update: { assignedAdminId: masterAdmin.id },
      create: {
        tenantId,
        email: eng.email,
        name: eng.name,
        passwordHash: engineerPassword,
        role: 'ENGINEER',
        authProvider: 'PASSWORD',
        assignedAdminId: masterAdmin.id,
        isActive: true,
      },
    })
    console.log('Created Engineer:', engineer.email, '-> Reports to:', masterAdmin.name)
  }

  // ==================
  // CUSTOMER ACCOUNTS
  // ==================
  console.log('\n--- Creating Customer Accounts ---')

  const customerAccount1 = await prisma.customerAccount.upsert({
    where: { tenantId_companyName: { tenantId, companyName: 'Test Company Pvt Ltd' } },
    update: {},
    create: {
      tenantId,
      companyName: 'Test Company Pvt Ltd',
      address: '123 Test Street, Bangalore',
      contactEmail: 'contact@testcompany.com',
      contactPhone: '+91-9876543210',
      assignedAdminId: masterAdmin.id,
      isActive: true,
    },
  })
  console.log('Created Customer Account:', customerAccount1.companyName)

  const customerAccount2 = await prisma.customerAccount.upsert({
    where: { tenantId_companyName: { tenantId, companyName: 'Beta Corporation' } },
    update: {},
    create: {
      tenantId,
      companyName: 'Beta Corporation',
      address: '456 Beta Avenue, Mumbai',
      contactEmail: 'info@betacorp.com',
      contactPhone: '+91-8765432109',
      assignedAdminId: masterAdmin.id,
      isActive: true,
    },
  })
  console.log('Created Customer Account:', customerAccount2.companyName)

  // ==================
  // CUSTOMER USERS
  // ==================
  console.log('\n--- Creating Customer Users ---')
  const customerPassword = await bcrypt.hash('customer123', 12)

  const customer1 = await prisma.customerUser.upsert({
    where: { tenantId_email: { tenantId, email: 'customer@example.com' } },
    update: { customerAccountId: customerAccount1.id },
    create: {
      tenantId,
      email: 'customer@example.com',
      name: 'Test Customer',
      passwordHash: customerPassword,
      companyName: 'Test Company Pvt Ltd',
      customerAccountId: customerAccount1.id,
      isActive: true,
      isPoc: true,
      activatedAt: new Date(),
    },
  })
  console.log('Created Customer (POC):', customer1.email)

  // Link as primary POC
  await prisma.customerAccount.update({
    where: { id: customerAccount1.id },
    data: { primaryPocId: customer1.id },
  })

  const customer2 = await prisma.customerUser.upsert({
    where: { tenantId_email: { tenantId, email: 'beta@betacorp.com' } },
    update: { customerAccountId: customerAccount2.id },
    create: {
      tenantId,
      email: 'beta@betacorp.com',
      name: 'Beta Customer User',
      passwordHash: customerPassword,
      companyName: 'Beta Corporation',
      customerAccountId: customerAccount2.id,
      isActive: true,
      isPoc: true,
      activatedAt: new Date(),
    },
  })
  console.log('Created Customer (POC):', customer2.email)

  await prisma.customerAccount.update({
    where: { id: customerAccount2.id },
    data: { primaryPocId: customer2.id },
  })

  // ==================
  // MASTER INSTRUMENTS
  // ==================
  console.log('\n--- Migrating Master Instruments from JSON ---')

  const existingInstruments = await prisma.masterInstrument.count({ where: { tenantId } })
  if (existingInstruments > 0) {
    console.log(`Skipping instrument migration - ${existingInstruments} instruments already exist`)
  } else {
    const jsonPath = path.join(__dirname, '../src/data/master-instruments.json')
    try {
      const jsonData = fs.readFileSync(jsonPath, 'utf-8')
      const instruments: MasterInstrumentJson[] = JSON.parse(jsonData)

      let successCount = 0
      let errorCount = 0

      for (const instrument of instruments) {
        try {
          const instrumentId = crypto.randomUUID()
          await prisma.masterInstrument.create({
            data: {
              tenantId,
              instrumentId,
              version: 1,
              isLatest: true,
              legacyId: instrument.id,
              category: instrument.type,
              description: instrument.instrument_desc,
              make: serializeCompositeValue(instrument.make),
              model: serializeCompositeValue(instrument.model),
              assetNumber: instrument.asset_no,
              serialNumber: serializeCompositeValue(instrument.instrument_sl_no),
              usage: instrument.usage || null,
              calibratedAtLocation: instrument.calibrated_at || null,
              reportNo: instrument.report_no || null,
              calibrationDueDate: parseDate(instrument.next_due_on),
              rangeData: instrument.range && instrument.range.length > 0 ? instrument.range : undefined,
              remarks: instrument.remarks || null,
              isActive: true,
              importedFromJson: true,
              changeReason: 'Initial seed import',
            },
          })
          successCount++
        } catch (err) {
          errorCount++
          console.error(`Failed to import instrument ${instrument.id} (${instrument.asset_no}):`, err)
        }
      }

      console.log(`Imported ${successCount} instruments (${errorCount} errors)`)
    } catch (err) {
      console.error('Failed to read master-instruments.json:', err)
    }
  }

  // ==================
  // MASTER INSTRUMENT CERTIFICATES
  // ==================
  await seedCertificates(tenantId, masterAdmin.id)

  // ==================
  // SUMMARY
  // ==================
  console.log('\n========================================')
  console.log('        SEED COMPLETED SUCCESSFULLY')
  console.log('========================================')
  console.log('\nTest Credentials:')
  console.log('----------------------------------------')
  console.log('MASTER Admin: admin@htaipl.com / admin123')
  console.log('Engineer 1:   kiran@htaipl.com / engineer123')
  console.log('Engineer 2:   rajesh@htaipl.com / engineer123')
  console.log('Engineer 3:   thiyagarajan@htaipl.com / engineer123')
  console.log('Engineer 4:   chandrashekar@htaipl.com / engineer123')
  console.log('Customer 1:   customer@example.com / customer123')
  console.log('Customer 2:   beta@betacorp.com / customer123')
  console.log('----------------------------------------\n')
}

main()
  .catch((e) => {
    console.error('Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
