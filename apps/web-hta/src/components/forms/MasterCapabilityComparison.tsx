'use client'

// What a master offers for one parameter, against what the calibration requires.
//
// The requirement comes from the unit under test and is never entered here. What this
// adds is the other half of the comparison: the band the readings fall in, the least
// count that band resolves to, its accuracy, and the ratio between the two - which is
// the check that decides whether a pass near the limit means anything.
//
// One row per required range, because a binned parameter is calibrated at different
// resolutions across its span and a single row would report one of them.

import { AlertTriangle, CheckCircle, Info } from 'lucide-react'
import {
  DEFAULT_ACCURACY_RATIO,
  chooseCapability,
  requiredRanges,
  type AssignmentSuitability,
  type RangeSuitability,
} from '@/lib/master-instrument-capability'
import type { RegistryUnit } from '@/lib/master-instrument-registry'
import { cn } from '@/lib/utils'

interface MasterCapabilityComparisonProps {
  unit: RegistryUnit
  parameter: {
    parameterName: string
    parameterUnit: string
    rangeMin: string
    rangeMax: string
    leastCountValue: string
    accuracyValue: string
    requiresBinning: boolean
    bins: { binMin: string; binMax: string; leastCount: string; accuracy: string }[]
  }
  /** The ratio this lab expects. Defaults to the common 4:1. */
  threshold?: number
}

const num = (v: number) => Number(v.toFixed(4)).toString()

const PILL = 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase'
const TH = 'text-left px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider'
const TD = 'px-3 py-2 text-xs font-mono tabular-nums text-slate-800'

