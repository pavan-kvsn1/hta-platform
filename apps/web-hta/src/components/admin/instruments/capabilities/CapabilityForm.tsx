'use client'

/**
 * Declaring a capability.
 *
 * One panel that grows downward rather than a stepper: the four cheap decisions
 * cost a band each, the two that are real work get the full width, and an
 * answered band collapses to a line you can click to change. Nothing already
 * said ever leaves the screen.
 *
 * The last two bands are the work. Operating Range asks whether the parameter
 * splits into subtypes - thermocouple types, RTD kinds - because a subtype
 * carries its own span and its own buckets. Ranges then fills those buckets:
 * from, to, least count, and an accuracy in whichever of the shapes the
 * certificate used.
 */

import { Fragment, useState } from 'react'
// The expression engine a certificate's result columns already use: a small
// recursive-descent parser, never eval, so an accuracy an admin types is worked out
// the same way everywhere and never reaches a JavaScript interpreter.
import {
  checkExpression,
  formulaBreakdown,
  type FieldDefinition,
} from '@/lib/certificate/fields'
import { Icon } from '../Icons'
import type { Bucket, Component, Profile, Subtype } from './CapabilitiesTab'

/* ── the form's own shape ─────────────────────────────────────────────────── */

export interface RangeRow {
  id: string | null // the bucket it came from, or null when new
  from: string
  to: string
  leastCount: string
  basis: Basis
  /** The bound above the reading; under a class, the whole of it. */
  upper: string
  /**
   * The bound below the reading, left blank when it is the same as the one
   * above - which is the common case, and is why the field says "same as +"
   * rather than making every row state a figure twice.
   */
  lower: string

  // --- the percentage bases, and the arithmetic one --------------------------
  /** As typed: "0.02" for 0.02%, not 0.0002. Nobody writes a fraction on a form. */
  percent: string
  /** The trailing term. Counts of the least count, unless digitsUnit says otherwise. */
  digits: string
  digitsUnit: string
  /** Arithmetic over {reading} {full scale} {span} {least count}. */
  expression: string
  /** What a certificate prints. Written from the fields above until someone edits it. */
  printed: string
  /**
   * True once the wording has been changed by hand.
   *
   * Kept so the figures can go on being edited without silently rewriting a sentence
   * somebody chose - a datasheet's own words are usually better than anything
   * generated, and are the whole reason the field is editable.
   */
  printedEdited: boolean
  /**
   * Whether the accuracy has been changed in this sitting.
   *
   * Separate from printedEdited, which is about the record. Every stored wording is
   * the calibrating lab's own and none of them match the phrasing generated here -
   * "+/-0.02% of reading +/-2 count" against "\u00b1(0.02% of reading + 2 counts)" - so a
   * mark based on the record alone would appear on all 104 bands and mean nothing.
   * This marks the one case worth seeing: figures just changed, wording left behind.
   */
  touched: boolean
}

export interface SubtypeRow {
  id: string | null
  name: string
  from: string
  to: string
  rows: RangeRow[]
}

export interface CapabilityDraft {
  componentId: string | null
  /** Undefined until a part is chosen, so the band knows it is unanswered. */
  partChosen: boolean
  role: string
  /**
   * The group the parameter was picked from.
   *
   * Only needed while nothing has been picked yet - once there is a parameter,
   * the group is whichever one holds it, and this is what the field showed in
   * the meantime.
   */
  group: string
  parameter: string
  unit: string
  min: string
  max: string
  sopReferences: string[]
  subs: boolean
  subtypes: SubtypeRow[]
  rows: RangeRow[]
  openSub: number
  bucketed: boolean
}

/**
 * How an accuracy is stated, in the words an engineer would use.
 *
 * "% of reading" and "% of full scale" used to store a figure whose unit was "%",
 * which the comparison then divided by as though it were volts. They now store a
 * formula with its basis named, which is the thing the app can actually compute with.
 */
export type Basis = 'absolute' | 'pct_rdg' | 'pct_fs' | 'expr' | 'cls'

const BASES: [Basis, string][] = [
  ['absolute', 'absolute'],
  ['pct_rdg', '% of Reading'],
  ['pct_fs', '% of Full Scale'],
  ['expr', 'formula'],
  ['cls', 'a class'],
]

/** The two that ask for a percentage and an optional counts term. */
const PERCENT_BASES: Basis[] = ['pct_rdg', 'pct_fs']
const BASIS_OF: Partial<Record<Basis, 'reading' | 'full_scale'>> = {
  pct_rdg: 'reading',
  pct_fs: 'full_scale',
}
const BASIS_SUFFIX: Record<string, string> = { absolute: '' }

/** The names an accuracy expression may use. Four, and nothing else resolves. */
export const ACCURACY_VARIABLES = ['reading', 'full scale', 'span', 'least count'] as const

/**
 * The sentence the figures come to, for a certificate to print.
 *
 * Only ever a suggestion. A datasheet says "+/-(0.05% rdg + 1d)" and a lab has every
 * right to keep those exact words, so this fills the field and then gets out of the
 * way the moment anyone types in it.
 */
export function printedFrom(r: RangeRow, unit: string): string {
  if (r.basis === 'cls') return r.upper.trim()
  if (r.basis === 'absolute') {
    if (!r.upper.trim()) return ''
    const u = unit ? ` ${unit}` : ''
    return r.lower.trim() && r.lower.trim() !== r.upper.trim()
      ? `+${r.upper.trim()}${u} / -${r.lower.trim()}${u}`
      : `\u00b1${r.upper.trim()}${u}`
  }

  const terms: string[] = []
  if (PERCENT_BASES.includes(r.basis) && r.percent.trim()) {
    terms.push(`${r.percent.trim()}% of ${r.basis === 'pct_fs' ? 'full scale' : 'reading'}`)
  }
  if (r.digits.trim()) {
    const n = r.digits.trim()
    const unitWord = r.digitsUnit.trim() || (n === '1' ? 'count' : 'counts')
    terms.push(`${n} ${unitWord}`)
  }
  if (!terms.length) return ''
  return terms.length === 1 ? `\u00b1${terms[0]}` : `\u00b1(${terms.join(' + ')})`
}

export const blankRow = (): RangeRow => ({
  id: null,
  from: '',
  to: '',
  leastCount: '',
  basis: 'absolute',
  upper: '',
  lower: '',
  percent: '',
  digits: '',
  digitsUnit: '',
  expression: '',
  printed: '',
  printedEdited: false,
  touched: false,
})

/**
 * The names an accuracy expression may use, shaped as the expression engine wants them.
 *
 * The engine was written for a certificate's result columns, where a name is a column
 * and an id is a generated string. Here the name is the id, so what an engineer types
 * is what is stored and there is nothing to translate in either direction.
 */
const VARIABLE_FIELDS: FieldDefinition[] = ACCURACY_VARIABLES.map((name, order) => ({
  id: name,
  name,
  group: 'accuracy' as FieldDefinition['group'],
  type: 'numeric',
  unit: '',
  order,
}))

