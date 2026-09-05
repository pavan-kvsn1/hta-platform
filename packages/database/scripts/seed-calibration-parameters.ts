/**
 * Seed the parameters a lab can calibrate.
 *
 *   pnpm --filter @hta/database db:seed:parameters
 *
 * Run at deployment, and again whenever the master instrument registry changes. It is
 * safe to run repeatedly: standards are matched by name and updated in place, tenant
 * rows are created only where they are missing, and nothing is ever deleted.
 *
 * What it will not do is overwrite a name a lab has chosen. The whole point of the
 * tenant layer is that "RTD" can be "Platinum RTD" here and something else elsewhere;
 * a seed that reset those on every deploy would quietly undo somebody's work.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PrismaClient } from '@prisma/client'
import { deriveParameterStandards, type RegistryLike } from '../src/calibration-parameters'

/** Bumped when the derivation changes in a way worth telling apart in the data. */
const SEED_VERSION = '1.0'

const REGISTRY = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../apps/web-hta/src/data/master-instrument-registry.json',
)

async function main() {
  const prisma = new PrismaClient()
  const dryRun = process.argv.includes('--dry-run')

  try {
    const registry = JSON.parse(readFileSync(REGISTRY, 'utf8')) as RegistryLike
    const standards = deriveParameterStandards(registry)

    console.log(`Derived ${standards.length} parameters from the registry`)
    console.log(
      `  ${standards.filter((s) => s.source === 'registry').length} a master records, ` +
        `${standards.filter((s) => s.source === 'certificates').length} only a certificate does`,
    )
    if (dryRun) {
      console.log('\n--dry-run: nothing written')
      for (const s of standards) {
        console.log(`  ${s.category.padEnd(12)} ${s.standardName}`)
      }
      return
    }

    let created = 0
    let updated = 0
    for (const standard of standards) {
      const existing = await prisma.calibrationParameterStandard.findUnique({
        where: { standardName: standard.standardName },
        select: { id: true },
      })
      await prisma.calibrationParameterStandard.upsert({
        where: { standardName: standard.standardName },
        create: { ...standard, seedVersion: SEED_VERSION },
        update: {
          category: standard.category,
          units: standard.units,
          defaultUnit: standard.defaultUnit,
          subtypes: standard.subtypes,
          aliases: standard.aliases,
          source: standard.source,
          seedVersion: SEED_VERSION,
        },
      })
      if (existing) updated += 1
      else created += 1
    }
    console.log(`Standards: ${created} created, ${updated} updated`)

    // Every tenant gets a row per standard, named as the standard until they say
    // otherwise. Missing rows are added; existing ones are left exactly as they are.
    const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } })
    const all = await prisma.calibrationParameterStandard.findMany({
      select: { id: true, standardName: true },
    })

    for (const tenant of tenants) {
      const mine = await prisma.calibrationParameter.findMany({
        where: { tenantId: tenant.id },
        select: { standardId: true },
      })
      const have = new Set(mine.map((p) => p.standardId))
      const missing = all.filter((s) => !have.has(s.id))

      if (missing.length > 0) {
        await prisma.calibrationParameter.createMany({
          data: missing.map((s) => ({
            tenantId: tenant.id,
            standardId: s.id,
            customName: s.standardName,
            units: [],
            subtypes: [],
          })),
          skipDuplicates: true,
        })
      }
      console.log(
        `${tenant.name}: ${missing.length} added, ${have.size} already there and left alone`,
      )
    }
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  console.error('Seeding failed:', error)
  process.exit(1)
})
