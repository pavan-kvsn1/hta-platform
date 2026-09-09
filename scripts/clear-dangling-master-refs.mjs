/**
 * Let a parameter go of a master its certificate does not carry.
 *
 * A parameter can name a master that is no longer attached to the certificate - taken
 * off before removal cleared these fields, or edited elsewhere. The reference is
 * already broken: the assignment row can never be ticked, and the card reports a master
 * that is not there. The app now drops such a reference when the certificate loads, but
 * only in the copy on screen; the row keeps it until the certificate is saved.
 *
 * This is the same repair, made where the data lives.
 *
 * Everything cleared alongside the id was read off that one instrument - which of its
 * capabilities was used, on which curve, under which procedure, what the reviewer was
 * told, and how a master measuring something else was mapped to the parameter. None of
 * it means anything about the next master.
 *
 * Draft certificates only. A signed one is a record of what was signed; if one turns up
 * here it is reported and left alone, because that is a conversation and not a script.
 *
 * Usage:  node scripts/clear-dangling-master-refs.mjs [--check]
 */

import { PrismaClient } from '@prisma/client'

const EDITABLE = ['DRAFT', 'REVISION_REQUIRED', 'CUSTOMER_REVISION_REQUIRED']
const check = process.argv.includes('--check')
const prisma = new PrismaClient()

const dangling = await prisma.$queryRawUnsafe(`
  SELECT pa.id, pa."parameterName", pa."masterInstrumentId", pa."masterProfileId",
         pa."sopReference", c.id AS "certificateId", c."certificateNumber", c.status
  FROM "Parameter" pa
  JOIN "Certificate" c ON c.id = pa."certificateId"
  WHERE pa."masterInstrumentId" IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM "CertificateMasterInstrument" cmi
      WHERE cmi."certificateId" = c.id
        AND cmi."masterInstrumentId" = pa."masterInstrumentId"
    )
  ORDER BY c."certificateNumber", pa."parameterName"
`)

console.log(`${dangling.length} parameter(s) name a master their certificate does not carry\n`)

const skipped = dangling.filter((r) => !EDITABLE.includes(r.status))
const target = dangling.filter((r) => EDITABLE.includes(r.status))

for (const r of target) {
  console.log(
    `  ${r.certificateNumber.padEnd(22)} ${String(r.status).padEnd(10)} ` +
      `${String(r.parameterName).padEnd(24)} master ${r.masterInstrumentId}` +
      `${r.masterProfileId ? `, profile ${r.masterProfileId}` : ''}` +
      `${r.sopReference ? `, SOP ${r.sopReference}` : ''}`,
  )
  if (!check) {
    await prisma.parameter.update({
      where: { id: r.id },
      data: {
        masterInstrumentId: null,
        masterProfileId: null,
        masterSubtype: null,
        masterAcceptanceReason: null,
        masterMapping: null,
        sopReference: null,
      },
    })
  }
}

if (skipped.length) {
  console.log('\nleft alone, not editable:')
  for (const r of skipped) {
    console.log(`  ${r.certificateNumber.padEnd(22)} ${r.status.padEnd(10)} ${r.parameterName}`)
  }
}

console.log(check ? '\n--check: nothing written' : `\nwritten. ${target.length} cleared.`)
await prisma.$disconnect()
