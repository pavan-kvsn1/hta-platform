'use client'

/**
 * The parts this instrument is made of.
 *
 * A Fluke 754 with two pressure modules is three components, each with its own
 * model and serial and its own certificates. Make is not a column: of 212 units
 * in the registry exactly one records a different make per part, so the column
 * would be empty 211 times.
 *
 * The edit row is two lines, both placed rather than left to flow, so neither
 * ends in a gap:
 *
 *   [ 1 ] [ Component Name .......... ] [ Model ] [ Serial Part No. ..... ]
 *         [ Capabilities ............ ] [ Role ...................... ]
 *
 * Adding and editing ask the same questions, so there is one form for one
 * thing. The single difference is Role: on a component being created there are
 * no capabilities to read it off, so it is a choice; on one that already has
 * some it is derived, because setting it by hand could contradict them.
 *
 * A tick is not a capability. Ticking one hands off to the capability form,
 * which is where a unit, a range and an accuracy get asked for.
 */

import { useState } from 'react'
import { CALIBRATION_PARAMETERS } from '@/lib/calibration-parameters'
import { Icon } from '../Icons'
import CapabilityPicker from './CapabilityPicker'
import type { Component, Profile } from '../capabilities/CapabilitiesTab'

interface Identity {
  name: string
  model: string
  serialNumber: string
}

interface Draft extends Identity {
  /** What the component will carry once saved. */
  caps: string[]
  /** What it carries now, so additions and removals can be told apart. */
  had: string[]
  roles: string[]
}

const roleWord = (r: string) => r.toLowerCase().replace(/_/g, ' ')
const blank = (): Draft => ({ name: '', model: '', serialNumber: '', caps: [], had: [], roles: [] })

