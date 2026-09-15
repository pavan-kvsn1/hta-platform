'use client'

/**
 * An accuracy, in whichever shape the certificate declared it.
 *
 * The registry holds three: a symmetric bound, a formula kept verbatim, and an
 * accuracy class. Asymmetric - +0.5 on one side and -0.3 on the other - is the
 * one the model cannot hold yet; it is not a ± anything, and rounding it to the
 * larger of the two would overstate the instrument. When the columns land it
 * renders here beside the rest.
 */

export interface BucketAccuracy {
  accuracyKind: string | null
  accuracyValue: number | null
  accuracyUnit: string | null
  accuracyPolarity: string | null
  accuracyFormula: string | null
  accuracyClass: string | null
}

export function hasAccuracy(b: BucketAccuracy) {
  return Boolean(b.accuracyKind && (b.accuracyValue !== null || b.accuracyFormula || b.accuracyClass))
}

export default function AccuracyCell({ bucket }: { bucket: BucketAccuracy }) {
  if (!hasAccuracy(bucket)) return <span className="undecl">not declared</span>

  if (bucket.accuracyKind === 'FORMULA') return <span className="formula">{bucket.accuracyFormula}</span>
  if (bucket.accuracyKind === 'CLASS') return <span className="clschip">{bucket.accuracyClass}</span>

  return (
    <>
      <span className="num">
        {bucket.accuracyPolarity ?? '±'}
        {bucket.accuracyValue}
      </span>{' '}
      <span style={{ color: 'var(--muted)' }}>{bucket.accuracyUnit}</span>
    </>
  )
}
