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
import { CheckCircle, ChevronDown, Search, Trash2 } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { SearchableSelect, type SearchableOption } from '@/components/ui/searchable-select'
import type { MasterMapping, Parameter } from '@/lib/stores/certificate-store'
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
  mappedCapability,
  matchesParameter,
  missingRequirement,
  requirementFor,
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
import { classificationOf, type CalibrationParameter } from '@/lib/parameter-mapping'
import { useParameterStore } from '@/lib/stores/parameter-store'
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
  /** Set where the master measures something other than the parameter. */
  masterMapping?: MasterMapping
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
  parameterUnit?: string | null,
) {
  if (!unit || required.length === 0) return null
  return (
    chooseCapability(unit, parameterName, required, { threshold, parameterUnit })?.suitability
      .worstRatio ?? null
  )
}



/** A step of the flow that can be folded away once it is answered. */
function Step({
  title,
  summary,
  children,
}: {
  title: string
  summary?: string
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(true)
  return (
    <section className="rounded-xl border border-slate-200 overflow-hidden mb-4">
      <div
        className={cn(
          'bg-slate-100 px-4 py-3 flex items-center justify-between gap-3',
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
            {title}
          </span>
        </button>
        {!open && summary && (
          <span className="text-[11px] text-slate-500 truncate">{summary}</span>
        )}
      </div>
      {open && <div className="p-4">{children}</div>}
    </section>
  )
}

/**
 * A requirement in one line.
 *
 * A binned parameter has several, and printing the first as though it were the whole
 * thing said "0 to 100 °C" in the heading and "0 to 20 °C" underneath it - the first
 * band, wearing the name of the parameter.
 */
function requirementSummary(ranges: RequiredRange[], unit: string): string {
  if (ranges.length === 0) return 'not stated yet'
  if (ranges.length === 1) {
    const [only] = ranges
    return `${n(only.from)} to ${n(only.to)} ${unit} · least count ${n(only.leastCount)} · accuracy ±${n(only.accuracy)}`
  }
  const from = Math.min(...ranges.map((r) => r.from))
  const to = Math.max(...ranges.map((r) => r.to))
  return `${n(from)} to ${n(to)} ${unit}, binned across ${ranges.length} ranges`
}

/**
 * How one parameter is to be measured.
 *
 * Ordinarily by a master recording the same thing, and there is nothing to decide. Not
 * always: a thermocouple indicator reading °C is calibrated with a millivolt source and
 * the readings converted, and no rule can derive that pairing because the relationship
 * is whatever the expression says.
 *
 * So it is asked outright, as two answers rather than a dropdown that might drift. The
 * ordinary answer costs a glance; the other opens the questions it needs and no more.
 */
function MeasuredUsing({
  parameter,
  label,
  capabilities,
  mapping,
  onChange,
}: {
  parameter: Parameter
  label: string
  /** Every capability the lab's instruments record, with a label where one is known. */
  capabilities: { standardName: string; customName: string; category: string; units: string[]; defaultUnit: string | null }[]
  mapping?: MasterMapping
  onChange: (mapping: MasterMapping | undefined) => void
}) {
  const own = requirementFor({ ...parameter, masterMapping: undefined })
  const mapped = capabilities.find((c) => c.standardName === mapping?.parameter)
  const range = mapping?.ranges[0]

  const set = (patch: Partial<MasterMapping>) =>
    onChange({
      parameter: mapping?.parameter ?? '',
      unit: mapping?.unit ?? '',
      ranges: mapping?.ranges ?? [],
      ...patch,
    })

  const setRange = (patch: Partial<RequiredRange>) => {
    const current = range ?? { from: 0, to: 0, leastCount: 0, accuracy: 0 }
    set({ ranges: [{ ...current, ...patch }] })
  }

  const num = (v: number | undefined) => (v === undefined || Number.isNaN(v) ? '' : String(v))
  const parse = (v: string) => (v.trim() === '' ? Number.NaN : Number(v))

  return (
    <Step
      title={`Measured using — for ${label}`}
      summary={
        mapping
          ? `through ${mapping.parameter || 'another parameter'}${mapping.unit ? ` · ${mapping.unit}` : ''}`
          : `directly, as ${label}`
      }
    >
      <div className="flex flex-wrap gap-2 mb-3">
        {[
          { on: !mapping, text: `directly, as ${label}` },
          { on: !!mapping, text: 'through a different parameter' },
        ].map((choice) => (
          <button
            key={choice.text}
            type="button"
            onClick={() =>
              onChange(
                choice.text.startsWith('directly')
                  ? undefined
                  : { parameter: '', unit: '', ranges: [] },
              )
            }
            className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-xl border bg-white',
              choice.on ? 'border-primary' : 'border-slate-300',
            )}
          >
            <span
              className={cn(
                'size-4 rounded-full border-2 flex-shrink-0',
                choice.on ? 'border-primary' : 'border-slate-300',
              )}
              style={choice.on ? { boxShadow: 'inset 0 0 0 3px var(--primary)' } : undefined}
            />
            <span className="text-xs font-semibold text-slate-800">{choice.text}</span>
          </button>
        ))}
      </div>

      {!mapping ? (
        <p className="text-[11px] text-slate-500">
          Requirement comes from Section 02 &mdash;{' '}
          <b className="text-slate-600">{requirementSummary(own.ranges, own.unit)}</b>.
        </p>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
            <div>
              <label className={LABEL}>
                Master parameter <span className="text-red-500">*</span>
              </label>
              <SearchableSelect
                value={mapping.parameter}
                placeholder="Which capability will measure it..."
                className="h-9 rounded-lg"
                options={capabilities.map((capability) => ({
                  value: capability.standardName,
                  label: capability.customName,
                  detail: capability.category,
                }))}
                onChange={(value) => {
                  const next = capabilities.find((c) => c.standardName === value)
                  set({ parameter: value, unit: next?.defaultUnit ?? '' })
                }}
              />
            </div>
            <div>
              <label className={LABEL}>
                Unit <span className="text-red-500">*</span>
              </label>
              <SearchableSelect
                value={mapping.unit}
                placeholder="Unit it is read in..."
                className="h-9 rounded-lg"
                options={(mapped?.units ?? []).map((u) => ({ value: u, label: u }))}
                onChange={(value) => set({ unit: value })}
              />
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
            <p className="text-[11px] text-slate-500">
              This master measures something else, so state what it must do.{' '}
              {own.ranges.length > 0 && (
                <>
                  Your unit needs{' '}
                  <b className="text-slate-700">{requirementSummary(own.ranges, own.unit)}</b>.
                </>
              )}
            </p>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div>
                <label className={LABEL}>From</label>
                <input
                  type="text"
                  value={num(range?.from)}
                  onChange={(e) => setRange({ from: parse(e.target.value) })}
                  className="w-full h-9 rounded-lg border border-slate-300 px-2 text-xs"
                />
              </div>
              <div>
                <label className={LABEL}>To</label>
                <input
                  type="text"
                  value={num(range?.to)}
                  onChange={(e) => setRange({ to: parse(e.target.value) })}
                  className="w-full h-9 rounded-lg border border-slate-300 px-2 text-xs"
                />
              </div>
              <div>
                <label className={LABEL}>Least count</label>
                <input
                  type="text"
                  value={num(range?.leastCount)}
                  onChange={(e) => setRange({ leastCount: parse(e.target.value) })}
                  className="w-full h-9 rounded-lg border border-slate-300 px-2 text-xs"
                />
              </div>
              <div>
                <label className={LABEL}>Accuracy &plusmn;</label>
                <input
                  type="text"
                  value={num(range?.accuracy)}
                  onChange={(e) => setRange({ accuracy: parse(e.target.value) })}
                  className="w-full h-9 rounded-lg border border-slate-300 px-2 text-xs"
                />
              </div>
            </div>

            {/* The conversion itself belongs to Section 05, which already owns
                expression columns. Nothing here needs it: which instruments are
                offered turns on the requirement stated above, in the master's own
                units, which is why the engineer states it rather than the app
                deriving it from an expression that does not exist yet. */}
            <p className="text-[11px] text-slate-500">
              Readings in {mapping.unit || 'the master’s unit'} are converted to{' '}
              {own.unit || 'the parameter’s unit'} by an expression column in
              Section 05, which is what the error column subtracts.
            </p>
          </div>
        </div>
      )}
    </Step>
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
  /**
   * What each name measures, from the lab's parameter store.
   *
   * Both sides go through it - the parameter on the certificate and the capability
   * recorded against the master - so an AC source is no longer offered for a DC
   * parameter, and a lab renaming a parameter changes nothing about what matches.
   */
  const labParameters = useParameterStore((state) => state.parameters)
  const classify = useMemo(
    () => (name: string) => classificationOf(name, labParameters),
    [labParameters],
  )

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
  /**
   * How each ticked parameter is to be measured.
   *
   * Absent means the ordinary case - the master measures the same thing, and the
   * requirement is the unit under test's own. Present means the engineer has said the
   * master measures something else, and has stated what it must achieve in the master's
   * units, because no conversion this app could invent would beat the figure they
   * already have from a table.
   */
  const [mappings, setMappings] = useState<Record<string, MasterMapping>>(
    () =>
      Object.fromEntries(
        parameters
          .filter((p) => p.masterMapping)
          .map((p) => [p.id, p.masterMapping as MasterMapping]),
      ),
  )

  const [showUnrecorded, setShowUnrecorded] = useState(false)
  const [showOutOfRange, setShowOutOfRange] = useState(false)
  const [declarations, setDeclarations] = useState<Record<string, Declaration>>(
    seed?.declarations ?? {},
  )

  /**
   * Names that tell the parameters apart. A certificate can calibrate Temperature
   * twice, and "rated against Temperature and Temperature" identifies neither.
   */
  const labels = useMemo(() => parameterLabels(parameters), [parameters])

  /**
   * The label for a parameter, found by id.
   *
   * Not by identity: once a mapping is made the flow works on a copy of the parameter,
   * and looking it up by object gave -1 and quietly dropped the range that tells two
   * Temperatures apart.
   */
  const labelOf = (id: string) => {
    const at = parameters.findIndex((p) => p.id === id)
    return at >= 0 ? labels[at] : ''
  }
  const labelsFor = (ids: string[]) =>
    parameters.map((p, i) => (ids.includes(p.id) ? labels[i] : null)).filter((x): x is string => x !== null)

  /**
   * Every capability the lab's instruments record, for the mapping question.
   *
   * Taken from the instruments rather than the parameter store, because the mapping is
   * to a capability a master actually has - a name the store knows but nothing records
   * would be an offer that leads to an empty list. The store supplies the label and the
   * grouping where it has them, and its absence costs only those.
   */
  const capabilities = useMemo(() => {
    const found = new Map<string, { units: Set<string> }>()
    for (const inst of instruments) {
      for (const profile of resolveUnit(inst)?.capability_profiles ?? []) {
        const name = profile.parameter?.trim()
        if (!name) continue
        if (!found.has(name)) found.set(name, { units: new Set() })
        if (profile.unit?.trim()) found.get(name)!.units.add(profile.unit.trim())
      }
    }
    return [...found.entries()]
      .map(([standardName, { units }]) => {
        const known = labParameters.find((p) => p.standardName === standardName)
        const list = [...units]
        return {
          standardName,
          customName: known?.customName ?? standardName,
          category: known?.category ?? '',
          units: list,
          defaultUnit: known?.defaultUnit ?? list[0] ?? null,
        }
      })
      .sort((a, b) => a.customName.localeCompare(b.customName))
  }, [instruments, resolveUnit, labParameters])

  const chosenParameters = useMemo(
    () =>
      parameters
        .map((raw, parameterIndex) => ({
          // The mapping made in this flow overrides whatever the certificate holds,
          // so every question below - the requirement, the capability to look for -
          // follows the answer being given now.
          parameter: mappings[raw.id] ? { ...raw, masterMapping: mappings[raw.id] } : raw,
          parameterIndex,
        }))
        .filter(({ parameter }) => paramIds.includes(parameter.id)),
    [parameters, paramIds, mappings],
  )

  const requiredFor = useMemo(() => {
    const map = new Map<string, RequiredRange[]>()
    parameters.forEach((p) =>
      map.set(p.id, requirementFor(mappings[p.id] ? { ...p, masterMapping: mappings[p.id] } : p).ranges),
    )
    return map
  }, [parameters, mappings])

  /**
   * How an instrument rates against every parameter ticked. The worst answer is the one
   * that matters: a master that reads Temperature beautifully and cannot reach the
   * Pressure range cannot serve this assignment.
   */
  const rate = useMemo(
    () =>
      (inst: MasterInstrument): Eligibility & { limiting?: string } => {
        const unit = resolveUnit(inst)
        const each = chosenParameters.map(({ parameter }) => {
          const capability = mappedCapability(parameter)
          return {
            name: parameter.parameterName,
            fit: eligibilityFor(
              unit,
              inst,
              {
                name: capability.name,
                unit: capability.unit,
                required: requiredFor.get(parameter.id) ?? [],
              },
              threshold,
            ),
          }
        })
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
          const capability = mappedCapability(parameter)
          if (!capability.name.trim()) return true
          return unit.capability_profiles.some((p) =>
            matchesParameter(p, capability.name, capability.unit, classify),
          )
        })
        return servesAll ? 'records them' : 'records something else'
      },
    [resolveUnit, chosenParameters, classify],
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

  /**
   * What the list is, and what it leaves out.
   *
   * Three groups, and they add up to the lab's whole master list: the instruments that
   * record what is being calibrated, the ones that record something else, and the ones
   * that record nothing at all. Only the last was ever mentioned, so for Temperature
   * 142 instruments vanished without a word - and for Flow, 199 of 209. A list that
   * hides four fifths of the lab should say so and say why.
   */
  const groups = useMemo(() => {
    if (chosenParameters.length === 0) {
      return { recording: 0, otherParameters: 0, unrecorded: 0 }
    }
    let recording = 0
    let otherParameters = 0
    let unrecorded = 0
    for (const inst of instruments) {
      const where = standing(inst)
      if (where === 'records them') recording += 1
      else if (where === 'nothing recorded') unrecorded += 1
      else otherParameters += 1
    }
    return { recording, otherParameters, unrecorded }
  }, [instruments, chosenParameters, standing])

  const unrecordedCount = groups.unrecorded

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

  /**
   * Instruments whose capability does not span the required range.
   *
   * They cannot be used - the row was already disabled - and for a Temperature
   * parameter of -20 to 60 there are fifteen of them among seventy-six. Listing them
   * put the instruments that can do the job further down a list mostly made of ones
   * that cannot. They are counted underneath instead, and a near miss is worth seeing,
   * so they are one click away rather than gone.
   */
  const outOfRangeCount = useMemo(
    () =>
      chosenParameters.length === 0
        ? 0
        : pool.filter((inst) => rate(inst).outOfRange).length,
    [pool, chosenParameters, rate],
  )

  const shown = useMemo(() => {
    const q = instrumentQuery.trim().toLowerCase()
    const rows = filtered
      .filter((i) => showOutOfRange || !rate(i).outOfRange)
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
  }, [filtered, instrumentQuery, rate, chosenId, instruments, showOutOfRange])

  /**
   * Parameters with nothing to rate an instrument against, and why.
   *
   * Two different reasons wearing one sentence until now: a parameter that never
   * stated its range, least count and accuracy in Section 02, and a parameter measured
   * through a different master whose requirement has not been filled in above. The
   * second was borrowing the first's wording and printing "states , so" - an empty
   * list of missing pieces, because in that case nothing is missing from Section 02.
   */
  const unrateable = useMemo(
    () =>
      chosenParameters
        .filter(({ parameter }) => (requiredFor.get(parameter.id) ?? []).length === 0)
        .map(({ parameter }) => ({
          name: labelOf(parameter.id) || parameter.parameterName,
          mappedTo: parameter.masterMapping?.parameter ?? null,
          missing: missingRequirement(parameter),
        })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
              // Only instruments that record this parameter count. Counting the ones
              // with nothing recorded made every parameter look better served than it
              // is, by the same handful of instruments each time.
              const usable = instruments.filter((inst) => {
                const unit = resolveUnit(inst)
                if (!unit || unit.capability_profiles.length === 0) return false
                if (
                  p.parameterName.trim() &&
                  !unit.capability_profiles.some((cp) =>
                    matchesParameter(cp, p.parameterName, p.parameterUnit, classify),
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

          {/* Step 2 - how each is to be measured. Ordinarily nothing to decide; the
              question is asked so that the other answer is a choice and not a drift. */}
          <div className="mt-4">
            {chosenParameters.map(({ parameter }) => (
              <MeasuredUsing
                key={parameter.id}
                parameter={parameter}
                label={labelOf(parameter.id) || parameter.parameterName}
                capabilities={capabilities}
                mapping={mappings[parameter.id]}
                onChange={(next) =>
                  setMappings((current) => {
                    const copy = { ...current }
                    if (next) copy[parameter.id] = next
                    else delete copy[parameter.id]
                    return copy
                  })
                }
              />
            ))}
          </div>
        </div>

        {/* Step 3 - which instrument */}
        {chosenParameters.length > 0 && (
          <Step
            title="Which instrument"
            summary={chosenInstrument ? `${chosenInstrument.asset_no} · ${chosenInstrument.instrument_desc}` : undefined}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
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
              {unrateable.map((u) => (
                <p
                  key={u.name}
                  className="mb-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800"
                >
                  {u.mappedTo ? (
                    <>
                      <b>{u.name}</b> is measured through {u.mappedTo}, and what that master
                      must achieve has not been stated yet &mdash; fill in the range, least
                      count and accuracy above. These instruments cannot be rated until it
                      is; one can still be chosen.
                    </>
                  ) : (
                    <>
                      <b>{u.name}</b> states <b>{listOf(u.missing)}</b>, so these instruments
                      cannot be rated against it. Set it in Section 02; the instrument can
                      still be chosen now.
                    </>
                  )}
                </p>
              ))}
              <p className="text-[11px] text-slate-500 mb-1.5">
                <b className="text-slate-600">{groups.recording}</b> of the lab&rsquo;s{' '}
                {instruments.length} instruments record{' '}
                {chosenParameters.length > 1 ? 'all of ' : ''}
                <b className="text-slate-600">{listOf(labelsFor(paramIds))}</b>
                {groups.otherParameters > 0 && (
                  <>
                    ; the other {groups.otherParameters} record different parameters and are
                    not listed
                  </>
                )}
                . Each row shows the model, where it was last calibrated, and the range it
                records.
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
                  {filtered.length !== shown.length + (showOutOfRange ? 0 : outOfRangeCount) &&
                    ` ${filtered.length - shown.length - (showOutOfRange ? 0 : outOfRangeCount)} more hidden by the search.`}
                  {outOfRangeCount > 0 && !showOutOfRange && (
                    <>
                      {' '}
                      {outOfRangeCount} more do not reach the required range &mdash;{' '}
                      <button
                        type="button"
                        onClick={() => setShowOutOfRange(true)}
                        className="font-semibold text-primary"
                      >
                        show them
                      </button>
                      .
                    </>
                  )}
                  {showOutOfRange && outOfRangeCount > 0 && (
                    <>
                      {' '}
                      Including {outOfRangeCount} that do not reach the required range
                      &mdash;{' '}
                      <button
                        type="button"
                        onClick={() => setShowOutOfRange(false)}
                        className="font-semibold text-primary"
                      >
                        hide them
                      </button>
                      .
                    </>
                  )}
                  {unrecordedCount > 0 && (
                    <>
                      {' '}
                      A further {unrecordedCount} record no capability at all, so there is
                      nothing to rate them by &mdash;{' '}
                      <button
                        type="button"
                        onClick={() => setShowUnrecorded((v) => !v)}
                        className="font-semibold text-primary"
                      >
                        {showUnrecorded ? 'hide them' : 'show them anyway'}
                      </button>
                    </>
                  )}
                </p>
              </div>
            </div>
          </Step>
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
              label={labelOf(parameter.id) || parameter.parameterName}
              instrument={chosenInstrument}
              unit={registryUnit}
              required={requiredFor.get(parameter.id) ?? []}
              sops={sops}
              declaration={declarations[parameter.id] ?? EMPTY_DECLARATION}
              classify={classify}
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
                      parameter.parameterUnit,
                    )
                    return {
                      parameterIndex,
                      masterMapping: mappings[parameter.id],
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
  label,
  instrument,
  unit,
  required,
  sops,
  declaration,
  classify,
  threshold,
  disabled,
  onChange,
}: {
  parameter: Parameter
  /** The parameter's name, told apart from its siblings by range where needed. */
  label: string
  instrument: MasterInstrument
  unit?: RegistryUnit
  required: RequiredRange[]
  sops: string[]
  declaration: Declaration
  /** What each name measures, so the capability compared is one that can serve it. */
  classify: (name: string) => { measures: string; kind: string } | null
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
    return (
      chooseCapability(unit, parameter.parameterName, required, {
        threshold,
        parameterUnit: parameter.parameterUnit,
        classify,
      })?.profile ?? null
    )
  }, [unit, parameter.parameterName, parameter.parameterUnit, declaration.profileId, required, threshold, classify])

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
    () => worstRatioFor(unit, parameter.parameterName, required, threshold, parameter.parameterUnit),
    [unit, parameter.parameterName, parameter.parameterUnit, required, threshold],
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
        parameterUnit={parameter.parameterUnit}
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
