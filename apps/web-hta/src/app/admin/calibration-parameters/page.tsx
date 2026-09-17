'use client'

/**
 * The parameter register.
 *
 * What this lab can calibrate, what it calls each one, and which units it
 * offers. Sixty rows in eight groups, which is not a list anybody reads flat,
 * so it is grouped and searchable and a row opens in place rather than in a
 * modal - the same shape the capability form on an instrument uses.
 *
 * Two layers sit behind every row. This lab owns the name, the unit list, the
 * default and whether the parameter appears at all; the shared standard holds
 * the group, the quantity, the variant and the older names. The editor keeps
 * them in separate columns and says which one a save will touch, because one is
 * invisible to other labs and the other is not.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import { apiFetch } from '@/lib/api-client'
import { Icon } from '@/components/admin/parameters/Bits'
import ParameterEditor from '@/components/admin/parameters/ParameterEditor'
import NewParameterForm from '@/components/admin/parameters/NewParameter'
import {
  blankNew,
  changedIn,
  draftOf,
  groupsIn,
  quantitiesIn,
  renamed,
  variantsIn,
  type Draft,
  type NewParameter,
  type Parameter,
} from '@/components/admin/parameters/registry'
import './parameter-register.css'

type Filter = 'all' | 'edited' | 'nounits' | 'off'

const FILTERS: [Filter, string][] = [
  ['all', 'All'],
  ['edited', 'Customised'],
  ['nounits', 'No units'],
  ['off', 'Switched off'],
]

export default function CalibrationParametersPage() {
  const [list, setList] = useState<Parameter[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [shut, setShut] = useState<Set<string>>(() => new Set())
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [adding, setAdding] = useState<NewParameter | null>(null)

  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')

  const load = useCallback(async () => {
    setError(null)
    try {
      // The counts come with it: this is the one screen that needs them, and a
      // second round trip to fill in a column would show the page twice.
      const res = await apiFetch('/api/calibration-parameters?includeInactive=true&withUsage=true')
      if (!res.ok) {
        setError(`Could not load the register (error ${res.status}).`)
        return
      }
      const body = (await res.json()) as { parameters?: Parameter[] }
      setList(body.parameters ?? [])
    } catch {
      setError('Could not reach the server.')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // `list ?? []` is a fresh array on every render, which would make every memo
  // below recompute for nothing.
  const all = useMemo(() => list ?? [], [list])
  const groups = useMemo(() => groupsIn(all), [all])
  const quantities = useMemo(() => quantitiesIn(all), [all])
  const variants = useMemo(() => variantsIn(all), [all])

  /* ── what the search and the filter leave ── */
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return all.filter((p) => {
      if (filter === 'edited' && !(renamed(p) || p.ownUnits)) return false
      if (filter === 'nounits' && p.units.length) return false
      if (filter === 'off' && p.active) return false
      if (!q) return true
      return [p.customName, p.standardName, p.measures, p.kind, ...p.units, ...p.aliases].some((s) =>
        String(s).toLowerCase().includes(q),
      )
    })
  }, [all, query, filter])

  const counts = useMemo(
    () => ({
      renamed: all.filter(renamed).length,
      own: all.filter((p) => p.ownUnits).length,
      off: all.filter((p) => !p.active).length,
      bare: all.filter((p) => !p.units.length).length,
    }),
    [all],
  )

  const open = (p: Parameter) => {
    setAdding(null)
    setSaveError(null)
    setEditing(p.id)
    setDraft(draftOf(p))
  }

  const close = () => {
    setEditing(null)
    setDraft(null)
    setSaveError(null)
  }

  /* ── saving an edit ── */
  const save = async () => {
    const p = all.find((x) => x.id === editing)
    if (!p || !draft) return
    const changed = changedIn(p, draft)
    setSaving(true)
    setSaveError(null)
    try {
      const body: Record<string, unknown> = {}
      if (draft.customName.trim() !== p.customName) body.customName = draft.customName.trim() || p.standardName
      if (draft.active !== p.active) body.active = draft.active
      if (JSON.stringify(draft.units) !== JSON.stringify(p.ownUnits ? p.units : null)) {
        // Null is "go back to the standard's", which the endpoint reads as an
        // empty list - the column means "whatever the standard offers" when bare.
        body.units = draft.units ?? []
        body.defaultUnit = draft.defaultUnit
      } else if (draft.defaultUnit !== (p.ownUnits ? p.defaultUnit : null)) {
        body.defaultUnit = draft.defaultUnit
      }
      if (changed.shared) {
        body.shared = {
          category: draft.category.trim(),
          measures: draft.measures.trim().toLowerCase(),
          kind: draft.anyKind ? 'any' : draft.kind.trim().toLowerCase(),
          aliases: draft.aliases,
          subtypes: draft.subtypes,
        }
      }

      const res = await apiFetch(`/api/calibration-parameters/${p.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => null)
        setSaveError(b?.message || b?.error || `Could not save (error ${res.status}).`)
        return
      }
      close()
      // Re-read rather than patch in place: a changed quantity moves the counts
      // on every parameter that shares it, not just this one.
      await load()
    } catch {
      setSaveError('Could not reach the server.')
    } finally {
      setSaving(false)
    }
  }

  /* ── adding one ── */
  const create = async () => {
    if (!adding) return
    setSaving(true)
    setSaveError(null)
    try {
      const res = await apiFetch('/api/calibration-parameters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          standardName: adding.standardName.trim(),
          category: adding.category.trim(),
          measures: adding.measures.trim().toLowerCase(),
          kind: adding.anyKind ? 'any' : adding.kind.trim().toLowerCase(),
          units: adding.units,
          defaultUnit: adding.defaultUnit,
          subtypes: adding.subtypes,
          aliases: adding.aliases,
        }),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => null)
        setSaveError(b?.message || b?.error || `Could not add it (error ${res.status}).`)
        return
      }
      const created = ((await res.json()) as { parameter?: Parameter }).parameter
      setAdding(null)
      setQuery('')
      setFilter('all')
      if (created) setShut((s) => new Set([...s].filter((g) => g !== created.category)))
      await load()
    } catch {
      setSaveError('Could not reach the server.')
    } finally {
      setSaving(false)
    }
  }

  /* ── the shell ── */
  if (!list && !error) {
    return (
      <div className="preg preg-fill">
        <div className="wrap">
          <p className="paneempty">
            <Loader2 className="size-4 animate-spin" style={{ display: 'inline', marginRight: 8 }} />
            Loading the register…
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="preg preg-fill">
      <div className="wrap">
        <div className="titlerow">
          <Link href="/admin/instruments" className="back">
            {Icon.left}
            Back to Instruments
          </Link>
          <span className="titlesep" />
          <h1>Parameter Register</h1>
          <span className="sub">what this lab calibrates, and what it calls it</span>
        </div>

        {error ? (
          <div className="card" style={{ borderColor: 'var(--crit-br)', background: 'var(--crit-bg)', padding: '13px 17px', marginBottom: 14 }}>
            <p style={{ margin: 0, color: 'var(--crit-tx)' }}>{error}</p>
          </div>
        ) : null}

        <div className="card sumbar">
          <div className="stat">
            <span className="k">Parameters</span>
            <span className="v">
              {all.length}
              <small>in {groups.length} groups</small>
            </span>
          </div>
          <div className="stat">
            <span className="k">Renamed</span>
            <span className="v">
              {counts.renamed}
              <small>of {all.length}</small>
            </span>
          </div>
          <div className="stat">
            <span className="k">Own unit list</span>
            <span className="v">
              {counts.own}
              <small>of {all.length}</small>
            </span>
          </div>
          <div className="stat tw">
            <span className="k">Switched off</span>
            <span className="v">
              {counts.off}
              <small>of {all.length}</small>
            </span>
          </div>
          <div className="stat">
            <span className="k">No unit declared</span>
            <span className="v">
              {counts.bare}
              <small>of {all.length}</small>
            </span>
          </div>
        </div>

        <div className="tools">
          <label className="search">
            {Icon.search}
            <input
              type="text"
              value={query}
              placeholder="Search by name, unit or alias…"
              autoComplete="off"
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <div className="seg">
            {FILTERS.map(([f, label]) => (
              <button
                key={f}
                type="button"
                className={filter === f ? 'on' : undefined}
                onClick={() => setFilter(f)}
              >
                {label}
              </button>
            ))}
          </div>
          <span className="spacer" />
          <span className="counted">
            {shown.length === all.length ? `${all.length} parameters` : `${shown.length} of ${all.length}`}
          </span>
          <button
            type="button"
            className="btn primary"
            onClick={() => {
              close()
              setSaveError(null)
              setAdding(blankNew())
            }}
          >
            + Parameter type
          </button>
        </div>

        {adding ? (
          <NewParameterForm
            draft={adding}
            set={(patch) => setAdding((d) => (d ? { ...d, ...patch } : d))}
            all={all}
            groups={groups}
            quantities={quantities}
            variants={variants}
            saving={saving}
            error={saveError}
            onCancel={() => {
              setAdding(null)
              setSaveError(null)
            }}
            onSave={() => void create()}
          />
        ) : null}

        {groups.map((g) => {
          const rows = shown.filter((p) => p.category === g)
          if (!rows.length) return null
          // A search that has narrowed the list opens everything; a shut group
          // would hide the very row that matched.
          const isShut = shut.has(g) && !query.trim() && filter === 'all'
          const held = all.filter((p) => p.category === g).length

          return (
            <section key={g} className={'card grp' + (isShut ? ' shut' : '')}>
              <button
                type="button"
                className="ghead"
                aria-expanded={!isShut}
                onClick={() =>
                  setShut((s) => {
                    const next = new Set(s)
                    if (next.has(g)) next.delete(g)
                    else next.add(g)
                    return next
                  })
                }
              >
                {Icon.caret}
                <span className="gn">{g}</span>
                <span className="gm">
                  {rows.length}
                  {rows.length === held ? '' : ` of ${held}`}
                </span>
              </button>

              <div className="gbody">
                <div className="rowhead">
                  <span>Parameter</span>
                  <span>Quantity</span>
                  <span>Units</span>
                  <span>Instruments</span>
                  <span>Status</span>
                  <span className="ct">Edit</span>
                </div>

                {rows.map((p) =>
                  p.id === editing && draft ? (
                    <ParameterEditor
                      key={p.id}
                      parameter={p}
                      draft={draft}
                      set={(patch) => setDraft((d) => (d ? { ...d, ...patch } : d))}
                      groups={groups}
                      quantities={quantities}
                      variants={variants}
                      saving={saving}
                      error={saveError}
                      onCancel={close}
                      onSave={() => void save()}
                    />
                  ) : (
                    <button
                      key={p.id}
                      type="button"
                      className={'row' + (p.active ? '' : ' off')}
                      onClick={() => open(p)}
                    >
                      <span className="rname">
                        <span className="n">{p.customName}</span>
                        {renamed(p) ? (
                          <span className="was">
                            standard: <b>{p.standardName}</b>
                          </span>
                        ) : p.aliases.length ? (
                          <span className="was">also: {p.aliases.join(', ')}</span>
                        ) : null}
                      </span>
                      <span className="match">
                        {p.measures}
                        {p.kind !== 'any' ? (
                          <>
                            {' '}
                            <span className="sep">·</span> {p.kind}
                          </>
                        ) : null}
                      </span>
                      <span className="chips">
                        {p.units.length ? (
                          p.units.map((u) => (
                            <span key={u} className={'u' + (u === p.defaultUnit ? ' def' : '')}>
                              {u}
                            </span>
                          ))
                        ) : (
                          <span className="undecl">none declared</span>
                        )}
                        {p.subtypes.length ? <span className="u">{p.subtypes.length} subtypes</span> : null}
                      </span>
                      <span
                        className={'uses' + (p.instruments ? '' : ' none')}
                        title={
                          p.instruments
                            ? `${p.instruments} master instrument${p.instruments === 1 ? '' : 's'} carry a capability for this`
                            : 'no master instrument carries a capability for this'
                        }
                      >
                        {p.instruments || '—'}
                      </span>
                      <span>
                        {!p.active ? (
                          <span className="pill no">Off</span>
                        ) : renamed(p) || p.ownUnits ? (
                          <span className="pill edited">Edited</span>
                        ) : (
                          <span className="pill on">On</span>
                        )}
                      </span>
                      <span className="pen" aria-hidden="true">
                        {Icon.pen}
                      </span>
                    </button>
                  ),
                )}
              </div>
            </section>
          )
        })}

        {list && shown.length === 0 && !adding ? (
          <div className="card">
            <p className="paneempty">Nothing in the register matches that.</p>
          </div>
        ) : null}
      </div>
    </div>
  )
}
