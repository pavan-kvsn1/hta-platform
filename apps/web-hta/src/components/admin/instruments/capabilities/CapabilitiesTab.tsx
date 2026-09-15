'use client'

/**
 * What this instrument can measure or source.
 *
 * One pane per component, read off the capabilities themselves, plus one for
 * anything that belongs to the instrument rather than to a component. A Fluke
 * 754 with two pressure modules is three panes; the modules carry their own
 * serials and their own certificates, which is the case the component model
 * exists for.
 *
 * A capability's ranges hang off its subtypes when it has them and off the
 * capability itself when it does not, so everything that reads ranges goes
 * through rowsOf and the two can never disagree.
 *
 * The card reads; it does not edit. Every way in is the pencil on its row,
 * which opens the one form that can ask for a unit, a range and an accuracy
 * together - so there is no second place where half a capability can be made.
 */

import { useCallback, useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { apiFetch } from '@/lib/api-client'
import { CALIBRATION_PARAMETERS } from '@/lib/calibration-parameters'
import { Icon } from '../Icons'
import AccuracyCell, { type BucketAccuracy } from './AccuracyCell'
import CapabilityForm, {
  blankDraft,
  bucketBody,
  draftFrom,
  type CapabilityDraft,
  type RangeRow,
} from './CapabilityForm'

export interface Bucket extends BucketAccuracy {
  id: string
  bucketKey: string
  min: number | null
  max: number | null
  minInclusive: boolean
  maxInclusive: boolean
  leastCountValue: number | null
  leastCountUnit: string | null
}

export interface Subtype {
  id: string
  subtypeKey: string
  min: number | null
  max: number | null
  buckets: Bucket[]
}

export interface Profile {
  id: string
  profileKey: string
  parameter: string
  role: string
  unit: string | null
  min: number | null
  max: number | null
  subtypeKind: string | null
  sopReferences: string[]
  componentId: string | null
  subtypes: Subtype[]
  buckets: Bucket[]
}

export interface Component {
  id: string
  componentKey: string
  name: string
  make: string | null
  model: string | null
  serialNumber: string | null
}

/** Every bucket a capability holds, wherever it hangs. */
export const rowsOf = (p: Profile): Bucket[] =>
  p.subtypes.length ? p.subtypes.flatMap((s) => s.buckets) : p.buckets

const roleWord = (r: string) => (r || '').toLowerCase().replace(/_/g, ' ')

function RangeTable({ rows, unit }: { rows: Bucket[]; unit: string | null }) {
  if (!rows.length) return <p className="norows">No ranges declared yet.</p>
  return (
    <div className="tablewrap">
      <table>
        <thead>
          <tr>
            <th style={{ width: 34 }}>#</th>
            <th style={{ textAlign: 'right' }}>From</th>
            <th style={{ textAlign: 'right' }}>To</th>
            <th>Least Count</th>
            <th>Accuracy</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((b, i) => (
            <tr key={b.id}>
              <td className="n">{i + 1}</td>
              <td className="num rt">
                {/* A bucket that starts above its lower bound rather than at it. */}
                {!b.minInclusive ? (
                  <span className="excl" title="starts above this value">
                    ▸
                  </span>
                ) : null}
                {b.min ?? '—'}
              </td>
              <td className="num rt">{b.max ?? '—'}</td>
              <td className="num">
                {b.leastCountValue !== null ? (
                  `${b.leastCountValue}${b.leastCountUnit ? ` ${b.leastCountUnit}` : ''}`
                ) : (
                  // Not the same as zero: the certificate simply did not state one.
                  <span className="undecl">not declared</span>
                )}
              </td>
              <td>
                <AccuracyCell bucket={b} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function CapabilitiesTab({
  instrumentId,
  sopReferences = [],
  seed = null,
  onSeedUsed,
}: {
  instrumentId: string
  /** The procedures the instrument holds, offered against each capability. */
  sopReferences?: string[]
  /** A capability ticked in Basic Info and not yet declared. */
  seed?: { componentId: string; parameter: string; role: string } | null
  onSeedUsed?: () => void
}) {
  const [profiles, setProfiles] = useState<Profile[] | null>(null)
  const [components, setComponents] = useState<Component[]>([])
  /** Which capabilities have a certificate in force, so a card can say so. */
  const [certified, setCertified] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [shut, setShut] = useState<Set<string>>(() => new Set())
  const [open, setOpen] = useState<string | null>(null)

  // The form, when one is open. `editing` is the profile it is changing, or null
  // for a new one.
  const [draft, setDraft] = useState<CapabilityDraft | null>(null)
  const [editing, setEditing] = useState<Profile | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await apiFetch(`/api/admin/instruments/${instrumentId}/capabilities`)
      if (!res.ok) {
        setError(`Could not load the capabilities (error ${res.status}).`)
        return
      }
      const d = await res.json()
      setProfiles(d.profiles ?? [])
      setComponents(d.components ?? [])
    } catch {
      setError('Could not reach the server.')
      return
    }

    // Separately, and quietly: a card that cannot say whether it is certified is
    // worse than one that says nothing, but it is not worth failing the tab for.
    try {
      const res = await apiFetch(`/api/admin/instruments/${instrumentId}/certificates`)
      if (!res.ok) return
      const list: { capabilityProfileId: string | null; isActive: boolean; validUntil: string | null }[] =
        (await res.json()).certificates ?? []
      const map: Record<string, string> = {}
      for (const c of list) {
        if (c.isActive && c.capabilityProfileId) map[c.capabilityProfileId] = c.validUntil ?? ''
      }
      setCertified(map)
    } catch {
      /* the cards simply do not mention certification */
    }
  }, [instrumentId])

  useEffect(() => {
    void load()
  }, [load])

  // A capability arriving from Basic Info opens the form already filled in as far
  // as the tick could fill it.
  useEffect(() => {
    if (!seed || draft) return
    setEditing(null)
    setDraft({
      ...blankDraft(),
      componentId: seed.componentId,
      partChosen: true,
      role: seed.role,
      parameter: seed.parameter,
    })
    onSeedUsed?.()
  }, [seed, draft, onSeedUsed])

  /**
   * Saves the capability, then its subtypes, then its buckets.
   *
   * A range has to hang off something, so the profile is written first and its
   * id used for the rest. Subtypes and buckets are replaced rather than
   * reconciled: the form holds the whole set, so the shortest correct path is
   * to clear what the capability had and write what the form says. Nothing
   * outside this capability is touched.
   */
  const save = async () => {
    if (!draft) return
    setSaving(true)
    setError(null)

    const call = async (path: string, method: string, body?: unknown) => {
      const res = await apiFetch(`/api/admin/instruments/${instrumentId}${path}`, {
        method,
        ...(body === undefined
          ? {}
          : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => null)
        throw new Error(b?.error || `${method} ${path} failed (error ${res.status})`)
      }
      return res.status === 204 ? null : await res.json().catch(() => null)
    }

    try {
      const profileBody = {
        parameter: draft.parameter.trim(),
        role: draft.role,
        unit: draft.unit.trim(),
        componentId: draft.componentId,
        min: draft.subs
          ? Math.min(...draft.subtypes.map((s) => Number(s.from)).filter((n) => !Number.isNaN(n)))
          : draft.min === ''
            ? null
            : Number(draft.min),
        max: draft.subs
          ? Math.max(...draft.subtypes.map((s) => Number(s.to)).filter((n) => !Number.isNaN(n)))
          : draft.max === ''
            ? null
            : Number(draft.max),
        sopReferences: draft.sopReferences,
      }

      const saved = editing
        ? await call(`/capabilities/${editing.id}`, 'PATCH', profileBody)
        : await call('/capabilities', 'POST', profileBody)
      const profileId: string = saved?.profile?.id ?? saved?.id ?? editing?.id
      if (!profileId) throw new Error('The server did not say which capability it saved.')

      // Clear what it had, so what the form shows is what it ends up with.
      if (editing) {
        for (const s of editing.subtypes) {
          await call(`/capabilities/${profileId}/subtypes/${s.id}`, 'DELETE')
        }
        for (const b of editing.buckets) {
          await call(`/capabilities/${profileId}/buckets/${b.id}`, 'DELETE')
        }
      }

      // A row nobody typed a bound into is not a range.
      const usable = (rows: RangeRow[]) => rows.filter((r) => r.from !== '' || r.to !== '')

      if (draft.subs) {
        for (const [i, s] of draft.subtypes.entries()) {
          const made = await call(`/capabilities/${profileId}/subtypes`, 'POST', {
            subtypeKey: s.name.trim() || `Subtype ${i + 1}`,
            min: s.from === '' ? null : Number(s.from),
            max: s.to === '' ? null : Number(s.to),
          })
          const subtypeId: string | undefined = made?.subtype?.id ?? made?.id
          for (const [j, r] of usable(s.rows).entries()) {
            await call(`/capabilities/${profileId}/buckets`, 'POST', {
              ...bucketBody(r, draft.unit.trim(), j),
              subtypeId,
            })
          }
        }
      } else {
        for (const [j, r] of usable(draft.rows).entries()) {
          await call(`/capabilities/${profileId}/buckets`, 'POST', bucketBody(r, draft.unit.trim(), j))
        }
      }

      setDraft(null)
      setEditing(null)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the capability.')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (pr: Profile) => {
    const n = rowsOf(pr).length
    if (
      !window.confirm(
        `Remove ${pr.profileKey} ${pr.parameter}?` +
          (n ? ` Its ${n} range${n === 1 ? '' : 's'} and their accuracies go with it.` : ''),
      )
    )
      return
    setError(null)
    try {
      const res = await apiFetch(`/api/admin/instruments/${instrumentId}/capabilities/${pr.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const b = await res.json().catch(() => null)
        setError(b?.error || `Could not remove the capability (error ${res.status}).`)
        return
      }
      await load()
    } catch {
      setError('Could not reach the server.')
    }
  }

  if (error && !profiles) {
    return (
      <div className="card sec">
        <p style={{ margin: 0, color: 'var(--crit-tx)' }}>{error}</p>
      </div>
    )
  }
  if (!profiles) {
    return (
      <div className="card sec" style={{ display: 'grid', placeItems: 'center', minHeight: 120 }}>
        <Loader2 className="size-5 animate-spin text-[#94a3b8]" />
      </div>
    )
  }

  if (draft) {
    return (
      <>
        {error && (
          <div className="card sec" style={{ borderColor: 'var(--crit-br)', background: 'var(--crit-bg)' }}>
            <p style={{ margin: 0, color: 'var(--crit-tx)' }}>{error}</p>
          </div>
        )}
        <CapabilityForm
          draft={draft}
          set={(patch) => setDraft((d) => (d ? { ...d, ...patch } : d))}
          components={components}
          profiles={profiles}
          editingKey={editing ? editing.profileKey : null}
          parameters={[...CALIBRATION_PARAMETERS]}
          sops={sopReferences}
          saving={saving}
          onCancel={() => {
            setDraft(null)
            setEditing(null)
          }}
          onSave={() => void save()}
        />
      </>
    )
  }

  const groups = components.map((c) => ({
    key: c.id,
    label: c.name,
    sub: [c.model, c.serialNumber].filter(Boolean).join(' · ') || null,
    items: profiles.filter((p) => p.componentId === c.id),
  }))
  const loose = profiles.filter((p) => !p.componentId || !components.some((c) => c.id === p.componentId))
  if (loose.length || !components.length) {
    groups.unshift({ key: 'whole', label: 'The instrument as a whole', sub: null, items: loose })
  }

  const totalRows = profiles.reduce((n, p) => n + rowsOf(p).length, 0)
  const toggle = (key: string) =>
    setShut((s) => {
      const next = new Set(s)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  return (
    <>
      {error && (
        <div className="card sec" style={{ borderColor: 'var(--crit-br)', background: 'var(--crit-bg)' }}>
          <p style={{ margin: 0, color: 'var(--crit-tx)' }}>{error}</p>
        </div>
      )}

      <div className="toolbar">
        <button
          type="button"
          className="tbtn solid"
          onClick={() => {
            setEditing(null)
            setDraft(blankDraft())
          }}
        >
          <Icon.plus /> Add Capability
        </button>
        <button
          type="button"
          className="tbtn"
          onClick={() => {
            setShut(new Set(groups.map((g) => g.key)))
            setOpen(null)
          }}
        >
          Collapse All
        </button>
        <button type="button" className="tbtn" onClick={() => setShut(new Set())}>
          Expand All
        </button>
        <span className="meta">
          {profiles.length} capabilit{profiles.length === 1 ? 'y' : 'ies'} · {totalRows} range
          {totalRows === 1 ? '' : 's'} · {components.length} component{components.length === 1 ? '' : 's'}
        </span>
      </div>

      {groups.map((g) => {
        const isOpen = !shut.has(g.key)
        return (
          <section className={'pane part' + (g.items.length ? '' : ' bare')} key={g.key}>
            <button type="button" className="panehead" aria-expanded={isOpen} onClick={() => toggle(g.key)}>
              <span className="cv">{isOpen ? '▾' : '▸'}</span>
              <span className="pt">{g.label}</span>
              {g.sub ? <span className="ps mono">{g.sub}</span> : null}
              <span className="pn">{g.items.length}</span>
            </button>

            {isOpen && (
              <div className="panebody">
                {g.items.length === 0 && (
                  <p className="paneempty">
                    Nothing declared against {g.label} yet.{' '}
                    <button
                      type="button"
                      className="link"
                      onClick={() => {
                        setEditing(null)
                        setDraft({ ...blankDraft(), componentId: g.key === 'whole' ? null : g.key })
                      }}
                    >
                      Declare a capability
                    </button>
                  </p>
                )}

                {g.items.map((pr) => {
                  const rows = rowsOf(pr)
                  const cardOpen = open === pr.id
                  const noLeastCount = rows.filter((b) => b.leastCountValue === null).length
                  return (
                    <div className={'card prof' + (cardOpen ? ' open' : '')} key={pr.id}>
                      <div className="profrow">
                        <button
                          type="button"
                          className="profhead"
                          onClick={() => setOpen(cardOpen ? null : pr.id)}
                        >
                          <span style={{ color: 'var(--faint)' }}>
                            {cardOpen ? <Icon.down /> : <Icon.right />}
                          </span>
                          <span className="idx">{pr.profileKey}</span>
                          <span className="nm">
                            {pr.parameter} <span className="role">({roleWord(pr.role)})</span>
                          </span>
                          <span className="cnt">
                            {pr.subtypes.length ? `${pr.subtypes.length} subtypes · ` : ''}
                            {rows.length} range{rows.length === 1 ? '' : 's'}
                            {' · '}
                            {pr.id in certified ? (
                              'certified'
                            ) : (
                              <span style={{ color: 'var(--warn-tx)' }}>no certificate</span>
                            )}
                            {noLeastCount ? (
                              <>
                                {' · '}
                                <span style={{ color: 'var(--warn-tx)' }}>
                                  {noLeastCount} without a least count
                                </span>
                              </>
                            ) : null}
                          </span>
                        </button>
                        <span className="profacts">
                          <button
                            type="button"
                            className="iconbtn"
                            aria-label={`Edit ${pr.parameter}`}
                            onClick={() => {
                              setEditing(pr)
                              setDraft(draftFrom(pr))
                            }}
                          >
                            <Icon.pen />
                          </button>
                          <button
                            type="button"
                            className="iconbtn del"
                            aria-label={`Delete ${pr.parameter}`}
                            onClick={() => void remove(pr)}
                          >
                            <Icon.bin />
                          </button>
                        </span>
                      </div>

                      {cardOpen && (
                        <div className="profbody">
                          <div className="attrs">
                            <span className="attr">
                              Parameter <b>{pr.parameter}</b>
                            </span>
                            <span className="attr">
                              Role <b>{roleWord(pr.role)}</b>
                            </span>
                            <span className="attr">
                              Unit <b>{pr.unit ?? '—'}</b>
                            </span>
                            <span className="attr">
                              Operating range{' '}
                              <b>
                                {pr.min ?? '—'} to {pr.max ?? '—'}
                              </b>
                            </span>
                            <span className="attr">
                              Belongs to <b>{g.key === 'whole' ? 'the instrument' : g.label}</b>
                            </span>
                          </div>

                          <div className="subhead" style={{ marginTop: 12 }}>
                            <span className="lbl">Procedures</span>
                          </div>
                          <div className="chips">
                            {pr.sopReferences.length ? (
                              pr.sopReferences.map((s) => (
                                <span className="chip" key={s}>
                                  <span className="mono">{s}</span>
                                </span>
                              ))
                            ) : (
                              <span className="undecl">
                                No procedure applies to this capability. An engineer calibrating
                                against it has none to follow.
                              </span>
                            )}
                          </div>

                          {pr.subtypes.length ? (
                            <>
                              <div className="subhead">
                                <span className="lbl">
                                  {pr.subtypeKind ? pr.subtypeKind.toLowerCase() : 'Subtypes'}
                                </span>
                              </div>
                              <div className="chips" style={{ marginBottom: 4 }}>
                                {pr.subtypes.map((s) => (
                                  <span className={'chip' + (s.buckets.length ? ' on' : '')} key={s.id}>
                                    {s.subtypeKey}
                                  </span>
                                ))}
                              </div>
                              {pr.subtypes.map((s) => (
                                <div className="sub" key={s.id}>
                                  <div className="subtop">
                                    <span className="nm">{s.subtypeKey}</span>
                                    <span className="rg mono">
                                      {s.min ?? '—'} to {s.max ?? '—'} {pr.unit}
                                    </span>

                                  </div>
                                  <p className="lbl" style={{ display: 'block', marginBottom: 5 }}>
                                    Range buckets:
                                  </p>
                                  <RangeTable rows={s.buckets} unit={pr.unit} />
                                </div>
                              ))}
                            </>
                          ) : (
                            <>
                              <div className="subhead">
                                <span className="lbl">Range buckets</span>
                              </div>
                              <RangeTable rows={pr.buckets} unit={pr.unit} />
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        )
      })}
    </>
  )
}
