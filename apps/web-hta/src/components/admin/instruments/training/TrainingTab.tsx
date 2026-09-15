'use client'

/**
 * Who is signed off to use this instrument.
 *
 * This used to sit at the bottom of Metadata, which made it read as a property
 * of the record rather than a thing with its own lifecycle. These expire, and
 * an expired one stops someone signing a certificate against the instrument -
 * which is why the section carries an amber state in the rail the moment
 * anybody has lapsed or is about to.
 *
 * The engineer is a User row, not a typed name, so a sign-off joins to the
 * person who signs the certificate. Someone who has left keeps their records -
 * a certificate they signed is still on file - but is not offered for a new one.
 *
 * A record cannot exist without its evidence: the endpoint takes the PDF and
 * the engineer together, because a sign-off an assessor cannot be shown is not
 * a sign-off. That is why adding one starts from the file.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { apiFetch } from '@/lib/api-client'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { Icon } from '../Icons'

interface Engineer {
  id: string
  name: string | null
  email: string
  role: string
  isActive: boolean
}

interface Training {
  id: string
  engineer: Engineer | null
  certificateFileName: string | null
  certificateFileSize: number | null
  trainedAt: string | null
  expiresAt: string | null
  notes: string | null
  /** Empty means the whole instrument. */
  scopeComponentIds?: string[]
  uploadedAt: string
}

/** Sixty days is a recalibration cycle's notice. */
const SOON = 60

export function trainingState(t: Pick<Training, 'expiresAt'>) {
  if (!t.expiresAt) return { k: 'none', label: 'no expiry', tone: 'flat' as const }
  const days = Math.ceil((new Date(t.expiresAt).getTime() - Date.now()) / 86400000)
  if (days < 0) return { k: 'expired', label: 'expired', tone: 'crit' as const }
  if (days <= SOON) return { k: 'soon', label: `${days} days left`, tone: 'warn' as const }
  return { k: 'valid', label: 'in force', tone: 'good' as const }
}

/** Empty means the whole instrument; two names fit, more are counted. */
function scopeLabel(t: Training, components: { id: string; name: string }[]) {
  const ids = t.scopeComponentIds ?? []
  if (!ids.length) return 'Full instrument'
  const names = ids.map((id) => components.find((c) => c.id === id)?.name ?? id)
  return names.length <= 2 ? names.join(', ') : `${names[0]} +${names.length - 1}`
}

