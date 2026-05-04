/**
 * Ad-hoc script: Wipe and re-seed MasterInstrument + MasterInstrumentCertificate
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." npx tsx adhocs/reseed-master-instruments.ts
 *
 * What it does:
 *   1. Deletes all MasterInstrumentCertificate records
 *   2. Deletes all MasterInstrument records
 *   3. Re-creates instruments from master-instruments.json with ALL fields
 *      (including parameterGroup, parameterCapabilities, parameterRoles, sopReferences)
 *   4. Re-seeds calibration certificates from reference_docs/certificate_pdfs/ (uploads to GCS or local)
 */

import { PrismaClient } from '@prisma/client'
import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'

const prisma = new PrismaClient()

// --- Types ---

interface MasterInstrumentJson {
  id: number
  type: string
  parameter_group?: string | null
  parameter?: {
    role?: string[]
    capabilities?: string[]
  } | null
  sop_references?: string[] | null
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

// --- Helpers ---

function serializeCompositeValue(value: string | { ind?: string; sen?: string } | undefined): string {
  if (!value) return ''
  if (typeof value === 'string') return value
  const parts: string[] = []
  if (value.ind) parts.push(`Ind: ${value.ind}`)
  if (value.sen) parts.push(`Sen: ${value.sen}`)
  return parts.join(' / ') || ''
}

function parseDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null
  const parts = dateStr.split('/')
  if (parts.length !== 3) return null
  const [month, day, year] = parts.map(Number)
  return new Date(year, month - 1, day)
}

