/**
 * Put a certificate back with its reviewer, after an approval nobody was told about.
 *
 * A reviewer approved HTA/S22734/165/26 and the app moved it to the customer. The
 * email that carries the link never went - the queue it goes through is not configured
 * here, so every notification on this machine has failed - and the link was never
 * opened. The certificate is waiting on a customer who does not know it exists, and
 * will go on waiting until the link expires.
 *
 * Three things, in this order. The link is revoked first: leaving it live while the
 * certificate moves back would give whoever holds that URL two days in which to approve
 * something that is no longer theirs to approve. Then the status. Then an event, so the
 * history says the approval was undone rather than showing one that inexplicably
 * un-happened.
 *
 * The signatures are left alone. The engineer's still stands - they did submit it - and
 * approving replaces the reviewer's rather than adding a second, so re-approving is
 * clean.
 *
 * Dry by default. Pass --apply to write.
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const APPLY = process.argv.includes('--apply')
const CERT_ID = process.argv.find((a) => a.startsWith('--id='))?.slice(5)
  ?? '5eed80c6-57e5-4eba-8e4f-4ab644103128'

/** Only an approval that nobody acted on can be quietly undone. */
const REVERTABLE_FROM = 'PENDING_CUSTOMER_APPROVAL'
const BACK_TO = 'PENDING_REVIEW'

async function main() {
  const cert = await prisma.certificate.findUnique({
    where: { id: CERT_ID },
    select: { id: true, certificateNumber: true, status: true, currentRevision: true, reviewerId: true },
  })
  if (!cert) throw new Error(`No certificate ${CERT_ID}`)

  console.log(`${cert.certificateNumber}  ${cert.status}  revision ${cert.currentRevision}`)

  if (cert.status !== REVERTABLE_FROM) {
    console.log(`\nNothing to do: expected ${REVERTABLE_FROM}, found ${cert.status}.`)
    return
  }

  const tokens = await prisma.approvalToken.findMany({
    where: { certificateId: CERT_ID, usedAt: null, expiresAt: { gt: new Date() } },
  })

  // A link somebody has already opened and acted on is not a link to revoke - it is a
  // decision, and this script has no business undoing one.
  const used = await prisma.approvalToken.count({
    where: { certificateId: CERT_ID, usedAt: { not: null } },
  })
  if (used > 0) {
    console.log(`\nSTOP: ${used} link(s) on this certificate have been used. The customer has acted; do not revert.`)
    return
  }

  console.log('\nWould change:')
  console.log(`  status              ${cert.status}  ->  ${BACK_TO}`)
  for (const t of tokens) {
    console.log(`  link ${t.token.slice(0, 8)}...  expires ${t.expiresAt.toISOString()}  ->  now (revoked, never opened)`)
  }
  console.log(`  + one CERTIFICATE_REVERTED_TO_REVIEW event on the history`)
  console.log('\nUnchanged: signatures, sign-offs, master decisions, revision number.')

  if (!APPLY) {
    console.log('\nDry run. Pass --apply to write.')
    return
  }

  const now = new Date()

  // Read the sequence number before opening the transaction, not inside it.
  //
  // An interactive transaction gets five seconds by default, and this is run against a
  // database reached through a cloud-sql-proxy tunnel where a single round trip is a
  // few hundred milliseconds - this ordered read over the event history was enough on
  // its own to blow the budget, and the whole revert rolled back. Nothing is lost by
  // reading first: the write below still fails if something else claims the number.
  const last = await prisma.certificateEvent.findFirst({
    where: { certificateId: CERT_ID },
    orderBy: { sequenceNumber: 'desc' },
    select: { sequenceNumber: true },
  })

  await prisma.$transaction(async (tx) => {
    // The link first, so there is no moment where it is live against a certificate
    // that has moved back.
    await tx.approvalToken.updateMany({
      where: { certificateId: CERT_ID, usedAt: null },
      data: { expiresAt: now },
    })

    await tx.certificate.update({
      where: { id: CERT_ID },
      data: { status: BACK_TO },
    })

    await tx.certificateEvent.create({
      data: {
        certificateId: CERT_ID,
        sequenceNumber: (last?.sequenceNumber ?? 0) + 1,
        revision: cert.currentRevision,
        eventType: 'CERTIFICATE_REVERTED_TO_REVIEW',
        eventData: JSON.stringify({
          from: REVERTABLE_FROM,
          to: BACK_TO,
          reason:
            'The customer notification was never sent - the email queue is not configured - and the review link was never opened.',
          revokedLinks: tokens.length,
        }),
        userId: cert.reviewerId,
        userRole: 'ENGINEER',
      },
    })
  }, {
    // Three writes over a tunnel. The default five seconds is the local-database
    // assumption, and it is not the one this script runs under.
    timeout: 20000,
    maxWait: 10000,
  })

  const after = await prisma.certificate.findUnique({
    where: { id: CERT_ID },
    select: { status: true },
  })
  const live = await prisma.approvalToken.count({
    where: { certificateId: CERT_ID, usedAt: null, expiresAt: { gt: new Date() } },
  })
  console.log(`\nDone. Status is now ${after?.status}; ${live} live link(s) remain.`)
}

main()
  .catch((e) => {
    console.error('FAILED:', e.message)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
