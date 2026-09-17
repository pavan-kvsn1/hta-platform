/**
 * Repair the master entries on certificates written before the app recorded enough.
 *
 * Two things are missing, for two different reasons.
 *
 * The parameter link travelled as a position while every save deleted and recreated
 * the parameter rows, so it went stale and came back null. That is a bug's leftovers:
 * the entry always served that parameter, the certificate just stopped saying so. It
 * is healed here on every certificate, issued or not.
 *
 * The least count and accuracy are snapshotted onto the certificate when a master is
 * chosen, so a reissue prints the figures it was issued with. Certificates saved
 * before that carry nothing. Those are filled from the registry as it stands today -
 * which is only defensible where the certificate has not been issued. An authorized
 * certificate's numbers are whatever its customer already holds, and writing today's
 * registry into it would be inventing history.
 *
 *   node scripts/backfill-master-spec.mjs --check
 *   node scripts/backfill-master-spec.mjs
 */
import { resolve } from 'node:path'
import { createRequire } from 'node:module'

// pnpm does not hoist, and ESM resolves from this file rather than the working
// directory, so the client is required from the package that depends on it.
const require = createRequire(resolve(process.cwd(), 'packages/database/package.json'))
const { PrismaClient } = require('@prisma/client')

const apply = !process.argv.includes('--check')
const prisma = new PrismaClient()

/** Statuses whose figures a customer may already hold. */
const ISSUED = new Set([
  'AUTHORIZED',
  'APPROVED',
  'PENDING_CUSTOMER_APPROVAL',
  'CUSTOMER_REVIEW_EXPIRED',
  'CUSTOMER_REVISION_REQUIRED',
])

/**
 * The capabilities, read from the database.
 *
 * This used to read the register file the app shipped. The app does not ship it any
 * more - it was generated at build time, so an instrument edited on the admin pages
 * was not in it - and a repair script working from a stale copy would write stale
 * figures onto certificates, which is the opposite of repairing them.
 *
 * Shaped as the file shaped it, so everything below reads unchanged: a profile with
 * buckets, and subtypes carrying buckets of their own.
 */
const num = (v) => (v === null || v === undefined ? null : Number(v))

const bucketOf = (b) => ({
  id: b.bucketKey,
  min: num(b.minValue),
  max: num(b.maxValue),
  min_inclusive: b.minInclusive,
  max_inclusive: b.maxInclusive,
  least_count:
    b.leastCountValue === null
      ? null
      : { value: num(b.leastCountValue), unit: b.leastCountUnit ?? '' },
  accuracy:
    b.accuracyKind === 'SYMMETRIC'
      ? { type: 'symmetric', value: num(b.accuracyValue), unit: b.accuracyUnit ?? '' }
      : b.accuracyKind === 'FORMULA'
        ? { type: 'formula', expression: b.accuracyFormula ?? '' }
        : b.accuracyKind === 'CLASS'
          ? { type: 'class', class: b.accuracyClass ?? '' }
          : null,
})

const instrumentRows = await prisma.masterInstrument.findMany({
  where: { isActive: true, isLatest: true },
  select: { instrumentId: true, legacyId: true },
})
const legacyOf = new Map(
  instrumentRows.filter((i) => i.legacyId !== null).map((i) => [i.instrumentId, i.legacyId]),
)

const profileRows = await prisma.masterCapabilityProfile.findMany({
  include: {
    buckets: { orderBy: { sortOrder: 'asc' } },
    subtypes: {
      orderBy: { sortOrder: 'asc' },
      include: { buckets: { orderBy: { sortOrder: 'asc' } } },
    },
  },
})

/** Every unit by its legacy id, which is what a certificate stores. */
const unitsByLegacyId = new Map()
for (const row of profileRows) {
  const legacy = legacyOf.get(row.instrumentId)
  if (legacy == null) continue
  const key = String(legacy)
  const unit = unitsByLegacyId.get(key) ?? { legacy_id: legacy, capability_profiles: [] }
  unit.capability_profiles.push({
    id: row.profileKey,
    parameter: row.parameter,
    role: row.role.toLowerCase(),
    unit: row.unit || null,
    min: num(row.minValue),
    max: num(row.maxValue),
    buckets: row.buckets.map(bucketOf),
    subtypes: row.subtypes.map((s) => ({
      id: s.subtypeKey,
      min: num(s.minValue),
      max: num(s.maxValue),
      buckets: s.buckets.map(bucketOf),
    })),
  })
  unitsByLegacyId.set(key, unit)
}

/** The buckets a declared capability resolves to - the subtype's where one was named. */
function bucketsFor(profile, subtype) {
  if (subtype) {
    const match = (profile.subtypes ?? []).find((s) => s.id === subtype)
    if (match) return match.buckets ?? []
  }
  return profile.buckets ?? []
}

/** The bucket spanning the range, else one overlapping it - as the app resolves it. */
function bucketForRange(buckets, from, to) {
  return (
    buckets.find((b) => b.min != null && b.max != null && b.min <= from && b.max >= to) ??
    buckets.find((b) => b.min != null && b.max != null && b.max > from && b.min < to) ??
    null
  )
}

/** The accuracy as stated: only a symmetric one is a number. */
function accuracyOf(bucket) {
  const accuracy = bucket.accuracy
  if (!accuracy) return { value: '', unit: '' }
  if (accuracy.type === 'symmetric') {
    return { value: String(accuracy.value ?? ''), unit: accuracy.unit ?? '' }
  }
  if (accuracy.type === 'formula') return { value: accuracy.expression ?? '', unit: '' }
  return { value: accuracy.class ?? '', unit: '' }
}

