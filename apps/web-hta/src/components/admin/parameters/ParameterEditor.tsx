'use client'

/**
 * One parameter, open for editing, in place of its row.
 *
 * The two columns are not "editable" and "read-only" - everything here can be
 * changed. They are **this lab** and **every lab**, which is the division that
 * actually matters: a rename or a narrowed unit list is invisible to anyone
 * else, and a change to the quantity moves which instruments can serve a
 * certificate for every lab that reads the standard.
 *
 * Quantity and variant are editable rather than locked, with the consequence
 * shown instead. Forbidding them would leave a mis-seeded parameter permanently
 * wrong, which is worse than showing the count of what a change would re-pair.
 */

import { useState } from 'react'
import { Chips, Icon, Suggest, Switch } from './Bits'
import {
  changedIn,
  defaultOf,
  flat,
  pairingMoved,
  unitsOf,
  usesOf,
  type Draft,
  type Parameter,
} from './registry'

export default function ParameterEditor({
  parameter,
  draft,
  set,
  groups,
  quantities,
  variants,
  saving,
  error,
  onCancel,
  onSave,
}: {
  parameter: Parameter
  draft: Draft
  set: (patch: Partial<Draft>) => void
  groups: string[]
  quantities: string[]
  variants: string[]
  saving: boolean
  error: string | null
  onCancel: () => void
  onSave: () => void
}) {
  /** Which unit was refused, and how much is measured in it. */
  const [refused, setRefused] = useState<{ unit: string; n: number } | null>(null)

  const p = parameter
  const d = draft
  const units = unitsOf(p, d)
  const def = defaultOf(p, d)
  const changed = changedIn(p, d)
  const moved = pairingMoved(p, d)
  const instruments = p.instruments ?? 0
  const groupIsNew =
    Boolean(d.category.trim()) && !groups.some((g) => flat(g) === flat(d.category))

  const dropUnit = (u: string) => {
    const n = usesOf(p, u)
    // A unit something is measured in cannot quietly disappear: the capability
    // would still be in it and nothing on the certificate would say so.
    if (n) {
      setRefused({ unit: u, n })
      return
    }
    const next = units.filter((x) => x !== u)
    setRefused(null)
    set({
      units: next,
      defaultUnit: def === u ? (next[0] ?? null) : d.defaultUnit,
    })
  }

  return (
    <div className="ed">
      <div className="edhead">
        <span className="lbl">Edit parameter</span>
        <span className="std">
          {p.category} · {p.standardName}
        </span>
      </div>

      <div className="edgrid">
        {/* ── what this lab owns ── */}
        <div className="pane">
          <div className="f">
            <span className="k">Your name for it</span>
            <input
              type="text"
              value={d.customName}
              placeholder={p.standardName}
              onChange={(e) => set({ customName: e.target.value })}
            />
            <span className="hint">
              What engineers see. Safe to change — everything still matches on{' '}
              <code>{p.standardName}</code> behind it.
            </span>
          </div>

          <div className="f">
            <span className="k">Units</span>
            <Chips
              id="ed-unit"
              values={units}
              highlight={def}
              lockedWhen={(u) => usesOf(p, u) > 0}
              placeholder={units.length ? 'add a unit…' : 'none yet — add one'}
              onAdd={(u) => {
                setRefused(null)
                set({ units: [...units, u], defaultUnit: def ?? u })
              }}
              onRemove={dropUnit}
            />
            {refused ? (
              <p className="refuse">
                {Icon.warn}
                <span>
                  <b>{refused.unit}</b> can’t be removed — {refused.n}{' '}
                  {refused.n === 1 ? 'capability is' : 'capabilities are'} measured in it. To stop
                  offering this parameter at all, switch it off below.
                </span>
              </p>
            ) : null}
            <div className="srcnote">
              {d.units === null ? (
                <span>
                  Using the standard’s{' '}
                  {p.standardUnits.length === 1 ? 'one unit' : `${p.standardUnits.length} units`}.
                </span>
              ) : (
                <>
                  <span>Your own list.</span>
                  <button
                    type="button"
                    className="link"
                    onClick={() => {
                      setRefused(null)
                      set({ units: null, defaultUnit: null })
                    }}
                  >
                    Back to the standard’s {p.standardUnits.length}
                  </button>
                </>
              )}
            </div>
          </div>

          {units.length ? (
            <div className="f">
              <span className="k">Default unit</span>
              <div className="chips">
                {units.map((u) => (
                  <button
                    key={u}
                    type="button"
                    className={'u' + (u === def ? ' def' : '')}
                    onClick={() => set({ units, defaultUnit: u })}
                  >
                    {u}
                  </button>
                ))}
              </div>
              <span className="hint">What engineers get first. They can still pick another.</span>
            </div>
          ) : null}

          <div className="f">
            <span className="k">Show to engineers</span>
            <Switch
              on={d.active}
              label="Show to engineers"
              yes="In every parameter list."
              no="Hidden from the lists. Anything already recorded keeps working."
              onToggle={() => set({ active: !d.active })}
            />
          </div>
        </div>

        {/* ── what every lab reads ── */}
        <div className="pane">
          <p className="everylab">Changes on this side apply to every lab.</p>

          <Suggest
            id="ed-group"
            label="Group"
            value={d.category}
            options={groups}
            onChange={(v) => set({ category: v })}
            badge={groupIsNew ? <span className="fresh">new</span> : null}
            hint={
              groupIsNew
                ? `“${d.category.trim()}” is new — it appears with this type in it.`
                : 'Which heading it sits under. Nothing else reads it.'
            }
          />

          <Suggest
            id="ed-quantity"
            label="Quantity"
            value={d.measures}
            options={quantities}
            onChange={(v) => set({ measures: v })}
          />

          <div className="f">
            <span className="k">Variant</span>
            <div className="sidebyside">
              <input
                type="text"
                value={d.kind}
                placeholder="none"
                disabled={d.anyKind}
                autoComplete="off"
                list="ed-variants"
                onChange={(e) => set({ kind: e.target.value })}
              />
              <label className="ck">
                <input
                  type="checkbox"
                  checked={d.anyKind}
                  onChange={(e) => set({ anyKind: e.target.checked })}
                />{' '}
                no particular variant
              </label>
            </div>
            <datalist id="ed-variants">
              {variants.map((v) => (
                <option key={v} value={v} />
              ))}
            </datalist>
            {moved ? (
              <p className="refuse">
                {Icon.warn}
                <span>
                  Re-pairs what this parameter can be served by.{' '}
                  {instruments ? (
                    <>
                      <b>{instruments}</b> master {instruments === 1 ? 'instrument is' : 'instruments are'}{' '}
                      recorded against it.
                    </>
                  ) : (
                    'Nothing is recorded against it yet, so nothing moves today.'
                  )}
                </span>
              </p>
            ) : (
              <span className="hint">
                Together with the quantity, what pairs a certificate with an instrument that can
                serve it.
              </span>
            )}
          </div>

          <div className="f">
            <span className="k">Subtypes</span>
            <Chips
              id="ed-sub"
              values={d.subtypes}
              placeholder={d.subtypes.length ? 'add…' : 'Type K, Pt-100…'}
              onAdd={(v) => set({ subtypes: [...d.subtypes, v] })}
              onRemove={(v) => set({ subtypes: d.subtypes.filter((x) => x !== v) })}
            />
          </div>

          <div className="f">
            <span className="k">Also matches</span>
            <Chips
              id="ed-alias"
              values={d.aliases}
              placeholder={d.aliases.length ? 'add…' : 'older names…'}
              onAdd={(v) => set({ aliases: [...d.aliases, v] })}
              onRemove={(v) => set({ aliases: d.aliases.filter((x) => x !== v) })}
            />
            <span className="hint">Older names that should still find this.</span>
          </div>

          <p className="prov">{p.source} · seed 1.0</p>
        </div>
      </div>

      {error ? (
        <div style={{ padding: '0 16px 12px' }}>
          <p className="refuse">
            {Icon.warn}
            <span>{error}</span>
          </p>
        </div>
      ) : null}

      <div className="edfoot">
        <span className="sent">
          {!changed.any ? (
            <span className="dim">Nothing changed yet.</span>
          ) : changed.shared ? (
            <>
              Saves for <b>every lab</b> — the right-hand side is shared.
            </>
          ) : (
            <>
              Saves for <b>this lab only</b>.
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
            disabled={!changed.any || saving}
            style={!changed.any || saving ? { opacity: 0.45 } : undefined}
            onClick={onSave}
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </span>
      </div>
    </div>
  )
}