const EXPRESSION_FIELD: FieldDefinition = {
  id: 'accuracy',
  name: 'accuracy',
  group: 'accuracy' as FieldDefinition['group'],
  type: 'expression',
  unit: '',
  order: ACCURACY_VARIABLES.length,
}

const trimNumber = (n: number) => Number(n.toPrecision(12))

/**
 * What the accuracy comes to at the top of the band, worked through a line at a time.
 *
 * The top of the range because that is where a master is usually tightest against what
 * is being asked of it, and because a percentage of the reading is largest there -
 * an accuracy that passes at the top passes throughout.
 */
function working(r: RangeRow, unit: string, fullScale: string): string[] {
  const reading = Number(r.to)
  const lc = Number(r.leastCount)
  const fs = Number(fullScale)
  const u = unit ? ` ${unit}` : ''

  if (r.basis === 'expr') {
    const breakdown = formulaBreakdown(r.expression, {
      fields: [...VARIABLE_FIELDS, EXPRESSION_FIELD],
      values: {
        reading: Number.isFinite(reading) ? String(Math.abs(reading)) : '',
        'full scale': Number.isFinite(fs) ? String(Math.abs(fs)) : '',
        span: Number.isFinite(fs) && r.from !== '' ? String(Math.abs(fs - Number(r.from))) : '',
        'least count': Number.isFinite(lc) ? String(lc) : '',
      },
    })
    if (!breakdown || breakdown.steps.length < 2) return []
    const lines = breakdown.steps.slice(1)
    return breakdown.result === null
      ? lines
      : [...lines.slice(0, -1), `= ${trimNumber(breakdown.result)}${u}`]
  }

  if (!PERCENT_BASES.includes(r.basis)) return []

  const lines: string[] = []
  let total = 0
  const pct = Number(r.percent)
  if (r.percent.trim() && Number.isFinite(pct)) {
    const against = r.basis === 'pct_fs' ? fs : reading
    if (!Number.isFinite(against)) {
      return [r.basis === 'pct_fs' ? 'No full scale on this capability yet.' : 'No top of range yet.']
    }
    const part = (pct / 100) * Math.abs(against)
    total += part
    lines.push(
      `${r.percent.trim()}% of ${trimNumber(Math.abs(against))}  =  ${trimNumber(part)}${u}`,
    )
  }
  const dg = Number(r.digits)
  if (r.digits.trim() && Number.isFinite(dg)) {
    if (!Number.isFinite(lc) || !r.leastCount.trim()) {
      return [...lines, 'No least count on this range, so the counts term cannot be worked out.']
    }
    const part = dg * lc
    total += part
    lines.push(`${r.digits.trim()} × ${trimNumber(lc)}  =  ${trimNumber(part)}${u}`)
  }
  if (!lines.length) return []
  return lines.length === 1
    ? [`${lines[0]}`]
    : [...lines, `= ${trimNumber(total)}${u}`]
}

/**
 * Everything about one band's accuracy that does not fit on the row.
 *
 * Three things, in the order they answer each other: the figures, what those figures
 * come to, and the sentence a certificate prints. Stacked rather than tucked into a
 * drawer, because a wording that no longer matches its figures is the failure this is
 * here to prevent, and it is only obvious when the two are a line apart.
 */
function AccuracyPanel({
  row,
  index,
  unit,
  fullScale,
  disabled,
  onChange,
}: {
  row: RangeRow
  index: number
  unit: string
  fullScale: string
  disabled?: boolean
  onChange: (patch: Partial<RangeRow>) => void
}) {
  const suggested = printedFrom(row, unit)
  const lines = working(row, unit, fullScale)
  const check =
    row.basis === 'expr'
      ? checkExpression(row.expression, {
          field: { ...EXPRESSION_FIELD, expression: row.expression },
          fields: [...VARIABLE_FIELDS, EXPRESSION_FIELD],
        })
      : null

  return (
    <div className="accp">
      {row.basis === 'expr' && (
        <>
          <div className="accrow">
            <span className="accl">Arithmetic</span>
            <textarea
              className="accx"
              rows={1}
              spellCheck={false}
              value={row.expression}
              disabled={disabled}
              placeholder="330 + 0.01 * {reading}"
              aria-label={`Accuracy arithmetic for range ${index + 1}`}
              onChange={(e) => onChange({ expression: e.target.value })}
            />
          </div>
          <div className="accrow">
            <span className="accl">Use</span>
            <span className="accvars">
              {ACCURACY_VARIABLES.map((name) => (
                <button
                  key={name}
                  type="button"
                  className="accvar"
                  disabled={disabled}
                  title="Add to the arithmetic"
                  onClick={() =>
                    onChange({
                      expression: `${row.expression}${row.expression ? ' ' : ''}{${name}}`,
                    })
                  }
                >
                  {`{${name}}`}
                </button>
              ))}
            </span>
          </div>
          {row.expression.trim() && check && !check.ok && (
            <div className="accrow">
              <span className="accl" />
              <span className="accbad">{check.problem}</span>
            </div>
          )}
        </>
      )}

      {lines.length > 0 && (
        <div className="accrow">
          <span className="accl">{row.to ? `At ${row.to}${unit ? ' ' + unit : ''}` : 'Works out'}</span>
          <span className="accwork">
            {lines.map((line, i) => (
              <span key={i} className={i === lines.length - 1 && lines.length > 1 ? 'accsum' : ''}>
                {line}
              </span>
            ))}
          </span>
        </div>
      )}

      <div className="accrow">
        <span className="accl">Prints as</span>
        <input
          className="accprint"
          value={row.printed}
          disabled={disabled}
          placeholder={suggested || 'what the certificate should say'}
          aria-label={`Printed accuracy for range ${index + 1}`}
          onChange={(e) => onChange({ printed: e.target.value, printedEdited: true })}
        />
        {row.touched && row.printed.trim() !== suggested && suggested && (
          <button
            type="button"
            className="accundo"
            disabled={disabled}
            title="Use the wording these figures would write"
            onClick={() => onChange({ printed: suggested, printedEdited: false })}
          >
            {row.printed.trim() ? 'not the figures' : 'no wording'}
          </button>
        )}
      </div>
      <div className="accrow">
        <span className="accl" />
        <span className="acchint">
          {row.basis === 'expr'
            ? 'What the certificate prints. The arithmetic above is what the master is rated by.'
            : 'Written for you from the figures. Edit it to match the datasheet — what you type is what the certificate prints.'}
        </span>
      </div>
    </div>
  )
}

/**
 * A stored bucket, as the form holds it.
 *
 * A formula opens on the basis it was stored with rather than on the raw sentence:
 * a band recorded as 0.05% of reading is a percentage, and asking an engineer to
 * re-read that out of "+/-(0.05% rdg + 1d)" is asking them to parse it by eye.
 */
