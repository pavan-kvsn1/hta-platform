'use client'

/**
 * An accuracy, in whichever shape the certificate declared it.
 *
 * The registry holds four. Three are a single figure - a symmetric bound, a
 * formula kept verbatim, an accuracy class. The fourth is two: +0.5 on one side
 * and −0.3 on the other is not a ± anything, and collapsing it to the larger of
 * the two would say the instrument is worse than it is above the reading and
 * better than it is below, with nothing downstream able to tell.
 */

export interface BucketAccuracy {
  accuracyKind: string | null
  accuracyValue: number | null
  accuracyUnit: string | null
  accuracyPolarity: string | null
  accuracyFormula: string | null
  /** FORMULA only. The arithmetic behind the sentence, and the parts of it. */
  accuracyExpression?: string | null
  accuracyPercentOf?: string | null
  accuracyPercentValue?: number | null
  accuracyDigits?: number | null
  accuracyDigitsUnit?: string | null
  accuracyClass: string | null
  /** ASYMMETRIC only. Absent on rows read before the columns existed. */
  accuracyUpper?: number | null
  accuracyLower?: number | null
}

export function hasAccuracy(b: BucketAccuracy) {
  if (!b.accuracyKind) return false
  if (b.accuracyKind === 'ASYMMETRIC')
    return (b.accuracyUpper ?? null) !== null || (b.accuracyLower ?? null) !== null
  return b.accuracyValue !== null || Boolean(b.accuracyFormula) || Boolean(b.accuracyClass)
}

/** The same text the cell shows, for a tooltip or a comparison. */
export function accuracyText(b: BucketAccuracy) {
  if (!hasAccuracy(b)) return 'not declared'
  if (b.accuracyKind === 'FORMULA') return b.accuracyFormula ?? ''
  if (b.accuracyKind === 'CLASS') return b.accuracyClass ?? ''
  const unit = b.accuracyUnit ? ` ${b.accuracyUnit}` : ''
  if (b.accuracyKind === 'ASYMMETRIC') {
    const up = (b.accuracyUpper ?? null) === null ? '—' : `+${b.accuracyUpper}`
    const down = (b.accuracyLower ?? null) === null ? '—' : `−${Math.abs(Number(b.accuracyLower))}`
    return `${up} / ${down}${unit}`
  }
  return `${b.accuracyPolarity ?? '±'}${b.accuracyValue}${unit}`
}

export default function AccuracyCell({ bucket }: { bucket: BucketAccuracy }) {
  if (!hasAccuracy(bucket)) return <span className="undecl">not declared</span>

  if (bucket.accuracyKind === 'FORMULA') return <span className="formula">{bucket.accuracyFormula}</span>
  if (bucket.accuracyKind === 'CLASS') return <span className="clschip">{bucket.accuracyClass}</span>

  if (bucket.accuracyKind === 'ASYMMETRIC') {
    const up = bucket.accuracyUpper ?? null
    const down = bucket.accuracyLower ?? null
    return (
      <>
        {/* The two are shown together and never added up: they are bounds on
            opposite sides of the reading, not a span. */}
        <span className="num">{up === null ? '—' : `+${up}`}</span>
        <span style={{ color: 'var(--faint)' }}> / </span>
        <span className="num">{down === null ? '—' : `−${Math.abs(Number(down))}`}</span>{' '}
        <span style={{ color: 'var(--muted)' }}>{bucket.accuracyUnit}</span>
      </>
    )
  }

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
