'use client'

// Adding one master instrument to the certificate.
//
// The flow asks what the master is *for* before asking which one it is. A certificate
// calibrates several parameters and one master rarely serves them all, so choosing the
// parameters first is what lets the instrument list say "4.0 : 1" or "Range Exceeds"
// instead of listing every asset in the lab and leaving the engineer to work it out.
//
// A master can serve more than one parameter - a universal calibrator sources
// temperature and reads pressure on the same certificate - so the parameters are
// ticked, not picked. Each one is then declared separately: the capability used, the
// range required and the procedure followed all differ per parameter, even on the same
// instrument.
//
// Each step appears only once the step before it is answered, and nothing is written
// to the certificate until "Add this master" - so a half-made choice can be abandoned
// without leaving a partly-filled master behind.

import { useMemo, useState } from 'react'
import { CheckCircle, Search, Trash2 } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { SearchableSelect, type SearchableOption } from '@/components/ui/searchable-select'
import type { Parameter } from '@/lib/stores/certificate-store'
import {
  MasterInstrument,
  CATEGORY_LABELS,
  getDisplayValue,
  getSimpleValue,
  getSopReferences,
} from '@/lib/master-instruments'
import type { RegistryUnit } from '@/lib/master-instrument-registry'
import {
  DEFAULT_ACCURACY_RATIO,
  chooseCapability,
  declaredCapability,
  missingRequirement,
  requiredRanges,
  type RequiredRange,
} from '@/lib/master-instrument-capability'
import {
  ELIGIBILITY_BADGE,
  eligibilityFor,
  type Eligibility,
} from '@/lib/master-instrument-eligibility'
import { MasterCapabilityDeclaration } from './MasterCapabilityDeclaration'
import { MasterBandTable } from './MasterBandTable'
import { cn } from '@/lib/utils'

const LABEL = 'block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2'
const ANY = '__any__'

const n = (v: number) => Number(v.toFixed(4)).toString()

/**
 * Distinct values, sorted, treating case and spacing as noise.
 *
 * The lab's list carries "Digital RTD Thermometer with Sensor" and "...with sensor" as
 * two descriptions. Offered as two they read as a data error the engineer has to pick
 * between; the first spelling seen stands for both.
 */
function distinct(values: string[]): string[] {
  const seen = new Map<string, string>()
  for (const value of values) {
    const trimmed = value.trim()
    if (!trimmed) continue
    const key = trimmed.toLowerCase().replace(/\s+/g, ' ')
    if (!seen.has(key)) seen.set(key, trimmed)
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b))
}

