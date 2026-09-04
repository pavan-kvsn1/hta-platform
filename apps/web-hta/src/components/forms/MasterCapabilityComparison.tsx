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

import { AlertTriangle, CheckCircle, Info, Pencil } from 'lucide-react'
import {
  DEFAULT_ACCURACY_RATIO,
  chooseCapability,
  evaluateSuitability,
  missingRequirement,
  requiredRanges,
  type AssignmentSuitability,
  type RangeSuitability,
  type RequiredRange,
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
    masterProfileId?: string
    masterSubtype?: string
  }
  /** The ratio this lab expects. Defaults to the common 4:1. */
  threshold?: number
  /**
   * Reopen the declaration. Offered on the summary strip, which is where the answer
   * being changed is actually shown - a sentence-long link underneath was describing
   * the action instead of sitting on the thing it acts upon.
   */
  onEdit?: () => void
}

/** What the engineer declared, when they have. */
interface Declaration {
  masterProfileId?: string
  masterSubtype?: string
}

const num = (v: number) => Number(v.toFixed(4)).toString()

/**
 * The capability to compare against: the declared one where there is a declaration,
 * otherwise the best fitting, flagged as a guess.
 */
function declaredFrom(
  unit: RegistryUnit,
  parameter: { parameterName: string } & Declaration,
  required: RequiredRange[],
  threshold: number,
) {
  const profile = parameter.masterProfileId
    ? unit.capability_profiles.find((p) => p.id === parameter.masterProfileId)
    : undefined

  if (profile) {
    return {
      wasDeclared: true,
      chosen: {
        profile,
        subtypeId: parameter.masterSubtype ?? null,
        suitability: evaluateSuitability(profile, required, {
          subtypeId: parameter.masterSubtype,
          threshold,
        }),
      },
    }
  }
  return {
    wasDeclared: false,
    chosen: chooseCapability(unit, parameter.parameterName, required, { threshold }),
  }
}

const PILL = 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase'
const TH = 'text-left px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider'
const TD = 'px-3 py-2 text-xs font-mono tabular-nums text-slate-800'

export function MasterCapabilityComparison({
  unit,
  parameter,
  threshold = DEFAULT_ACCURACY_RATIO,
  onEdit,
}: MasterCapabilityComparisonProps) {
  const required = requiredRanges(parameter)

  if (required.length === 0) {
    // Name what is actually missing. "Set the range, least count and accuracy" sends
    // the engineer to check three fields when usually only one of them is blank.
    const missing = missingRequirement(parameter)
    return (
      <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
        <p className="text-xs text-slate-500">
          This parameter states{' '}
          <b className="text-slate-700">
            {missing.length < 3
              ? missing.join(' and ')
              : `${missing.slice(0, -1).join(', ')} and ${missing[missing.length - 1]}`}
          </b>
          , so there is nothing to compare this instrument against. Set it in Section 02.
        </p>
      </div>
    )
  }

  // The declaration decides which capability is compared. Without one, the best
  // fitting is used and said to be a guess, rather than presented as a fact.
  const declared = declaredFrom(unit, parameter, required, threshold)
  const chosen = declared.chosen

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
        {!declared.wasDeclared && (
          <span className="text-[11px] text-slate-500">
            best fit &mdash; not yet declared
          </span>
        )}
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            aria-label="Edit how this instrument was used"
            title="Edit how this instrument was used"
            className="ml-auto shrink-0 text-slate-400 hover:text-primary transition-colors"
          >
            <Pencil className="size-3.5" />
          </button>
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
  // A least count finer than required still serves the range, so it reads the same as
  // an exact match. Only a coarser one cannot serve it.
  const lcTone =
    range.leastCount === 'coarser'
      ? 'bg-red-100 text-red-700'
      : 'bg-green-100 text-green-700'

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
            {range.leastCount === 'coarser' ? 'Not Compatible' : 'Compatible'}
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
