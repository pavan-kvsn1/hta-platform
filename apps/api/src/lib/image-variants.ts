/**
 * Which copy of a photograph to serve, and what to try when it is not there.
 *
 * A certificate photograph is stored up to four times: the original the engineer
 * uploaded, and three derived copies the worker makes - a 2000px optimized one for
 * viewing, a 1000px print one for the certificate's appendix, and a 200px thumbnail.
 * Each derived copy has a column on the row that names it, and null means the worker
 * has not made it yet.
 *
 * Those columns can lie. A file deleted from the bucket leaves the row still pointing
 * at it, and the row is the only thing consulted, so nothing finds out until a download
 * fails. That is why this returns a list rather than a key: the caller walks it, and
 * clears the column of anything that turns out not to exist.
 */
export type VariantName = 'thumbnail' | 'optimized' | 'print' | 'original'

export type VariantColumn = 'printKey' | 'optimizedKey' | 'thumbnailKey'

export interface VariantSource {
  storageKey: string
  mimeType: string
  printKey?: string | null
  optimizedKey?: string | null
  thumbnailKey?: string | null
}

export interface VariantCandidate {
  key: string
  mime: string
  /** The column claiming this file exists, so a caller can clear it when it does not. */
  column?: VariantColumn
}

/**
 * The copies to try, best first. Always ends with the original, which is the one file
 * that is certain to have been written, and whose column cannot be cleared because
 * there isn't one.
 */
export function variantCandidates(image: VariantSource, requested: string): VariantCandidate[] {
  const derived = (key: string | null | undefined, column: VariantColumn): VariantCandidate[] =>
    key ? [{ key, mime: 'image/jpeg', column }] : []

  const original: VariantCandidate = { key: image.storageKey, mime: image.mimeType }

  switch (requested) {
    case 'thumbnail':
      return [...derived(image.thumbnailKey, 'thumbnailKey'), original]

    case 'optimized':
      return [...derived(image.optimizedKey, 'optimizedKey'), original]

    /**
     * What the appendix embeds, and the only one that walks the whole way down.
     *
     * A photograph uploaded before the print variant existed still has an optimized
     * copy; one the worker has not reached yet still has the original. Both are heavier
     * than wanted, and both are better than a certificate missing a figure.
     */
    case 'print':
      return [
        ...derived(image.printKey, 'printKey'),
        ...derived(image.optimizedKey, 'optimizedKey'),
        original,
      ]

    default:
      return [original]
  }
}
