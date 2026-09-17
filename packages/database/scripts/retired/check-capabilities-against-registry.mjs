/**
 * Does the database hold what the bundled registry holds?
 *
 * The certificate flow judges a master instrument - can it measure this, over
 * this range, accurately enough - from a 1.3 MB registry file compiled into the
 * web app. Moving that to the database is only safe where the two agree, and
 * agreeing on a developer's machine says nothing about agreeing on the lab's.
 *
 * So this runs anywhere a connection string reaches, and compares every field
 * the app actually reads: the parameter, the span, each range band, each least
 * count, and each of the four shapes an accuracy comes in.
 *
 *   DATABASE_URL=... node scripts/check-capabilities-against-registry.mjs
 *
 * Exits 0 when they agree and 1 when they do not, so it can gate a deploy.
 *
 * Expect this to start reporting differences once instruments are edited in the
 * admin pages - at that point the database is right and the file is stale, which
 * is the whole reason for the move. Run it before the switch, not after.
 */
import { PrismaClient } from '@prisma/client'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const REGISTRY = resolve(
  here, '..', '..', '..', '..', 'apps', 'web-hta', 'src', 'data', 'master-instrument-registry.json',
)

const prisma = new PrismaClient()
const registry = JSON.parse(readFileSync(REGISTRY, 'utf8'))

const instruments = await prisma.masterInstrument.findMany({
  where: { isActive: true, isLatest: true },
  select: { instrumentId: true, legacyId: true },
})
const instrumentOf = new Map(
  instruments.filter((i) => i.legacyId !== null).map((i) => [i.legacyId, i.instrumentId]),
)

const profiles = await prisma.masterCapabilityProfile.findMany({
  include: {
    buckets: { orderBy: { sortOrder: 'asc' } },
    subtypes: { orderBy: { sortOrder: 'asc' }, include: { buckets: { orderBy: { sortOrder: 'asc' } } } },
  },
})
const profilesOf = new Map()
for (const p of profiles) {
  if (!profilesOf.has(p.instrumentId)) profilesOf.set(p.instrumentId, new Map())
  profilesOf.get(p.instrumentId).set(p.profileKey, p)
}

const num = (v) => (v === null || v === undefined ? null : Number(v))
const near = (a, b) =>
  a == null && b == null ? true
  : typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) < 1e-9
  : a === b

const diffs = []
let comparedProfiles = 0
let comparedBuckets = 0

const cmp = (where, field, file, db) => {
  if (!near(file, db)) diffs.push(`${where} ${field}: file ${JSON.stringify(file)} / db ${JSON.stringify(db)}`)
}

/** Only what the app reads. The file carries a few fields nothing consumes. */
function compareAccuracy(where, file, row) {
  const kind = row.accuracyKind
  if (!file && !kind) return
  if (!file || !kind) {
    diffs.push(`${where} accuracy: file ${file ? file.type : 'none'} / db ${kind ?? 'none'}`)
    return
  }
  const expected = { symmetric: 'SYMMETRIC', formula: 'FORMULA', class: 'CLASS', asymmetric: 'ASYMMETRIC' }[file.type]
  if (expected !== kind) {
    diffs.push(`${where} accuracy.type: file ${file.type} / db ${kind}`)
    return
  }
  switch (file.type) {
    case 'symmetric':
      cmp(where, 'accuracy.value', file.value, num(row.accuracyValue))
      cmp(where, 'accuracy.unit', file.unit ?? null, row.accuracyUnit)
      break
    case 'formula':
      // The sentence a certificate prints, and the numbers the app computes with.
      cmp(where, 'accuracy.expression', file.expression ?? null, row.accuracyFormula)
      // The arithmetic, where the numbers alone cannot hold the shape.
      cmp(where, 'accuracy.evaluable', file.evaluable ?? null, row.accuracyExpression)
      cmp(where, 'accuracy.percent_of', file.percent_of ?? null, row.accuracyPercentOf)
      cmp(where, 'accuracy.percent_value', file.percent_value ?? null, num(row.accuracyPercentValue))
      cmp(where, 'accuracy.digits', file.digits ?? null, num(row.accuracyDigits))
      cmp(where, 'accuracy.digits_unit', file.digits_unit ?? null, row.accuracyDigitsUnit)
      break
    case 'class':
      cmp(where, 'accuracy.class', file.class ?? null, row.accuracyClass)
      break
  }
}

