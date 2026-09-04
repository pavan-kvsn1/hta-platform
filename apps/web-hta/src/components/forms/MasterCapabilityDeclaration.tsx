'use client'

// How a master instrument was used for one parameter.
//
// An instrument can record the same parameter twice - as a source and as a measuring
// device - with different spans and different accuracies, and a thermocouple or RTD
// records several curves whose spans and accuracies also differ. Nothing in the
// readings says which was used, so the engineer declares it and the certificate keeps
// the answer.
//
// Only a question with more than one answer is asked. Where an instrument records one
// capability, one role and no curves - most of them - nothing is asked at all and the
// facts are stated instead.

import { useState } from 'react'
import { Info } from 'lucide-react'
import {
  declaredCapability,
  type RequiredRange,
} from '@/lib/master-instrument-capability'
import type { CapabilityProfile, RegistryUnit } from '@/lib/master-instrument-registry'
import { cn } from '@/lib/utils'

interface MasterCapabilityDeclarationProps {
  unit: RegistryUnit
  parameterName: string
  /** What the calibration needs, so options that cannot reach it can be set aside. */
  required: RequiredRange[]
  profileId?: string
  subtype?: string
  disabled?: boolean
  onChange: (declaration: { profileId: string; subtype?: string }) => void
}

const LABEL = 'block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2'

function radio(on: boolean) {
  return (
    <span
      className={cn(
        'size-4 rounded-full border-2 flex-shrink-0',
        on ? 'border-primary' : 'border-slate-300',
      )}
      style={on ? { boxShadow: 'inset 0 0 0 3px var(--primary)' } : undefined}
    />
  )
}

/** Whether a capability, on a given curve, spans everything the calibration needs. */
function reaches(profile: CapabilityProfile, subtypeId: string | null, required: RequiredRange[]) {
  const declared = declaredCapability(profile, subtypeId)
  if (declared.min == null || declared.max == null) return true
  return required.every((r) => declared.min! <= r.from && declared.max! >= r.to)
}

