'use client'

/**
 * A parameter the registry has never heard of.
 *
 * The seed script runs at deploy and takes what the master registry holds, so a
 * lab that starts calibrating something new between deploys had no way in. This
 * is that way in, and it asks for more than a name on purpose.
 *
 * A type carries `measures` and `kind`, and those are what pair a certificate
 * with an instrument that can serve it. One made from a name alone would sit in
 * every list and match nothing - which looks like nothing going wrong until a
 * certificate cannot find a standard. So the form offers the words already in
 * use rather than a blank box, and the line above the buttons says what the new
 * type will and will not pair with before it is saved.
 *
 * There is no separate way in for a group. A group is the `category` label on a
 * type, not a record, so naming a new one here files the first type into it.
 */

import { Chips, Icon, Suggest } from './Bits'
import { flat, type NewParameter, type Parameter } from './registry'

export default function NewParameterForm({
  draft,
  set,
  all,
  groups,
  quantities,
  variants,
  saving,
  error,
  onCancel,
  onSave,
}: {
  draft: NewParameter
  set: (patch: Partial<NewParameter>) => void
  all: Parameter[]
  groups: string[]
  quantities: string[]
  variants: string[]
  saving: boolean
  error: string | null
  onCancel: () => void
  onSave: () => void
}) {
  const d = draft
  const name = d.standardName.trim()
  const quantity = d.measures.trim().toLowerCase()
  const kind = d.anyKind ? 'any' : d.kind.trim().toLowerCase()

  const groupIsNew = Boolean(d.category.trim()) && !groups.some((g) => flat(g) === flat(d.category))
  const quantityIsNew = Boolean(quantity) && !quantities.includes(quantity)
  // standardName is unique across every lab, so this is checked here and again
  // by the endpoint, which can see rows this lab cannot.
  const clash = all.find((p) => flat(p.standardName) === flat(name) && name !== '')
  const ready = Boolean(name && !clash && d.category.trim() && quantity && (d.anyKind || d.kind.trim()))

  /* What the new type will pair with, said before saving rather than after. */
  const twins = quantity ? all.filter((p) => p.measures === quantity && p.kind === kind) : []
  const reach = twins.reduce((n, p) => n + (p.instruments ?? 0), 0)

  return (
    <section className="card new">
      <div className="newhead">
        <span className="lbl">New parameter type</span>
        <span className="why">
          Goes into the shared registry — every lab gets it, and can then rename it for themselves.
        </span>
      </div>

      <div className="newgrid">
        <div className="pane">
          <div className="f">
            <span className="k">Name</span>
            <input
              type="text"
              value={d.standardName}
              placeholder="Torque (Static)"
              autoComplete="off"
              autoFocus
              onChange={(e) => set({ standardName: e.target.value })}
            />
            {clash ? (
              <p className="refuse" style={{ marginTop: 7 }}>
                {Icon.warn}
                <span>
                  <b>{name}</b> is already in the register.
                </span>
              </p>
            ) : null}
          </div>

          <Suggest
            id="new-group"
            label="Group"
            value={d.category}
            options={groups}
            placeholder="Mechanical"
            onChange={(v) => set({ category: v })}
            badge={groupIsNew ? <span className="fresh">new</span> : null}
            hint={
              groupIsNew
                ? `“${d.category.trim()}” is new — it appears with this type in it.`
                : 'Pick one, or type a new name.'
            }
          />

          <Suggest
            id="new-quantity"
            label="Quantity"
            value={d.measures}
            options={quantities}
            placeholder="torque"
            onChange={(v) => set({ measures: v })}
            badge={quantityIsNew ? <span className="fresh">new</span> : null}
            hint="The physical quantity. Reuse one from the list where you can."
          />

          <div className="f">
            <span className="k">Variant</span>
            <div className="sidebyside">
              <input
                type="text"
                value={d.kind}
                placeholder="static"
                disabled={d.anyKind}
                autoComplete="off"
                list="new-variants"
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
            <datalist id="new-variants">
              {variants.map((v) => (
                <option key={v} value={v} />
              ))}
            </datalist>
            <span className="hint">Which sort of it — dc against ac, gauge against absolute.</span>
          </div>
        </div>

        <div className="pane">
          <div className="f">
            <span className="k">Units</span>
            <Chips
              id="new-unit"
              values={d.units}
              highlight={d.defaultUnit}
              placeholder={d.units.length ? 'add a unit…' : 'Nm, then enter…'}
              onAdd={(u) => set({ units: [...d.units, u], defaultUnit: d.defaultUnit ?? u })}
              onRemove={(u) => {
                const next = d.units.filter((x) => x !== u)
                set({ units: next, defaultUnit: d.defaultUnit === u ? (next[0] ?? null) : d.defaultUnit })
              }}
            />
          </div>

          {d.units.length > 1 ? (
            <div className="f">
              <span className="k">Default unit</span>
              <div className="chips">
                {d.units.map((u) => (
                  <button
                    key={u}
                    type="button"
                    className={'u' + (u === d.defaultUnit ? ' def' : '')}
                    onClick={() => set({ defaultUnit: u })}
                  >
                    {u}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="f">
            <span className="k">
              Subtypes <span className="opt">optional</span>
            </span>
            <Chips
              id="new-sub"
              values={d.subtypes}
              placeholder={d.subtypes.length ? 'add…' : 'Type K, Pt-100…'}
              onAdd={(v) => set({ subtypes: [...d.subtypes, v] })}
              onRemove={(v) => set({ subtypes: d.subtypes.filter((x) => x !== v) })}
            />
          </div>

          <div className="f">
            <span className="k">
              Also matches <span className="opt">optional</span>
            </span>
            <Chips
              id="new-alias"
              values={d.aliases}
              placeholder={d.aliases.length ? 'add…' : 'names on older certificates…'}
              onAdd={(v) => set({ aliases: [...d.aliases, v] })}
              onRemove={(v) => set({ aliases: d.aliases.filter((x) => x !== v) })}
            />
            <span className="hint">Older names that should still find this.</span>
          </div>
        </div>
      </div>

      <div style={{ padding: '0 16px 14px' }}>
        {!quantity ? (
          <p className="verdict hold">Fill in the quantity to see what this pairs with.</p>
        ) : twins.length ? (
          <p className="verdict good">
            {Icon.tick}
            <span>
              Pairs with <b>{twins.map((x) => x.standardName).join(', ')}</b> — {reach} master{' '}
              {reach === 1 ? 'instrument' : 'instruments'} already recorded that way.
            </span>
          </p>
        ) : (
          <p className="verdict warn">
            {Icon.warn}
            <span>
              Nothing else measures{' '}
              <b>
                {quantity}
                {kind === 'any' ? '' : ` · ${kind}`}
              </b>{' '}
              yet, so no master instrument can serve it until one is recorded against it. That is
              fine for something genuinely new — and a sign of a typo if it was meant to join
              something that already exists.
            </span>
          </p>
        )}
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
          {ready ? (
            <>
              Adds <b>{name}</b> to {groupIsNew ? 'a new group, ' : ''}the shared registry.
            </>
          ) : (
            <span className="dim">Name, group and quantity are needed.</span>
          )}
        </span>
        <span className="sp">
          <button type="button" className="btn ghost" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={!ready || saving}
            style={!ready || saving ? { opacity: 0.45 } : undefined}
            onClick={onSave}
          >
            {saving ? 'Adding…' : 'Add to the registry'}
          </button>
        </span>
      </div>
    </section>
  )
}
