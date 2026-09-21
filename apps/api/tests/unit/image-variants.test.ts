/**
 * Which copy of a photograph gets served, and what happens when a column lies.
 *
 * The columns naming the derived copies are a claim, not a fact - a file deleted from
 * the bucket leaves the row pointing at it. The route walks this list and clears the
 * column of anything that turns out to be missing, so the ordering here is what decides
 * whether a reader gets their photograph or a 404.
 */
import { describe, expect, it } from 'vitest'

import { variantCandidates, type VariantSource } from '../../src/lib/image-variants.js'

const fully = (over: Partial<VariantSource> = {}): VariantSource => ({
  storageKey: 'certificates/c1/uuc/1758-abc.jpg',
  mimeType: 'image/heic',
  printKey: 'certificates/c1/uuc/1758-abc-print.jpg',
  optimizedKey: 'certificates/c1/uuc/1758-abc-optimized.jpg',
  thumbnailKey: 'certificates/c1/uuc/1758-abc-thumbnail.jpg',
  ...over,
})

const keys = (image: VariantSource, variant: string) =>
  variantCandidates(image, variant).map((c) => c.key)

describe('a photograph the worker has fully processed', () => {
  it('serves the print copy to the appendix, then falls back twice', () => {
    expect(keys(fully(), 'print')).toEqual([
      'certificates/c1/uuc/1758-abc-print.jpg',
      'certificates/c1/uuc/1758-abc-optimized.jpg',
      'certificates/c1/uuc/1758-abc.jpg',
    ])
  })

  it('serves the optimized copy for viewing, and falls back to the original only', () => {
    expect(keys(fully(), 'optimized')).toEqual([
      'certificates/c1/uuc/1758-abc-optimized.jpg',
      'certificates/c1/uuc/1758-abc.jpg',
    ])
  })

  it('never substitutes a 200px thumbnail for anything larger', () => {
    // A thumbnail standing in for a print copy would look like a bug, not a fallback.
    expect(keys(fully(), 'print')).not.toContain('certificates/c1/uuc/1758-abc-thumbnail.jpg')
    expect(keys(fully(), 'optimized')).not.toContain('certificates/c1/uuc/1758-abc-thumbnail.jpg')
  })
})

describe('a photograph uploaded before the print variant existed', () => {
  // All 115 rows in the database on the day this shipped.
  const older = fully({ printKey: null })

  it('still prints, using the optimized copy', () => {
    expect(keys(older, 'print')).toEqual([
      'certificates/c1/uuc/1758-abc-optimized.jpg',
      'certificates/c1/uuc/1758-abc.jpg',
    ])
  })
})

describe('a photograph the worker has not reached at all', () => {
  const raw = fully({ printKey: null, optimizedKey: null, thumbnailKey: null })

  it('still prints, using the original the engineer uploaded', () => {
    expect(keys(raw, 'print')).toEqual(['certificates/c1/uuc/1758-abc.jpg'])
  })

  it('keeps the original mime type rather than claiming it is a JPEG', () => {
    // The upload may well be a HEIC off an iPhone.
    expect(variantCandidates(raw, 'print')[0].mime).toBe('image/heic')
  })
})

describe('clearing a column that lied', () => {
  it('names the column for every derived copy, so a miss can be healed', () => {
    const candidates = variantCandidates(fully(), 'print')
    expect(candidates.map((c) => c.column)).toEqual(['printKey', 'optimizedKey', undefined])
  })

  it('leaves the original without a column, because there is nothing to clear', () => {
    const candidates = variantCandidates(fully(), 'print')
    expect(candidates[candidates.length - 1].column).toBeUndefined()
  })
})

describe('the list always ends somewhere', () => {
  it('offers the original for an unknown variant rather than nothing', () => {
    expect(keys(fully(), 'banana')).toEqual(['certificates/c1/uuc/1758-abc.jpg'])
  })

  it('ends with the original for every variant, so a reader is never left empty', () => {
    for (const variant of ['thumbnail', 'optimized', 'print', 'original', 'banana']) {
      const list = keys(fully(), variant)
      expect(list[list.length - 1]).toBe('certificates/c1/uuc/1758-abc.jpg')
    }
  })
})
