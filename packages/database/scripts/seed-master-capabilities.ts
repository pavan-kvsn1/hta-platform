/**
 * Seed master instrument capabilities and components from the registry.
 *
 *   pnpm --filter @hta/database db:seed:capabilities -- --dry-run
 *   pnpm --filter @hta/database db:seed:capabilities
 *
 * Inserts only. It never updates and never deletes, so it is safe to run again when new
 * instruments appear in the registry: anything already present is left exactly as it is,
 * including whatever an admin has since edited.
 *
 * That is the whole point of decision 1 in docs/scope/master-instrument-model-decisions.md.
 * The registry is where this data came from, not what it is. Once a profile exists the
 * database owns it, and a seed that reset profiles on every deploy would quietly undo
 * somebody's afternoon.
 *
 * Joined on legacyId. Before the 11 Sep 2026 cleanup eight instruments had none and
 * would have seeded empty; all 212 now match.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PrismaClient, type Prisma } from '@prisma/client'
import { deriveCapabilities, type CapabilityRegistry, type UnitCapabilities } from '../src/master-capabilities'

const REGISTRY = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../apps/web-hta/src/data/master-instrument-registry.json',
)

interface Tally {
  profiles: number
  subtypes: number
  buckets: number
  components: number
}

const zero = (): Tally => ({ profiles: 0, subtypes: 0, buckets: 0, components: 0 })
const add = (a: Tally, b: Tally) => {
  a.profiles += b.profiles
  a.subtypes += b.subtypes
  a.buckets += b.buckets
  a.components += b.components
}

async function seedUnit(
  tx: Prisma.TransactionClient,
  unit: UnitCapabilities,
  target: { tenantId: string; instrumentId: string },
): Promise<{ written: Tally; skipped: Tally }> {
  const written = zero()
  const skipped = zero()
  const { tenantId, instrumentId } = target

  for (const p of unit.profiles) {
    const existing = await tx.masterCapabilityProfile.findUnique({
      where: { tenantId_instrumentId_profileKey: { tenantId, instrumentId, profileKey: p.profileKey } },
      select: { id: true },
    })
    if (existing) {
      // Present already. Leave it and everything under it alone - it may have been
      // edited, and this script has no way to tell a deliberate change from drift.
      skipped.profiles += 1
      skipped.subtypes += p.subtypes.length
      skipped.buckets += p.buckets.length + p.subtypes.reduce((n, s) => n + s.buckets.length, 0)
      continue
    }

    const profile = await tx.masterCapabilityProfile.create({
      data: {
        tenantId,
        instrumentId,
        profileKey: p.profileKey,
        parameter: p.parameter,
        role: p.role,
        unit: p.unit,
        kind: p.kind,
        minValue: p.min,
        maxValue: p.max,
        minInclusive: p.minInclusive,
        maxInclusive: p.maxInclusive,
        subtypeKind: p.subtypeKind,
        sopReferences: p.sopReferences,
        source: 'registry',
        sortOrder: p.sortOrder,
      },
      select: { id: true },
    })
    written.profiles += 1

    for (const s of p.subtypes) {
      const subtype = await tx.masterCapabilitySubtype.create({
        data: {
          profileId: profile.id,
          subtypeKey: s.subtypeKey,
          minValue: s.min,
          maxValue: s.max,
          minInclusive: s.minInclusive,
          maxInclusive: s.maxInclusive,
          sortOrder: s.sortOrder,
        },
        select: { id: true },
      })
      written.subtypes += 1
      if (s.buckets.length) {
        await tx.masterCapabilityBucket.createMany({
          data: s.buckets.map((b) => ({
            profileId: profile.id,
            subtypeId: subtype.id,
            bucketKey: b.bucketKey,
            minValue: b.min,
            maxValue: b.max,
            minInclusive: b.minInclusive,
            maxInclusive: b.maxInclusive,
            leastCountValue: b.leastCountValue,
            leastCountUnit: b.leastCountUnit,
            accuracyKind: b.accuracyKind,
            accuracyValue: b.accuracyValue,
            accuracyUnit: b.accuracyUnit,
            accuracyPolarity: b.accuracyPolarity,
            accuracyFormula: b.accuracyFormula,
            accuracyClass: b.accuracyClass,
            sortOrder: b.sortOrder,
          })),
        })
        written.buckets += s.buckets.length
      }
    }

    if (p.buckets.length) {
      await tx.masterCapabilityBucket.createMany({
        data: p.buckets.map((b) => ({
          profileId: profile.id,
          subtypeId: null,
          bucketKey: b.bucketKey,
          minValue: b.min,
          maxValue: b.max,
          minInclusive: b.minInclusive,
          maxInclusive: b.maxInclusive,
          leastCountValue: b.leastCountValue,
          leastCountUnit: b.leastCountUnit,
          accuracyKind: b.accuracyKind,
          accuracyValue: b.accuracyValue,
          accuracyUnit: b.accuracyUnit,
          accuracyPolarity: b.accuracyPolarity,
          accuracyFormula: b.accuracyFormula,
          accuracyClass: b.accuracyClass,
          sortOrder: b.sortOrder,
        })),
      })
      written.buckets += p.buckets.length
    }
  }

  for (const c of unit.components) {
    const existing = await tx.masterInstrumentComponent.findUnique({
      where: { tenantId_instrumentId_componentKey: { tenantId, instrumentId, componentKey: c.componentKey } },
      select: { id: true },
    })
    if (existing) {
      skipped.components += 1
      continue
    }
    await tx.masterInstrumentComponent.create({
      data: {
        tenantId,
        instrumentId,
        componentKey: c.componentKey,
        role: c.role,
        make: c.make,
        model: c.model,
        serialNumber: c.serialNumber,
        sortOrder: c.sortOrder,
      },
    })
    written.components += 1
  }

  return { written, skipped }
}

async function main() {
  const prisma = new PrismaClient()
  const dryRun = process.argv.includes('--dry-run')

  try {
    const registry = JSON.parse(readFileSync(REGISTRY, 'utf8')) as CapabilityRegistry
    const { units, skippedNoLegacyId, totals } = deriveCapabilities(registry)

    console.log(
      `Registry: ${units.length} units, ${totals.profiles} profiles, ` +
        `${totals.subtypes} subtypes, ${totals.buckets} buckets, ${totals.components} components`,
    )
    if (skippedNoLegacyId.length) {
      console.log(`\n${skippedNoLegacyId.length} units have no legacy id and cannot be matched:`)
      for (const s of skippedNoLegacyId) console.log(`  ${s}`)
    }

    // Only the current version of each instrument. An instrument's capabilities belong
    // to the instrument, not to one version of its description.
    const rows = await prisma.masterInstrument.findMany({
      where: { isLatest: true, legacyId: { not: null } },
      select: { legacyId: true, tenantId: true, instrumentId: true, assetNumber: true },
    })
    const byLegacy = new Map(rows.map((r) => [r.legacyId as number, r]))
    console.log(`\nDatabase: ${rows.length} current instruments with a legacy id`)

    const unmatched = units.filter((u) => !byLegacy.has(u.legacyId))
    if (unmatched.length) {
      console.log(`\n${unmatched.length} registry units have no instrument in the database:`)
      for (const u of unmatched) console.log(`  legacy ${u.legacyId}  ${u.assetNo}  ${u.description}`)
    }

    if (dryRun) {
      const matched = units.length - unmatched.length
      const would = zero()
      for (const u of units) {
        if (!byLegacy.has(u.legacyId)) continue
        would.profiles += u.profiles.length
        would.components += u.components.length
        for (const p of u.profiles) {
          would.subtypes += p.subtypes.length
          would.buckets += p.buckets.length + p.subtypes.reduce((n, s) => n + s.buckets.length, 0)
        }
      }
      console.log(
        `\nDry run. ${matched} units would be seeded: ${would.profiles} profiles, ` +
          `${would.subtypes} subtypes, ${would.buckets} buckets, ${would.components} components.`,
      )
      console.log('Nothing written.')
      return
    }

    const written = zero()
    const skipped = zero()
    let touched = 0

    for (const unit of units) {
      const target = byLegacy.get(unit.legacyId)
      if (!target) continue
      // One transaction per instrument. A failure leaves that instrument untouched
      // rather than half-seeded, and does not roll back the 211 that already worked.
      const result = await prisma.$transaction((tx) => seedUnit(tx, unit, target))
      add(written, result.written)
      add(skipped, result.skipped)
      if (result.written.profiles || result.written.components) touched += 1
    }

    console.log(`\nSeeded ${touched} instruments.`)
    console.log(
      `  written: ${written.profiles} profiles, ${written.subtypes} subtypes, ` +
        `${written.buckets} buckets, ${written.components} components`,
    )
    console.log(
      `  left alone (already present): ${skipped.profiles} profiles, ${skipped.subtypes} subtypes, ` +
        `${skipped.buckets} buckets, ${skipped.components} components`,
    )
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
