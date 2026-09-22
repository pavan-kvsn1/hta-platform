/**
 * Whether the bins actually divide the range.
 *
 * Bins chop the range being calibrated into stretches, each carrying the least count
 * and accuracy that apply there. Every reading has to land in exactly one, because the
 * bin is what says how finely the reading could be read and how far it may be out. So
 * the bins have to meet: no stretch of the range with no bin over it, and no stretch
 * with two.
 *
 * Left unchecked, 0 to 10 and 20 to 100 looks like two tidy bins and quietly says
 * nothing about anything read between 10 and 20 - and the code that asks which bin a
 * reading is in then had to invent an answer.
 */

export interface BinSpan {
  binMin: string
  binMax: string
}

export interface BinRangeSource {
  rangeMin?: string | null
  rangeMax?: string | null
  requiresBinning?: boolean
  bins?: BinSpan[] | null
}

export type BinIssue =
  /** A bin whose edges are not both numbers yet, so it covers nothing knowable. */
  | { kind: 'incomplete'; position: number }
  /** A stretch of the range no bin covers. */
  | { kind: 'gap'; from: number; to: number }
  /** A stretch more than one bin claims, so which one applies is a toss-up. */
  | { kind: 'overlap'; from: number; to: number }

const figure = (value: string | null | undefined): number | null => {
  // Number('') is 0, not NaN, so an empty box would read as a bin covering 0 to 0 -
  // which then overlaps whichever bin starts at the bottom of the range.
  const text = String(value ?? '').trim()
  if (!text) return null
  const parsed = Number(text)
  return Number.isFinite(parsed) ? parsed : null
}

/** A number as it reads, without a float's tail: 10.1 rather than 10.100000000000001. */
const plain = (value: number) => Number(value.toFixed(6))

/**
 * Everything wrong with how these bins cover the range, in the order it occurs.
 *
 * Empty when the bins meet end to end across the whole range, and when there is
 * nothing to judge - binning switched off, no bins yet, or no range stated.
 *
 * Bins are read in the order their edges put them, not the order they were typed: an
 * engineer who fills in the top bin first has not made a mistake.
 */
export function binIssues(parameter: BinRangeSource): BinIssue[] {
  if (!parameter.requiresBinning) return []
  const bins = parameter.bins ?? []
  if (bins.length === 0) return []

  const issues: BinIssue[] = []

  const parsed = bins.map((bin, index) => ({
    position: index + 1,
    min: figure(bin.binMin),
    max: figure(bin.binMax),
  }))

  // A bin with a missing or unreadable edge cannot be placed, and neither can the
  // stretch beside it, so the continuity check would only invent findings. Said once
  // per bin, and nothing else is claimed until they are filled in.
  const incomplete = parsed.filter((b) => b.min === null || b.max === null)
  if (incomplete.length > 0) {
    return incomplete.map((b) => ({ kind: 'incomplete' as const, position: b.position }))
  }

  const whole = parsed
    .map((b) => ({ from: Math.min(b.min!, b.max!), to: Math.max(b.min!, b.max!) }))
    .sort((a, b) => a.from - b.from)

  const rangeFrom = figure(parameter.rangeMin)
  const rangeTo = figure(parameter.rangeMax)
  const low = rangeFrom !== null && rangeTo !== null ? Math.min(rangeFrom, rangeTo) : null
  const high = rangeFrom !== null && rangeTo !== null ? Math.max(rangeFrom, rangeTo) : null

  // The range starts before the first bin does.
  if (low !== null && whole[0].from > low) {
    issues.push({ kind: 'gap', from: plain(low), to: plain(whole[0].from) })
  }

  for (let i = 1; i < whole.length; i++) {
    const previous = whole[i - 1]
    const current = whole[i]
    // Bins are written to share their boundary - 0 to 10 then 10 to 100 - so meeting
    // exactly is how a continuous set looks, not an overlap to complain about.
    if (current.from > previous.to) {
      issues.push({ kind: 'gap', from: plain(previous.to), to: plain(current.from) })
    } else if (current.from < previous.to) {
      issues.push({
        kind: 'overlap',
        from: plain(current.from),
        to: plain(Math.min(previous.to, current.to)),
      })
    }
  }

  // The range runs on past the last bin.
  const last = whole[whole.length - 1]
  if (high !== null && last.to < high) {
    issues.push({ kind: 'gap', from: plain(last.to), to: plain(high) })
  }

  return issues
}

/** One sentence per problem, naming the stretch it is about. */
export function binIssueSentence(issue: BinIssue, unit: string): string {
  const span = (from: number, to: number) => `${from} to ${to}${unit ? ` ${unit}` : ''}`
  switch (issue.kind) {
    case 'incomplete':
      return `Bin ${issue.position} does not say what stretch it covers.`
    case 'gap':
      return `Nothing covers ${span(issue.from, issue.to)}. A reading taken there has no least count and no accuracy to be judged by.`
    case 'overlap':
      return `Two bins both claim ${span(issue.from, issue.to)}, so which least count and accuracy apply there is undecided.`
  }
}
