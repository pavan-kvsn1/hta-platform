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

import { useState } from 'react'
import { Icon } from '../Icons'
import type { Bucket, Component, Profile, Subtype } from './CapabilitiesTab'

/* ── the form's own shape ─────────────────────────────────────────────────── */

export interface RangeRow {
  id: string | null // the bucket it came from, or null when new
  from: string
  to: string
  leastCount: string
  basis: string // absolute | pct_rdg | pct_fs | formula | cls
  upper: string
  lower: string
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

const BASES: [string, string][] = [
  ['absolute', 'absolute'],
  ['pct_rdg', '% of reading'],
  ['pct_fs', '% of full scale'],
  ['formula', 'formula'],
  ['cls', 'class'],
]
const BASIS_SUFFIX: Record<string, string> = { absolute: '', pct_rdg: '%', pct_fs: '%FS' }

export const blankRow = (): RangeRow => ({
  id: null,
  from: '',
  to: '',
  leastCount: '',
  basis: 'absolute',
  upper: '',
  lower: '',
})

/** A stored bucket, as the form holds it. */
function rowFrom(b: Bucket): RangeRow {
  const basis =
    b.accuracyKind === 'FORMULA'
      ? 'formula'
      : b.accuracyKind === 'CLASS'
        ? 'cls'
        : b.accuracyUnit === '%FS'
          ? 'pct_fs'
          : b.accuracyUnit === '%'
            ? 'pct_rdg'
            : 'absolute'
  return {
    id: b.id,
    from: b.min === null ? '' : String(b.min),
    to: b.max === null ? '' : String(b.max),
    leastCount: b.leastCountValue === null ? '' : String(b.leastCountValue),
    basis,
    upper:
      b.accuracyKind === 'FORMULA'
        ? (b.accuracyFormula ?? '')
        : b.accuracyKind === 'CLASS'
          ? (b.accuracyClass ?? '')
          : b.accuracyValue === null
            ? ''
            : String(b.accuracyValue),
    lower: '',
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
  if (!r.upper.trim()) return { ...base, accuracyKind: null }
  if (r.basis === 'formula') return { ...base, accuracyKind: 'FORMULA', accuracyFormula: r.upper.trim() }
  if (r.basis === 'cls') return { ...base, accuracyKind: 'CLASS', accuracyClass: r.upper.trim() }
  return {
    ...base,
    accuracyKind: 'SYMMETRIC',
    accuracyValue: Number(r.upper),
    accuracyUnit: r.basis === 'pct_fs' ? '%FS' : r.basis === 'pct_rdg' ? '%' : unit || null,
    accuracyPolarity: '±',
  }
}

export const blankDraft = (): CapabilityDraft => ({
  componentId: null,
  partChosen: false,
  role: '',
  parameter: '',
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

export default function CapabilityForm({
  draft,
  set,
  components,
  profiles,
  editingKey,
  parameters,
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
  parameters: string[]
  sops: string[]
  saving: boolean
  onCancel: () => void
  onSave: () => void
}) {
  const [paramOpen, setParamOpen] = useState(false)
  const [paramQuery, setParamQuery] = useState('')

  const chosen = components.find((c) => c.id === draft.componentId)
  const partName = draft.componentId === null ? 'The instrument as a whole' : (chosen?.name ?? '—')
  const paramsOn = (id: string | null) => [
    ...new Set(profiles.filter((p) => p.componentId === id).map((p) => p.parameter)),
  ]

  const matches = (() => {
    const q = paramQuery.trim().toLowerCase()
    if (!q) return parameters
    const starts: string[] = []
    const holds: string[] = []
    for (const x of parameters) {
      const i = x.toLowerCase().indexOf(q)
      if (i === 0) starts.push(x)
      else if (i > 0) holds.push(x)
    }
    return [...starts, ...holds]
  })()

  /* ── the range rows, wherever they live ── */
  const si = Math.min(Math.max(draft.openSub, 0), Math.max(draft.subtypes.length - 1, 0))
  const rowsHere = draft.subs ? (draft.subtypes[si]?.rows ?? []) : draft.rows
  const filledIn = (i: number) => (draft.subtypes[i]?.rows ?? []).filter((r) => r.from !== '' || r.to !== '').length

  const setRows = (next: RangeRow[]) => {
    if (!draft.subs) return set({ rows: next })
    set({ subtypes: draft.subtypes.map((s, j) => (j === si ? { ...s, rows: next } : s)) })
  }
  const setRow = (i: number, patch: Partial<RangeRow>) =>
    setRows(rowsHere.map((r, j) => (j === i ? { ...r, ...patch } : r)))
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
        <th style={{ width: 168 }}>Accuracy Basis</th>
        <th style={{ width: 200 }}>Accuracy</th>
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
            <tr key={i}>
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
                <select value={r.basis} onChange={(e) => setRow(i, { basis: e.target.value })}>
                  {BASES.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                <div className="withu">
                  <input
                    value={r.upper}
                    placeholder={
                      r.basis === 'cls' ? 'Class 1' : r.basis === 'formula' ? '±(0.02% rdg + 2 counts)' : '0.6'
                    }
                    onChange={(e) => setRow(i, { upper: e.target.value })}
                  />
                  <span className="usuf">{unitSuffix(r)}</span>
                </div>
              </td>
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
          ))}
          <tr>
            <td colSpan={7} className="addrow">
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
      ) : draft.parameter && draft.unit && !paramOpen ? (
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
          <div className="prm">
            <div className="pf">
              <span className="k">Type</span>
              <div className="anchor">
                <div className={'combo' + (paramOpen ? ' open' : '')}>
                  <input
                    value={paramOpen ? paramQuery : draft.parameter}
                    placeholder={`Type to search ${parameters.length} parameters…`}
                    onFocus={() => {
                      if (!paramOpen) {
                        setParamOpen(true)
                        setParamQuery('')
                      }
                    }}
                    onBlur={() => window.setTimeout(() => setParamOpen(false), 120)}
                    onChange={(e) => setParamQuery(e.target.value)}
                  />
                  <span className="cv">▾</span>
                </div>
                {paramOpen && (
                  <div className="menu scroll">
                    {matches.length ? (
                      matches.map((x) => (
                        <button
                          type="button"
                          key={x}
                          onMouseDown={(e) => {
                            e.preventDefault()
                            set({ parameter: x })
                            setParamOpen(false)
                            setParamQuery('')
                          }}
                        >
                          {x}
                          {draft.parameter === x ? <span className="tick"> ✓</span> : null}
                        </button>
                      ))
                    ) : (
                      <p className="nohit">
                        Nothing matches “{paramQuery}”. It can still be typed in — a lab that starts
                        calibrating something new should not wait for a deploy.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="pf">
              <span className="k">Unit</span>
              <input value={draft.unit} placeholder="°C, bar, V…" onChange={(e) => set({ unit: e.target.value })} />
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