/** "a", "a and b", "a, b and c" - a bare join reads as canned. */
const listOf = (items: string[]) =>
  items.length < 3
    ? items.join(' and ')
    : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`

/**
 * The procedures an instrument can be used under.
 *
 * The registry records these for all 209 units, so it is the fallback when the list the
 * app is running on does not carry them - which is how the dropdown came to render with
 * nothing in it.
 */
export function sopReferencesFor(
  instrument: MasterInstrument | null | undefined,
  unit: RegistryUnit | undefined,
): string[] {
  const fromList = instrument ? getSopReferences(instrument) : []
  if (fromList.length > 0) return fromList
  return unit?.sop_references ?? []
}

/** What was declared for one parameter, on the master being added. */
export interface FlowAssignment {
  parameterIndex: number
  profileId?: string
  subtype?: string
  sopReference: string
  /** Why a ratio below the lab's threshold was accepted. Empty when it was not. */
  acceptanceReason: string
}

export interface FlowResult {
  instrument: MasterInstrument
  assignments: FlowAssignment[]
}

interface Declaration {
  profileId?: string
  subtype?: string
  sop: string
  reason: string
}

const EMPTY_DECLARATION: Declaration = { sop: '', reason: '' }

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

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-bold text-slate-500 uppercase">{label}</p>
      <p className="font-semibold text-slate-800">{value || '—'}</p>
    </div>
  )
}

function worstRatioFor(
  unit: RegistryUnit | undefined,
  parameterName: string,
  required: RequiredRange[],
  threshold: number,
) {
  if (!unit || required.length === 0) return null
  return (
    chooseCapability(unit, parameterName, required, { threshold })?.suitability.worstRatio ?? null
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
  const [paramIds, setParamIds] = useState<string[]>([])
  const [category, setCategory] = useState(ANY)
  const [make, setMake] = useState(ANY)
  const [description, setDescription] = useState(ANY)
  const [instrumentQuery, setInstrumentQuery] = useState('')
  const [assetNo, setAssetNo] = useState<string | null>(null)
  const [showUnrecorded, setShowUnrecorded] = useState(false)
  const [declarations, setDeclarations] = useState<Record<string, Declaration>>({})

  const chosenParameters = useMemo(
    () =>
      parameters
        .map((parameter, parameterIndex) => ({ parameter, parameterIndex }))
        .filter(({ parameter }) => paramIds.includes(parameter.id)),
    [parameters, paramIds],
  )

  const requiredFor = useMemo(() => {
    const map = new Map<string, RequiredRange[]>()
    parameters.forEach((p) => map.set(p.id, requiredRanges(p)))
    return map
  }, [parameters])

  /**
   * How an instrument rates against every parameter ticked. The worst answer is the one
   * that matters: a master that reads Temperature beautifully and cannot reach the
   * Pressure range cannot serve this assignment.
   */
  const rate = useMemo(
    () =>
      (inst: MasterInstrument): Eligibility & { limiting?: string } => {
        const unit = resolveUnit(inst)
        const each = chosenParameters.map(({ parameter }) => ({
          name: parameter.parameterName,
          fit: eligibilityFor(
            unit,
            inst,
            {
              name: parameter.parameterName,
              unit: parameter.parameterUnit,
              required: requiredFor.get(parameter.id) ?? [],
            },
            threshold,
          ),
        }))
        if (each.length === 0) {
          return eligibilityFor(unit, inst, { name: '', unit: '', required: [] }, threshold)
        }
        const worst = each.reduce((a, b) => (b.fit.rank > a.fit.rank ? b : a))
        return each.length > 1 && worst.fit.rank > 0
          ? { ...worst.fit, limiting: worst.name }
          : worst.fit
      },
    [resolveUnit, chosenParameters, requiredFor, threshold],
  )

  /** Whether an instrument records every parameter ticked, or records nothing at all. */
  const standing = useMemo(
    () =>
      (inst: MasterInstrument): 'records them' | 'nothing recorded' | 'records something else' => {
        const unit = resolveUnit(inst)
        if (!unit || unit.capability_profiles.length === 0) return 'nothing recorded'
        const servesAll = chosenParameters.every(({ parameter }) => {
          const wanted = parameter.parameterName.trim().toLowerCase()
          if (!wanted) return true
          return unit.capability_profiles.some((p) => p.parameter.toLowerCase().includes(wanted))
        })
        return servesAll ? 'records them' : 'records something else'
      },
    [resolveUnit, chosenParameters],
  )

  // Instruments with no capability recorded at all are set aside rather than folded in:
  // in this lab the same handful would otherwise pad every parameter's list, and for a
  // parameter few instruments serve they would be most of it.
  const pool = useMemo(() => {
    if (chosenParameters.length === 0) return []
    const capable = instruments.filter((i) => standing(i) === 'records them')
    return showUnrecorded
      ? [...capable, ...instruments.filter((i) => standing(i) === 'nothing recorded')]
      : capable
  }, [instruments, chosenParameters, standing, showUnrecorded])

  const unrecordedCount = useMemo(
    () =>
      chosenParameters.length === 0
        ? 0
        : instruments.filter((i) => standing(i) === 'nothing recorded').length,
    [instruments, chosenParameters, standing],
  )

  const categories: SearchableOption[] = useMemo(
    () => [
      { value: ANY, label: 'Any category', pinned: true },
      ...[...new Set(pool.map((i) => i.type))]
        .sort()
        .map((c) => ({ value: c, label: CATEGORY_LABELS[c] || c })),
    ],
    [pool],
  )

  const makes: SearchableOption[] = useMemo(
    () => [
      { value: ANY, label: 'Any make', pinned: true },
      ...distinct(
        pool
          .filter((i) => category === ANY || i.type === category)
          .map((i) => getSimpleValue(i.make)),
      ).map((m) => ({ value: m, label: m })),
    ],
    [pool, category],
  )

  const descriptions: SearchableOption[] = useMemo(
    () => [
      { value: ANY, label: 'Any description', pinned: true },
      ...distinct(
        pool
          .filter((i) => category === ANY || i.type === category)
          .filter(
          (i) =>
            make === ANY ||
            getSimpleValue(i.make).trim().toLowerCase() === make.trim().toLowerCase(),
        )
          .map((i) => i.instrument_desc),
      ).map((d) => ({ value: d, label: d })),
    ],
    [pool, category, make],
  )

  const filtered = useMemo(
    () =>
      pool
        .filter((i) => category === ANY || i.type === category)
        .filter(
          (i) =>
            make === ANY ||
            getSimpleValue(i.make).trim().toLowerCase() === make.trim().toLowerCase(),
        )
        .filter(
          (i) =>
            description === ANY ||
            i.instrument_desc.trim().toLowerCase().replace(/\s+/g, ' ') ===
              description.trim().toLowerCase().replace(/\s+/g, ' '),
        ),
    [pool, category, make, description],
  )

  const shown = useMemo(() => {
    const q = instrumentQuery.trim().toLowerCase()
    return filtered
      .filter((i) =>
        !q
          ? true
          : [
              i.asset_no,
              i.instrument_desc,
              getSimpleValue(i.make),
              getSimpleValue(i.model),
              getSimpleValue(i.instrument_sl_no),
            ].some((field) => (field ?? '').toLowerCase().includes(q)),
      )
      .map((i) => ({ inst: i, fit: rate(i) }))
      .sort((a, b) => a.fit.rank - b.fit.rank || a.inst.asset_no.localeCompare(b.inst.asset_no))
  }, [filtered, instrumentQuery, rate])

  const chosenInstrument = assetNo
    ? (instruments.find((i) => i.asset_no === assetNo) ?? null)
    : null
  const registryUnit = chosenInstrument ? resolveUnit(chosenInstrument) : undefined
  const sops = sopReferencesFor(chosenInstrument, registryUnit)

  const toggleParameter = (id: string) => {
    setParamIds((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    )
    // The instrument list is rated against the parameters ticked, so a change to them
    // invalidates a choice made under the old set.
    setAssetNo(null)
    setDeclarations({})
    setCategory(ANY)
    setMake(ANY)
    setDescription(ANY)
    setInstrumentQuery('')
  }

  const pickInstrument = (inst: MasterInstrument) => {
    if (assetNo === inst.asset_no) {
      // Clicking the chosen one again un-picks it; a radio list can otherwise only be
      // changed, never cleared.
      setAssetNo(null)
      setDeclarations({})
      return
    }
    setAssetNo(inst.asset_no)
    const firstSop = sopReferencesFor(inst, resolveUnit(inst))[0] ?? ''
    setDeclarations(
      Object.fromEntries(
        chosenParameters.map(({ parameter }) => [
          parameter.id,
          { ...EMPTY_DECLARATION, sop: firstSop },
        ]),
      ),
    )
  }

  const setDeclaration = (paramId: string, patch: Partial<Declaration>) =>
    setDeclarations((current) => ({
      ...current,
      [paramId]: { ...EMPTY_DECLARATION, ...current[paramId], ...patch },
    }))

  const canAdd = chosenParameters.length > 0 && chosenInstrument !== null

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
            Used for which parameters <span className="text-red-500">*</span>
          </label>
          <p className="text-[11px] text-slate-500 mb-1.5">
            Tick every parameter this master was used for &mdash; a universal calibrator
            can serve several. Each one is declared separately below.
          </p>
          <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
            {parameters.map((p, i) => {
              const covered = coveredBy.get(p.id)
              const wanted = p.parameterName.trim().toLowerCase()
              // Only instruments that record this parameter count. Counting the ones
              // with nothing recorded made every parameter look better served than it
              // is, by the same handful of instruments each time.
              const usable = instruments.filter((inst) => {
                const unit = resolveUnit(inst)
                if (!unit || unit.capability_profiles.length === 0) return false
                if (
                  wanted &&
                  !unit.capability_profiles.some((cp) =>
                    cp.parameter.toLowerCase().includes(wanted),
                  )
                ) {
                  return false
                }
                return eligibilityFor(
                  unit,
                  inst,
                  {
                    name: p.parameterName,
                    unit: p.parameterUnit,
                    required: requiredFor.get(p.id) ?? [],
                  },
                  threshold,
                ).usable
              }).length
              const on = paramIds.includes(p.id)

              return (
                <label
                  key={p.id}
                  className={cn(
                    'w-full text-left px-4 py-3 flex items-center gap-4',
                    covered
                      ? 'opacity-50 bg-slate-50 cursor-not-allowed'
                      : 'bg-white hover:bg-slate-50 cursor-pointer',
                  )}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={disabled || !!covered}
                    onChange={() => toggleParameter(p.id)}
                    className="size-4 rounded border-slate-300 text-primary focus:ring-primary disabled:cursor-not-allowed"
                  />
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
                </label>
              )
            })}
          </div>
          <p className="text-xs text-slate-500 mt-2">
            {parameters.some((p) => !coveredBy.has(p.id))
              ? 'Choosing the parameters first filters the instrument list to those that can serve all of them.'
              : 'Every parameter already has a master.'}
          </p>
        </div>

        {/* Step 2 - which instrument */}
        {chosenParameters.length > 0 && (
          <div className="mb-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
              <div>
                <Label className={LABEL} htmlFor="flow-category">
                  Category
                </Label>
                <SearchableSelect
                  id="flow-category"
                  value={category}
                  options={categories}
                  disabled={disabled}
                  onChange={(v) => {
                    setCategory(v)
                    setMake(ANY)
                    setDescription(ANY)
                  }}
                />
              </div>
              <div>
                <Label className={LABEL} htmlFor="flow-make">
                  Make
                </Label>
                <SearchableSelect
                  id="flow-make"
                  value={make}
                  options={makes}
                  disabled={disabled}
                  onChange={(v) => {
                    setMake(v)
                    setDescription(ANY)
                  }}
                />
              </div>
              <div className="md:col-span-2">
                <Label className={LABEL} htmlFor="flow-description">
                  Description
                </Label>
                <SearchableSelect
                  id="flow-description"
                  value={description}
                  options={descriptions}
                  disabled={disabled}
                  onChange={setDescription}
                />
              </div>
            </div>

            <div className="mt-4">
              <Label className={LABEL}>
                Instrument <span className="text-red-500">*</span>
              </Label>
              <p className="text-[11px] text-slate-500 mb-1.5">
                Each row: model &middot; where that master was last calibrated &middot; the
                range it records for{' '}
                {listOf(
                  chosenParameters.map((c) => c.parameter.parameterName || 'this parameter'),
                )}
                . The badge is its accuracy against yours.
              </p>

              <div className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 mb-2">
                <Search className="size-4 text-slate-400 shrink-0" />
                <input
                  type="text"
                  value={instrumentQuery}
                  disabled={disabled}
                  onChange={(e) => setInstrumentQuery(e.target.value)}
                  placeholder="Search by asset number, description, make, model or serial"
                  aria-label="Search instruments"
                  className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
                />
                {instrumentQuery && (
                  <button
                    type="button"
                    onClick={() => setInstrumentQuery('')}
                    className="text-[11px] font-semibold text-primary shrink-0"
                  >
                    Clear
                  </button>
                )}
              </div>

              <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden max-h-80 overflow-y-auto">
                {shown.length === 0 ? (
                  <p className="px-4 py-6 text-center text-xs text-slate-500">
                    No instrument matches those filters.
                  </p>
                ) : (
                  shown.map(({ inst, fit }) => {
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
                        <span
                          className={cn(
                            'size-4 rounded-full border-2 flex-shrink-0',
                            on ? 'border-primary' : 'border-slate-300',
                          )}
                          style={on ? { boxShadow: 'inset 0 0 0 3px var(--primary)' } : undefined}
                        />
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm font-semibold text-slate-800 truncate">
                            {inst.asset_no} &nbsp; {inst.instrument_desc}
                          </span>
                          <span className="block text-xs text-slate-500 truncate">
                            {getDisplayValue(inst.model)}
                            {inst.calibrated_at ? ` · calibrated at ${inst.calibrated_at}` : ''}
                            {fit.detail ? ` · ${fit.detail}` : ''}
                            {fit.limiting ? ` · limited by ${fit.limiting}` : ''}
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
                  })
                )}
              </div>

              <p className="text-xs text-slate-500 mt-2">
                {shown.filter((s) => s.fit.usable).length} of {shown.length} shown can be used
                for{' '}
                {listOf(
                  chosenParameters.map((c) => c.parameter.parameterName || 'this parameter'),
                )}{' '}
                &mdash; the rest stay visible with the reason.
                {filtered.length !== shown.length &&
                  ` ${filtered.length - shown.length} more are hidden by the search.`}
                {unrecordedCount > 0 && (
                  <>
                    {' '}
                    {unrecordedCount} instrument{unrecordedCount === 1 ? ' records' : 's record'}{' '}
                    no capability at all and {unrecordedCount === 1 ? 'is' : 'are'} not listed.{' '}
                    <button
                      type="button"
                      onClick={() => setShowUnrecorded((v) => !v)}
                      className="font-semibold text-primary"
                    >
                      {showUnrecorded ? 'Hide them' : 'Show them'}
                    </button>
                  </>
                )}
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
                <Info
                  label="Serial No"
                  value={getDisplayValue(chosenInstrument.instrument_sl_no)}
                />
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

        {/* Steps 3 and 4 - how it was used, one declaration per parameter. The
            requirement, the comparison and the SOP sit inside the declaration panel:
            they are what the declaration produced, and reading them as separate
            sections below it loses that they answer the same question. */}
        {chosenInstrument &&
          chosenParameters.map(({ parameter }) => (
            <ParameterDeclaration
              key={parameter.id}
              parameter={parameter}
              instrument={chosenInstrument}
              unit={registryUnit}
              required={requiredFor.get(parameter.id) ?? []}
              sops={sops}
              declaration={declarations[parameter.id] ?? EMPTY_DECLARATION}
              threshold={threshold}
              disabled={disabled}
              onChange={(patch) => setDeclaration(parameter.id, patch)}
            />
          ))}

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
                  instrument: chosenInstrument!,
                  assignments: chosenParameters.map(({ parameter, parameterIndex }) => {
                    const declaration = declarations[parameter.id] ?? EMPTY_DECLARATION
                    const ratio = worstRatioFor(
                      registryUnit,
                      parameter.parameterName,
                      requiredFor.get(parameter.id) ?? [],
                      threshold,
                    )
                    return {
                      parameterIndex,
                      profileId: declaration.profileId,
                      subtype: declaration.subtype,
                      sopReference: declaration.sop,
                      acceptanceReason:
                        ratio !== null && ratio < threshold ? declaration.reason.trim() : '',
                    }
                  }),
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

/**
 * One parameter's declaration on the master being added.
 *
 * Repeated per parameter because none of it is shared: a universal calibrator sources
 * temperature on one capability and reads pressure on another, against different
 * required ranges, under different procedures.
 */
function ParameterDeclaration({
  parameter,
  instrument,
  unit,
  required,
  sops,
  declaration,
  threshold,
  disabled,
  onChange,
}: {
  parameter: Parameter
  instrument: MasterInstrument
  unit?: RegistryUnit
  required: RequiredRange[]
  sops: string[]
  declaration: Declaration
  threshold: number
  disabled?: boolean
  onChange: (patch: Partial<Declaration>) => void
}) {
  const declaredProfile = useMemo(() => {
    if (!unit) return null
    if (declaration.profileId) {
      const found = unit.capability_profiles.find((p) => p.id === declaration.profileId)
      if (found) return found
    }
    return chooseCapability(unit, parameter.parameterName, required, { threshold })?.profile ?? null
  }, [unit, parameter.parameterName, declaration.profileId, required, threshold])

  // A capability the registry names but records nothing for: nine of this lab's units
  // are like this, and every table below them has nothing to draw.
  const recordsNoRanges = useMemo(
    () =>
      declaredProfile
        ? declaredCapability(declaredProfile, declaration.subtype).buckets.length === 0
        : false,
    [declaredProfile, declaration.subtype],
  )

  const worstRatio = useMemo(
    () => worstRatioFor(unit, parameter.parameterName, required, threshold),
    [unit, parameter.parameterName, required, threshold],
  )

  const sopId = `flow-sop-${parameter.id}`

  // The panel header names the parameter itself, so no heading is needed above it.
  return (
    <MasterCapabilityDeclaration
        unit={unit}
        parameterName={parameter.parameterName}
        required={required}
        profileId={declaration.profileId}
        subtype={declaration.subtype}
        disabled={disabled}
        onChange={(d) => onChange({ profileId: d.profileId, subtype: d.subtype })}
      >
        {required.length === 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs font-bold text-amber-800 mb-1">
              Nothing to check this master against yet.
            </p>
            <p className="text-[11px] text-amber-800">
              {parameter.parameterName || 'This parameter'} states{' '}
              <b>{listOf(missingRequirement(parameter))}</b>. The requirement is read from
              the unit under test, so set it in Section 02 &mdash; the master can be chosen
              now and will be checked once it is there.
            </p>
          </div>
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

        {declaredProfile && recordsNoRanges && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-bold text-slate-700 mb-1">
              The registry names this capability but records no ranges for it.
            </p>
            <p className="text-[11px] text-slate-500">
              {instrument.asset_no} is recorded as measuring {declaredProfile.parameter}, with
              no range, least count or accuracy against it, so there is no least-count match
              or accuracy ratio to show. It can still be used; the certificate records the
              declaration above.
            </p>
          </div>
        )}

        {declaredProfile && !recordsNoRanges && required.length > 0 && (
          <MasterBandTable
            assetNo={instrument.asset_no}
            profile={declaredProfile}
            subtypeId={declaration.subtype}
            required={required}
            threshold={threshold}
          />
        )}

        <div>
          <label className={LABEL} htmlFor={sopId}>
            SOP Ref <span className="text-red-500">*</span>
          </label>
          {sops.length > 0 ? (
            <select
              id={sopId}
              value={declaration.sop}
              disabled={disabled}
              onChange={(e) => onChange({ sop: e.target.value })}
              className="w-64 h-9 text-xs rounded-lg border border-slate-300 bg-white px-2"
            >
              {sops.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          ) : (
            <input
              id={sopId}
              type="text"
              value={declaration.sop}
              disabled={disabled}
              onChange={(e) => onChange({ sop: e.target.value })}
              placeholder="e.g. NLAB/CAL/T01/R01"
              className="w-64 h-9 text-xs rounded-lg border border-slate-300 bg-white px-2"
            />
          )}
          {sops.length === 0 && (
            <p className="text-[11px] text-slate-500 mt-1">
              No procedure is recorded against {instrument.asset_no}, so type the reference
              in.
            </p>
          )}
        </div>

        {worstRatio !== null && worstRatio < threshold && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs font-bold text-amber-800 mb-1">
              Lowest ratio across your buckets is {worstRatio.toFixed(1)} : 1.
            </p>
            <p className="text-[11px] text-amber-800 mb-2">
              Below the {threshold}:1 the lab asks for. Usable, with a reason recorded on the
              certificate.
            </p>
            <textarea
              rows={2}
              value={declaration.reason}
              disabled={disabled}
              onChange={(e) => onChange({ reason: e.target.value })}
              className="w-full rounded-lg border border-amber-200 bg-white p-2 text-xs"
              placeholder="e.g. Customer tolerance is wider than the stated accuracy; agreed with the reviewer."
            />
          </div>
        )}
    </MasterCapabilityDeclaration>
  )
}
