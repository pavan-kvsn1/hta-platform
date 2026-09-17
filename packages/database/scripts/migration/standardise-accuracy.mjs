/**
 * Make every accuracy in the register one the app can actually rate.
 *
 * 120 bands state their accuracy as a formula. After the parts were backfilled, 82 of
 * them reduced to a number and 38 did not, for four different reasons:
 *
 *   - 12 say the percentage is of "fsd". Full-scale deflection is full scale; the word
 *     is a synonym the engine does not know. A rename, nothing more.
 *   - 16 say "+/-2.0 %RH" and similar. That is two percentage points of humidity, an
 *     absolute figure - it was never a formula, and becomes a symmetric accuracy.
 *   -  8 were ambiguous in the source and the lab has since settled them. Their
 *     printed wording changes too, because the old wording was the ambiguity.
 *   -  2 carry "+/- 0.01 ohm" in the digits field, where the engine multiplies by the
 *     least count. 0.01 ohm is already the answer, so scaling it would state an
 *     accuracy nobody wrote.
 *
 * Seven bands end up as an expression, because no arrangement of one percentage and
 * one digits term holds them: a constant plus a percentage, or two percentages on two
 * bases. The rest stay in the columns, where they remain queryable.
 *
 * Writes both sides - the database and the bundled registry - because the registry is
 * still what the app falls back on when the API cannot be reached, and a fallback that
 * disagrees with the live path is worse than no fallback at all.
 *
 *   node scripts/standardise-accuracy.mjs [--apply]
 *
 * Without --apply it reports every change and writes nothing. Re-running after an
 * apply is a no-op: each edit is matched by what it is changing away from.
 */
import { PrismaClient } from '@prisma/client'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const REGISTRY = resolve(
  here, '..', '..', '..', '..', 'apps', 'web-hta', 'src', 'data', 'master-instrument-registry.json',
)

const apply = process.argv.includes('--apply')

/** A digits term counts least counts only where its unit says so. */
const COUNT_UNITS = new Set(['d', 'dgt', 'dgts', 'digit', 'digits', 'count', 'counts'])

/**
 * The five the lab settled, keyed as the registry addresses them.
 *
 * Each states what it is replacing as well as what it becomes, so an edit that has
 * already been applied - or that no longer matches the data - is skipped rather than
 * written twice or written over something else.
 */
const DECIDED = [
  {
    where: { legacyId: 177, profile: 'P1' },
    was: '±10% of the Master gauge',
    // "10% of the master gauge" is a comparison tolerance, not a device spec.
    expression: '±2.5% FSD',
    percentOf: 'full_scale',
    percentValue: 0.025,
  },
  {
    where: { legacyId: 204, profile: 'P1' },
    was: '+/- 1%',
    // Senseair state it as a constant plus a proportion. Needs an expression.
    expression: '±(330 ppm + 1% of reading)',
    evaluable: '330 + 0.01 * {reading}',
  },
  {
    where: { legacyId: 122, profile: 'P1' },
    was: '+/-1% HD',
    expression: '±1% FSD',
    percentOf: 'full_scale',
    percentValue: 0.01,
  },
  {
    where: { legacyId: 192, profile: 'P1' },
    was: '+/-(3% of reading + 0.3% FS)',
    // Two percentages, two bases. The wording was already right; only the arithmetic
    // behind it was missing.
    expression: '±(3% of reading + 0.3% FS)',
    evaluable: '0.03 * {reading} + 0.003 * {full scale}',
  },
  {
    where: { legacyId: 56, profile: 'P2' },
    was: '+/-(0.004 x t)',
    // 0.004 x t is 0.4% of t. The same accuracy, said in the register's own terms.
    expression: '±0.4% of reading',
    percentOf: 'reading',
    percentValue: 0.004,
  },
]

/**
 * What one band should become, or null to leave it alone.
 *
 * One function, used for the database rows and for the registry file, so the two
 * cannot be given different answers.
 */
