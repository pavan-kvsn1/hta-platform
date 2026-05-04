/**
 * Standalone script to delete a certificate and all its traces from Cloud SQL and GCS.
 *
 * Usage:
 *   npx tsx scripts/delete-certificate.ts <certificate-id> [--dry-run]
 *
 * Prerequisites:
 *   - DATABASE_URL environment variable set (or .env file in project root)
 *   - GCS_CERTIFICATES_BUCKET / GCS_IMAGES_BUCKET env vars (for file cleanup)
 *   - GCP credentials configured (for GCS access)
 *
 * What it deletes:
 *   DB (cascaded automatically by Prisma onDelete: Cascade):
 *     CertificateEvent, CertificateRevision, ReviewFeedback, Parameter (+CalibrationResult),
 *     CertificateMasterInstrument, Signature, ApprovalToken, OpenSignDocument,
 *     SigningEvidence, ChatThread (+ChatMessage), UUCImage, CertificateImage,
 *     DownloadToken (+TokenAccessLog)
 *
 *   DB (handled explicitly - no cascade):
 *     InternalRequest (sets certificateId to null)
 *     Notification (deletes where certificateId matches)
 *
 *   GCS files:
 *     certificates/<cert-id>/  (all images: UUC, master instrument, readings)
 *     Signed PDF (if signedPdfPath is set)
 *     UUCImage storagePaths
 */

import { PrismaClient } from '@prisma/client'
import { Storage } from '@google-cloud/storage'

const prisma = new PrismaClient()

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const certId = args.find(a => !a.startsWith('--'))

  if (!certId) {
    console.error('Usage: npx tsx scripts/delete-certificate.ts <certificate-id> [--dry-run]')
    process.exit(1)
  }

  if (dryRun) {
    console.log('=== DRY RUN MODE — no changes will be made ===\n')
  }

  // 1. Verify the certificate exists and show summary
  const cert = await prisma.certificate.findUnique({
    where: { id: certId },
    include: {
      _count: {
        select: {
          events: true,
          revisions: true,
          feedbacks: true,
          parameters: true,
          masterInstruments: true,
          signatures: true,
          approvalTokens: true,
          openSignDocuments: true,
          signingEvidence: true,
          chatThreads: true,
          uucImages: true,
          certificateImages: true,
          downloadTokens: true,
          internalRequests: true,
          notifications: true,
        },
      },
    },
  })

  if (!cert) {
    console.error(`Certificate not found: ${certId}`)
    process.exit(1)
  }

  console.log(`Certificate: ${cert.certificateNumber} (${cert.id})`)
  console.log(`Status: ${cert.status}`)
  console.log(`Customer: ${cert.customerName || 'N/A'}`)
  console.log(`UUC: ${cert.uucDescription || 'N/A'} — S/N: ${cert.uucSerialNumber || 'N/A'}`)
  console.log(`Created: ${cert.createdAt.toISOString()}`)
  console.log(`Signed PDF: ${cert.signedPdfPath || 'none'}`)
  console.log('')
  console.log('Related records:')

  const counts = cert._count
  for (const [model, count] of Object.entries(counts)) {
    if (count > 0) {
      console.log(`  ${model}: ${count}`)
    }
  }
  console.log('')

  // 2. Collect GCS files to delete
  const filesToDelete: { bucket: string; path: string }[] = []

  // Signed PDF
  if (cert.signedPdfPath) {
    const certBucket = process.env.GCS_CERTIFICATES_BUCKET
    if (certBucket) {
      filesToDelete.push({ bucket: certBucket, path: cert.signedPdfPath })
    }
  }

  // UUCImage storage paths
  const uucImages = await prisma.uUCImage.findMany({
    where: { certificateId: certId },
    select: { storagePath: true },
  })
  const certBucket = process.env.GCS_CERTIFICATES_BUCKET
  if (certBucket) {
    for (const img of uucImages) {
      filesToDelete.push({ bucket: certBucket, path: img.storagePath })
    }
  }

  // CertificateImage storage keys (in images bucket)
  const certImages = await prisma.certificateImage.findMany({
    where: { certificateId: certId },
    select: { storageKey: true, storageBucket: true },
  })
  const imagesBucket = process.env.GCS_IMAGES_BUCKET || process.env.GCS_CERTIFICATES_BUCKET
  if (imagesBucket) {
    for (const img of certImages) {
      const bucket = img.storageBucket || imagesBucket
      filesToDelete.push({ bucket, path: img.storageKey })
    }
  }

  if (filesToDelete.length > 0) {
    console.log(`GCS files to delete: ${filesToDelete.length}`)
    for (const f of filesToDelete) {
      console.log(`  gs://${f.bucket}/${f.path}`)
    }
    console.log('')
  }

  if (dryRun) {
    console.log('Dry run complete. No changes made.')
    return
  }

  // 3. Prompt for confirmation
  const readline = await import('readline')
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const answer = await new Promise<string>(resolve => {
    rl.question('Type "DELETE" to confirm deletion: ', resolve)
  })
  rl.close()

  if (answer !== 'DELETE') {
    console.log('Aborted.')
    return
  }

  console.log('\nDeleting...')

  // 4. Handle non-cascading relations first
  const [irResult, notifResult] = await Promise.all([
    prisma.internalRequest.updateMany({
      where: { certificateId: certId },
      data: { certificateId: null },
    }),
    prisma.notification.deleteMany({
      where: { certificateId: certId },
    }),
  ])

  console.log(`  InternalRequests unlinked: ${irResult.count}`)
  console.log(`  Notifications deleted: ${notifResult.count}`)

  // 5. Delete the certificate (cascades handle the rest)
  await prisma.certificate.delete({
    where: { id: certId },
  })
  console.log('  Certificate deleted (cascade cleaned up all child records)')

  // 6. Delete GCS files
  if (filesToDelete.length > 0) {
    const storage = new Storage({
      projectId: process.env.GCP_PROJECT_ID,
    })

    let deletedCount = 0
    let failedCount = 0

    for (const f of filesToDelete) {
      try {
        const file = storage.bucket(f.bucket).file(f.path)
        const [exists] = await file.exists()
        if (exists) {
          await file.delete()
          deletedCount++
        }
      } catch (err) {
        failedCount++
        console.error(`  Failed to delete gs://${f.bucket}/${f.path}:`, err instanceof Error ? err.message : err)
      }
    }

    console.log(`  GCS files deleted: ${deletedCount}, failed: ${failedCount}`)
  }

  // 7. Also clean up the entire certificate images folder in GCS
  if (imagesBucket) {
    try {
      const storage = new Storage({ projectId: process.env.GCP_PROJECT_ID })
      const prefix = `certificates/${certId}/`
      const [files] = await storage.bucket(imagesBucket).getFiles({ prefix })
      if (files.length > 0) {
        console.log(`  Cleaning up ${files.length} remaining files under ${prefix}`)
        await Promise.all(files.map(f => f.delete()))
      }
    } catch (err) {
      console.error('  Failed to clean GCS folder:', err instanceof Error ? err.message : err)
    }
  }

  console.log('\nDone. Certificate and all traces have been removed.')
}

main()
  .catch((err) => {
    console.error('Fatal error:', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