export function rowFrom(b: Bucket): RangeRow {
  const percentOf = b.accuracyPercentOf ?? null
  const basis: Basis =
    b.accuracyKind === 'CLASS'
      ? 'cls'
      : b.accuracyKind !== 'FORMULA'
        ? 'absolute'
        : // An expression states the whole accuracy; the fields cannot summarise it.
          b.accuracyExpression
          ? 'expr'
          : percentOf === 'reading'
            ? 'pct_rdg'
            : percentOf === 'full_scale' || percentOf === 'span'
              ? 'pct_fs'
              : // A formula with neither is a sentence and nothing else. It opens as
                // arithmetic with the box empty, which is where it has to be settled.
                'expr'

  /** Stored as a fraction, shown as a percentage. 0.0005 is what 0.05% means. */
  const percent =
    b.accuracyPercentValue === null || b.accuracyPercentValue === undefined
      ? ''
      : String(Number((b.accuracyPercentValue * 100).toPrecision(12)))

  return {
    id: b.id,
    from: b.min === null ? '' : String(b.min),
    to: b.max === null ? '' : String(b.max),
    leastCount: b.leastCountValue === null ? '' : String(b.leastCountValue),
    basis,
    upper:
      b.accuracyKind === 'CLASS'
        ? (b.accuracyClass ?? '')
        : b.accuracyKind === 'ASYMMETRIC'
          ? ((b.accuracyUpper ?? null) === null ? '' : String(b.accuracyUpper))
          : b.accuracyKind === 'SYMMETRIC' && b.accuracyValue !== null
            ? String(b.accuracyValue)
            : '',
    // Held unsigned. The form labels the field as the - side, so a stored -0.3
    // comes back as 0.3 rather than as a minus the reader has to type again.
    lower:
      b.accuracyKind === 'ASYMMETRIC' && (b.accuracyLower ?? null) !== null
        ? String(Math.abs(Number(b.accuracyLower)))
        : '',
    percent,
    digits:
      b.accuracyDigits === null || b.accuracyDigits === undefined
        ? ''
        : String(b.accuracyDigits),
    digitsUnit: b.accuracyDigitsUnit ?? '',
    expression: b.accuracyExpression ?? '',
    printed: b.accuracyKind === 'FORMULA' ? (b.accuracyFormula ?? '') : '',
    // Anything already stored was written by somebody, so it opens as theirs to keep -
    // editing the figures will not quietly rewrite it.
    printedEdited: Boolean(b.accuracyKind === 'FORMULA' && b.accuracyFormula),
    touched: false,
  }
}

/** And back again, as the endpoint wants it. The three shapes do not share fields. */
export function bucketBody(r: RangeRow, unit: string, index: number) {
  const base: Record<string, unknown> = {
    min: r.from === '' ? null : Number(r.from),
    max: r.to === '' ? null : Number(r.to),
    // A bucket after the first starts above its lower bound, not at it.
    minInclusive: index === 0,
    maxInclusive: true,
    leastCountValue: r.leastCount === '' ? null : Number(r.leastCount),
    leastCountUnit: r.leastCount === '' ? null : unit || null,
    sortOrder: index,
  }
  if (r.basis === 'expr') {
    const expression = r.expression.trim()
    if (!expression) return { ...base, accuracyKind: null }
    return {
      ...base,
      accuracyKind: 'FORMULA',
      // The wording is what prints. Where nobody has written one, the arithmetic
      // stands in - a certificate with the expression on it is worse than one with
      // a blank, but only just, and a blank is what this used to produce.
      accuracyFormula: r.printed.trim() || expression,
      accuracyExpression: expression,
    }
  }

  if (PERCENT_BASES.includes(r.basis)) {
    const percent = r.percent.trim()
    const digits = r.digits.trim()
    if (!percent && !digits) return { ...base, accuracyKind: null }
    return {
      ...base,
      accuracyKind: 'FORMULA',
      accuracyFormula: r.printed.trim() || printedFrom(r, unit),
      // Typed as a percentage, stored as the fraction the arithmetic needs.
      accuracyPercentOf: percent ? BASIS_OF[r.basis] : null,
      accuracyPercentValue: percent ? Number(percent) / 100 : null,
      accuracyDigits: digits ? Number(digits) : null,
      accuracyDigitsUnit: digits ? r.digitsUnit.trim() || 'count' : null,
    }
  }

  if (r.basis === 'cls')
    return r.upper.trim()
      ? { ...base, accuracyKind: 'CLASS', accuracyClass: r.upper.trim() }
      : { ...base, accuracyKind: null }

  if (!r.upper.trim() && !r.lower.trim()) return { ...base, accuracyKind: null }
  // Only absolute figures reach here now, so the unit is the parameter's own. A
  // percentage used to land here with the unit "%", and the comparison divided by it
  // as though it were volts.
  const accuracyUnit = unit || null

  // A lower bound that was typed and differs is what makes this asymmetric. The
  // two sides are then kept apart: collapsing them to the larger would say the
  // instrument is worse than it is on one side and better on the other, and
  // nothing downstream could tell which figure it had been handed.
  if (r.lower.trim() && r.lower.trim() !== r.upper.trim())
    return {
      ...base,
      accuracyKind: 'ASYMMETRIC',
      accuracyUpper: r.upper.trim() === '' ? null : Math.abs(Number(r.upper)),
      accuracyLower: -Math.abs(Number(r.lower)),
      accuracyUnit,
    }

  return {
    ...base,
    accuracyKind: 'SYMMETRIC',
    accuracyValue: Math.abs(Number(r.upper)),
    accuracyUnit,
    accuracyPolarity: '±',
  }
}

export const blankDraft = (): CapabilityDraft => ({
  componentId: null,
  partChosen: false,
  role: '',
  parameter: '',
  group: '',
  unit: '',
  min: '',
  max: '',
  sopReferences: [],
  subs: false,
  subtypes: [],
  rows: [blankRow()],
  openSub: 0,
  bucketed: true,
})

export function draftFrom(p: Profile): CapabilityDraft {
  const subs = p.subtypes.length > 0
  return {
    componentId: p.componentId,
    partChosen: true,
    role: p.role,
    parameter: p.parameter,
    group: '',
    unit: p.unit ?? '',
    min: p.min === null ? '' : String(p.min),
    max: p.max === null ? '' : String(p.max),
    sopReferences: [...p.sopReferences],
    subs,
    subtypes: p.subtypes.map((s: Subtype) => ({
      id: s.id,
      name: s.subtypeKey,
      from: s.min === null ? '' : String(s.min),
      to: s.max === null ? '' : String(s.max),
      rows: s.buckets.length ? s.buckets.map(rowFrom) : [blankRow()],
    })),
    rows: subs ? [blankRow()] : p.buckets.length ? p.buckets.map(rowFrom) : [blankRow()],
    openSub: 0,
    bucketed: (subs ? p.subtypes.flatMap((s) => s.buckets) : p.buckets).length > 1,
  }
}

/* ── bands and tiles ──────────────────────────────────────────────────────── */

