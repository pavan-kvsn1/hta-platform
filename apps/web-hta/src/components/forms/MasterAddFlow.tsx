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
  COMPATIBILITY_BADGE,
  ELIGIBILITY_BADGE,
  eligibilityFor,
  type Eligibility,
} from '@/lib/master-instrument-eligibility'
import { MasterCapabilityDeclaration } from './MasterCapabilityDeclaration'
import { MasterBandTable } from './MasterBandTable'
import { listOf, parameterLabels } from '@/lib/parameter-labels'
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

/** An existing master, reopened: the flow starts filled in and commits back to it. */
export interface FlowSeed {
  parameterIds: string[]
  /** The unit, by the id a certificate stores - an asset number names several. */
  instrumentId: number
  declarations: Record<string, { profileId?: string; subtype?: string; sop: string; reason: string }>
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
  /**
   * Present when an already-chosen master is being edited. Editing means going back to
   * the whole selection - the instrument itself is as much a part of the answer as the
   * capability declared on it - so the same flow reopens on the answers already given.
   */
  seed?: FlowSeed
  onCancel: () => void
  onAdd: (result: FlowResult) => void
}

const PILL =
  'inline-flex items-center justify-center min-w-[3rem] px-2 py-0.5 rounded-full text-[10px] font-bold uppercase flex-shrink-0'

/**
 * The two things an engineer is judging, side by side on the right of each row.
 *
 * Least count and accuracy are answered apart because they fail for different reasons:
 * a coarser least count means the readings cannot be recorded as written, while a thin
 * accuracy ratio is a judgement the lab can accept with a reason. Colour carries the
 * verdict so a list of forty can be read down in one pass; the numbers behind it are on
 * the badge's tooltip and in full on the comparison table once an instrument is chosen.
 */
function Verdicts({ fit }: { fit: Eligibility }) {
  return (
    <span className="flex items-center gap-1.5 flex-shrink-0">
      <span
        className={cn(PILL, COMPATIBILITY_BADGE[fit.leastCount])}
        title={`Least count - ${fit.leastCountNote}`}
      >
        LC
      </span>
      <span
        className={cn(PILL, COMPATIBILITY_BADGE[fit.accuracy])}
        title={`Accuracy - ${fit.accuracyNote}`}
      >
        Acc.
      </span>
    </span>
  )
}

/**
 * What the two badges mean, once, under the list.
 *
 * Four words rather than four sentences: the reader is matching a colour they can see
 * against a phrase, not being taught the rule. The rule itself is on each badge, on
 * hover, against that instrument's actual numbers.
 */
