'use client'

// Adding one master instrument to the certificate.
//
// The flow asks what the master is *for* before asking which one it is. A certificate
// calibrates several parameters and one master rarely serves them all, so choosing the
// parameter first is what lets the instrument list say "4.0 : 1" or "Range Exceeds"
// instead of listing every asset in the lab and leaving the engineer to work it out.
//
// Each step appears only once the step before it is answered, and nothing is written
// to the certificate until "Add this master" - so a half-made choice can be abandoned
// without leaving a partly-filled master behind, which is what the old always-open
// card did.

import { useMemo, useState } from 'react'
import { CheckCircle, Trash2 } from 'lucide-react'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Parameter } from '@/lib/stores/certificate-store'
import {
  MasterInstrument,
  CATEGORY_LABELS,
  getDisplayValue,
  getSopReferences,
} from '@/lib/master-instruments'
import type { RegistryUnit } from '@/lib/master-instrument-registry'
import {
  DEFAULT_ACCURACY_RATIO,
  chooseCapability,
  requiredRanges,
  type RequiredRange,
} from '@/lib/master-instrument-capability'
import { ELIGIBILITY_BADGE, eligibilityFor } from '@/lib/master-instrument-eligibility'
import { MasterCapabilityDeclaration } from './MasterCapabilityDeclaration'
import { MasterBandTable } from './MasterBandTable'
import { cn } from '@/lib/utils'

const LABEL = 'block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2'
const ANY = '__any__'

const n = (v: number) => Number(v.toFixed(4)).toString()

export interface FlowResult {
  parameterIndex: number
  instrument: MasterInstrument
  profileId?: string
  subtype?: string
  sopReference: string
  /** Why a ratio below the lab's threshold was accepted. Empty when it was not. */
  acceptanceReason: string
}

interface MasterAddFlowProps {
  index: number
  parameters: Parameter[]
  /** Master id per parameter id, for the ones already covered on this certificate. */
  coveredBy: Map<string, string>
  instruments: MasterInstrument[]
  /** The registry unit behind a listed instrument - by id, or by asset number. */
  resolveUnit: (instrument: MasterInstrument) => RegistryUnit | undefined
  threshold?: number
  disabled?: boolean
  onCancel: () => void
  onAdd: (result: FlowResult) => void
}

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

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-bold text-slate-500 uppercase">{label}</p>
      <p className="font-semibold text-slate-800">{value || '—'}</p>
    </div>
  )
}

