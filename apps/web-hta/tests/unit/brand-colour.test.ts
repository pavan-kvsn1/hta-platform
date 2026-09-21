/**
 * One cyan, in four places.
 *
 * The certificate sets its company name, title, rule and footer in the brand cyan, and
 * the logo and watermark are recoloured to it by a Python script. Those live in
 * different languages and different packages, so they cannot share an import without
 * routing a JSON file through the bundler - which, on this repo, is how build breakages
 * happen. They share a declared source instead: packages/assets/brand.json.
 *
 * This test is what makes that declaration mean anything. Change brand.json and these
 * fail until every copy follows; change one copy and it fails on its own.
 */
import { readFileSync } from 'fs'
import { join } from 'path'

import { describe, expect, it } from 'vitest'

const repoRoot = join(__dirname, '..', '..', '..', '..')
const read = (...parts: string[]) => readFileSync(join(repoRoot, ...parts), 'utf8')

const brand = JSON.parse(read('packages', 'assets', 'brand.json')) as { cyan: string }

/** `const HTA_BLUE = '#0099CC'`, whatever the hex happens to be. */
const tsConstant = (source: string) => source.match(/const HTA_BLUE = '(#[0-9A-Fa-f]{6})'/)?.[1]

describe('the brand cyan', () => {
  it('is a six-digit hex in brand.json', () => {
    expect(brand.cyan).toMatch(/^#[0-9A-F]{6}$/)
  })

  it('is what the certificate prints', () => {
    const source = read('apps', 'web-hta', 'src', 'components', 'pdf', 'CalibrationCertificatePDF.tsx')
    expect(tsConstant(source)).toBe(brand.cyan)
  })

  it('is what the tenant template prints', () => {
    // A scaffold rather than a running app, which is exactly why it drifts unnoticed.
    const source = read('apps', 'web-tenant-template', 'src', 'components', 'pdf', 'CalibrationCertificatePDF.tsx')
    expect(tsConstant(source)).toBe(brand.cyan)
  })

  it('is what the recolour script paints', () => {
    // It parses brand.json at runtime; this pins the reading, not a second copy of the
    // value - a script that stopped reading the file would still pass a hex comparison.
    const source = read('packages', 'assets', 'scripts', 'recolour-cyan.py')
    expect(source).toContain("['cyan']")
    expect(source).not.toMatch(/BRAND\s*=\s*\(0x/)
  })

  it('is the only cyan the certificate uses', () => {
    // A literal that slipped past HTA_BLUE would show up here.
    const source = read('apps', 'web-hta', 'src', 'components', 'pdf', 'CalibrationCertificatePDF.tsx')
    const hexes = source.match(/#[0-9A-Fa-f]{6}/g) ?? []
    const cyans = hexes.filter((h) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
      return b > 150 && g > 100 && r < 100
    })
    expect([...new Set(cyans.map((c) => c.toUpperCase()))]).toEqual([brand.cyan])
  })
})
