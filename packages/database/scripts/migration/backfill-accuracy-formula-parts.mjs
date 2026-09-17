/**
 * The numbers behind every formula accuracy, copied out of the registry.
 *
 * A bucket whose accuracy reads "+/-0.02% of reading +/-2 count" was imported with
 * only that sentence. The app rates a master by computing its accuracy at the
 * reading in hand, and it cannot compute with a sentence - so 120 buckets across
 * 85 instruments had nothing to rate by, which shows as a grey "Acc." badge and
 * stops the engineer to ask for a written justification.
 *
 * The registry already holds those numbers, parsed when it was built. This copies
 * them across rather than parsing the text a second time: the parse was done once
 * and a second implementation is one more thing to keep in step with the first.
 *
 * Matched on instrument -> profile -> subtype -> bucket, which lines up for all
 * 120 with none left over. Run:
 *
 *   node scripts/backfill-accuracy-formula-parts.mjs [--apply]
 *
 * Without --apply it reports what it would do and writes nothing.
 */
import { PrismaClient } from '@prisma/client'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const REGISTRY = resolve(
  here, '..', '..', '..', '..', 'apps', 'web-hta', 'src', 'data', 'master-instrument-registry.json',
)

const apply = process.argv.includes('--apply')
const prisma = new PrismaClient()

const registry = JSON.parse(readFileSync(REGISTRY, 'utf8'))

/** legacyId -> instrumentId, which is what a capability actually hangs off. */
const instruments = await prisma.masterInstrument.findMany({
  where: { isActive: true, isLatest: true },
  select: { instrumentId: true, legacyId: true },
})
const instrumentOf = new Map(
  instruments.filter((i) => i.legacyId !== null).map((i) => [i.legacyId, i.instrumentId]),
)

/** Every bucket row, addressable the way the registry addresses it. */
const profiles = await prisma.masterCapabilityProfile.findMany({
  include: { buckets: true, subtypes: { include: { buckets: true } } },
})
const rowAt = new Map()
for (const profile of profiles) {
  for (const b of profile.buckets) {
    rowAt.set(`${profile.instrumentId}|${profile.profileKey}||${b.bucketKey}`, b)
  }
  for (const s of profile.subtypes) {
    for (const b of s.buckets) {
      rowAt.set(`${profile.instrumentId}|${profile.profileKey}|${s.subtypeKey}|${b.bucketKey}`, b)
    }
  }
}

const writes = []
const unparsed = []
const missing = []

for (const asset of registry.assets) {
  for (const unit of asset.units) {
    const instrumentId = instrumentOf.get(unit.legacy_id)
    if (!instrumentId) continue

    for (const profile of unit.capability_profiles ?? []) {
      const buckets = [
        ...(profile.buckets ?? []).map((b) => ['', b]),
        ...(profile.subtypes ?? []).flatMap((s) => (s.buckets ?? []).map((b) => [s.id, b])),
      ]

      for (const [subtype, bucket] of buckets) {
        const accuracy = bucket.accuracy ?? {}
        if (accuracy.type !== 'formula') continue

        const row = rowAt.get(`${instrumentId}|${profile.id}|${subtype}|${bucket.id}`)
        if (!row) {
          missing.push(`${unit.legacy_id} ${profile.id} ${subtype || '-'} ${bucket.id}`)
          continue
        }

        /**
         * The sentence as well as the numbers.
         *
         * The import dropped both: every one of the 120 formula buckets has a null
         * accuracyFormula. That one is not about rating - the snapshot copied onto a
         * certificate prints this text as the master's accuracy, so without it the
         * certificate states a blank where a figure belongs.
         *
         * Written even for the two that carry no numbers, because a certificate can
         * print "+/-(0.004 x t)" perfectly well even where the app cannot compute it.
         */
        const text = accuracy.expression ?? null

        if (accuracy.percent_value == null && accuracy.digits == null) {
          unparsed.push(`${unit.legacy_id} ${bucket.id}: ${accuracy.expression}`)
          // Still worth the text, which is what the certificate prints.
          if (text) {
            writes.push({
              id: row.id,
              where: `${unit.legacy_id} ${profile.id} ${bucket.id}`,
              expression: text,
              data: { accuracyFormula: text },
            })
          }
          continue
        }

        writes.push({
          id: row.id,
          where: `${unit.legacy_id} ${profile.id}${subtype ? ' ' + subtype : ''} ${bucket.id}`,
          expression: accuracy.expression,
          data: {
            accuracyFormula: text,
            accuracyPercentOf: accuracy.percent_of ?? null,
            accuracyPercentValue: accuracy.percent_value ?? null,
            accuracyDigits: accuracy.digits ?? null,
            accuracyDigitsUnit: accuracy.digits_unit ?? null,
          },
        })
      }
    }
  }
}

console.log(`bucket rows in the database : ${rowAt.size}`)
console.log(`formula buckets to fill in  : ${writes.length}`)
console.log(`  of those, text only       : ${unparsed.length}`)
console.log(`no matching row             : ${missing.length}`)

if (missing.length) {
  console.log('\nunmatched:')
  for (const m of missing.slice(0, 10)) console.log('   ' + m)
}
if (unparsed.length) {
  console.log('\nleft unrated, as they are today:')
  for (const u of unparsed) console.log('   ' + u)
}

console.log('\nsample of what would be written:')
for (const w of writes.slice(0, 5)) {
  const d = w.data
  console.log(
    `   ${w.where.padEnd(22)} ${w.expression.padEnd(30)} ->` +
      ` ${d.accuracyPercentValue ?? '-'} of ${d.accuracyPercentOf ?? '-'}` +
      `${d.accuracyDigits != null ? ` + ${d.accuracyDigits} ${d.accuracyDigitsUnit}` : ''}`,
  )
}

if (!apply) {
  console.log('\nnothing written. Pass --apply to write.')
  await prisma.$disconnect()
  process.exit(0)
}

// One transaction: a half-filled table would leave some masters rated and some
// not, which is harder to reason about than either end state.
await prisma.$transaction(
  writes.map((w) => prisma.masterCapabilityBucket.update({ where: { id: w.id }, data: w.data })),
)
console.log(`\nwritten: ${writes.length} rows.`)

await prisma.$disconnect()