function Band({
  label,
  done,
  dimmed,
  value,
  onChange,
  children,
}: {
  label: string
  done?: boolean
  dimmed?: boolean
  value?: React.ReactNode
  onChange?: () => void
  children?: React.ReactNode
}) {
  if (dimmed)
    return (
      <div className="band dimmed">
        <span className="bl">{label}</span>
        <span className="ph" />
      </div>
    )
  if (done)
    return (
      <div className="band done">
        <span className="bl">{label}</span>
        <span className="bv">{value}</span>
        <button type="button" className="chg" onClick={onChange}>
          change
        </button>
      </div>
    )
  return (
    <div className="band">
      <span className="bl">{label}</span>
      <div className="bc">{children}</div>
    </div>
  )
}

function Tile({
  on,
  wide,
  title,
  sub,
  rows,
  onClick,
}: {
  on: boolean
  wide?: boolean
  title: React.ReactNode
  sub?: string
  rows?: [string, React.ReactNode][]
  onClick: () => void
}) {
  return (
    <button type="button" className={'tile' + (wide ? ' wide' : '') + (on ? ' sel' : '')} onClick={onClick}>
      <span className="pick">{on ? '◉' : '○'}</span>
      <span className="tn">{title}</span>
      <span className="trule" />
      {rows ? (
        rows.map(([k, v], i) => (
          <span className="tr" key={i}>
            <span className="tk">{k}</span>
            {v}
          </span>
        ))
      ) : (
        <span className="tv dim">{sub}</span>
      )}
    </button>
  )
}

/* ── the form ─────────────────────────────────────────────────────────────── */

/**
 * Adding a unit to the register, from inside the form that wanted it.
 *
 * The register holds symbols - "mmHg", not "millimetre of mercury" - because a
 * symbol is what prints on a certificate and what a range is read in. There is
 * nowhere for a written-out name to go, so the panel does not ask for one it
 * would then drop.
 *
 * The tick is the real decision. Off, the unit is used on this capability and
 * nowhere else. On, it is written back so the next person choosing this
 * parameter finds it already in the list. A parameter the register has never
 * heard of has nothing to write back to, and the tick says so rather than
 * silently doing nothing.
 */
function RegisterUnit({
  parameter,
  units,
  inRegister,
  seed,
  onUse,
  onRegister,
  onClose,
}: {
  parameter: string
  units: string[]
  inRegister: boolean
  /** Whatever was already typed in the field, so it is not typed twice. */
  seed: string
  onUse: (unit: string) => void
  onRegister: (symbol: string, share: boolean) => Promise<string | null>
  onClose: () => void
}) {
  const [symbol, setSymbol] = useState(seed)
  const [share, setShare] = useState(inRegister)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Whitespace and case are not what makes two units different.
  const flat = (s: string) => s.toLowerCase().replace(/\s+/g, '')
  const clash = units.find((u) => flat(u) === flat(symbol) && symbol.trim() !== '')

  const ready = Boolean(symbol.trim()) && !clash && !busy

  const submit = async () => {
    const value = symbol.trim()
    if (!value || clash) return
    setBusy(true)
    setError(null)
    const failed = await onRegister(value, share)
    setBusy(false)
    // The unit is used here either way: failing to add it to the register is a
    // reason to say so, not a reason to throw away what was typed.
    if (failed) {
      setError(failed)
      return
    }
    onUse(value)
  }

  return (
    <div className="pop" role="dialog" aria-label={`Register a unit for ${parameter}`}>
      <div className="pophead">
        <span>Register a unit</span>
        <button type="button" className="x" aria-label="Close" onClick={onClose}>
          ✕
        </button>
      </div>
      <p className="popsub">for {parameter}</p>

      <div className="popgrid">
        <div className="pf">
          <span className="k">Symbol</span>
          <input
            value={symbol}
            placeholder="mmHg"
            autoFocus
            aria-label="Unit symbol"
            onChange={(e) => setSymbol(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void submit()
              }
              if (e.key === 'Escape') onClose()
            }}
          />
          <span className="hint">as it prints on a certificate</span>
        </div>
        <div className="pf">
          <span className="k">Already registered</span>
          <span className="inherit">
            {units.length ? units.join(' · ') : <span className="undecl">nothing yet</span>}
          </span>
        </div>
      </div>

      {clash ? (
        <p className="clash">
          ⚠ <b>{clash}</b> is already registered for {parameter}.{' '}
          <button type="button" className="link" onClick={() => onUse(clash)}>
            Use {clash} instead
          </button>{' '}
          or change the symbol.
        </p>
      ) : null}
      {error ? <p className="clash">⚠ {error}</p> : null}

      <label className="both small">
        <input
          type="checkbox"
          checked={share}
          disabled={!inRegister}
          onChange={(e) => setShare(e.target.checked)}
        />
        <span>
          {inRegister
            ? 'Offer this unit on other instruments too'
            : `The register has no entry for ${parameter}, so this unit is used here only`}
        </span>
      </label>

      <div className="popfoot">
        <button type="button" className="btn ghost" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button
          type="button"
          className="btn primary"
          disabled={ready ? undefined : true}
          // The same way the Save button shows it cannot be pressed; there is no
          // disabled rule in the stylesheet for either of them to lean on.
          style={ready ? undefined : { opacity: 0.45 }}
          onClick={() => void submit()}
        >
          {busy ? 'Registering…' : 'Register'}
        </button>
      </div>
    </div>
  )
}