const day = (iso: string | null) => (iso ? iso.slice(0, 10) : '')
const kb = (n: number | null) =>
  n === null ? '' : n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`

export default function TrainingTab({
  instrumentId,
  formatDate,
}: {
  instrumentId: string
  formatDate: (iso: string | null) => string
}) {
  const [list, setList] = useState<Training[] | null>(null)
  const [engineers, setEngineers] = useState<Engineer[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [adding, setAdding] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [draft, setDraft] = useState({ engineerId: '', trainedAt: '', expiresAt: '', notes: '' })
  const picker = useRef<HTMLInputElement>(null)

  const [editing, setEditing] = useState<string | null>(null)
  const [edit, setEdit] = useState({ trainedAt: '', expiresAt: '', notes: '' })

  /** Which components the row being filled in covers. Empty is the whole instrument. */
  const [scope, setScope] = useState<string[]>([])
  const [components, setComponents] = useState<{ id: string; name: string }[]>([])

  const load = useCallback(async () => {
    setError(null)
    try {
      const t = await apiFetch(`/api/admin/instruments/${instrumentId}/trainings`)
      if (!t.ok) {
        setError(`Could not load the training records (error ${t.status}).`)
        return
      }
      setList((await t.json()).trainings ?? [])

      // The endpoint caps a page at 25. A lab with more engineers than that would
      // silently lose the rest of them out of the chooser, so page through.
      const found: Engineer[] = []
      for (let page = 1; page <= 20; page++) {
        const u = await apiFetch(`/api/admin/users?role=ENGINEER&isActive=true&limit=25&page=${page}`)
        if (!u.ok) break
        const d = await u.json()
        const batch: Engineer[] = d.users ?? d.data ?? []
        found.push(...batch.filter((e) => e.role === 'ENGINEER'))
        if (!batch.length || found.length >= (d.pagination?.total ?? found.length)) break
      }
      setEngineers(found)

      // The components a sign-off can be narrowed to.
      const c = await apiFetch(`/api/admin/instruments/${instrumentId}/capabilities`)
      if (c.ok) setComponents((await c.json()).components ?? [])
    } catch {
      setError('Could not reach the server.')
    }
  }, [instrumentId])

  useEffect(() => {
    void load()
  }, [load])

  /**
   * The evidence streams from the API, which wants an Authorization header, so
   * a plain link to it gets a tenant error instead of a document. The bytes are
   * fetched and handed to the browser as a blob it can open on its own.
   */
  const openEvidence = async (rec: Training) => {
    setError(null)
    try {
      const res = await apiFetch(`/api/admin/instruments/${instrumentId}/trainings/${rec.id}/pdf`)
      if (!res.ok) {
        setError(`Could not open the evidence (error ${res.status}).`)
        return
      }
      const url = URL.createObjectURL(await res.blob())
      window.open(url, '_blank', 'noreferrer')
      // The tab has its own copy now; holding this one open leaks it for the
      // life of the page.
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch {
      setError('Could not reach the server.')
    }
  }

  const closeAdd = () => {
    setAdding(false)
    setFile(null)
    setScope([])
    setDraft({ engineerId: '', trainedAt: '', expiresAt: '', notes: '' })
  }

  const create = async () => {
    if (!file || !draft.engineerId) return
    setBusy(true)
    setError(null)
    try {
      const body = new FormData()
      body.append('file', file)
      body.append('engineerId', draft.engineerId)
      if (draft.trainedAt) body.append('trainedAt', draft.trainedAt)
      if (draft.expiresAt) body.append('expiresAt', draft.expiresAt)
      if (draft.notes.trim()) body.append('notes', draft.notes.trim())
      // A list, so it survives whether it holds one component or five.
      body.append('scopeComponentIds', JSON.stringify(scope))

      const res = await apiFetch(`/api/admin/instruments/${instrumentId}/trainings`, { method: 'POST', body })
      if (!res.ok) {
        const b = await res.json().catch(() => null)
        setError(b?.error || `Could not add the record (error ${res.status}).`)
        return
      }
      closeAdd()
      await load()
    } catch {
      setError('Could not reach the server.')
    } finally {
      setBusy(false)
    }
  }

  const saveEdit = async (id: string) => {
    setBusy(true)
    setError(null)
    try {
      const res = await apiFetch(`/api/admin/instruments/${instrumentId}/trainings/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trainedAt: edit.trainedAt || null,
          expiresAt: edit.expiresAt || null,
          notes: edit.notes.trim() || null,
          scopeComponentIds: scope,
        }),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => null)
        setError(b?.error || `Could not save the record (error ${res.status}).`)
        return
      }
      setEditing(null)
      await load()
    } catch {
      setError('Could not reach the server.')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (t: Training) => {
    const who = t.engineer?.name || t.engineer?.email || 'this engineer'
    if (!window.confirm(`Remove the training record for ${who}? They will no longer be signed off on this instrument.`))
      return
    setBusy(true)
    setError(null)
    try {
      const res = await apiFetch(`/api/admin/instruments/${instrumentId}/trainings/${t.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const b = await res.json().catch(() => null)
        setError(b?.error || `Could not remove the record (error ${res.status}).`)
        return
      }
      await load()
    } catch {
      setError('Could not reach the server.')
    } finally {
      setBusy(false)
    }
  }

  if (error && !list) {
    return (
      <div className="card sec">
        <p style={{ margin: 0, color: 'var(--crit-tx)' }}>{error}</p>
      </div>
    )
  }
  if (!list) {
    return (
      <div className="card sec" style={{ display: 'grid', placeItems: 'center', minHeight: 120 }}>
        <Loader2 className="size-5 animate-spin text-[#94a3b8]" />
      </div>
    )
  }

  const states = list.map(trainingState)
  const expired = states.filter((s) => s.k === 'expired').length
  const soon = states.filter((s) => s.k === 'soon').length
  const noEvidence = list.filter((t) => !t.certificateFileName).length

  // Someone who has left keeps their records but is not offered for a new one.
  const options = engineers
    .filter((e) => e.isActive)
    .map((e) => ({ value: e.id, label: e.name || e.email, detail: e.email }))

  /**
   * One row form, for adding and for editing.
   *
   * The engineer and the evidence are set when the record is created and fixed
   * afterwards - the endpoint takes them together and will not change either -
   * so on an existing row they report rather than ask.
   */
  const rowForm = (key: string, index: number, t: Training | null) => {
    const isNew = t === null
    const who = t?.engineer?.name || t?.engineer?.email

    return (
      <tr className="formrow" key={key}>
        <td colSpan={10}>
          <div className="prow">
            <div className="sl">{index + 1}</div>

            <div className="f embed">
              <span className="k">Engineer</span>
              {isNew ? (
                <SearchableSelect
                  value={draft.engineerId}
                  options={options}
                  placeholder="Choose an engineer…"
                  emptyMessage="Nobody on this lab matches that."
                  // Matches the inputs beside it: same height, same radius, same border.
                  className="h-[31px] rounded-lg border-[#e2e8f0]"
                  onChange={(v) => setDraft((d) => ({ ...d, engineerId: v }))}
                />
              ) : (
                <span className="v">{who}</span>
              )}
            </div>

            <div className="f">
              <span className="k">Trained</span>
              <input
                type="date"
                value={isNew ? draft.trainedAt : edit.trainedAt}
                onChange={(e) =>
                  isNew
                    ? setDraft((d) => ({ ...d, trainedAt: e.target.value }))
                    : setEdit((d) => ({ ...d, trainedAt: e.target.value }))
                }
              />
            </div>

            <div className="f">
              <span className="k">Expires</span>
              <input
                type="date"
                value={isNew ? draft.expiresAt : edit.expiresAt}
                onChange={(e) =>
                  isNew
                    ? setDraft((d) => ({ ...d, expiresAt: e.target.value }))
                    : setEdit((d) => ({ ...d, expiresAt: e.target.value }))
                }
              />
            </div>

            <div className="f evid">
              <span className="k">Evidence</span>
              {isNew ? (
                file ? (
                  <span className="evrow">
                    <span className="mono">{file.name}</span>
                    <span className="dim mono">{kb(file.size)}</span>
                    <button type="button" className="link" onClick={() => picker.current?.click()}>
                      Replace
                    </button>
                  </span>
                ) : (
                  <button type="button" className="btn ghost sm" onClick={() => picker.current?.click()}>
                    <Icon.plus /> Attach a PDF
                  </button>
                )
              ) : t?.certificateFileName ? (
                <span className="evrow">
                  <button type="button" className="link" onClick={() => void openEvidence(t)}>
                    {t.certificateFileName}
                  </button>
                </span>
              ) : (
                <span className="undecl">none on file</span>
              )}
            </div>

            <div className="f scope">
              <span className="k">Signed off on</span>
              <div className="scopebox">
                {/* Empty means the whole instrument, which is both the common case and
                    the honest reading of a record that never said otherwise. */}
                <label className="ck">
                  <input
                    type="checkbox"
                    checked={scope.length === 0}
                    onChange={() => setScope([])}
                  />{' '}
                  Full instrument
                </label>
                <span className="scopesep" />
                {components.length ? (
                  components.map((c) => (
                    <label className="ck" key={c.id}>
                      <input
                        type="checkbox"
                        checked={scope.includes(c.id)}
                        onChange={() =>
                          setScope((s) => (s.includes(c.id) ? s.filter((x) => x !== c.id) : [...s, c.id]))
                        }
                      />{' '}
                      {c.name}
                    </label>
                  ))
                ) : (
                  <span className="undecl">no components recorded</span>
                )}
              </div>
            </div>

            <div className="f tnotes">
              <span className="k">Notes</span>
              <input
                value={isNew ? draft.notes : edit.notes}
                placeholder="optional"
                onChange={(e) =>
                  isNew
                    ? setDraft((d) => ({ ...d, notes: e.target.value }))
                    : setEdit((d) => ({ ...d, notes: e.target.value }))
                }
              />
            </div>

            <div className="fbtns">
              <button
                type="button"
                className="btn ghost"
                onClick={() => (isNew ? closeAdd() : setEditing(null))}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn primary"
                disabled={busy || (isNew && (!file || !draft.engineerId))}
                onClick={() => void (isNew ? create() : saveEdit(t!.id))}
              >
                {busy ? 'Saving…' : isNew ? 'Add' : 'Save'}
              </button>
            </div>
          </div>

          <p className="fnote">
            {isNew
              ? 'Evidence is a PDF of the training certificate. Without it the sign-off cannot be shown to an assessor, which is why a record cannot be added until one is attached. Leave every component unticked for the whole instrument.'
              : 'The engineer and the evidence are fixed once a record exists — a sign-off is for one person against one document. To correct either, remove this record and add it again.'}
          </p>
        </td>
      </tr>
    )
  }

  return (
    <>
      <input
        ref={picker}
        type="file"
        accept="application/pdf"
        hidden
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />

      {error && (
        <div className="card sec" style={{ borderColor: 'var(--crit-br)', background: 'var(--crit-bg)' }}>
          <p style={{ margin: 0, color: 'var(--crit-tx)' }}>{error}</p>
        </div>
      )}

      <div className="card audsum">
        <span>
          <b>{list.length}</b> {list.length === 1 ? 'person' : 'people'} signed off
        </span>
        {expired ? (
          <>
            <span className="sep">·</span>
            <span className="tw crit">
              <b>{expired}</b> expired
            </span>
          </>
        ) : null}
        {soon ? (
          <>
            <span className="sep">·</span>
            <span className="tw warn">
              <b>{soon}</b> lapsing within {SOON} days
            </span>
          </>
        ) : null}
        {noEvidence ? (
          <>
            <span className="sep">·</span>
            <span className="tw warn">
              <b>{noEvidence}</b> without evidence
            </span>
          </>
        ) : null}
        <button
          type="button"
          className="tbtn solid"
          style={{ marginLeft: 'auto' }}
          onClick={() => {
            setEditing(null)
            setAdding((a) => !a)
          }}
        >
          <Icon.plus /> Add training record
        </button>
      </div>

      {expired > 0 && (
        <div className="card trwarn">
          ⚠ An expired training record means that engineer is no longer signed off on this instrument. A
          certificate they sign against it can be challenged.
        </div>
      )}

      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 38 }}>Sl.</th>
              <th>Engineer</th>
              <th style={{ width: 120 }}>Trained</th>
              <th style={{ width: 120 }}>Expires</th>
              <th style={{ width: 150 }}>Status</th>
              <th>Evidence</th>
              <th>Scope</th>
              <th>Notes</th>
              <th style={{ width: 52, textAlign: 'center' }}>Edit</th>
              <th style={{ width: 58, textAlign: 'center' }}>Delete</th>
            </tr>
          </thead>
          <tbody>
            {list.map((t, i) => {
              const st = trainingState(t)
              const who = t.engineer?.name || t.engineer?.email

              if (editing === t.id) return rowForm(t.id, i, t)

              return (
                <tr key={t.id}>
                  <td className="n">{i + 1}</td>
                  <td style={{ fontWeight: 500 }}>
                    {who || <span className="undecl">removed engineer</span>}
                    {t.engineer && !t.engineer.isActive ? <span className="gonechip">left</span> : null}
                  </td>
                  <td className="num">{formatDate(t.trainedAt)}</td>
                  <td className="num">{formatDate(t.expiresAt)}</td>
                  <td>
                    <span className={'pill ' + st.tone}>{st.label}</span>
                  </td>
                  <td>
                    {t.certificateFileName ? (
                      <button type="button" className="link" onClick={() => void openEvidence(t)}>
                        <Icon.file />
                        {t.certificateFileName}
                      </button>
                    ) : (
                      <span className="undecl">none on file</span>
                    )}
                  </td>
                  <td className="dimcell" title={scopeLabel(t, components)}>
                    {scopeLabel(t, components)}
                  </td>
                  <td className="dimcell">{t.notes || <span className="undecl">—</span>}</td>
                  <td style={{ textAlign: 'center' }}>
                    <button
                      type="button"
                      className="iconbtn"
                      aria-label={`Edit the record for ${who ?? 'this engineer'}`}
                      onClick={() => {
                        setAdding(false)
                        setEditing(t.id)
                        setEdit({
                          trainedAt: day(t.trainedAt),
                          expiresAt: day(t.expiresAt),
                          notes: t.notes ?? '',
                        })
                        setScope(t.scopeComponentIds ?? [])
                      }}
                    >
                      <Icon.pen />
                    </button>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <button
                      type="button"
                      className="iconbtn del"
                      aria-label={`Delete the record for ${who ?? 'this engineer'}`}
                      onClick={() => void remove(t)}
                    >
                      <Icon.bin />
                    </button>
                  </td>
                </tr>
              )
            })}

            {adding && rowForm('new', list.length, null)}

            {list.length === 0 && !adding && (
              <tr>
                <td colSpan={10} className="paneempty" style={{ padding: '18px 14px' }}>
                  Nobody is signed off on this instrument yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}