function decide(band) {
  const { legacyId, profileKey, expression, percentOf, percentValue, digits, digitsUnit } = band

  const decided = DECIDED.find(
    (d) => d.where.legacyId === legacyId && d.where.profile === profileKey && expression === d.was,
  )
  if (decided) {
    return {
      why: 'settled by the lab',
      kind: 'FORMULA',
      expression: decided.expression,
      evaluable: decided.evaluable ?? null,
      percentOf: decided.percentOf ?? null,
      percentValue: decided.percentValue ?? null,
      digits: null,
      digitsUnit: null,
    }
  }

  // Percentage points of humidity: an absolute figure, not a proportion of anything.
  if (percentOf === 'rh' && percentValue !== null) {
    return {
      why: 'percentage points, not a proportion',
      kind: 'SYMMETRIC',
      value: Number((percentValue * 100).toPrecision(12)),
      unit: '%RH',
    }
  }

  // A digits term already in engineering units is a constant, and the only way to say
  // so is as arithmetic.
  if (digits !== null && digitsUnit && !COUNT_UNITS.has(digitsUnit.toLowerCase())) {
    if (percentOf !== 'reading' || percentValue === null) return null
    return {
      why: `a ${digitsUnit} term is a constant, not a count`,
      kind: 'FORMULA',
      expression,
      evaluable: `${percentValue} * {reading} + ${digits}`,
      percentOf: null,
      percentValue: null,
      digits: null,
      digitsUnit: null,
    }
  }

  // Full-scale deflection is full scale.
  if (percentOf === 'fsd') {
    return {
      why: 'fsd is full scale',
      kind: 'FORMULA',
      expression,
      evaluable: null,
      percentOf: 'full_scale',
      percentValue,
      digits,
      digitsUnit,
    }
  }

  return null
}

// =================================================================================
// The database
// =================================================================================
const prisma = new PrismaClient()

const instruments = await prisma.masterInstrument.findMany({
  where: { isActive: true, isLatest: true },
  select: { instrumentId: true, legacyId: true, assetNumber: true },
})
const legacyOf = new Map(instruments.map((i) => [i.instrumentId, i.legacyId]))
const assetOf = new Map(instruments.map((i) => [i.instrumentId, i.assetNumber]))

const profiles = await prisma.masterCapabilityProfile.findMany({
  include: { buckets: true, subtypes: { include: { buckets: true } } },
})

const writes = []
for (const profile of profiles) {
  const legacyId = legacyOf.get(profile.instrumentId)
  if (legacyId == null) continue

  const buckets = [
    ...profile.buckets.map((b) => [null, b]),
    ...profile.subtypes.flatMap((s) => s.buckets.map((b) => [s.subtypeKey, b])),
  ]

  for (const [subtypeKey, b] of buckets) {
    if (b.accuracyKind !== 'FORMULA') continue

    const outcome = decide({
      legacyId,
      profileKey: profile.profileKey,
      expression: b.accuracyFormula,
      percentOf: b.accuracyPercentOf,
      percentValue: b.accuracyPercentValue === null ? null : Number(b.accuracyPercentValue),
      digits: b.accuracyDigits === null ? null : Number(b.accuracyDigits),
      digitsUnit: b.accuracyDigitsUnit,
    })
    if (!outcome) continue

    const data =
      outcome.kind === 'SYMMETRIC'
        ? {
            accuracyKind: 'SYMMETRIC',
            accuracyValue: outcome.value,
            accuracyUnit: outcome.unit,
            accuracyFormula: null,
            accuracyExpression: null,
            accuracyPercentOf: null,
            accuracyPercentValue: null,
            accuracyDigits: null,
            accuracyDigitsUnit: null,
          }
        : {
            accuracyKind: 'FORMULA',
            accuracyFormula: outcome.expression,
            accuracyExpression: outcome.evaluable,
            accuracyPercentOf: outcome.percentOf,
            accuracyPercentValue: outcome.percentValue,
            accuracyDigits: outcome.digits,
            accuracyDigitsUnit: outcome.digitsUnit,
          }

    writes.push({
      id: b.id,
      label: `${String(legacyId).padStart(4)} ${assetOf.get(profile.instrumentId) ?? ''} ${profile.profileKey}${subtypeKey ? '/' + subtypeKey : ''} ${b.bucketKey}`,
      from: b.accuracyFormula,
      why: outcome.why,
      to:
        outcome.kind === 'SYMMETRIC'
          ? `symmetric ${outcome.value} ${outcome.unit}`
          : outcome.evaluable
            ? `"${outcome.expression}"  =  ${outcome.evaluable}`
            : `"${outcome.expression}"  =  ${outcome.percentValue} of ${outcome.percentOf}${outcome.digits !== null ? ` + ${outcome.digits} ${outcome.digitsUnit}` : ''}`,
      data,
    })
  }
}