export default function CapabilityForm({
  draft,
  set,
  components,
  profiles,
  editingKey,
  groups,
  defaultGroup,
  registryError,
  units,
  inRegister,
  onRegisterUnit,
  sops,
  saving,
  onCancel,
  onSave,
}: {
  draft: CapabilityDraft
  set: (patch: Partial<CapabilityDraft>) => void
  components: Component[]
  profiles: Profile[]
  editingKey: string | null
  /**
   * The register, in the two levels a person picks through - straight out of the
   * calibration_parameter tables. Empty while it is still being fetched, and
   * there is no list baked into the app to fall back on: a list in two places
   * disagrees with itself the first time somebody adds a parameter.
   */
  groups: { name: string; parameters: string[] }[]
  /** What went wrong fetching it, if anything, so the field can say so. */
  registryError: string | null
  /** The instrument's own category, as the group to start in. */
  defaultGroup: string
  /** The units already registered against the chosen parameter. */
  units: string[]
  /** False for a parameter the register has never heard of; nothing to write to. */
  inRegister: boolean
  /** Resolves to null on success, or to something to show the person who asked. */
  onRegisterUnit: (symbol: string, share: boolean) => Promise<string | null>
  sops: string[]
  saving: boolean
  onCancel: () => void
  onSave: () => void
}) {
  const [paramOpen, setParamOpen] = useState(false)
  const [groupOpen, setGroupOpen] = useState(false)
  const [groupQuery, setGroupQuery] = useState('')
  const [unitOpen, setUnitOpen] = useState(false)
  const [registering, setRegistering] = useState(false)

  /**
   * The units worth offering for what has been typed.
   *
   * Filtered by the field's own contents, except when those contents are already
   * one of the units - otherwise choosing degC leaves a list of one, which reads
   * as though the others had gone away.
   */
  const typed = draft.unit.trim().toLowerCase()
  const exact = units.some((u) => u.toLowerCase() === typed)
  const unitMatches = !typed || exact ? units : units.filter((u) => u.toLowerCase().includes(typed))

  const chosen = components.find((c) => c.id === draft.componentId)
  const partName = draft.componentId === null ? 'The instrument as a whole' : (chosen?.name ?? '—')
  const paramsOn = (id: string | null) => [
    ...new Set(profiles.filter((p) => p.componentId === id).map((p) => p.parameter)),
  ]

  /**
   * The group on show.
   *
   * A parameter answers the question by itself - whichever group holds it is the
   * group, and saying otherwise would be a field disagreeing with the field
   * beside it. Only with nothing picked does what was chosen matter, and failing
   * that, the instrument's own category.
   */
  const groupOfParameter = (name: string) => {
    const wanted = name.trim().toLowerCase()
    if (!wanted) return ''
    return groups.find((g) => g.parameters.some((x) => x.toLowerCase() === wanted))?.name ?? ''
  }
  const group = draft.parameter
    ? groupOfParameter(draft.parameter) || draft.group
    : draft.group || defaultGroup
  const inherited = !draft.parameter && !draft.group && Boolean(defaultGroup)

  /** Everything the register holds in that group. */
  const inGroup = group ? (groups.find((g) => g.name === group)?.parameters ?? []) : []

  /**
   * The parameters worth offering for what has been typed - and, as with the
   * unit, the list suggests rather than gates. A lab that starts calibrating
   * something the register has never heard of types it in and carries on; the
   * alternative is waiting for somebody to add a row first.
   */
  const matches = (() => {
    const q = draft.parameter.trim().toLowerCase()
    if (!q || inGroup.some((x) => x.toLowerCase() === q)) return inGroup
    const starts: string[] = []
    const holds: string[] = []
    for (const x of inGroup) {
      const i = x.toLowerCase().indexOf(q)
      if (i === 0) starts.push(x)
      else if (i > 0) holds.push(x)
    }
    return [...starts, ...holds]
  })()

  const groupMatches = (() => {
    const q = groupQuery.trim().toLowerCase()
    if (!q) return groups
    return groups.filter((g) => g.name.toLowerCase().includes(q))
  })()

  /* ── the range rows, wherever they live ── */
  const si = Math.min(Math.max(draft.openSub, 0), Math.max(draft.subtypes.length - 1, 0))
  const rowsHere = draft.subs ? (draft.subtypes[si]?.rows ?? []) : draft.rows
  const filledIn = (i: number) => (draft.subtypes[i]?.rows ?? []).filter((r) => r.from !== '' || r.to !== '').length

  const setRows = (next: RangeRow[]) => {
    if (!draft.subs) return set({ rows: next })
    set({ subtypes: draft.subtypes.map((s, j) => (j === si ? { ...s, rows: next } : s)) })
  }
  /**
   * One funnel for every change to a range row.
   *
   * A wording nobody has written follows its figures from here, so a new band never
   * has to have its sentence typed out, and a wording somebody has written is left
   * exactly alone - which is the whole reason the field is editable.
   */
  const ACCURACY_FIELDS: (keyof RangeRow)[] = ['basis', 'percent', 'digits', 'upper', 'lower']
  const setRow = (i: number, patch: Partial<RangeRow>) =>
    setRows(
      rowsHere.map((r, j) => {
        if (j !== i) return r
        const next = { ...r, ...patch }
        if (ACCURACY_FIELDS.some((f) => f in patch)) {
          next.touched = true
          if (!next.printedEdited) next.printed = printedFrom(next, draft.unit)
        }
        if ('printed' in patch || 'expression' in patch) next.touched = true
        return next
      }),
    )
  const setSub = (i: number, patch: Partial<SubtypeRow>) =>
    set({ subtypes: draft.subtypes.map((s, j) => (j === i ? { ...s, ...patch } : s)) })

  const unitSuffix = (r: RangeRow) => (r.basis in BASIS_SUFFIX ? BASIS_SUFFIX[r.basis] || draft.unit : '')

  const totalRanges = draft.subs
    ? draft.subtypes.reduce((n, s) => n + s.rows.filter((r) => r.from !== '' || r.to !== '').length, 0)
    : draft.rows.filter((r) => r.from !== '' || r.to !== '').length

  const rangeReady =
    draft.parameter.trim() && draft.unit.trim() && (draft.subs ? draft.subtypes.length > 0 : draft.min !== '' && draft.max !== '')
  const canSave = Boolean(draft.partChosen && draft.role && draft.parameter.trim() && draft.unit.trim())

  const RangeHead = () => (
    <thead>
      <tr>
        <th style={{ width: 34 }}>#</th>
        <th style={{ width: 118 }}>From</th>
        <th style={{ width: 118 }}>To</th>
        <th style={{ width: 148 }}>Least Count</th>
        <th style={{ width: 168 }}>Accuracy is</th>
        <th style={{ width: 140 }}>+ (upper)</th>
        <th style={{ width: 140 }}>− (lower)</th>
        <th style={{ width: 52, textAlign: 'center' }}>Del</th>
      </tr>
    </thead>
  )

  const rangeTable = (
    <div className="tablewrap">
      <table>
        <RangeHead />
        <tbody>
          {rowsHere.map((r, i) => (
            // The band and the panel that belongs to it are two rows of one table, so
            // they are siblings under a fragment rather than one row wrapping the other.
            <Fragment key={i}>
            <tr>
              <td className="n">{i + 1}</td>
              <td>
                <input value={r.from} placeholder="from" onChange={(e) => setRow(i, { from: e.target.value })} />
              </td>
              <td>
                <input value={r.to} placeholder="to" onChange={(e) => setRow(i, { to: e.target.value })} />
              </td>
              <td>
                <div className="withu">
                  <input
                    value={r.leastCount}
                    placeholder="blank if none"
                    onChange={(e) => setRow(i, { leastCount: e.target.value })}
                  />
                  <span className="usuf">{draft.unit}</span>
                </div>
              </td>
              <td>
                <select
                  value={r.basis}
                  onChange={(e) => setRow(i, { basis: e.target.value as Basis })}
                >
                  {BASES.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </td>
              {r.basis === 'cls' ? (
                // A class is one text, not two bounds, so the field takes both columns
                // rather than leaving one of them dead.
                <td colSpan={2}>
                  <input
                    value={r.upper}
                    placeholder="Class 1"
                    onChange={(e) => setRow(i, { upper: e.target.value })}
                  />
                </td>
              ) : r.basis === 'expr' ? (
                <td colSpan={2}>
                  <span className="accsay">formula below</span>
                </td>
              ) : PERCENT_BASES.includes(r.basis) ? (
                // A percentage and, where the instrument states one, a trailing term
                // in counts of its own resolution.
                <td colSpan={2}>
                  <span className="accpct">
                    <span className="withu">
                      <input
                        value={r.percent}
                        placeholder="0.02"
                        aria-label={`Accuracy percentage for range ${i + 1}`}
                        onChange={(e) => setRow(i, { percent: e.target.value })}
                      />
                      <span className="usuf">%</span>
                    </span>
                    <span className="accplus">+</span>
                    <span className="withu">
                      <input
                        value={r.digits}
                        placeholder="none"
                        aria-label={`Accuracy counts term for range ${i + 1}`}
                        onChange={(e) => setRow(i, { digits: e.target.value })}
                      />
                      <span className="usuf">{r.digitsUnit || 'counts'}</span>
                    </span>
                  </span>
                </td>
              ) : (
                <>
                  <td>
                    <div className="withu">
                      <input
                        value={r.upper}
                        placeholder="0.6"
                        aria-label={`Upper accuracy bound for range ${i + 1}`}
                        onChange={(e) => setRow(i, { upper: e.target.value })}
                      />
                      <span className="usuf">{unitSuffix(r)}</span>
                    </div>
                  </td>
                  <td>
                    <div className="withu">
                      <input
                        value={r.lower}
                        placeholder="same as +"
                        aria-label={`Lower accuracy bound for range ${i + 1}`}
                        onChange={(e) => setRow(i, { lower: e.target.value })}
                      />
                      {/* The suffix appears once there is a figure for it to be the
                          unit of; on an empty field it reads as clutter. */}
                      <span className="usuf">{r.lower ? unitSuffix(r) : ''}</span>
                    </div>
                  </td>
                </>
              )}
              <td style={{ textAlign: 'center' }}>
                <button
                  type="button"
                  className="iconbtn del"
                  aria-label={`Remove range ${i + 1}`}
                  onClick={() => setRows(rowsHere.filter((_, j) => j !== i))}
                >
                  <Icon.bin />
                </button>
              </td>
            </tr>
            {(r.basis === 'expr' || PERCENT_BASES.includes(r.basis)) && (
              <tr className="accrowtr">
                <td colSpan={8}>
                  <AccuracyPanel
                    row={r}
                    index={i}
                    unit={draft.unit}
                    fullScale={draft.subs ? (draft.subtypes[si]?.to ?? '') : draft.max}
                    onChange={(patch) => setRow(i, patch)}
                  />
                </td>
              </tr>
            )}
            </Fragment>
          ))}
          <tr>
            <td colSpan={8} className="addrow">
              <button type="button" className="link" onClick={() => setRows([...rowsHere, blankRow()])}>
                <Icon.plus /> Add range
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )

  return (
    <div className="card wiz">
      <div className="wizhead">
        <span className="lbl">{editingKey ? 'Edit capability' : 'New capability'}</span>
        {editingKey ? <span className="wizsub mono">{editingKey}</span> : null}
      </div>

      {/* ── 1. which part ── */}
      {draft.partChosen ? (
        <Band label="Part" done value={partName} onChange={() => set({ partChosen: false })} />
      ) : (
        <Band label="Part">
          <div className="tiles">
            {components.map((c) => (
              <Tile
                key={c.id}
                on={draft.partChosen && draft.componentId === c.id}
                title={c.name}
                onClick={() => set({ componentId: c.id, partChosen: true })}
                rows={[
                  ['Model', <span className="tv" key="m">{c.model || '—'}</span>],
                  [
                    'Group',
                    paramsOn(c.id).length ? (
                      <span className="gchip" key="g">{paramsOn(c.id).join(', ')}</span>
                    ) : (
                      <span className="tv dim" key="g">none yet</span>
                    ),
                  ],
                ]}
              />
            ))}
            <Tile
              on={draft.partChosen && draft.componentId === null}
              title={<>The instrument<br />as a whole</>}
              onClick={() => set({ componentId: null, partChosen: true })}
              rows={[
                ['Model', <span className="tv" key="m">—</span>],
                [
                  'Group',
                  paramsOn(null).length ? (
                    <span className="gchip" key="g">{paramsOn(null).join(', ')}</span>
                  ) : (
                    <span className="tv dim" key="g">none yet</span>
                  ),
                ],
              ]}
            />
          </div>
          <p className="hint">Parts are managed in Basic Info.</p>
        </Band>
      )}

      {/* ── 2. what it does ── */}
      {!draft.partChosen ? (
        <Band label="Role" dimmed />
      ) : draft.role ? (
        <Band
          label="Role"
          done
          value={draft.role === 'MEASURING' ? 'Measures' : 'Sources'}
          onChange={() => set({ role: '' })}
        />
      ) : (
        <Band label="Role">
          <div className="tiles">
            <Tile wide on={false} title="Measures" sub="reads the value of something" onClick={() => set({ role: 'MEASURING' })} />
            <Tile wide on={false} title="Sources" sub="produces a known value" onClick={() => set({ role: 'SOURCE' })} />
          </div>
        </Band>
      )}

      {/* ── 3. parameter and unit ── */}
      {!draft.role ? (
        <Band label="Parameter" dimmed />
      ) : /* Collapses once both are answered - but not while either is still being
             answered. The unit is typed as well as chosen, and a band that folded
             on the first letter of "mmHg" would take the field away mid-word. */
        draft.parameter && draft.unit && !paramOpen && !unitOpen && !registering ? (
        <Band
          label="Parameter"
          done
          value={
            <>
              {draft.parameter} <span className="dim">·</span> {draft.unit}
            </>
          }
          onChange={() => set({ parameter: '', unit: '' })}
        />
      ) : (
        <Band label="Parameter">
          {/* Three questions, narrowing: which family of measurement, which
              parameter inside it, which unit that parameter is read in. All three
              lists are the register itself - there is no copy of it in the app to
              drift out of step with the rows. */}
          <div className="prm">
            <div className="pf">
              <span className="k">Parameter Group</span>
              <div className="anchor">
                <div className={'combo' + (groupOpen ? ' open' : '')}>
                  <input
                    value={groupOpen ? groupQuery : group}
                    disabled={!groups.length}
                    aria-label="Parameter group"
                    placeholder={
                      registryError
                        ? 'The register could not be loaded'
                        : groups.length
                          ? 'Choose a group'
                          : 'Loading the register…'
                    }
                    onFocus={() => {
                      if (!groupOpen) {
                        setGroupOpen(true)
                        setGroupQuery('')
                      }
                    }}
                    onBlur={() => window.setTimeout(() => setGroupOpen(false), 120)}
                    onChange={(e) => setGroupQuery(e.target.value)}
                  />
                  <span className="cv">▾</span>
                </div>
                {groupOpen && (
                  <div className="menu scroll">
                    {groupMatches.length ? (
                      groupMatches.map((g) => (
                        <button
                          type="button"
                          key={g.name}
                          onMouseDown={(e) => {
                            e.preventDefault()
                            // A parameter belongs to its group, so changing the
                            // group unasks the two questions under it rather than
                            // leaving an answer from another family standing.
                            set({ group: g.name, parameter: '', unit: '' })
                            setGroupOpen(false)
                            setGroupQuery('')
                          }}
                        >
                          {g.name}
                          <span className="dim"> · {g.parameters.length}</span>
                          {group === g.name ? <span className="tick"> ✓</span> : null}
                        </button>
                      ))
                    ) : (
                      <p className="nohit">No group matches “{groupQuery}”.</p>
                    )}
                  </div>
                )}
              </div>
              {inherited ? <span className="hint">inherited from the instrument</span> : null}
            </div>

            <div className="pf">
              <span className="k">Parameter Type</span>
              <div className="anchor">
                <div className={'combo' + (paramOpen ? ' open' : '')}>
                  <input
                    value={draft.parameter}
                    disabled={!group}
                    aria-label="Parameter type"
                    placeholder={
                      group ? `Type to search ${inGroup.length} in ${group}…` : 'Choose a group first'
                    }
                    onFocus={() => setParamOpen(true)}
                    onBlur={() => window.setTimeout(() => setParamOpen(false), 120)}
                    onChange={(e) => set({ parameter: e.target.value, unit: '' })}
                  />
                  <span className="cv">▾</span>
                </div>
                {paramOpen && (
                  <div className="menu scroll">
                    {matches.map((x) => (
                      <button
                        type="button"
                        key={x}
                        onMouseDown={(e) => {
                          e.preventDefault()
                          set({ parameter: x, unit: '' })
                          setParamOpen(false)
                        }}
                      >
                        {x}
                        {draft.parameter === x ? <span className="tick"> ✓</span> : null}
                      </button>
                    ))}
                    {matches.length === 0 && (
                      <p className="nohit">
                        Nothing in {group} matches “{draft.parameter.trim()}”. It can still be used
                        here — a lab that starts calibrating something new should not wait for a row
                        to be added first.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="pf">
              <span className="k">Unit</span>
              {/* One anchor over both, so the register panel opens below the field
                  it belongs to rather than at the corner of the form. */}
              <div className="anchor">
                <div className={'combo' + (unitOpen ? ' open' : '')}>
                  <input
                    value={draft.unit}
                    disabled={!draft.parameter}
                    placeholder={
                      !draft.parameter
                        ? 'Choose a parameter first'
                        : units.length
                          ? 'Type to search…'
                          : 'None registered yet — type or register one'
                    }
                    aria-label="Unit"
                    onFocus={() => setUnitOpen(true)}
                    // Long enough for a click on a row to land before the list shuts.
                    onBlur={() => window.setTimeout(() => setUnitOpen(false), 120)}
                    // What is typed is the unit. The list suggests; it does not
                    // gate - a lab calibrating something new should not wait for
                    // someone to add its unit to a register first.
                    onChange={(e) => set({ unit: e.target.value })}
                  />
                  <span className="cv">▾</span>
                </div>

                {unitOpen && (
                  <div className="menu scroll">
                    {unitMatches.map((u) => (
                      <button
                        type="button"
                        key={u}
                        onMouseDown={(e) => {
                          e.preventDefault()
                          set({ unit: u })
                          setUnitOpen(false)
                        }}
                      >
                        {u}
                        {draft.unit === u ? <span className="tick"> ✓</span> : null}
                      </button>
                    ))}
                    {unitMatches.length === 0 && (
                      <p className="nohit">
                        {units.length
                          ? `No registered unit matches “${draft.unit.trim()}”. It can still be used here.`
                          : `Nothing is registered for ${draft.parameter} yet.`}
                      </p>
                    )}
                    <div className="msep" />
                    <button
                      type="button"
                      className="add"
                      onMouseDown={(e) => {
                        e.preventDefault()
                        setUnitOpen(false)
                        setRegistering(true)
                      }}
                    >
                      <Icon.plus /> Register a new unit
                    </button>
                  </div>
                )}

                {registering && (
                  <RegisterUnit
                    parameter={draft.parameter}
                    units={units}
                    inRegister={inRegister}
                    seed={exact ? '' : draft.unit.trim()}
                    onUse={(u) => {
                      set({ unit: u })
                      setRegistering(false)
                    }}
                    onRegister={onRegisterUnit}
                    onClose={() => setRegistering(false)}
                  />
                )}
              </div>
              <span className="hint">as it prints on a certificate</span>
            </div>
          </div>
        </Band>
      )}

      {/* ── 4. procedures ── */}
      {!draft.parameter || !draft.unit ? (
        <Band label="Procedures" dimmed />
      ) : (
        <Band label="Procedures">
          <div className="sopwrap">
            {sops.length === 0 && <span className="undecl">No procedure is linked to this instrument.</span>}
            {sops.map((s) => {
              const on = draft.sopReferences.includes(s)
              return (
                <button
                  type="button"
                  key={s}
                  className={'sop' + (on ? ' on' : '')}
                  onClick={() =>
                    set({
                      sopReferences: on ? draft.sopReferences.filter((x) => x !== s) : [...draft.sopReferences, s],
                    })
                  }
                >
                  <span className="tk2">{on ? '✓' : ''}</span>
                  <span className="mono">{s}</span>
                </button>
              )
            })}
          </div>
          <p className="hint">
            {draft.sopReferences.length ? (
              `${draft.sopReferences.length} of ${sops.length} apply to ${draft.parameter}. Untick any that do not.`
            ) : (
              <span className="warnt">
                ⚠ No procedure applies to this capability. It can be saved, but an engineer calibrating
                against it will have none to follow.
              </span>
            )}
          </p>
        </Band>
      )}

      {/* ── 5. operating range, and whether it splits ── */}
      {!draft.parameter || !draft.unit ? (
        <Band label="Operating Range" dimmed />
      ) : (
        <Band label="Operating Range">
          <div className="orhead">
            <label className="both small">
              <input
                type="checkbox"
                checked={draft.subs}
                onChange={(e) => {
                  if (e.target.checked) {
                    // Whatever was typed as a plain span becomes the first subtype,
                    // so nothing already entered is lost.
                    set({
                      subs: true,
                      subtypes: [{ id: null, name: '', from: draft.min, to: draft.max, rows: draft.rows }],
                      openSub: 0,
                    })
                  } else {
                    if (
                      draft.subtypes.length > 1 &&
                      !window.confirm('Collapsing to a single range discards the other subtypes and their ranges. Continue?')
                    )
                      return
                    const first = draft.subtypes[0]
                    set({
                      subs: false,
                      min: first?.from ?? '',
                      max: first?.to ?? '',
                      rows: first?.rows ?? [blankRow()],
                    })
                  }
                }}
              />
              <span>
                This parameter splits into subtypes <span className="dim">optional</span>
              </span>
            </label>
            {draft.subs && (
              <span className="overall">
                Overall{' '}
                <b>
                  {(() => {
                    const f = draft.subtypes.map((s) => parseFloat(s.from)).filter((n) => !isNaN(n))
                    const t = draft.subtypes.map((s) => parseFloat(s.to)).filter((n) => !isNaN(n))
                    return f.length && t.length ? `${Math.min(...f)} to ${Math.max(...t)} ${draft.unit}` : '—'
                  })()}
                </b>{' '}
                <span className="dim">· computed</span>
              </span>
            )}
          </div>

          {draft.subs ? (
            <>
              <div className="tablewrap">
                <table>
                  <thead>
                    <tr>
                      <th>Subtype</th>
                      <th style={{ width: 170 }}>From</th>
                      <th style={{ width: 170 }}>To</th>
                      <th />
                      <th style={{ width: 56, textAlign: 'center' }}>Del</th>
                    </tr>
                  </thead>
                  <tbody>
                    {draft.subtypes.map((s, i) => (
                      <tr key={i}>
                        <td>
                          <input value={s.name} placeholder="Type J" onChange={(e) => setSub(i, { name: e.target.value })} />
                        </td>
                        <td>
                          <input value={s.from} placeholder="-210" onChange={(e) => setSub(i, { from: e.target.value })} />
                        </td>
                        <td>
                          <input value={s.to} placeholder="1200" onChange={(e) => setSub(i, { to: e.target.value })} />
                        </td>
                        <td className="usuf">{draft.unit}</td>
                        <td style={{ textAlign: 'center' }}>
                          <button
                            type="button"
                            className="iconbtn del"
                            aria-label={`Remove ${s.name || `subtype ${i + 1}`}`}
                            onClick={() => set({ subtypes: draft.subtypes.filter((_, j) => j !== i), openSub: 0 })}
                          >
                            <Icon.bin />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button
                type="button"
                className="link mt"
                onClick={() => set({ subtypes: [...draft.subtypes, { id: null, name: '', from: '', to: '', rows: [blankRow()] }] })}
              >
                <Icon.plus /> Add subtype
              </button>
            </>
          ) : (
            <div className="fromto">
              <div className="pf">
                <span className="k">From</span>
                <div className="withu">
                  <input value={draft.min} placeholder="0" onChange={(e) => set({ min: e.target.value })} />
                  <span className="usuf">{draft.unit}</span>
                </div>
              </div>
              <div className="pf">
                <span className="k">To</span>
                <div className="withu">
                  <input value={draft.max} placeholder="700" onChange={(e) => set({ max: e.target.value })} />
                  <span className="usuf">{draft.unit}</span>
                </div>
              </div>
              <p className="hint">What this capability spans, end to end.</p>
            </div>
          )}
        </Band>
      )}

      {/* ── 6. the ranges themselves ── */}
      {!rangeReady ? (
        <Band label="Ranges" dimmed />
      ) : (
        <Band label="Ranges">
          <div className="tiles">
            <Tile
              wide
              on={!draft.bucketed}
              title={`One range${draft.subs ? ' per subtype' : ''}`}
              sub="one accuracy across the whole span"
              onClick={() => set({ bucketed: false })}
            />
            <Tile
              wide
              on={draft.bucketed}
              title="Bucketed"
              sub="accuracy changes across the span"
              onClick={() => set({ bucketed: true })}
            />
          </div>

          {draft.subs ? (
            <>
              <div className="subtabs" role="tablist">
                {draft.subtypes.map((s, i) => {
                  const n = filledIn(i)
                  return (
                    <button
                      type="button"
                      key={i}
                      role="tab"
                      aria-selected={i === si}
                      className={'subtab ' + (i === si ? 'on ' : '') + (n ? 'has' : 'empty')}
                      onClick={() => set({ openSub: i })}
                    >
                      <span className="stn">{s.name || `Subtype ${i + 1}`}</span>
                      <span className="stc">{n ? n : '⚠'}</span>
                    </button>
                  )
                })}
                <span className="subprog">
                  {draft.subtypes.filter((_, i) => filledIn(i) > 0).length} of {draft.subtypes.length} have ranges
                </span>
              </div>

              <div className="subpanel">
                <div className="subbar">
                  <span className="sbn">{draft.subtypes[si]?.name || `Subtype ${si + 1}`}</span>
                  <span className="sbs mono">
                    {draft.subtypes[si]?.from !== '' && draft.subtypes[si]?.to !== ''
                      ? `${draft.subtypes[si].from} to ${draft.subtypes[si].to} ${draft.unit}`
                      : 'no operating range yet'}
                  </span>
                  {/* Thermocouple types usually share a least count, and retyping six rows
                      eight times is where mistakes come from. */}
                  {draft.subtypes.some((_, i) => i !== si && filledIn(i) > 0) && (
                    <label className="sbcopy">
                      Copy ranges from
                      <select
                        value=""
                        onChange={(e) => {
                          const from = Number(e.target.value)
                          if (Number.isNaN(from)) return
                          setRows((draft.subtypes[from]?.rows ?? []).map((r) => ({ ...r, id: null })))
                        }}
                      >
                        <option value="">choose…</option>
                        {draft.subtypes.map((s, i) =>
                          i !== si && filledIn(i) > 0 ? (
                            <option key={i} value={i}>
                              {s.name || `Subtype ${i + 1}`} · {filledIn(i)} ranges
                            </option>
                          ) : null,
                        )}
                      </select>
                    </label>
                  )}
                </div>
                {filledIn(si) === 0 && (
                  <p className="subempty">
                    No ranges declared for {draft.subtypes[si]?.name || 'this subtype'} yet.
                  </p>
                )}
                {rangeTable}
              </div>
            </>
          ) : (
            rangeTable
          )}
        </Band>
      )}

      <div className="wizfoot">
        <span className="sent">
          {!draft.partChosen ? (
            <span className="dim">Nothing declared yet</span>
          ) : (
            <>
              {partName} {draft.role ? (draft.role === 'MEASURING' ? 'measures' : 'sources') : ''}{' '}
              {draft.parameter}
              {draft.unit ? ` in ${draft.unit}` : ''}
              {(draft.sopReferences.length || draft.subtypes.length || totalRanges) > 0 && (
                <span className="dim">
                  {' · '}
                  {[
                    draft.sopReferences.length ? `${draft.sopReferences.length} procedures` : null,
                    draft.subs && draft.subtypes.length ? `${draft.subtypes.length} subtypes` : null,
                    totalRanges ? `${totalRanges} ranges` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              )}
            </>
          )}
        </span>
        <span className="sp">
          <button type="button" className="btn ghost" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={!canSave || saving}
            style={canSave && !saving ? undefined : { opacity: 0.45 }}
            onClick={onSave}
          >
            {saving ? 'Saving…' : editingKey ? 'Save changes' : 'Save capability'}
          </button>
        </span>
      </div>
    </div>
  )
}
