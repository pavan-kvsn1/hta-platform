/**
 * Put back what the registry import dropped, on whichever database this points at.
 *
 * Some instruments state an accuracy as a sum rather than a figure - "0.02% of
 * the reading, plus 2 counts". The import saved neither the sentence nor the
 * numbers in it, so 120 of 1,726 range bands recorded that an accuracy existed
 * and nothing about what it was.
 *
 * Two consequences, both only visible once the app reads the database instead of
 * the bundled file: the certificate prints a blank where the master's accuracy
 * belongs, and the instrument cannot be rated, so the engineer is stopped and
 * asked to justify one that is actually fine.
 *
 * Runs the three steps in order and stops at the first failure:
 *
 *   1. add the four columns          (additive; safe to re-run)
 *   2. copy the values back          (only the formula bands; safe to re-run)
 *   3. check the database vs the file (exits 1 if they still disagree)
 *
 *   DATABASE_URL="postgresql://..." node scripts/fix-formula-accuracy.mjs
 *
 * Nothing is dropped and no existing value is overwritten with a worse one.
 */
import { execSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const pkg = resolve(here, '..', '..')
const MIGRATION = '20260916104500_accuracy_formula_parts'

/**
 * `soft` is a pattern for output that means "already done" rather than "failed".
 *
 * Recording a migration that is already recorded is not a reason to stop a
 * retry - it is the retry working. A real failure still stops the run.
 */
const run = (label, command, soft) => {
  console.log(`\n\u2500\u2500 ${label} ${'\u2500'.repeat(Math.max(0, 58 - label.length))}`)
  try {
    execSync(command, { cwd: pkg, stdio: soft ? 'pipe' : 'inherit' })
    if (soft) console.log('   done')
  } catch (error) {
    const output = `${error.stdout ?? ''}${error.stderr ?? ''}`
    if (soft && soft.test(output)) {
      console.log('   already recorded')
      return
    }
    if (soft) console.error(output)
    console.error(`\nStopped at: ${label}`)
    process.exit(error.status ?? 1)
  }
}

console.log('Database:', (process.env.DATABASE_URL ?? '(none set)').replace(/:\/\/[^:]+:[^@]*@/, '://***:***@'))

// Re-running this is harmless: the columns already exist, and the statement
// fails loudly rather than silently doing something else.
run(
  '1. the four columns',
  `npx prisma db execute --file prisma/migrations/${MIGRATION}/migration.sql --schema prisma/schema.prisma`,
)
run(
  '   recording it',
  `npx prisma migrate resolve --applied ${MIGRATION} --schema prisma/schema.prisma`,
  /already recorded as applied/,
)

run('2. copying the values back', 'node scripts/migration/backfill-accuracy-formula-parts.mjs --apply')

run('3. checking against the file', 'node scripts/retired/check-capabilities-against-registry.mjs')

console.log('\nDone. The database now holds what the file holds.')
