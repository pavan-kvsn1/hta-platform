/**
 * Take "AS A SOURCE" out of master instruments' SOP references.
 *
 * The master list's SOP REFERENCE column holds those words for ten instruments - dry
 * blocks, a granite surface plate, a current coil, a DDS signal generator, a humidity
 * chamber, optical parallels. It says how the instrument is used, not under which
 * procedure it was calibrated. Seeded into the database as a reference, it appeared in
 * the certificate's SOP Ref dropdown as something an engineer could pick and sign off.
 *
 * The registry file was corrected at its source; this is the same correction for the
 * rows the app actually reads. Narrow on purpose: it removes that one value and
 * nothing else, leaves every real reference in place and in order, and touches no row
 * that does not hold it.
 *
 * Usage:  node scripts/clean-sop-references.mjs [--check]
 */

import { PrismaClient } from '@prisma/client'

const NOT_A_REFERENCE = 'AS A SOURCE'
const check = process.argv.includes('--check')
const prisma = new PrismaClient()

const rows = await prisma.masterInstrument.findMany({
  // Current rows only. Older versions are a record of what the register said at the
  // time, and rewriting them would erase that rather than correct it.
  where: { sopReferences: { has: NOT_A_REFERENCE }, isLatest: true },
  select: { id: true, legacyId: true, assetNumber: true, sopReferences: true },
  orderBy: { legacyId: 'asc' },
})

console.log(`${rows.length} instrument(s) hold ${JSON.stringify(NOT_A_REFERENCE)}`)

for (const row of rows) {
  const kept = row.sopReferences.filter((s) => s.trim().toUpperCase() !== NOT_A_REFERENCE)
  console.log(
    `  ${String(row.assetNumber).padEnd(18)} ${JSON.stringify(row.sopReferences)} -> ${JSON.stringify(kept)}`,
  )
  if (!check) {
    await prisma.masterInstrument.update({ where: { id: row.id }, data: { sopReferences: kept } })
  }
}

const left = await prisma.masterInstrument.count({
  where: { sopReferences: { has: NOT_A_REFERENCE }, isLatest: true },
})
console.log(check ? '\n--check: nothing written' : `\nwritten. remaining: ${left}`)

await prisma.$disconnect()
