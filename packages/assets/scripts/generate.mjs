#!/usr/bin/env node
/**
 * Generate derived logo assets from source files in packages/assets/logos/
 *
 * Source files (edit these, everything else is derived):
 *   logos/hta-logo.jpg          — clean logo (app UI, sidebar, navbar, desktop icon)
 *   logos/hta-logo-with-tag.jpg — full logo with tagline + ® (PDF certificates)
 *
 * The certificate's cyan variant is derived from the tagged logo by
 * scripts/recolour-cyan.py, so there is no cyan source file to keep in step.
 *
 * Run:  pnpm --filter @hta/assets gen
 */

import { readFileSync, writeFileSync, copyFileSync, mkdirSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..', '..', '..')

const LOGOS_DIR = resolve(__dirname, '..', 'logos')
const CLEAN_LOGO = resolve(LOGOS_DIR, 'hta-logo.jpg')
const TAGGED_LOGO = resolve(LOGOS_DIR, 'hta-logo-with-tag.jpg')

const WEB_PUBLIC = resolve(root, 'apps', 'web-hta', 'public')
const DESKTOP_RESOURCES = resolve(root, 'apps', 'desktop', 'resources')
const PDF_BASE64 = resolve(root, 'apps', 'web-hta', 'src', 'components', 'pdf', 'logo-base64.ts')

console.log('Generating derived logo assets...\n')

// 1. Copy clean logo → web public/hta-logo.jpg
copyFileSync(CLEAN_LOGO, resolve(WEB_PUBLIC, 'hta-logo.jpg'))
console.log('  ✓ public/hta-logo.jpg')

// 2. Convert clean logo → web public/logo.png (for emails, tenant config)
try {
  execSync(
    `npx sharp-cli -i "${CLEAN_LOGO}" --format png -o "${resolve(WEB_PUBLIC, 'logo.png')}"`,
    { stdio: 'pipe' }
  )
  console.log('  ✓ public/logo.png')
} catch {
  console.log('  ✗ public/logo.png — sharp-cli not available, skipped')
}

// 3. Convert clean logo → desktop icon.ico (skipped if desktop app dir doesn't exist)
if (existsSync(DESKTOP_RESOURCES)) {
  try {
    const tmpPng = resolve(LOGOS_DIR, '_tmp-icon-256.png')
    execSync(
      `npx sharp-cli -i "${CLEAN_LOGO}" -o "${tmpPng}" resize 256 256`,
      { stdio: 'pipe' }
    )
    execSync(
      `npx png-to-ico "${tmpPng}" > "${resolve(DESKTOP_RESOURCES, 'icon.ico')}"`,
      { stdio: 'pipe', shell: true }
    )
    try { execSync(`rm "${tmpPng}"`, { stdio: 'pipe' }) } catch { /* ok */ }
    console.log('  ✓ desktop/resources/icon.ico')
  } catch {
    console.log('  ✗ desktop/resources/icon.ico — conversion tools not available, skipped')
  }
} else {
  console.log('  – desktop/resources/ not found, skipping icon.ico')
}

// 4. Generate base64 for PDF certificates (uses tagged logo)
//
// Two of them, not one. The mark as it stands, and the same mark with its
// navy repainted in the brand cyan - the certificate letterhead sets the
// company name, the title, the rule and the footer in #0099CC, and a navy
// logo beside all of that reads as two blues that nearly match. Nothing but
// the certificate uses the cyan one.
mkdirSync(dirname(PDF_BASE64), { recursive: true })
const taggedB64 = readFileSync(TAGGED_LOGO).toString('base64')

let cyanB64 = ''
try {
  cyanB64 = execSync(
    `python "${resolve(__dirname, 'recolour-cyan.py')}" "${TAGGED_LOGO}"`,
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'inherit'] },
  ).trim()
} catch {
  console.log('  ✗ cyan logo — python or Pillow unavailable')
}

const lines = [
  '// HTA Logo (with tagline) as Base64 Data URL for react-pdf',
  '// DO NOT EDIT — run "pnpm --filter @hta/assets gen" to regenerate',
  `export const HTA_LOGO_BASE64 = \`data:image/jpeg;base64,${taggedB64}\``,
  '',
]
if (cyanB64) {
  lines.push(
    '/** The same mark with its navy in the brand cyan. The certificate only. */',
    `export const HTA_LOGO_CYAN_BASE64 = \`data:image/jpeg;base64,${cyanB64}\``,
    '',
  )
} else if (existsSync(PDF_BASE64)) {
  // Keep the cyan export that is already there rather than dropping it and
  // breaking the certificate because one machine has no Pillow.
  const kept = readFileSync(PDF_BASE64, 'utf8').match(
    /\/\*\*[^\n]*\*\/\nexport const HTA_LOGO_CYAN_BASE64 = `[^`]*`/,
  )
  if (kept) lines.push(kept[0], '')
}
writeFileSync(PDF_BASE64, lines.join('\n'))
console.log(`  ✓ pdf/logo-base64.ts${cyanB64 ? ' (and the cyan variant)' : ''}`)

console.log('\nDone.')
