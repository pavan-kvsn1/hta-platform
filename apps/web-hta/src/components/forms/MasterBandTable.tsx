'use client'

// What the declared capability offers, laid against what the calibration requires.
//
// Every band the capability records is listed, not only the ones in play: the bands
// that serve a required range are grouped under it with the requirement cell spanning
// them, and the rest are shown greyed as "not used". Hiding them would leave the
// engineer unable to see that a finer band exists just outside their range.
//
// Least count and accuracy are judged in separate columns because they fail for
// different reasons and are acted on differently - a coarser least count means the
// readings cannot be recorded as written, while a thin accuracy ratio is a judgement
// call the lab can accept with a reason.
//
// The least-count column answers one question: can this band serve that range. A band
// finer than required serves it, so it reads Compatible like an exact match; the two
// least counts are side by side in the columns before it for anyone who wants the
// detail. Only an incompatibility is worth a sentence under the table.

import {
  DEFAULT_ACCURACY_RATIO,
  declaredCapability,
  resolveAccuracy,
  type RequiredRange,
} from '@/lib/master-instrument-capability'
import { ELIGIBILITY_BADGE } from '@/lib/master-instrument-eligibility'
import type { CapabilityBucket, CapabilityProfile } from '@/lib/master-instrument-registry'
import { cn } from '@/lib/utils'

const TH = 'text-left px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider'
const TD = 'px-3 py-2 font-mono text-xs tabular-nums text-slate-800'
const PILL = 'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase'

const n = (v: number | null | undefined) =>
  v == null ? '—' : Number(v.toFixed(4)).toString()

interface MasterBandTableProps {
  assetNo: string
  profile: CapabilityProfile
  subtypeId?: string | null
  required: RequiredRange[]
  threshold?: number
  /**
   * Whether to spell out what is wrong underneath the table.
   *
   * Off where the caller has already said it. A master no finer than the thing it is
   * checking is refused outright above this table, and repeating "the accuracy ratio is
   * 1.0 : 1 ... please select a compatible master instrument" beneath it says the same
   * thing twice in two voices.
   */
  verdicts?: boolean
}

/**
 * What is wrong with this master, and the one thing to do about it.
 *
 * The least count and the accuracy fail for different reasons and both are worth
 * naming - a coarse least count cannot be written down at all, a thin ratio is a
 * judgement - so each keeps its own sentence. What they share is the remedy, and
 * repeating "please select a compatible master instrument" under each of them reads as
 * two problems needing two instruments. Said once, after whichever of them spoke.
 */
function Verdicts({
  required,
  bands,
  declared,
  threshold,
}: {
  required: RequiredRange[]
  bands: CapabilityBucket[]
  declared: { min: number | null; max: number | null }
  threshold: number
}) {
  const leastCount = LeastCountVerdict({ required, bands, declared })
  const accuracy = AccuracyVerdict({ required, bands, threshold })
  if (!leastCount && !accuracy) return null

  /**
   * A short ratio is not the same fault as an unusable instrument.
   *
   * A master that cannot resolve the reading, or cannot reach the range, cannot do the
   * job at all - there is nothing to weigh, and the answer is another instrument. A
   * ratio between 1 : 1 and the lab's threshold is different: the master is finer than
   * the unit under test, just not by the margin the lab asks for. That is a judgement
   * the lab can make, and telling the engineer to go and find another instrument reads
   * as a refusal where the lab's own rules allow a decision.
   */
  // An empty list passes every() - so a band with no comparable accuracy at all was
  // being told "if a finer master is available, use it", as though a ratio had been
  // worked out and come up short.
  const ratios = ratiosOf(required, bands)
  const onlyTheRatio = !leastCount && ratios.length > 0 && ratios.every((r) => r > 1)

  // Where the ratio is the only fault, the figure is already in the table's own column
  // and naming it again in a sentence only delays what to do about it.
  if (onlyTheRatio) {
    return (
      <p className="text-xs mt-1.5 text-amber-700">
        If a finer master is available, use it. If this one has to be used, record why
        below &mdash; the reviewer approves the certificate on that.
      </p>
    )
  }

  // Each verdict now ends in what to do about it, so the generic line beneath them
  // only repeats the last one - and where both spoke, it read as a third fault.
  return (
    <>
      {leastCount}
      {accuracy}
    </>
  )
}

/** The accuracy ratio of each required band, where it reduces to a number. */
function ratiosOf(required: RequiredRange[], bands: CapabilityBucket[]): number[] {
  return required
    .map((req) => {
      const band =
        bands.find((b) => b.min != null && b.max != null && b.min <= req.from && b.max >= req.to) ??
        bands.find((b) => b.min != null && b.max != null && b.max > req.from && b.min < req.to) ??
        bands[0]
      const acc = band ? accuracyOf(band, req.to) : null
      return acc ? req.accuracy / acc : null
    })
    .filter((r): r is number => r !== null)
}

