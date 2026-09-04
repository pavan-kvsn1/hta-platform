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
                matches
                  ? ELIGIBILITY_BADGE.green
                  : finer
                    ? ELIGIBILITY_BADGE.amber
                    : ELIGIBILITY_BADGE.red,
              )}
            >
              {matches ? 'Matches' : 'Does not match'}
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
        <table className="w-full text-sm">
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
      <LeastCountVerdict required={required} bands={bands} declared={declared} />
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
    }
  })

  if (checks.some((c) => !c.covered)) {
    return (
      <p className="text-xs mt-1.5 text-red-600">
        Part of the required range falls outside every band this capability records.
      </p>
    )
  }
  if (checks.some((c) => !c.matches && !c.finer)) {
    return (
      <p className="text-xs mt-1.5 text-red-600">
        The master&rsquo;s least count is coarser than required &mdash; readings would be
        recorded finer than this instrument can actually read.
      </p>
    )
  }
  if (checks.some((c) => c.finer)) {
    return (
      <p className="text-xs mt-1.5 text-amber-700">
        The master&rsquo;s least count is finer than required. Not a match, but acceptable
        &mdash; the certificate records the master&rsquo;s own least count.
      </p>
    )
  }
  return (
    <p className="text-xs mt-1.5 text-green-700">Least count matches on every required range.</p>
  )
}
