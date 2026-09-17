/**
 * Say which capability is the readout's and which is the probe's.
 *
 * Six masters are two pieces, certified separately, each with its own accuracy. The
 * registry has always recorded which capability is which; the import had nowhere to
 * put it, so the database holds two Temperature records against one instrument and
 * nothing to tell them apart.
 *
 * That was harmless while the app read the registry. Once it read the database, the
 * declaration panel could only distinguish them by range - and both read
 * "-100 to 500 °C", which tells an engineer nothing at all.
 *
 * The same field carries `mode` for 782 HTAIPL/L, a caliper checker whose two Length
 * capabilities are its height face and its outside face.
 *
 *   node scripts/backfill-capability-part.mjs [--apply]
 *
 * Without --apply it reports what it would write and writes nothing. Re-running after
 * an apply is a no-op.
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

const instruments = await prisma.masterInstrument.findMany({
  where: { isActive: true, isLatest: true },
  select: { instrumentId: true, legacyId: true, assetNumber: true },
})
const instrumentOf = new Map(
  instruments.filter((i) => i.legacyId !== null).map((i) => [i.legacyId, i.instrumentId]),
)
const assetOf = new Map(instruments.map((i) => [i.instrumentId, i.assetNumber]))

const profiles = await prisma.masterCapabilityProfile.findMany({
  select: { id: true, instrumentId: true, profileKey: true, parameter: true, part: true, mode: true },
})
const profileAt = new Map(profiles.map((p) => [`${p.instrumentId}|${p.profileKey}`, p]))

const writes = []
const missing = []

for (const asset of registry.assets) {
  for (const unit of asset.units) {
    const instrumentId = instrumentOf.get(unit.legacy_id)
    if (!instrumentId) continue

    for (const profile of unit.capability_profiles ?? []) {
      const component = profile.component ?? null
      const mode = profile.mode ?? null
      if (!component && !mode) continue

      const row = profileAt.get(`${instrumentId}|${profile.id}`)
      if (!row) {
        missing.push(`${unit.legacy_id} ${profile.id}: no such capability in the database`)
        continue
      }
      if (row.part === component && row.mode === mode) continue

      writes.push({
        id: row.id,
        where: `${String(unit.legacy_id).padStart(4)} ${String(assetOf.get(instrumentId) ?? '').padEnd(15)} ${profile.id} ${profile.parameter}`,
        to: component ?? mode,
        data: { part: component, mode },
      })
    }
  }
}

console.log(`capabilities to mark : ${writes.length}`)
console.log(`could not be matched : ${missing.length}`)
for (const m of missing) console.log('   ' + m)
for (const w of writes) console.log(`   ${w.where}  ->  ${w.to}`)

if (!apply) {
  console.log('\nnothing written. Pass --apply to write.')
  await prisma.$disconnect()
  process.exit(0)
}

await prisma.$transaction(
  writes.map((w) => prisma.masterCapabilityProfile.update({ where: { id: w.id }, data: w.data })),
)
console.log(`\nmarked: ${writes.length} capabilities.`)

await prisma.$disconnect()