/**
 * Whether the master is enough finer than the unit under test, said in words.
 *
 * The ratio was a badge on each row and nothing else. A column of figures says what the
 * numbers are; it does not say that the instrument fails the lab's rule, and the least
 * count beside it had a sentence while this did not - so a master short on accuracy
 * read as one with a slightly odd number rather than one to put back.
 */
function AccuracyVerdict({
  required,
  bands,
  threshold,
}: {
  required: RequiredRange[]
  bands: CapabilityBucket[]
  threshold: number
}) {
  const ratios = required
    .map((req) => {
      const band =
        bands.find((b) => b.min != null && b.max != null && b.min <= req.from && b.max >= req.to) ??
        bands.find((b) => b.min != null && b.max != null && b.max > req.from && b.min < req.to) ??
        bands[0]
      const acc = band ? accuracyOf(band, req.to) : null
      return acc ? req.accuracy / acc : null
    })
    .filter((r): r is number => r !== null)

  // No number to divide by. Either the band records no accuracy at all, or it records
  // one that does not reduce to a figure - a percentage with no stated basis, a class.
  // Silence here read as "nothing wrong": the ratio column showed a dash and no
  // sentence said the comparison had not been made.
  if (ratios.length === 0) {
    return (
      <p className="text-xs mt-1.5 text-amber-700">
        The accuracy recorded for this band does not give a figure to compare against,
        so the ratio cannot be worked out here. The reviewer approves that from the
        instrument&rsquo;s own certificate &mdash; say what they should approve it on
        below.
      </p>
    )
  }
  const worst = Math.min(...ratios)
  if (worst >= threshold) return null

  return (
    <p className="text-xs mt-1.5 text-red-600">
      At {worst.toFixed(1)} : 1 it is not enough finer than the unit under test for a
      reading near the limit to decide pass from fail; the lab asks for {threshold} : 1.
      Choose a finer master.
    </p>
  )
}

/** The accuracy of one band as a number, where it reduces to one. */
function accuracyOf(band: CapabilityBucket, at: number) {
  const resolved = resolveAccuracy(band.accuracy, { reading: at })
  return resolved && resolved.value > 0 ? resolved.value : null
}

export function MasterBandTable({
  assetNo,
  profile,
  subtypeId,
  required,
  threshold = DEFAULT_ACCURACY_RATIO,
  verdicts = true,
}: MasterBandTableProps) {
  const declared = declaredCapability(profile, subtypeId)
  const bands = [...declared.buckets].sort((a, b) => (a.min ?? 0) - (b.min ?? 0))

  if (bands.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
        <p className="text-xs text-slate-500">
          This capability records no ranges, so there is nothing to compare.
        </p>
      </div>
    )
  }

  const used = new Set<CapabilityBucket>()
  const rows: React.ReactNode[] = []

  required.forEach((req, ri) => {
    const hits = bands.filter(
      (b) => b.max != null && b.min != null && b.max > req.from && b.min < req.to,
    )
    const spanning = hits.length ? hits : [bands[0]]

    spanning.forEach((band, i) => {
      used.add(band)
      const lc = band.least_count?.value ?? null
      const matches = lc != null && Math.abs(lc - req.leastCount) < 1e-9
      const finer = lc != null && lc < req.leastCount
      const acc = accuracyOf(band, req.to)
      const ratio = acc ? req.accuracy / acc : null

      rows.push(
        <tr key={`${ri}-${i}`} className="bg-green-50">
          {i === 0 && (
            <td
              rowSpan={spanning.length}
              className="px-3 py-2 align-middle border-r border-slate-200 bg-green-50"
            >
              <span className="font-mono text-xs tabular-nums text-slate-800">
                {n(req.from)} to {n(req.to)}
              </span>
              <span className="block text-[10px] text-slate-500">
                needs {n(req.leastCount)} &middot; &plusmn;{n(req.accuracy)}
              </span>
            </td>
          )}
          <td className={TD}>
            {n(band.min)} to {n(band.max)}
          </td>
          <td className={TD}>{n(lc)}</td>
          <td className={TD}>{n(acc)}</td>
          <td className="px-3 py-2">
            <span
              className={cn(
                PILL,
                matches || finer ? ELIGIBILITY_BADGE.green : ELIGIBILITY_BADGE.red,
              )}
            >
              {matches || finer ? 'Compatible' : 'Not Compatible'}
            </span>
          </td>
          <td className="px-3 py-2">
            <span
              className={cn(
                PILL,
                ratio === null
                  ? ELIGIBILITY_BADGE.slate
                  : ratio >= threshold
                    ? ELIGIBILITY_BADGE.green
                    : ELIGIBILITY_BADGE.amber,
              )}
            >
              {ratio === null ? 'class' : `${ratio.toFixed(1)} : 1`}
            </span>
          </td>
        </tr>,
      )
    })
  })

  // Bands outside the requirement, for context.
  bands
    .filter((b) => !used.has(b))
    .forEach((band, i) => {
      rows.push(
        <tr key={`spare-${i}`} className="bg-white">
          <td className="px-3 py-2 border-r border-slate-200 text-xs text-slate-400">not used</td>
          <td className="px-3 py-2 font-mono text-xs tabular-nums text-slate-500">
            {n(band.min)} to {n(band.max)}
          </td>
          <td className="px-3 py-2 font-mono text-xs tabular-nums text-slate-500">
            {n(band.least_count?.value)}
          </td>
          <td className="px-3 py-2 font-mono text-xs tabular-nums text-slate-500">
            {n(accuracyOf(band, band.max ?? 0))}
          </td>
          <td className="px-3 py-2 text-xs text-slate-400">&mdash;</td>
          <td className="px-3 py-2 text-xs text-slate-400">&mdash;</td>
        </tr>,
      )
    })

  return (
    <div>
      <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
        What {assetNo} offers &mdash; {profile.parameter} &middot; {profile.role}
        {profile.unit ? ` · ${profile.unit}` : ''}
        {subtypeId ? ` · ${subtypeId}` : ''}
      </label>
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-100">
              <th className={cn(TH, 'border-r border-slate-200')}>Serves</th>
              <th className={TH}>Range</th>
              <th className={TH}>Least count</th>
              <th className={TH}>Accuracy &plusmn;</th>
              <th className={TH}>Least count</th>
              <th className={TH}>Accuracy ratio</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">{rows}</tbody>
        </table>
      </div>
      {verdicts && (
        <Verdicts required={required} bands={bands} declared={declared} threshold={threshold} />
      )}
    </div>
  )
}