export default function ComponentsTable({
  components,
  profiles,
  busy,
  onAdd,
  onSave,
  onDelete,
  onDeclare,
}: {
  components: Component[]
  profiles: Profile[]
  busy: boolean
  /** Returns the new component's id, or null if the server refused. */
  onAdd: (d: Identity) => Promise<string | null>
  /** Identity changes plus the parameters taken off the component. */
  onSave: (id: string, d: Identity, removed: string[]) => Promise<boolean>
  onDelete: (c: Component) => Promise<void>
  /** Hand a newly ticked capability to the form that can finish it. */
  onDeclare: (componentId: string, parameter: string, role: string) => void
}) {
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft>(blank)

  const paramsOn = (id: string) => [
    ...new Set(profiles.filter((p) => p.componentId === id).map((p) => p.parameter)),
  ]
  const rolesOn = (id: string) => [
    ...new Set(profiles.filter((p) => p.componentId === id).map((p) => roleWord(p.role))),
  ]

  const startAdd = () => {
    setDraft(blank())
    setEditing(null)
    setAdding((a) => !a)
  }
  const startEdit = (c: Component) => {
    const had = paramsOn(c.id)
    setDraft({
      name: c.name,
      model: c.model ?? '',
      serialNumber: c.serialNumber ?? '',
      caps: [...had],
      had,
      roles: rolesOn(c.id),
    })
    setAdding(false)
    setEditing(c.id)
  }
  const close = () => {
    setAdding(false)
    setEditing(null)
    setDraft(blank())
  }

  const identity = (d: Draft): Identity => ({
    name: d.name.trim(),
    model: d.model.trim(),
    serialNumber: d.serialNumber.trim(),
  })

  const commitEdit = async (c: Component) => {
    const removed = draft.had.filter((x) => !draft.caps.includes(x))
    const added = draft.caps.filter((x) => !draft.had.includes(x))

    if (
      removed.length &&
      !window.confirm(
        `Take ${removed.join(' and ')} off ${draft.name}? ` +
          'Their ranges, accuracies and SOP references go with them.',
      )
    )
      return

    const ok = await onSave(c.id, identity(draft), removed)
    if (!ok) return

    // A capability is a unit, a range and an accuracy, none of which a tick can
    // give. The first new one gets the form that can ask for them.
    if (added.length) {
      onDeclare(c.id, added[0], draft.roles[0] ? draft.roles[0].toUpperCase() : 'MEASURING')
      return
    }
    close()
  }

  const text = (k: keyof Identity, label: string, placeholder: string, cls: string) => (
    <div className={`f ${cls}`}>
      <span className="k">{label}</span>
      <input
        value={draft[k]}
        placeholder={placeholder}
        autoFocus={k === 'name'}
        onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
      />
    </div>
  )

  /**
   * Derived when the component already has capabilities to read a role off, a
   * choice when it does not. Ticking it on a component that has some could
   * contradict them, so there it only reports.
   */
  const roleBox = (derived: boolean) => (
    <div className="f prole">
      <span className="k">Role</span>
      <div className="rolebox">
        {(['measuring', 'source'] as const).map((r) => (
          <label className="ck" key={r}>
            <input
              type="checkbox"
              checked={draft.roles.includes(r)}
              disabled={derived}
              readOnly={derived}
              onChange={
                derived
                  ? undefined
                  : () =>
                      setDraft((d) => ({
                        ...d,
                        roles: d.roles.includes(r) ? d.roles.filter((x) => x !== r) : [...d.roles, r],
                      }))
              }
            />{' '}
            {r}
          </label>
        ))}
      </div>
    </div>
  )

  const picker = (
    <CapabilityPicker
      parameters={[...CALIBRATION_PARAMETERS]}
      selected={draft.caps}
      declared={draft.had}
      onToggle={(x) =>
        setDraft((d) => ({
          ...d,
          caps: d.caps.includes(x) ? d.caps.filter((y) => y !== x) : [...d.caps, x],
        }))
      }
      onDrop={(x) => setDraft((d) => ({ ...d, caps: d.caps.filter((y) => y !== x) }))}
    />
  )

  const commitAdd = async () => {
    const id = await onAdd(identity(draft))
    if (!id) return
    // Same hand-off as an edit: a tick cannot supply a unit, a range and an
    // accuracy, so the first new one goes to the form that asks for them.
    if (draft.caps.length) {
      onDeclare(id, draft.caps[0], draft.roles[0] ? draft.roles[0].toUpperCase() : 'MEASURING')
      return
    }
    close()
  }

  const identityFields = (
    <>
      {text('name', 'Component Name', 'Indicator, Pressure Module…', 'pname')}
      {text('model', 'Model Part No.', 'optional', 'pmodel')}
      {text('serialNumber', 'Serial Part No.', 'optional', 'pserial')}
    </>
  )

  const buttons = (onCommit: () => void, label: string) => (
    <div className="fbtns">
      <button type="button" className="btn ghost" onClick={close} disabled={busy}>
        Cancel
      </button>
      <button type="button" className="btn primary" disabled={busy || !draft.name.trim()} onClick={onCommit}>
        {busy ? 'Saving…' : label}
      </button>
    </div>
  )

  return (
    <>
      <div className="subhead">
        <span className="lbl">
          Components{' '}
          <span
            style={{ fontFamily: 'var(--sans)', textTransform: 'none', letterSpacing: 0, color: 'var(--muted)' }}
          >
            · {components.length} part{components.length === 1 ? '' : 's'}
          </span>
        </span>
        <button type="button" className="link" onClick={startAdd}>
          <Icon.plus /> Add component
        </button>
      </div>

      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 38 }}>Sl.</th>
              <th>Component Name</th>
              <th>Model Part No.</th>
              <th>Serial Part No.</th>
              <th>Capability</th>
              <th>Role</th>
              <th style={{ width: 52, textAlign: 'center' }}>Edit</th>
              <th style={{ width: 58, textAlign: 'center' }}>Delete</th>
            </tr>
          </thead>
          <tbody>
            {adding && (
              <tr className="formrow">
                <td colSpan={8}>
                  <div className="prow part">
                    {identityFields}
                    {picker}
                    {roleBox(false)}
                    {buttons(() => void commitAdd(), 'Add')}
                  </div>
                  <p className="fnote">
                    Tick what this component measures or sources. On save, the first capability
                    opens the capability form so its unit, range and accuracy can be recorded — a
                    tick on its own does not make a capability. Leave them all unticked to record
                    the part and declare its capabilities later.
                  </p>
                </td>
              </tr>
            )}

            {components.map((c, i) => {
              const mine = paramsOn(c.id)
              const roles = rolesOn(c.id)

              if (editing === c.id) {
                return (
                  <tr className="formrow" key={c.id}>
                    <td colSpan={8}>
                      <div className="prow part">
                        <div className="sl">{i + 1}</div>
                        {identityFields}

                        {picker}

                        {roleBox(true)}

                        {buttons(() => void commitEdit(c), 'Save')}
                      </div>
                      <p className="fnote">
                        Tick what this component measures or sources. On save, anything newly ticked
                        opens the capability form so its unit, range and accuracy can be recorded;
                        anything unticked comes off the component. Role follows the capabilities
                        declared, so it is not set here.
                      </p>
                    </td>
                  </tr>
                )
              }

              return (
                <tr key={c.id}>
                  <td className="n">{i + 1}</td>
                  <td style={{ fontWeight: 500 }}>{c.name}</td>
                  <td className="num">{c.model || <span className="undecl">—</span>}</td>
                  <td className="num">{c.serialNumber || <span className="undecl">—</span>}</td>
                  <td>
                    {mine.length ? (
                      <>
                        {mine[0]}
                        {mine.length > 1 ? <span className="more"> +{mine.length - 1}</span> : null}
                      </>
                    ) : (
                      <span className="undecl">none yet</span>
                    )}
                  </td>
                  <td className="roles">
                    {roles.length ? (
                      <span className="rolewrap">
                        {roles.map((r) => (
                          <span className="rolechip" key={r}>
                            {r}
                          </span>
                        ))}
                      </span>
                    ) : (
                      <span className="undecl">—</span>
                    )}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <button type="button" className="iconbtn" aria-label={`Edit ${c.name}`} onClick={() => startEdit(c)}>
                      <Icon.pen />
                    </button>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <button
                      type="button"
                      className="iconbtn del"
                      aria-label={`Delete ${c.name}`}
                      onClick={() => void onDelete(c)}
                    >
                      <Icon.bin />
                    </button>
                  </td>
                </tr>
              )
            })}

            {components.length === 0 && !adding && (
              <tr>
                <td colSpan={8} className="paneempty" style={{ padding: '18px 14px' }}>
                  No components recorded. An instrument with separate parts — an indicator and its
                  modules — should list each one, because each carries its own serial and its own
                  certificates.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}
