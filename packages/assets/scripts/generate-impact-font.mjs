/**
 * Impact, embedded for react-pdf, with its own ascent read off the file.
 *
 * The certificate is rendered twice: on the server for the real PDF, and in the browser
 * for the preview. A font has to load in both. The other faces come from unpkg, which
 * works either side; Impact is licensed with Windows and is on no such CDN, so it ships
 * with us - and a path cannot, because process.cwd() is apps/web-hta in development and
 * /app in the image, and a browser has no filesystem at all. A data URL has neither
 * problem, which is how the logo and the watermark already travel.
 *
 * The ascent is read from the font rather than written down. react-pdf positions text by
 * the top of its em box, so every baseline in the letterhead converts through the face's
 * ascent; Impact's is 1.0088 where Oswald's is 1.193, and guessing it puts the company
 * name three and a half points out.
 *
 *   node packages/assets/scripts/generate-impact-font.mjs
 */
import { readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const SOURCE = join(root, 'packages', 'assets', 'fonts', 'impact.ttf')
const TARGET = join(root, 'apps', 'web-hta', 'src', 'components', 'pdf', 'impact-base64.ts')

/** unitsPerEm from `head`, ascender from `hhea` - the two numbers the layout needs. */
function metrics(buffer) {
  const tables = {}
  const count = buffer.readUInt16BE(4)
  for (let i = 0; i < count; i += 1) {
    const entry = 12 + i * 16
    tables[buffer.toString('ascii', entry, entry + 4)] = buffer.readUInt32BE(entry + 8)
  }
  if (!tables.head || !tables.hhea) throw new Error('impact.ttf has no head/hhea table')
  return {
    unitsPerEm: buffer.readUInt16BE(tables.head + 18),
    ascender: buffer.readInt16BE(tables.hhea + 4),
  }
}

const font = readFileSync(SOURCE)
const { unitsPerEm, ascender } = metrics(font)
const ascent = ascender / unitsPerEm
const base64 = font.toString('base64')

writeFileSync(
  TARGET,
  `// Impact, embedded for react-pdf. DO NOT EDIT.
// Regenerate with "node packages/assets/scripts/generate-impact-font.mjs".
//
// Licensed with Windows and on no public CDN, so it travels with the app rather than
// being fetched like Roboto and Oswald. See packages/assets/fonts/impact.ttf.

/** Ascent as a fraction of the em, from the font's own hhea/head tables: ${ascender}/${unitsPerEm}. */
export const IMPACT_ASCENT = ${ascent.toFixed(6)}

export const IMPACT_BASE64 = 'data:font/truetype;base64,${base64}'
`,
  'utf8',
)

console.log(`  impact.ttf  ${(font.length / 1024).toFixed(0)}KB -> ${(base64.length / 1024).toFixed(0)}KB base64`)
console.log(`  ascent ${ascender}/${unitsPerEm} = ${ascent.toFixed(6)}`)