function assetNumberToFileName(assetNumber: string): string {
  return assetNumber.replace(/\//g, ' ') + '.pdf'
}

// --- Main ---

async function main() {
  console.log('=== Re-seed Master Instruments ===\n')

  // Find the tenant
  const tenant = await prisma.tenant.findFirst({ where: { isActive: true } })
  if (!tenant) {
    console.error('No active tenant found!')
    process.exit(1)
  }
  console.log(`Tenant: ${tenant.name} (${tenant.slug})\n`)

  // Find an admin user for certificate upload attribution
  const admin = await prisma.user.findFirst({
    where: { tenantId: tenant.id, role: 'ADMIN' },
  })
  if (!admin) {
    console.error('No admin user found!')
    process.exit(1)
  }

  // --- Step 1: Wipe ---
  console.log('--- Step 1: Deleting existing records ---')

  const certCount = await prisma.masterInstrumentCertificate.count()
  const instCount = await prisma.masterInstrument.count()
  console.log(`  Found ${certCount} certificates, ${instCount} instruments`)

  await prisma.masterInstrumentCertificate.deleteMany()
  console.log(`  Deleted ${certCount} MasterInstrumentCertificate records`)

  await prisma.masterInstrument.deleteMany()
  console.log(`  Deleted ${instCount} MasterInstrument records`)

  // --- Step 2: Re-seed instruments ---
  console.log('\n--- Step 2: Importing instruments from JSON ---')

  const jsonPath = path.resolve(__dirname, '../apps/web-hta/src/data/master-instruments.json')
  if (!fs.existsSync(jsonPath)) {
    console.error(`JSON not found: ${jsonPath}`)
    process.exit(1)
  }

  const instruments: MasterInstrumentJson[] = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'))
  console.log(`  Found ${instruments.length} instruments in JSON`)

  let created = 0
  let errors = 0

  for (const inst of instruments) {
    try {
      await prisma.masterInstrument.create({
        data: {
          tenantId: tenant.id,
          instrumentId: crypto.randomUUID(),
          version: 1,
          isLatest: true,
          legacyId: inst.id,
          category: inst.type,
          description: inst.instrument_desc,
          make: serializeCompositeValue(inst.make),
          model: serializeCompositeValue(inst.model),
          assetNumber: inst.asset_no,
          serialNumber: serializeCompositeValue(inst.instrument_sl_no),
          usage: inst.usage || null,
          calibratedAtLocation: inst.calibrated_at || null,
          reportNo: inst.report_no || null,
          calibrationDueDate: parseDate(inst.next_due_on),
          rangeData: inst.range && inst.range.length > 0 ? inst.range : undefined,
          remarks: inst.remarks || null,
          parameterGroup: inst.parameter_group || null,
          parameterCapabilities: inst.parameter?.capabilities || [],
          parameterRoles: inst.parameter?.role || [],
          sopReferences: inst.sop_references || [],
          isActive: true,
          importedFromJson: true,
          changeReason: 'Re-seeded with full parameter metadata',
        },
      })
      created++
    } catch (err) {
      errors++
      console.error(`  FAILED instrument ${inst.id} (${inst.asset_no}):`, err)
    }
  }

  console.log(`  Created: ${created}`)
  console.log(`  Errors: ${errors}`)

  // --- Step 3: Re-seed certificates ---
  console.log('\n--- Step 3: Re-seeding calibration certificates ---')

  const pdfSourceDir = path.resolve(__dirname, '../apps/web-hta/reference_docs/certificate_pdfs')
  if (!fs.existsSync(pdfSourceDir)) {
    console.log(`  PDF source dir not found: ${pdfSourceDir}`)
    console.log('  Skipping certificate seeding')
  } else {
    const GCS_BUCKET = 'hta-platform-prod-production-uploads'
    // @google-cloud/storage is installed in apps/api
    const { Storage } = await import('../apps/api/node_modules/@google-cloud/storage/build/cjs/src/index.js')
    const storage = new (Storage as any)({ projectId: 'hta-platform-prod' })
    const gcsBucket = storage.bucket(GCS_BUCKET)
    console.log(`  Uploading to gs://${GCS_BUCKET}/master-instruments/`)

    const newInstruments = await prisma.masterInstrument.findMany({
      where: { tenantId: tenant.id, isActive: true, isLatest: true },
      select: { id: true, assetNumber: true, reportNo: true, calibrationDueDate: true },
    })

    // Pre-scan to count how many PDFs we'll actually upload
    const uploadable: typeof newInstruments = []
    const skippedAssets: string[] = []
    for (const mi of newInstruments) {
      const fileName = assetNumberToFileName(mi.assetNumber)
      const sourcePath = path.join(pdfSourceDir, fileName)
      if (fs.existsSync(sourcePath)) {
        uploadable.push(mi)
      } else {
        skippedAssets.push(mi.assetNumber)
      }
    }

    const total = uploadable.length
    let certCreated = 0
    let certErrors = 0
    const startTime = Date.now()

    console.log(`  Found ${total} PDFs to upload, ${skippedAssets.length} skipped (no PDF)\n`)

    for (let i = 0; i < uploadable.length; i++) {
      const mi = uploadable[i]
      const fileName = assetNumberToFileName(mi.assetNumber)
      const sourcePath = path.join(pdfSourceDir, fileName)

      try {
        const pdfBuffer = fs.readFileSync(sourcePath)
        const fileStoragePath = `master-instruments/${fileName}`

        const file = gcsBucket.file(fileStoragePath)
        await file.save(pdfBuffer, { contentType: 'application/pdf', resumable: false })

        await prisma.masterInstrumentCertificate.create({
          data: {
            masterInstrumentId: mi.id,
            fileName,
            fileSize: pdfBuffer.length,
            mimeType: 'application/pdf',
            storagePath: fileStoragePath,
            reportNo: mi.reportNo,
            validUntil: mi.calibrationDueDate,
            uploadedById: admin.id,
            isLatest: true,
            isActive: true,
          },
        })
        certCreated++
      } catch (err) {
        certErrors++
        console.error(`  FAILED cert for ${mi.assetNumber}:`, err)
      }

      // Progress bar
      const done = i + 1
      const pct = Math.round((done / total) * 100)
      const elapsed = (Date.now() - startTime) / 1000
      const rate = done / elapsed
      const eta = Math.round((total - done) / rate)
      const barLen = 30
      const filled = Math.round((done / total) * barLen)
      const bar = '█'.repeat(filled) + '░'.repeat(barLen - filled)
      process.stdout.write(`\r  ${bar} ${pct}% (${done}/${total}) | ${rate.toFixed(1)}/s | ETA: ${eta}s  `)
    }

    console.log('\n')
    console.log(`  Uploaded: ${certCreated}`)
    console.log(`  Skipped (no PDF): ${skippedAssets.length}`)
    console.log(`  Errors: ${certErrors}`)
  }

  // --- Summary ---
  console.log('\n========================================')
  console.log('  RE-SEED COMPLETE')
  console.log('========================================')
  const finalCount = await prisma.masterInstrument.count()
  const finalCertCount = await prisma.masterInstrumentCertificate.count()
  console.log(`  Master Instruments: ${finalCount}`)
  console.log(`  Certificates: ${finalCertCount}`)
  console.log('========================================\n')
}

main()
  .catch((e) => {
    console.error('Script failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