function compareBuckets(where, fileBuckets, rows) {
  const fb = fileBuckets ?? []
  if (fb.length !== rows.length) {
    diffs.push(`${where}: ${fb.length} bands in the file, ${rows.length} in the database`)
    return
  }
  for (const f of fb) {
    const row = rows.find((r) => r.bucketKey === f.id)
    if (!row) {
      diffs.push(`${where} ${f.id}: band missing from the database`)
      continue
    }
    const at = `${where} ${f.id}`
    comparedBuckets++
    cmp(at, 'min', f.min, num(row.minValue))
    cmp(at, 'max', f.max, num(row.maxValue))
    cmp(at, 'min_inclusive', f.min_inclusive, row.minInclusive)
    cmp(at, 'max_inclusive', f.max_inclusive, row.maxInclusive)
    cmp(at, 'least_count', f.least_count?.value ?? null, num(row.leastCountValue))
    cmp(at, 'least_count.unit', f.least_count?.unit ?? null, row.leastCountUnit)
    compareAccuracy(at, f.accuracy ?? null, row)
  }
}

for (const asset of registry.assets) {
  for (const unit of asset.units) {
    const fileProfiles = unit.capability_profiles ?? []
    if (!fileProfiles.length) continue

    const instrumentId = instrumentOf.get(unit.legacy_id)
    if (!instrumentId) {
      diffs.push(`${unit.legacy_id}: in the file, no instrument in the database`)
      continue
    }
    const byKey = profilesOf.get(instrumentId)
    if (!byKey) {
      diffs.push(`${unit.legacy_id}: no capabilities in the database`)
      continue
    }

    for (const f of fileProfiles) {
      const row = byKey.get(f.id)
      const at = `${unit.legacy_id} ${f.id}`
      if (!row) {
        diffs.push(`${at}: missing from the database`)
        continue
      }
      comparedProfiles++
      cmp(at, 'parameter', f.parameter, row.parameter)
      cmp(at, 'role', f.role, row.role.toLowerCase())
      cmp(at, 'unit', f.unit, row.unit || null)
      cmp(at, 'kind', f.kind, row.kind.toLowerCase())
      /**
       * Which half, and how it measures.
       *
       * Added after this script reported 0 differences on a database that had lost
       * both. It only ever checked the fields it had been told about, so "no
       * differences" meant "none among the ones I thought of" - and six masters had
       * quietly stopped being able to tell their readout from their probe.
       */
      cmp(at, 'component', f.component ?? null, row.part)
      cmp(at, 'mode', f.mode ?? null, row.mode)
      cmp(at, 'min', f.min, num(row.minValue))
      cmp(at, 'max', f.max, num(row.maxValue))

      const fileSubs = f.subtypes ?? []
      if (fileSubs.length !== row.subtypes.length) {
        diffs.push(`${at}: ${fileSubs.length} subtypes in the file, ${row.subtypes.length} in the database`)
        continue
      }
      if (fileSubs.length) {
        for (const fs of fileSubs) {
          const rs = row.subtypes.find((s) => s.subtypeKey === fs.id)
          if (!rs) {
            diffs.push(`${at} ${fs.id}: subtype missing from the database`)
            continue
          }
          cmp(`${at} ${fs.id}`, 'min', fs.min, num(rs.minValue))
          cmp(`${at} ${fs.id}`, 'max', fs.max, num(rs.maxValue))
          compareBuckets(`${at} ${fs.id}`, fs.buckets, rs.buckets)
        }
      } else {
        compareBuckets(at, f.buckets, row.buckets)
      }
    }
  }
}

console.log(`profiles compared : ${comparedProfiles}`)
console.log(`bands compared    : ${comparedBuckets}`)
console.log(`differences       : ${diffs.length}`)
for (const d of diffs.slice(0, 30)) console.log('   ' + d)
if (diffs.length > 30) console.log(`   ... and ${diffs.length - 30} more`)
console.log(
  diffs.length
    ? '\nThe database does not yet match the file. Do not switch.'
    : '\nThe database holds exactly what the file holds. Safe to switch.',
)

await prisma.$disconnect()
process.exit(diffs.length ? 1 : 0)
