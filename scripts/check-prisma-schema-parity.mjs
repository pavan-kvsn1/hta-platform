import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const canonicalPath = resolve(root, 'packages/database/prisma/schema.prisma')
const mirrorPath = resolve(root, 'apps/web-hta/prisma/schema.prisma')

const normalize = (value) => value.replace(/\r\n/g, '\n').trim()

const canonical = normalize(readFileSync(canonicalPath, 'utf8'))
const mirror = normalize(readFileSync(mirrorPath, 'utf8'))

if (canonical !== mirror) {
  console.error('Prisma schema copies differ.')
  console.error(`Canonical: ${canonicalPath}`)
  console.error(`Mirror:    ${mirrorPath}`)
  console.error('Update the mirror schema or complete the migration to a single schema before proceeding.')
  process.exit(1)
}

console.log('Prisma schema parity OK.')