export function MasterAddFlow({
  index,
  parameters,
  coveredBy,
  instruments,
  resolveUnit,
  threshold = DEFAULT_ACCURACY_RATIO,
  disabled,
  onCancel,
  onAdd,
}: MasterAddFlowProps) {
  const [paramId, setParamId] = useState<string | null>(null)
  const [category, setCategory] = useState(ANY)
  const [description, setDescription] = useState(ANY)
  const [assetNo, setAssetNo] = useState<string | null>(null)
  const [profileId, setProfileId] = useState<string | undefined>()
  const [subtype, setSubtype] = useState<string | undefined>()
  const [sop, setSop] = useState('')
  const [reason, setReason] = useState('')

  const parameterIndex = parameters.findIndex((p) => p.id === paramId)
  const parameter = parameterIndex >= 0 ? parameters[parameterIndex] : null
  // Memoised: requiredRanges builds a new array each call, and every memo below keys
  // off it, so without this none of them ever hit.
  const required: RequiredRange[] = useMemo(
    () => (parameter ? requiredRanges(parameter) : []),
    [parameter],
  )

  const rate = useMemo(
    () => (inst: MasterInstrument) =>
      eligibilityFor(
        resolveUnit(inst),
        inst,
        {
          name: parameter?.parameterName ?? '',
          unit: parameter?.parameterUnit ?? '',
          required,
        },
        threshold,
      ),
    [resolveUnit, parameter, required, threshold],
  )

  // Step 2's pool: everything that records the chosen parameter, plus the instruments
  // whose capability was never recorded - excluding those would quietly hide the
  // instruments the registry simply has nothing to say about.
  const pool = useMemo(() => {
    if (!parameter) return []
    return instruments.filter((inst) => {
      const unit = resolveUnit(inst)
      if (!unit || unit.capability_profiles.length === 0) return true
      const wanted = parameter.parameterName.trim().toLowerCase()
      if (!wanted) return true
      return unit.capability_profiles.some((p) => p.parameter.toLowerCase().includes(wanted))
    })
  }, [instruments, parameter, resolveUnit])

  const categories = useMemo(
    () => [...new Set(pool.map((i) => i.type))].sort(),
    [pool],
  )
  const descriptions = useMemo(
    () =>
      [
        ...new Set(
          pool.filter((i) => category === ANY || i.type === category).map((i) => i.instrument_desc),
        ),
      ].sort(),
    [pool, category],
  )

  const shown = useMemo(
    () =>
      pool
        .filter((i) => category === ANY || i.type === category)
        .filter((i) => description === ANY || i.instrument_desc === description)
        .map((i) => ({ inst: i, fit: rate(i) }))
        .sort((a, b) => a.fit.rank - b.fit.rank || a.inst.asset_no.localeCompare(b.inst.asset_no)),
    [pool, category, description, rate],
  )

  const chosenInstrument = assetNo ? (instruments.find((i) => i.asset_no === assetNo) ?? null) : null
  const registryUnit = chosenInstrument ? resolveUnit(chosenInstrument) : undefined
  const sops = chosenInstrument ? getSopReferences(chosenInstrument) : []

  // The capability actually being compared: what was declared, or the best fit until
  // then, so the tables below are not blank while the declaration is still open.
  const declaredProfile = useMemo(() => {
    if (!registryUnit || !parameter) return null
    if (profileId) {
      const found = registryUnit.capability_profiles.find((p) => p.id === profileId)
      if (found) return found
    }
    return chooseCapability(registryUnit, parameter.parameterName, required, { threshold })
      ?.profile ?? null
  }, [registryUnit, parameter, profileId, required, threshold])

  const worstRatio = useMemo(() => {
    if (!registryUnit || !parameter) return null
    const chosen = chooseCapability(registryUnit, parameter.parameterName, required, { threshold })
    return chosen?.suitability.worstRatio ?? null
  }, [registryUnit, parameter, required, threshold])

  const pickParameter = (id: string) => {
    setParamId(id)
    setCategory(ANY)
    setDescription(ANY)
    setAssetNo(null)
    setProfileId(undefined)
    setSubtype(undefined)
    setSop('')
    setReason('')
  }

  const pickInstrument = (inst: MasterInstrument) => {
    if (assetNo === inst.asset_no) {
      // Clicking the chosen one again un-picks it; a radio list can otherwise only be
      // changed, never cleared.
      setAssetNo(null)
      setProfileId(undefined)
      setSubtype(undefined)
      setSop('')
      return
    }
    setAssetNo(inst.asset_no)
    setProfileId(undefined)
    setSubtype(undefined)
    setSop(getSopReferences(inst)[0] ?? '')
  }

  const canAdd = parameterIndex >= 0 && chosenInstrument !== null

  return (
    <div className="bg-section-inner rounded-xl p-5 border border-slate-300 mt-5">
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">
          Master Instrument {index}
        </span>
        <button
          type="button"
          onClick={onCancel}
          title="Discard"
          className="text-red-500 hover:text-red-700 transition-colors"
        >
          <Trash2 className="size-5" />
        </button>
      </div>

      <div className="bg-white rounded-xl p-4 border border-slate-200">
        {/* Step 1 - what this master is for */}
        <div className="mb-6">
          <label className={LABEL}>
            Used for which parameter <span className="text-red-500">*</span>
          </label>
          <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
            {parameters.map((p, i) => {
              const covered = coveredBy.get(p.id)
              const usable = instruments.filter((inst) => {
                const fit = eligibilityFor(
                  resolveUnit(inst),
                  inst,
                  {
                    name: p.parameterName,
                    unit: p.parameterUnit,
                    required: requiredRanges(p),
                  },
                  threshold,
                )
                return fit.usable && fit.rank <= 3
              }).length
              const on = paramId === p.id

              return (
                <button
                  key={p.id}
                  type="button"
                  disabled={disabled || !!covered}
                  onClick={() => pickParameter(p.id)}
                  className={cn(
                    'w-full text-left px-4 py-3 flex items-center gap-4',
                    covered
                      ? 'opacity-50 bg-slate-50 cursor-not-allowed'
                      : 'bg-white hover:bg-slate-50',
                  )}
                >
                  {radio(on)}
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold text-slate-800">
                      {p.parameterName || `Parameter ${i + 1}`}
                    </span>
                    <span className="block text-xs text-slate-500">
                      {p.rangeMin && p.rangeMax
                        ? `${p.rangeMin} to ${p.rangeMax} ${p.parameterUnit}`
                        : p.parameterUnit || 'Range not set'}
                      {p.accuracyValue ? ` · ±${p.accuracyValue}` : ''}
                      {' · '}
                      {covered
                        ? `already assigned to ${covered}`
                        : `${usable} instrument${usable === 1 ? '' : 's'} can do it`}
                    </span>
                  </span>
                  <span
                    className={cn(
                      'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase flex-shrink-0',
                      covered ? ELIGIBILITY_BADGE.green : ELIGIBILITY_BADGE.amber,
                    )}
                  >
                    {covered ? 'Covered' : 'Needs a master'}
                  </span>
                </button>
              )
            })}
          </div>
          <p className="text-xs text-slate-500 mt-2">
            {parameters.some((p) => !coveredBy.has(p.id))
              ? 'Choosing the parameter first filters the instrument list to those that can actually do it.'
              : 'Every parameter already has a master.'}
          </p>
        </div>

        {/* Step 2 - which instrument */}
        {parameter && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 mb-6">
            <div>
              <Label className={LABEL}>Category</Label>
              <Select value={category} onValueChange={(v) => { setCategory(v); setDescription(ANY) }}>
                <SelectTrigger className="w-full rounded-xl border-slate-300 h-12 px-4 font-medium bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY}>Any category</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c} value={c}>
                      {CATEGORY_LABELS[c] || c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className={LABEL}>Description</Label>
              <Select value={description} onValueChange={setDescription}>
                <SelectTrigger className="w-full rounded-xl border-slate-300 h-12 px-4 font-medium bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY}>Any description</SelectItem>
                  {descriptions.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="md:col-span-2">
              <Label className={LABEL}>
                Instrument <span className="text-red-500">*</span>
              </Label>
              <p className="text-[11px] text-slate-500 mb-1.5">
                Each row: model &middot; where that master was last calibrated &middot; the
                range it records for this parameter. The badge is its accuracy against yours.
              </p>
              <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden max-h-80 overflow-y-auto">
                {shown.map(({ inst, fit }) => {
                  const on = assetNo === inst.asset_no
                  return (
                    <button
                      key={inst.asset_no}
                      type="button"
                      disabled={disabled || !fit.usable}
                      onClick={() => pickInstrument(inst)}
                      className={cn(
                        'w-full text-left px-4 py-3 flex items-center gap-4',
                        fit.usable
                          ? 'bg-white hover:bg-slate-50'
                          : 'opacity-50 bg-slate-50 cursor-not-allowed',
                      )}
                    >
                      {radio(on)}
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-semibold text-slate-800 truncate">
                          {inst.asset_no} &nbsp; {inst.instrument_desc}
                        </span>
                        <span className="block text-xs text-slate-500 truncate">
                          {getDisplayValue(inst.model)}
                          {inst.calibrated_at ? ` · calibrated at ${inst.calibrated_at}` : ''}
                          {fit.detail ? ` · ${fit.detail}` : ''}
                        </span>
                      </span>
                      <span
                        className={cn(
                          'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase flex-shrink-0',
                          ELIGIBILITY_BADGE[fit.tone],
                        )}
                      >
                        {fit.verdict}
                      </span>
                    </button>
                  )
                })}
              </div>
              <p className="text-xs text-slate-500 mt-2">
                {shown.filter((s) => s.fit.usable).length} of {shown.length} shown can be used
                for {parameter.parameterName || 'this parameter'} &mdash; the rest stay visible
                with the reason.
              </p>
            </div>
          </div>
        )}

        {/* The instrument, once chosen */}
        {chosenInstrument && (
          <div className="flex gap-3 p-3 rounded-xl border bg-green-50 border-green-100 mb-5">
            <CheckCircle className="size-5 text-green-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-extrabold uppercase tracking-wider text-green-700 mb-2">
                Instrument Selected
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <Info label="Asset No" value={chosenInstrument.asset_no} />
                <Info label="Make / Model" value={getDisplayValue(chosenInstrument.model)} />
                <Info label="Serial No" value={getDisplayValue(chosenInstrument.instrument_sl_no)} />
                <Info label="Calibration Due" value={chosenInstrument.next_due_on} />
              </div>
              <div className="mt-3 pt-3 border-t border-slate-200">
                <p className="text-xs text-slate-500">
                  <span className="font-semibold">Calibrated at:</span>{' '}
                  {chosenInstrument.calibrated_at} &nbsp;&middot;&nbsp;
                  <span className="font-semibold">Report:</span> {chosenInstrument.report_no}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Steps 3 and 4 - how it was used, and what that gives */}
        {chosenInstrument && parameter && (
          <div className="space-y-5">
            {registryUnit && (
              <MasterCapabilityDeclaration
                unit={registryUnit}
                parameterName={parameter.parameterName}
                required={required}
                profileId={profileId}
                subtype={subtype}
                disabled={disabled}
                onChange={(d) => {
                  setProfileId(d.profileId)
                  setSubtype(d.subtype)
                }}
              />
            )}

            {required.length > 0 && (
              <div>
                <label className={LABEL}>Required of the master</label>
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-100 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                        <th className="text-left px-3 py-2">Range</th>
                        <th className="text-left px-3 py-2">Least count</th>
                        <th className="text-left px-3 py-2">Accuracy &plusmn;</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {required.map((r, i) => (
                        <tr key={i} className="bg-white">
                          <td className="px-3 py-2 font-mono text-xs tabular-nums text-slate-800">
                            {n(r.from)} to {n(r.to)} {parameter.parameterUnit}
                          </td>
                          <td className="px-3 py-2 font-mono text-xs tabular-nums text-slate-800">
                            {n(r.leastCount)}
                          </td>
                          <td className="px-3 py-2 font-mono text-xs tabular-nums text-slate-800">
                            {n(r.accuracy)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-slate-500 mt-1.5">
                  Taken from the unit under test in Section 02
                  {required.length > 1 ? `, which is binned across ${required.length} ranges` : ''}.
                  Change it there, not here.
                </p>
              </div>
            )}

            {declaredProfile && required.length > 0 && (
              <MasterBandTable
                assetNo={chosenInstrument.asset_no}
                profile={declaredProfile}
                subtypeId={subtype}
                required={required}
                threshold={threshold}
              />
            )}

            <div>
              <label className={LABEL} htmlFor="flow-sop">
                SOP Ref <span className="text-red-500">*</span>
              </label>
              {sops.length > 0 ? (
                <select
                  id="flow-sop"
                  value={sop}
                  disabled={disabled}
                  onChange={(e) => setSop(e.target.value)}
                  className="w-48 h-8 text-xs rounded-lg border border-slate-300 bg-white px-2"
                >
                  {sops.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id="flow-sop"
                  type="text"
                  value={sop}
                  disabled={disabled}
                  onChange={(e) => setSop(e.target.value)}
                  placeholder="e.g. NLAB/CAL/T01/R01"
                  className="w-56 h-8 text-xs rounded-lg border border-slate-300 bg-white px-2"
                />
              )}
            </div>

            {worstRatio !== null && worstRatio < threshold && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                <p className="text-xs font-bold text-amber-800 mb-1">
                  Lowest ratio across your buckets is {worstRatio.toFixed(1)} : 1.
                </p>
                <p className="text-[11px] text-amber-800 mb-2">
                  Below the {threshold}:1 the lab asks for. Usable, with a reason recorded on
                  the certificate.
                </p>
                <textarea
                  rows={2}
                  value={reason}
                  disabled={disabled}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full rounded-lg border border-amber-200 bg-white p-2 text-xs"
                  placeholder="e.g. Customer tolerance is wider than the stated accuracy; agreed with the reviewer."
                />
              </div>
            )}
          </div>
        )}

        {canAdd && (
          <div className="flex justify-end gap-2 mt-5">
            <button
              type="button"
              onClick={onCancel}
              className="h-10 px-4 rounded-xl border border-slate-300 bg-white text-sm font-medium"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() =>
                onAdd({
                  parameterIndex,
                  instrument: chosenInstrument!,
                  profileId,
                  subtype,
                  sopReference: sop,
                  acceptanceReason:
                    worstRatio !== null && worstRatio < threshold ? reason.trim() : '',
                })
              }
              className="h-10 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
            >
              Add this master
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
