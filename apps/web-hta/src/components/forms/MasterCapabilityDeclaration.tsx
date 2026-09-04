'use client'

// How a master instrument was used for one parameter.
//
// An instrument can record the same parameter twice - as a source and as a measuring
// device - with different spans and different accuracies, and a thermocouple or RTD
// records several curves whose spans and accuracies also differ. Nothing in the
// readings says which was used, so the engineer declares it and the certificate keeps
// the answer.
//
// The questions are asked in order and each one waits for the one before it: the role
// is a property of a capability, and the curve a property of a role, so asking all
// three at once would offer answers that the earlier answer may rule out. Only a
// question with more than one answer is asked at all. Where an instrument records one
// capability, one role and no curves - most of them - nothing is asked and the facts
// are stated instead.

import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Info } from 'lucide-react'
import {
  declaredCapability,
  matchesParameter,
  type RequiredRange,
} from '@/lib/master-instrument-capability'
import type { CapabilityProfile, RegistryUnit } from '@/lib/master-instrument-registry'
import { cn } from '@/lib/utils'

interface MasterCapabilityDeclarationProps {
  /** Absent when the certificate names a master the registry no longer holds. */
  unit?: RegistryUnit
  parameterName: string
  /** The parameter's unit, which decides which capabilities are candidates at all. */
  parameterUnit?: string | null
  /** What the calibration needs, so options that cannot reach it can be set aside. */
  required: RequiredRange[]
  profileId?: string
  subtype?: string
  disabled?: boolean
  onChange: (declaration: { profileId: string; subtype?: string }) => void
  /**
   * What the declaration produces - the requirement, the comparison, the SOP - shown
   * inside this panel rather than beneath it. They are the answer to the same question
   * the header asks, and reading them as separate sections loses that.
   */
  children?: React.ReactNode
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

/**
 * One collapsible panel per parameter.
 *
 * A master serving three parameters produces three of these, each with its own
 * requirement, comparison and procedure. Open they are long; collapsed the section
 * stays readable and the header still names which parameter it covers.
 */
function Panel({
  parameterName,
  children,
  action,
}: {
  parameterName: string
  children: React.ReactNode
  action?: React.ReactNode
}) {
  const [open, setOpen] = useState(true)
  const heading = `Assess and Verify Master Instrument Compatibility${
    parameterName ? ` - For ${parameterName}` : ''
  }`

  return (
    <section
      role="group"
      aria-label={heading}
      className="mt-3 rounded-xl border border-slate-200 bg-white overflow-hidden"
    >
      <div
        className={cn(
          'bg-slate-100 px-4 py-3 flex items-center justify-between gap-3 flex-wrap',
          open && 'border-b border-slate-200',
        )}
      >
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex items-center gap-2 text-left min-w-0"
        >
          <ChevronDown
            className={cn(
              'size-4 text-slate-500 shrink-0 transition-transform',
              !open && '-rotate-90',
            )}
          />
          <span className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">
            Assess and Verify Master Instrument Compatibility
            {parameterName ? ` - For ${parameterName}` : ''}{' '}
            <span className="text-red-500">*</span>
          </span>
        </button>
        {open && action}
      </div>
      {open && <div className="p-4 space-y-5">{children}</div>}
    </section>
  )
}

export function MasterCapabilityDeclaration({
  unit,
  parameterName,
  parameterUnit,
  required,
  profileId,
  subtype,
  disabled,
  onChange,
  children,
}: MasterCapabilityDeclarationProps) {
  const [showAll, setShowAll] = useState(false)
  /**
   * A capability chosen but not yet completed by a role. There is no profile to name
   * until both are answered, so this half-answer has nowhere to live but here.
   */
  const [pendingCap, setPendingCap] = useState<string | null>(null)

  const profiles = (unit?.capability_profiles ?? []).filter((p) =>
    matchesParameter(p, parameterName, parameterUnit),
  )

  const fits = (p: CapabilityProfile) => {
    const ids = (p.subtypes ?? []).map((s) => s.id)
    return ids.length ? ids.some((id) => reaches(p, id, required)) : reaches(p, null, required)
  }

  const declared = profiles.find((p) => p.id === profileId) ?? null

  // Capability. Answered by a declaration, by a choice made here, or by there being
  // only one - never by picking the first of several on the engineer's behalf.
  const capabilities = [...new Set(profiles.map((p) => p.parameter))]
  const capsUsable = capabilities.filter((c) =>
    profiles.some((p) => p.parameter === c && fits(p)),
  )
  const capShown = showAll ? capabilities : capsUsable.length ? capsUsable : capabilities
  const cap =
    declared?.parameter ??
    (pendingCap && capabilities.includes(pendingCap) ? pendingCap : null) ??
    (capShown.length === 1 ? capShown[0] : null)

  // Used as - only once the capability is settled, since the roles belong to it.
  const roles = cap ? profiles.filter((p) => p.parameter === cap).map((p) => p.role) : []
  const rolesUsable = roles.filter((r) => {
    const p = profiles.find((x) => x.parameter === cap && x.role === r)
    return p ? fits(p) : false
  })
  const roleShown = showAll ? roles : rolesUsable.length ? rolesUsable : roles
  const role = declared?.role ?? (roleShown.length === 1 ? roleShown[0] : null)

  // Both answers together name one capability profile, and only then is there a span,
  // a least count and an accuracy to compare against the requirement.
  const profile = cap && role
    ? (profiles.find((p) => p.parameter === cap && p.role === role) ?? null)
    : null

  // Sensor type - only once the role is settled, since the curves belong to the profile.
  const curves = profile ? (profile.subtypes ?? []).map((s) => s.id) : []
  const curvesUsable = profile ? curves.filter((id) => reaches(profile, id, required)) : []
  const curveShown = showAll ? curves : curvesUsable.length ? curvesUsable : curves
  const curve = profile
    ? subtype && curves.includes(subtype)
      ? subtype
      : (curvesUsable[0] ?? curves[0] ?? null)
    : null

  const hidden =
    capabilities.length - capShown.length +
    (roles.length - roleShown.length) +
    (curves.length - curveShown.length)

  // A question that has only one answer is not worth asking, but the answer is still a
  // declaration and still belongs on the certificate. Report it once, so it persists.
  const report = useRef(onChange)
  report.current = onChange
  useEffect(() => {
    if (!profile || profileId === profile.id) return
    if (pendingCap) return // The engineer is mid-answer; wait for the role.
    if (capShown.length > 1 || roleShown.length > 1) return
    report.current({ profileId: profile.id, subtype: curve ?? undefined })
  }, [profile, profileId, curve, pendingCap, capShown.length, roleShown.length])

  if (profiles.length === 0) {
    return (
      <Panel parameterName={parameterName}>
        <p className="text-xs text-slate-500">No capability recorded for this instrument.</p>
        {children}
      </Panel>
    )
  }

  const pickCap = (c: string) => {
    setPendingCap(c)
    const theseRoles = profiles.filter((p) => p.parameter === c).map((p) => p.role)
    if (theseRoles.length !== 1) return
    // One role, so the capability alone settles the profile.
    pickRole(c, theseRoles[0])
  }

  const pickRole = (c: string, r: string) => {
    const next = profiles.find((p) => p.parameter === c && p.role === r)
    if (!next) return
    setPendingCap(null)
    const ids = (next.subtypes ?? []).map((s) => s.id)
    const nextCurve = ids.find((id) => reaches(next, id, required)) ?? ids[0]
    onChange({ profileId: next.id, subtype: nextCurve })
  }

  const settled: [string, string][] = []
  if (capabilities.length > 0 && capShown.length <= 1 && cap) settled.push(['Capability', cap])
  if (cap && roleShown.length <= 1 && role) settled.push(['Used as', role])
  if (role && curves.length > 0 && curveShown.length <= 1 && curve) {
    settled.push(['Sensor type', curve])
  }

  return (
    <Panel
      parameterName={parameterName}
      action={
        (hidden > 0 || showAll) && (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="text-[11px] font-semibold text-primary whitespace-nowrap"
          >
            {showAll
              ? 'Show only what fits'
              : `Show all ${hidden + capShown.length + roleShown.length + curveShown.length} options`}
          </button>
        )
      }
    >
      {hidden > 0 && !showAll && (
        <p className="text-xs text-slate-500">
          {hidden} option{hidden === 1 ? '' : 's'} hidden because they do not reach the
          required range.
        </p>
      )}

      {capShown.length > 1 && (
        <div>
          <label className={LABEL}>
            Capability used <span className="text-red-500">*</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {capShown.map((c) => (
              <button
                key={c}
                type="button"
                disabled={disabled}
                onClick={() => pickCap(c)}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-xl border bg-white',
                  cap === c ? 'border-primary' : 'border-slate-300',
                )}
              >
                {radio(cap === c)}
                <span className="text-xs font-semibold text-slate-800">{c}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {cap && roleShown.length > 1 && (
        <div>
          <label className={LABEL}>
            Used as <span className="text-red-500">*</span>
          </label>
          <div className="flex flex-wrap gap-2 items-center">
            {roleShown.map((r) => (
              <button
                key={r}
                type="button"
                disabled={disabled}
                onClick={() => pickRole(cap, r)}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-xl border bg-white',
                  role === r ? 'border-primary' : 'border-slate-300',
                )}
              >
                {radio(role === r)}
                <span className="text-xs font-semibold text-slate-800 capitalize">{r}</span>
                <span className="text-xs text-slate-500">
                  {r === 'source' ? 'it produced the value' : 'it read the value'}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {role && profile && curveShown.length > 1 && (
        <div>
          <label className={LABEL} htmlFor={`curve-${profile.id}`}>
            Sensor type <span className="text-red-500">*</span>
          </label>
          <div className="flex items-center gap-3 flex-wrap">
            <select
              id={`curve-${profile.id}`}
              value={curve ?? ''}
              disabled={disabled}
              onChange={(e) => onChange({ profileId: profile.id, subtype: e.target.value })}
              className="rounded-xl border border-slate-300 h-10 px-3 bg-white text-xs font-medium min-w-[220px]"
            >
              {curveShown.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
            {curve && <CurveReach profile={profile} subtypeId={curve} />}
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
          <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
            <Info className="size-3" />
            the only option, so not asked
          </span>
        </div>
      )}

      {children}
    </Panel>
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