/**
 * The parameter each unlinked entry serves.
 *
 * The same rule the app now applies on both sides of a save: the Nth entry holding an
 * instrument takes the Nth parameter naming that instrument that no other entry has
 * claimed. Mutates the entries so the specification pass below sees the new links.
 */
function healLinks(entries, parameters) {
  const claimed = new Set(entries.map((e) => e.parameterId).filter(Boolean))
  const healed = new Map()

  entries.forEach((entry, position) => {
    if (entry.parameterId) return

    const rank = entries.filter(
      (other, i) =>
        i < position &&
        !other.parameterId &&
        String(other.masterInstrumentId) === String(entry.masterInstrumentId),
    ).length

    const free = parameters.filter(
      (p) =>
        !claimed.has(p.id) &&
        p.masterInstrumentId != null &&
        String(p.masterInstrumentId) === String(entry.masterInstrumentId),
    )

    const match = free[rank]
    if (match) {
      healed.set(entry.id, match.id)
      claimed.add(match.id)
      entry.parameterId = match.id
    }
  })

  return healed
}

async function main() {
  const certificates = await prisma.certificate.findMany({
    where: {
      masterInstruments: {
        some: { OR: [{ capabilityParameter: null }, { parameterId: null }] },
      },
    },
    select: {
      id: true,
      certificateNumber: true,
      status: true,
      parameters: {
        select: {
          id: true,
          rangeMin: true,
          rangeMax: true,
          masterInstrumentId: true,
          masterProfileId: true,
          masterSubtype: true,
        },
        orderBy: { sortOrder: 'asc' },
      },
      masterInstruments: {
        select: { id: true, assetNo: true, masterInstrumentId: true, parameterId: true },
      },
    },
  })

  const links = []
  const writes = []
  const skipped = { issued: [], noProfile: [], noUnit: [], noBucket: [], unlinked: [] }

  for (const certificate of certificates) {
    const label = (entry) =>
      `${certificate.certificateNumber ?? certificate.id} / ${entry.assetNo}`

    const healed = healLinks(certificate.masterInstruments, certificate.parameters)
    for (const [entryId, parameterId] of healed) {
      const entry = certificate.masterInstruments.find((e) => e.id === entryId)
      links.push({ id: entryId, parameterId, label: label(entry) })
    }

    if (ISSUED.has(certificate.status)) {
      skipped.issued.push(certificate.certificateNumber ?? certificate.id)
      continue
    }

    for (const entry of certificate.masterInstruments) {
      const parameter = certificate.parameters.find((p) => p.id === entry.parameterId)
      if (!parameter) {
        skipped.unlinked.push(label(entry))
        continue
      }
      if (!parameter.masterProfileId) {
        skipped.noProfile.push(label(entry))
        continue
      }

      const unit = unitsByLegacyId.get(String(entry.masterInstrumentId))
      const profile = (unit?.capability_profiles ?? []).find(
        (p) => p.id === parameter.masterProfileId,
      )
      if (!profile) {
        skipped.noUnit.push(label(entry))
        continue
      }

      const from = Number(parameter.rangeMin)
      const to = Number(parameter.rangeMax)
      const buckets = bucketsFor(profile, parameter.masterSubtype)
      const bucket =
        Number.isFinite(from) && Number.isFinite(to) ? bucketForRange(buckets, from, to) : null
      if (!bucket) {
        skipped.noBucket.push(label(entry))
        continue
      }

      const accuracy = accuracyOf(bucket)
      writes.push({
        id: entry.id,
        label: label(entry),
        data: {
          capabilityParameter: profile.parameter?.trim() ?? '',
          masterLeastCount:
            bucket.least_count?.value != null ? String(bucket.least_count.value) : null,
          masterLeastCountUnit: bucket.least_count?.unit ?? null,
          masterAccuracy: accuracy.value || null,
          masterAccuracyUnit: accuracy.unit || null,
        },
      })
    }
  }

  console.log(`${certificates.length} certificate(s) hold a master with something missing.`)

  console.log(`\n${links.length} lost parameter link(s) can be healed:`)
  for (const link of links) console.log(`  ${link.label}`)

  console.log(`\n${writes.length} specification(s) can be filled in:`)
  for (const write of writes) {
    const d = write.data
    console.log(
      `  ${write.label}  ${d.capabilityParameter}` +
        `  least count ${d.masterLeastCount ?? 'not recorded'} ${d.masterLeastCountUnit ?? ''}`.trimEnd() +
        `  accuracy ${d.masterAccuracy ?? 'not recorded'} ${d.masterAccuracyUnit ?? ''}`.trimEnd(),
    )
  }

  const report = (name, list) => {
    if (list.length === 0) return
    console.log(`\n${list.length} skipped - ${name}:`)
    for (const item of list) console.log(`  ${item}`)
  }
  report('already issued, so their figures are whatever the customer holds', skipped.issued)
  report('no capability declared on the parameter', skipped.noProfile)
  report('the registry has no such unit or profile', skipped.noUnit)
  report('no bucket covers the range being calibrated', skipped.noBucket)
  report('no parameter names this entry’s instrument', skipped.unlinked)

  if (!apply) {
    console.log('\n--check: nothing written.')
    return
  }

  for (const link of links) {
    await prisma.certificateMasterInstrument.update({
      where: { id: link.id },
      data: { parameterId: link.parameterId },
    })
  }
  for (const write of writes) {
    await prisma.certificateMasterInstrument.update({
      where: { id: write.id },
      data: write.data,
    })
  }
  console.log(`\nHealed ${links.length} link(s), wrote ${writes.length} specification(s).`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