// =================================================================================
// The bundled registry, edited the same way
// =================================================================================
const registryText = readFileSync(REGISTRY, 'utf8')
const registry = JSON.parse(registryText)
let fileEdits = 0

for (const asset of registry.assets) {
  for (const unit of asset.units) {
    for (const profile of unit.capability_profiles ?? []) {
      const groups = [
        profile.buckets ?? [],
        ...(profile.subtypes ?? []).map((s) => s.buckets ?? []),
      ]
      for (const buckets of groups) {
        for (const bucket of buckets) {
          const a = bucket.accuracy
          if (!a || a.type !== 'formula') continue

          const outcome = decide({
            legacyId: unit.legacy_id,
            profileKey: profile.id,
            expression: a.expression ?? null,
            percentOf: a.percent_of ?? null,
            percentValue: a.percent_value ?? null,
            digits: a.digits ?? null,
            digitsUnit: a.digits_unit ?? null,
          })
          if (!outcome) continue

          bucket.accuracy =
            outcome.kind === 'SYMMETRIC'
              ? { type: 'symmetric', value: outcome.value, unit: outcome.unit, polarity: a.polarity ?? '±' }
              : {
                  type: 'formula',
                  expression: outcome.expression,
                  evaluable: outcome.evaluable,
                  percent_of: outcome.percentOf,
                  percent_value: outcome.percentValue,
                  digits: outcome.digits,
                  digits_unit: outcome.digitsUnit,
                  polarity: a.polarity ?? '±',
                }
          fileEdits++
        }
      }
    }
  }
}

// =================================================================================
console.log(`database rows to change : ${writes.length}`)
console.log(`registry bands to change: ${fileEdits}`)

if (writes.length !== fileEdits) {
  console.error('\nThe two sides disagree on how many bands need changing. Stopping.')
  await prisma.$disconnect()
  process.exit(1)
}

const byReason = new Map()
for (const w of writes) byReason.set(w.why, (byReason.get(w.why) ?? 0) + 1)
console.log('')
for (const [why, n] of [...byReason].sort((a, b) => b[1] - a[1])) {
  console.log(`${String(n).padStart(4)}  ${why}`)
}

console.log('\nevery change:')
for (const w of writes) {
  console.log(`   ${w.label}`)
  console.log(`      was  ${w.from}`)
  console.log(`      now  ${w.to}`)
}

if (!apply) {
  console.log('\nnothing written. Pass --apply to write both sides.')
  await prisma.$disconnect()
  process.exit(0)
}

// One transaction. Half of these applied would leave the register in a state nobody
// designed: some humidity meters symmetric and some still formulas.
await prisma.$transaction(
  writes.map((w) => prisma.masterCapabilityBucket.update({ where: { id: w.id }, data: w.data })),
)
console.log(`\ndatabase: ${writes.length} rows written.`)

// Two-space JSON with a trailing newline, as the file already is.
writeFileSync(REGISTRY, JSON.stringify(registry, null, 2) + '\n', 'utf8')
console.log(`registry: ${fileEdits} bands written.`)

await prisma.$disconnect()