export function MasterCapabilityComparison({
  unit,
  parameter,
  threshold = DEFAULT_ACCURACY_RATIO,
}: MasterCapabilityComparisonProps) {
  const required = requiredRanges(parameter)

  if (required.length === 0) {
    return (
      <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
        <p className="text-xs text-slate-500">
          Set this parameter&rsquo;s range, least count and accuracy to see how this
          instrument compares.
        </p>
      </div>
    )
  }

  const chosen = chooseCapability(unit, parameter.parameterName, required, { threshold })

  if (!chosen) {
    return (
      <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
        <p className="text-xs text-slate-500">
          No capability is recorded for {parameter.parameterName} on this instrument, so
          there is nothing to check the requirement against.
        </p>
      </div>
    )
  }

  const { profile, subtypeId, suitability } = chosen
  const unitLabel = parameter.parameterUnit || profile.unit || ''

  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 overflow-hidden">
      <div className="px-3 py-2 border-b border-slate-200 flex flex-wrap items-center gap-x-5 gap-y-1">
        <span className="text-xs">
          <span className="text-slate-500">Capability</span>{' '}
          <b className="text-slate-800">{profile.parameter}</b>
        </span>
        <span className="text-xs">
          <span className="text-slate-500">Used as</span>{' '}
          <b className="text-slate-800 capitalize">{profile.role}</b>
        </span>
        {subtypeId && (
          <span className="text-xs">
            <span className="text-slate-500">Sensor type</span>{' '}
            <b className="text-slate-800">{subtypeId}</b>
          </span>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-100">
              <th className={cn(TH, 'border-r border-slate-200')}>Required</th>
              <th className={TH}>Band used</th>
              <th className={TH}>Least count</th>
              <th className={TH}>Accuracy &plusmn;</th>
              <th className={TH}>Accuracy ratio</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {suitability.ranges.map((r, i) => (
              <Row key={i} range={r} unitLabel={unitLabel} threshold={threshold} />
            ))}
          </tbody>
        </table>
      </div>

      <Verdict suitability={suitability} threshold={threshold} />
    </div>
  )
}

function Row({
  range,
  unitLabel,
  threshold,
}: {
  range: RangeSuitability
  unitLabel: string
  threshold: number
}) {
  const lcTone =
    range.leastCount === 'matches'
      ? 'bg-green-100 text-green-700'
      : range.leastCount === 'finer'
        ? 'bg-amber-100 text-amber-700'
        : 'bg-red-100 text-red-700'

  // Derived from the ratio rather than read off the bucket, so the accuracy shown is
  // always the one the ratio was computed from - including where a formula accuracy
  // resolved to a number. A class accuracy has no number and shows a dash.
  const accuracy =
    range.accuracyRatio !== null && range.accuracyRatio > 0
      ? range.required.accuracy / range.accuracyRatio
      : null

  return (
    <tr className={range.covered ? 'bg-green-50' : 'bg-white'}>
      <td className={cn(TD, 'border-r border-slate-200')}>
        {num(range.required.from)} to {num(range.required.to)} {unitLabel}
        <span className="block text-[10px] font-sans text-slate-500">
          needs {num(range.required.leastCount)} &middot; &plusmn;{num(range.required.accuracy)}
        </span>
      </td>
      <td className={cn(TD, !range.covered && 'text-red-600')}>
        {range.band && range.band.min != null && range.band.max != null
          ? `${num(range.band.min)} to ${num(range.band.max)}`
          : 'none'}
        {!range.covered && (
          <span className="block text-[10px] font-sans text-red-600">
            outside this capability
          </span>
        )}
      </td>
      <td className={TD}>
        {range.band?.least_count?.value != null ? num(range.band.least_count.value) : '—'}
      </td>
      <td className={TD}>{accuracy !== null ? num(accuracy) : '—'}</td>
      <td className="px-3 py-2">
        {range.leastCount && (
          <span className={cn(PILL, lcTone, 'mr-1.5')}>
            {range.leastCount === 'matches' ? 'Matches' : 'Does not match'}
          </span>
        )}
        {range.accuracyRatio === null ? (
          <span className={cn(PILL, 'bg-slate-200 text-slate-600')}>Not comparable</span>
        ) : (
          <span
            className={cn(
              PILL,
              range.accuracyRatio >= threshold
                ? 'bg-green-100 text-green-700'
                : 'bg-amber-100 text-amber-700',
            )}
          >
            {range.accuracyRatio.toFixed(1)} : 1
          </span>
        )}
      </td>
    </tr>
  )
}

function Verdict({
  suitability,
  threshold,
}: {
  suitability: AssignmentSuitability
  threshold: number
}) {
  if (!suitability.covered) {
    return (
      <Note tone="red">
        Part of the required range falls outside every band this capability records.
      </Note>
    )
  }
  if (!suitability.resolvable) {
    return (
      <Note tone="red">
        This instrument&rsquo;s least count is coarser than the parameter requires &mdash;
        readings would be recorded finer than it can actually read.
      </Note>
    )
  }
  if (suitability.worstRatio === null) {
    return (
      <Note tone="slate">
        Accuracy for this band is recorded as a class, so it cannot be compared as a
        number. Check the ratio by hand.
      </Note>
    )
  }
  if (!suitability.meetsThreshold) {
    return (
      <Note tone="amber">
        At {suitability.worstRatio.toFixed(1)}:1 this master is close to the unit&rsquo;s
        own accuracy, so a reading near the limit may not decide pass or fail. The lab
        asks for {threshold}:1.
      </Note>
    )
  }
  return <Note tone="green">Covers the range, resolves finely enough, and clears {threshold}:1.</Note>
}

function Note({ tone, children }: { tone: 'green' | 'amber' | 'red' | 'slate'; children: React.ReactNode }) {
  const styles = {
    green: 'border-green-100 bg-green-50 text-green-800',
    amber: 'border-amber-200 bg-amber-50 text-amber-800',
    red: 'border-red-200 bg-red-50 text-red-800',
    slate: 'border-slate-200 bg-white text-slate-600',
  }[tone]
  const Icon = tone === 'green' ? CheckCircle : tone === 'slate' ? Info : AlertTriangle
  return (
    <p className={cn('flex items-start gap-1.5 border-t px-3 py-2 text-[11px]', styles)}>
      <Icon className="size-3.5 shrink-0 mt-px" />
      <span>{children}</span>
    </p>
  )
}