export function MasterCapabilityDeclaration({
  unit,
  parameterName,
  required,
  profileId,
  subtype,
  disabled,
  onChange,
}: MasterCapabilityDeclarationProps) {
  const [showAll, setShowAll] = useState(false)

  const wanted = parameterName.trim().toLowerCase()
  const profiles = unit.capability_profiles.filter((p) =>
    p.parameter.toLowerCase().includes(wanted),
  )
  if (profiles.length === 0) return null

  const current = profiles.find((p) => p.id === profileId) ?? profiles[0]
  const curves = (current.subtypes ?? []).map((s) => s.id)
  const currentCurve = subtype && curves.includes(subtype) ? subtype : (curves[0] ?? null)

  const capabilities = [...new Set(profiles.map((p) => p.parameter))]
  const rolesHere = profiles.filter((p) => p.parameter === current.parameter).map((p) => p.role)

  const fits = (p: CapabilityProfile) => {
    const ids = (p.subtypes ?? []).map((s) => s.id)
    return ids.length ? ids.some((id) => reaches(p, id, required)) : reaches(p, null, required)
  }

  const capsShown = showAll
    ? capabilities
    : capabilities.filter((c) => profiles.some((p) => p.parameter === c && fits(p)))
  const rolesShown = showAll
    ? rolesHere
    : rolesHere.filter((r) => {
        const p = profiles.find((x) => x.parameter === current.parameter && x.role === r)
        return p ? fits(p) : false
      })
  const curvesShown = showAll ? curves : curves.filter((id) => reaches(current, id, required))

  const hidden =
    capabilities.length - (capsShown.length || capabilities.length)
    + rolesHere.length - (rolesShown.length || rolesHere.length)
    + curves.length - (curvesShown.length || curves.length)

  const caps = capsShown.length ? capsShown : capabilities
  const roles = rolesShown.length ? rolesShown : rolesHere
  const curveOptions = curvesShown.length ? curvesShown : curves

  const pick = (parameter: string, role: string) => {
    const next = profiles.find((p) => p.parameter === parameter && p.role === role) ?? current
    const nextCurves = (next.subtypes ?? []).map((s) => s.id)
    const nextCurve = nextCurves.find((id) => reaches(next, id, required)) ?? nextCurves[0]
    onChange({ profileId: next.id, subtype: nextCurve })
  }

  const settled: [string, string][] = []
  if (caps.length <= 1) settled.push(['Capability', current.parameter])
  if (roles.length <= 1) settled.push(['Used as', current.role])
  if (curves.length > 0 && curveOptions.length <= 1 && currentCurve) {
    settled.push(['Sensor type', currentCurve])
  }

  const asksNothing = caps.length <= 1 && roles.length <= 1 && curveOptions.length <= 1

  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className="bg-slate-100 px-4 py-3 border-b border-slate-200 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">
            How This Instrument Was Used <span className="text-red-500">*</span>
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            Declared, not inferred &mdash; the readings cannot tell us which capability,
            role or curve was used.
          </p>
        </div>
        {(hidden > 0 || showAll) && (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="text-[11px] font-semibold text-primary whitespace-nowrap"
          >
            {showAll ? 'Show only what fits' : `Show all options`}
          </button>
        )}
      </div>

      <div className="p-4 space-y-4">
        {hidden > 0 && !showAll && (
          <p className="text-xs text-slate-500">
            {hidden} option{hidden === 1 ? '' : 's'} hidden because they do not reach the
            required range.
          </p>
        )}

        {caps.length > 1 && (
          <div>
            <label className={LABEL}>
              Capability used <span className="text-red-500">*</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {caps.map((c) => (
                <button
                  key={c}
                  type="button"
                  disabled={disabled}
                  onClick={() => pick(c, profiles.find((p) => p.parameter === c)!.role)}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2 rounded-xl border bg-white',
                    current.parameter === c ? 'border-primary' : 'border-slate-300',
                  )}
                >
                  {radio(current.parameter === c)}
                  <span className="text-sm font-semibold text-slate-800">{c}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {roles.length > 1 && (
          <div>
            <label className={LABEL}>
              Used as <span className="text-red-500">*</span>
            </label>
            <div className="flex flex-wrap gap-2 items-center">
              {roles.map((r) => (
                <button
                  key={r}
                  type="button"
                  disabled={disabled}
                  onClick={() => pick(current.parameter, r)}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2 rounded-xl border bg-white',
                    current.role === r ? 'border-primary' : 'border-slate-300',
                  )}
                >
                  {radio(current.role === r)}
                  <span className="text-sm font-semibold text-slate-800 capitalize">{r}</span>
                  <span className="text-xs text-slate-500">
                    {r === 'source' ? 'it produced the value' : 'it read the value'}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {curveOptions.length > 1 && (
          <div>
            <label className={LABEL} htmlFor={`curve-${current.id}`}>
              Sensor type <span className="text-red-500">*</span>
            </label>
            <div className="flex items-center gap-3 flex-wrap">
              <select
                id={`curve-${current.id}`}
                value={currentCurve ?? ''}
                disabled={disabled}
                onChange={(e) => onChange({ profileId: current.id, subtype: e.target.value })}
                className="rounded-xl border border-slate-300 h-10 px-3 bg-white text-sm font-medium min-w-[220px]"
              >
                {curveOptions.map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </select>
              {currentCurve && (
                <CurveReach profile={current} subtypeId={currentCurve} />
              )}
            </div>
          </div>
        )}

        {settled.length > 0 && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 flex flex-wrap items-center gap-x-5 gap-y-1">
            {settled.map(([k, v]) => (
              <span key={k} className="text-xs">
                <span className="text-slate-500">{k}</span>{' '}
                <b className="text-slate-800 capitalize">{v}</b>
              </span>
            ))}
            {asksNothing && (
              <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                <Info className="size-3" />
                the only option, so not asked
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function CurveReach({ profile, subtypeId }: { profile: CapabilityProfile; subtypeId: string }) {
  const declared = declaredCapability(profile, subtypeId)
  if (declared.min == null || declared.max == null) return null
  const n = (v: number) => Number(v.toFixed(4)).toString()
  return (
    <span className="text-xs text-slate-500">
      Reaches{' '}
      <b className="text-slate-800 font-mono tabular-nums">
        {n(declared.min)} to {n(declared.max)} {profile.unit}
      </b>{' '}
      &mdash; the curve decides the span and the accuracy below
    </span>
  )
}