function LeastCountVerdict({
  required,
  bands,
  declared,
}: {
  required: RequiredRange[]
  bands: CapabilityBucket[]
  declared: { min: number | null; max: number | null }
}) {
  const checks = required.map((req) => {
    const band =
      bands.find((b) => b.min != null && b.max != null && b.min <= req.from && b.max >= req.to) ??
      bands.find((b) => b.min != null && b.max != null && b.max > req.from && b.min < req.to) ??
      bands[0]
    const lc = band?.least_count?.value ?? null
    return {
      covered:
        declared.min != null && declared.max != null &&
        declared.min <= req.from && declared.max >= req.to,
      matches: lc != null && Math.abs(lc - req.leastCount) < 1e-9,
      finer: lc != null && lc < req.leastCount,
      lc,
      needs: req.leastCount,
      unit: band?.least_count?.unit ?? '',
    }
  })

  if (checks.some((c) => !c.covered)) {
    return (
      <p className="text-xs mt-1.5 text-red-600">
        Part of the range being calibrated falls outside every band this capability
        records, so there is nothing to check those points against. Choose a master that
        spans the whole range.
      </p>
    )
  }
  // Said as the two numbers it is about. "Coarser than required - readings would be
  // recorded finer than this instrument can actually read" is true and takes a second
  // reading; "reads in steps of 0.5 °C, and the certificate needs 0.1" is the same fact
  // and needs none.
  // A least count the registry never recorded is not a coarse one. Both used to end up
  // here, and the sentence printed "reads in steps of 0" - a figure nobody wrote,
  // presented as the instrument's own.
  const unrecorded = checks.find((c) => c.lc === null)
  if (unrecorded) {
    return (
      <p className="text-xs mt-1.5 text-amber-700">
        No least count is recorded for this band, so whether the master can resolve the
        reading cannot be judged here. The reviewer approves that from the
        instrument&rsquo;s own certificate &mdash; say what they should approve it on
        below.
      </p>
    )
  }

  const coarse = checks.find((c) => !c.matches && !c.finer)
  if (coarse) {
    return (
      <p className="text-xs mt-1.5 text-red-600">
        This master reads in steps of{' '}
        <b>
          {n(coarse.lc ?? 0)} {coarse.unit}
        </b>
        , and the certificate needs{' '}
        <b>
          {n(coarse.needs)} {coarse.unit}
        </b>
        . Any finer digit would be one nobody read. Choose a master that reads at least
        as finely.
      </p>
    )
  }
  // A finer least count serves the range, and a compatible one needs no sentence: the
  // table has already said so on every row.
  return null
}
