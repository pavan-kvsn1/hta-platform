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

import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Info } from 'lucide-react'
import {
  declaredCapability,
  matchesParameter,
  type RequiredRange,
} from '@/lib/master-instrument-capability'
import { isSymmetric } from '@/lib/master-instrument-registry'
import type { CapabilityProfile, RegistryUnit } from '@/lib/master-instrument-registry'
import { cn } from '@/lib/utils'

interface MasterCapabilityDeclarationProps {
  /** Absent when the certificate names a master the registry no longer holds. */
  unit?: RegistryUnit
  parameterName: string
  /**
   * What to call it in the heading - the same name the mapping step above uses, told
   * apart from a sibling by its range where a certificate calibrates one twice.
   */
  label?: string
  /** The parameter's unit, which decides which capabilities are candidates at all. */
  parameterUnit?: string | null
  /** What the calibration needs, so options that cannot reach it can be set aside. */
  required: RequiredRange[]
  profileId?: string
  subtype?: string
  disabled?: boolean
  /**
   * The declaration so far. profileId is undefined while a capability has been picked
   * and the questions under it are still open - the certificate records no half answer,
   * and neither should the panel pretend one is settled.
   */
  onChange: (declaration: { profileId?: string; subtype?: string }) => void
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

/**
 * What tells two profiles of the same capability and role apart, in the engineer's terms.
 *
 * The component where the registry knows it - an indicator and its probe are two
 * certified instruments in one case, and which one did the measuring is the whole
 * question. Otherwise the mode the certificate stated, and failing both the accuracy,
 * which is what differs when nothing says why.
 */
function distinguish(profile: CapabilityProfile): { title: string; detail: string } {
  // Only the plain ±x figures. A formula or a class accuracy does not reduce to one
  // number, and a made-up one beside the real ones would be read as comparable.
  const accuracies = [
    ...new Set(
      (profile.subtypes ?? [])
        .flatMap((s) => s.buckets)
        .concat(profile.buckets)
        .map((b) => b.accuracy)
        .filter(isSymmetric)
        .map((a) => a.value),
    ),
  ].sort((a, b) => a - b)
  const detail = accuracies.length
    ? `±${accuracies[0]}${accuracies.length > 1 ? ` to ±${accuracies[accuracies.length - 1]}` : ''} ${profile.unit}`
    : 'nothing recorded'

  if (profile.component) {
    return {
      title: profile.component === 'indicator' ? 'Indicator' : 'Sensor',
      detail,
    }
  }
  if (profile.mode) return { title: profile.mode, detail }
  return {
    title:
      profile.min !== null && profile.max !== null
        ? `${profile.min} to ${profile.max} ${profile.unit}`
        : 'Unrecorded range',
    detail,
  }
}

/** The heading for that question, which depends on what the answers are. */
function distinguishLabel(candidates: CapabilityProfile[]): string {
  if (candidates.every((c) => c.component)) return 'Which part'
  if (candidates.every((c) => c.mode)) return 'Measured as'
  return 'Which record'
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
  label,
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
  //
  // A capability just clicked outranks one declared earlier. The other way round, a
  // declaration made under a previous answer kept deciding this: pick Thermocouple,
  // switch to RTD, and Thermocouple could never be got back to, because it needs a
  // role before it names a profile and the RTD profile was still answering for it.
  const cap =
    (pendingCap && capabilities.includes(pendingCap) ? pendingCap : null) ??
    declared?.parameter ??
    (capShown.length === 1 ? capShown[0] : null)

  // Used as - only once the capability is settled, since the roles belong to it.
  //
  // Deduplicated: two profiles can share a capability and a role and still be two
  // different things - the indicator and the probe of one thermometer, a caliper
  // checker's height and outside faces. Listing the role once per profile put the same
  // radio button on screen twice with nothing to tell the copies apart. Which one is a
  // separate question, asked below.
  const roles = cap
    ? [...new Set(profiles.filter((p) => p.parameter === cap).map((p) => p.role))]
    : []
  const rolesUsable = roles.filter((r) =>
    profiles.some((x) => x.parameter === cap && x.role === r && fits(x)),
  )
  const roleShown = showAll ? roles : rolesUsable.length ? rolesUsable : roles
  const role = declared?.role ?? (roleShown.length === 1 ? roleShown[0] : null)

  /**
   * The profiles still in play once the capability and the role are answered.
   *
   * Usually one. Where there are several they are genuinely different instruments
   * inside one asset, so the engineer picks - except that a profile recording nothing
   * never wins against one that records something. 682 lists Thermocouple twice, once
   * with eight curves and once empty, and asking which of those to use is a question
   * with one sensible answer.
   */
  const candidates = useMemo(() => {
    if (!cap || !role) return []
    const all = profiles.filter((p) => p.parameter === cap && p.role === role)
    const recorded = all.filter((p) => (p.subtypes ?? []).length > 0 || p.buckets.length > 0)
    return recorded.length ? recorded : all
  }, [profiles, cap, role])

  // Both answers together name one capability profile, and only then is there a span,
  // a least count and an accuracy to compare against the requirement.
  const profile =
    candidates.find((p) => p.id === profileId) ??
    (candidates.length === 1 ? candidates[0] : null)

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
    if (capShown.length > 1 || roleShown.length > 1 || candidates.length > 1) return
    report.current({ profileId: profile.id, subtype: curve ?? undefined })
  }, [profile, profileId, curve, pendingCap, capShown.length, roleShown.length, candidates.length])

  if (profiles.length === 0) {
    return (
      <Panel parameterName={label ?? parameterName}>
        <p className="text-xs text-slate-500">No capability recorded for this instrument.</p>
        {children}
      </Panel>
    )
  }

  const pickCap = (c: string) => {
    setPendingCap(c)
    const theseRoles = [
      ...new Set(profiles.filter((p) => p.parameter === c).map((p) => p.role)),
    ]
    if (theseRoles.length !== 1) {
      // More to answer before this names a profile. Whatever was declared answered a
      // different capability, and leaving it would have the role question answered by
      // a profile the engineer has just moved away from.
      if (declared) onChange({ profileId: undefined, subtype: undefined })
      return
    }
    // One role, so the capability alone settles the profile.
    pickRole(c, theseRoles[0])
  }

  const pickRole = (c: string, r: string) => {
    const same = profiles.filter((p) => p.parameter === c && p.role === r)
    const recorded = same.filter((p) => (p.subtypes ?? []).length > 0 || p.buckets.length > 0)
    const usable = recorded.length ? recorded : same
    // Several left means the next question decides it; do not answer it for them.
    const next = usable.length === 1 ? usable[0] : usable.find((p) => fits(p))
    if (!next || usable.length > 1) {
      setPendingCap(c)
      return
    }
    setPendingCap(null)
    const ids = (next.subtypes ?? []).map((s) => s.id)
    const nextCurve = ids.find((id) => reaches(next, id, required)) ?? ids[0]
    onChange({ profileId: next.id, subtype: nextCurve })
  }

  // An indicator-and-probe pair, which the unit's own serial number spells out.
  const instrumentIsTwoPart = candidates.some((c) => c.component)

  const settled: [string, string][] = []
  if (capabilities.length > 0 && capShown.length <= 1 && cap) settled.push(['Capability', cap])
  if (cap && roleShown.length <= 1 && role) settled.push(['Used as', role])
  if (candidates.length === 1 && profile && (profile.component || profile.mode)) {
    settled.push([distinguishLabel(candidates), distinguish(profile).title])
  }
  if (role && curves.length > 0 && curveShown.length <= 1 && curve) {
    settled.push(['Sensor type', curve])
  }

  return (
    <Panel
      parameterName={label ?? parameterName}
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

      {cap && role && candidates.length > 1 && (
        <div>
          <label className={LABEL}>
            {distinguishLabel(candidates)} <span className="text-red-500">*</span>
          </label>
          {/* Both halves are in the reading path, and the certificate gives each its
              own figure rather than one for the pair. Which of them the certificate is
              rated against is the engineer's call - what this must not do is let the
              readout's figure be taken for the instrument with the probe's out of
              sight, so both are said here, in the certificate's own words. */}
          <p className="text-[11px] text-slate-500 mb-1.5">
            {instrumentIsTwoPart ? (
              <>
                This instrument is a readout and a probe, certified separately &mdash;{' '}
                {candidates
                  .map((c) => `${distinguish(c).title.toLowerCase()} ${distinguish(c).detail}`)
                  .join(', ')}
                . A reading carries both. Say which one this declaration is rated
                against.
              </>
            ) : (
              `${cap} is recorded more than once against this instrument. They are not the same, so say which was used.`
            )}
          </p>
          <div className="flex flex-wrap gap-2 items-center">
            {candidates.map((c) => {
              const { title, detail } = distinguish(c)
              return (
                <button
                  key={c.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    setPendingCap(null)
                    const ids = (c.subtypes ?? []).map((x) => x.id)
                    onChange({
                      profileId: c.id,
                      subtype: ids.find((id) => reaches(c, id, required)) ?? ids[0],
                    })
                  }}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2 rounded-xl border bg-white',
                    profile?.id === c.id ? 'border-primary' : 'border-slate-300',
                  )}
                >
                  {radio(profile?.id === c.id)}
                  <span className="text-xs font-semibold text-slate-800 capitalize">{title}</span>
                  <span className="text-xs text-slate-500">{detail}</span>
                </button>
              )
            })}
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