function BadgeLegend() {
  const states: [string, string][] = [
    ['safe', 'with margin'],
    ['compatible', 'exact, none to spare'],
    ['incompatible', 'falls short'],
    ['unknown', 'not recorded'],
  ]
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
      <span>
        <b className="font-bold text-slate-600">LC</b> least count
      </span>
      <span>
        <b className="font-bold text-slate-600">Acc.</b> accuracy
      </span>
      <span aria-hidden className="text-slate-300">
        |
      </span>
      {states.map(([state, meaning]) => (
        <span key={state} className="inline-flex items-center gap-1.5">
          <span
            className={cn(
              'size-2.5 rounded-full',
              COMPATIBILITY_BADGE[state as keyof typeof COMPATIBILITY_BADGE].split(' ')[0],
            )}
          />
          {meaning}
        </span>
      ))}
    </p>
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
  seed,
  onCancel,
  onAdd,
}: MasterAddFlowProps) {
  const [paramIds, setParamIds] = useState<string[]>(seed?.parameterIds ?? [])
  const [category, setCategory] = useState(ANY)
  const [make, setMake] = useState(ANY)
  const [description, setDescription] = useState(ANY)
  const [instrumentQuery, setInstrumentQuery] = useState('')
  /**
   * The chosen instrument, by unit id.
   *
   * Not by asset number: 188 HTAIPL/L holds three units and 580 HTAIPL/L another three,
   * only one of which records Temperature. Keying the list on the asset gave several
   * rows the same React key, and selecting one of them selected all of them and
   * resolved to whichever came first - which for 580 is the only unit that can do the
   * job, and for 188 is one that cannot.
   */
  const [chosenId, setChosenId] = useState<number | null>(seed?.instrumentId ?? null)
  const [showUnrecorded, setShowUnrecorded] = useState(false)
  const [declarations, setDeclarations] = useState<Record<string, Declaration>>(
    seed?.declarations ?? {},
  )

  /**
   * Names that tell the parameters apart. A certificate can calibrate Temperature
   * twice, and "rated against Temperature and Temperature" identifies neither.
   */
  const labels = useMemo(() => parameterLabels(parameters), [parameters])
  const labelsFor = (ids: string[]) =>
    parameters.map((p, i) => (ids.includes(p.id) ? labels[i] : null)).filter((x): x is string => x !== null)

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
        // Naming the parameter that holds an instrument back only means something when
        // a comparison was made. On a row that could not be rated at all it reads as a
        // finding about that parameter, which it is not.
        const compared = worst.fit.verdict !== 'Not rated'
        return each.length > 1 && worst.fit.rank > 0 && compared
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
    const rows = filtered
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

    // The chosen instrument goes to the top and stays there, whatever the filters or
    // the search say. A choice that scrolls out of sight - or out of the list entirely,
    // once the search narrows past it - reads as a choice that came undone.
    if (chosenId === null) return rows
    const already = rows.findIndex((r) => r.inst.id === chosenId)
    if (already >= 0) {
      const [row] = rows.splice(already, 1)
      return [row, ...rows]
    }
    const missing = instruments.find((i) => i.id === chosenId)
    return missing ? [{ inst: missing, fit: rate(missing) }, ...rows] : rows
  }, [filtered, instrumentQuery, rate, chosenId, instruments])

  const unrateable = useMemo(
    () =>
      chosenParameters
        .filter(({ parameter }) => (requiredFor.get(parameter.id) ?? []).length === 0)
        .map(({ parameter }) => ({
          name: labels[parameters.indexOf(parameter)] ?? parameter.parameterName,
          missing: missingRequirement(parameter),
        })),
    [chosenParameters, requiredFor, labels, parameters],
  )

  const chosenInstrument =
    chosenId !== null ? (instruments.find((i) => i.id === chosenId) ?? null) : null
  const registryUnit = chosenInstrument ? resolveUnit(chosenInstrument) : undefined
  const sops = sopReferencesFor(chosenInstrument, registryUnit)

  const toggleParameter = (id: string) => {
    setParamIds((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    )
    // The instrument list is rated against the parameters ticked, so a change to them
    // invalidates a choice made under the old set.
    setChosenId(null)
    setDeclarations({})
    setCategory(ANY)
    setMake(ANY)
    setDescription(ANY)
    setInstrumentQuery('')
  }

  const pickInstrument = (inst: MasterInstrument) => {
    if (chosenId === inst.id) {
      // Clicking the chosen one again un-picks it; a radio list can otherwise only be
      // changed, never cleared.
      setChosenId(null)
      setDeclarations({})
      return
    }
    setChosenId(inst.id)
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
          {seed && <span className="ml-2 text-slate-500 normal-case">&mdash; editing</span>}
        </span>
        <button
          type="button"
          onClick={onCancel}
          title={seed ? 'Cancel' : 'Discard'}
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
                    <span className="block text-xs font-semibold text-slate-800">
                      {labels[i]}
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
              {unrateable.length > 0 && (
                <p className="mb-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                  {listOf(unrateable.map((u) => u.name))}{' '}
                  {unrateable.length === 1 ? 'states' : 'state'}{' '}
                  <b>{listOf([...new Set(unrateable.flatMap((u) => u.missing))])}</b>, so these
                  instruments cannot be rated against{' '}
                  {unrateable.length === 1 ? 'it' : 'them'}. Set it in Section 02; the
                  instrument can still be chosen now.
                </p>
              )}
              <p className="text-[11px] text-slate-500 mb-1.5">
                Each row shows the model, where it was last calibrated, and the range it
                records &mdash; rated against{' '}
                <b className="text-slate-600">{listOf(labelsFor(paramIds))}</b>.
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
                  className="h-9 w-full bg-transparent text-xs outline-none placeholder:text-slate-400"
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
                    const on = chosenId === inst.id
                    // Several units can share an asset number, so the serial is what
                    // tells them apart on screen - shown only where it has to.
                    const shares = shown.filter((r) => r.inst.asset_no === inst.asset_no).length > 1
                    const serial = getSimpleValue(inst.instrument_sl_no)
                    return (
                      <button
                        key={inst.id}
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
                          <span className="block text-xs font-semibold text-slate-800 truncate">
                            {inst.asset_no} &nbsp; {inst.instrument_desc}
                          </span>
                          <span className="block text-xs text-slate-500 truncate">
                            {getDisplayValue(inst.model)}
                            {shares && serial ? ` · serial ${serial}` : ''}
                            {inst.calibrated_at ? ` · calibrated at ${inst.calibrated_at}` : ''}
                            {fit.detail ? ` · ${fit.detail}` : ''}
                            {fit.limiting ? ` · limited by ${fit.limiting}` : ''}
                          </span>
                        </span>
                        <Verdicts fit={fit} />
                      </button>
                    )
                  })
                )}
              </div>

              <div className="mt-2 space-y-1">
                <BadgeLegend />
                <p className="text-[11px] text-slate-500">
                  {shown.filter((s) => s.fit.usable).length} of {shown.length} can be used;
                  the rest stay, with the reason.
                  {filtered.length !== shown.length &&
                    ` ${filtered.length - shown.length} more hidden by the search.`}
                  {unrecordedCount > 0 && (
                    <>
                      {' '}
                      {unrecordedCount} record no capability at all &mdash;{' '}
                      <button
                        type="button"
                        onClick={() => setShowUnrecorded((v) => !v)}
                        className="font-semibold text-primary"
                      >
                        {showUnrecorded ? 'hide them' : 'show them'}
                      </button>
                    </>
                  )}
                </p>
              </div>
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
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
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
              className="h-10 px-4 rounded-xl border border-slate-300 bg-white text-xs font-medium"
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
              className="h-10 px-4 rounded-xl bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50"
            >
              {seed ? 'Save this master' : 'Add this master'}
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

  // A procedure recorded on the certificate that the instrument no longer lists still
  // has to be offered: a <select> whose value is not among its options silently shows
  // the first one instead, which would rewrite what was signed off.
  const sopOptions = [...new Set([...sops, declaration.sop].filter(Boolean))]

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
              <table className="w-full text-xs">
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
          {sopOptions.length > 0 ? (
            <select
              id={sopId}
              value={declaration.sop}
              disabled={disabled}
              onChange={(e) => onChange({ sop: e.target.value })}
              className="w-64 h-9 text-xs rounded-lg border border-slate-300 bg-white px-2"
            >
              {sopOptions.map((s) => (
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
          {sopOptions.length === 0 && (
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
