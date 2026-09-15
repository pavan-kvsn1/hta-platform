'use client'

/**
 * Everything that has happened to this instrument, newest first.
 *
 * Grouped by day, because "what happened on Tuesday" is the question people
 * actually ask. Today and yesterday are named rather than dated.
 *
 * It used to read the capability audit alone, so an instrument at version 8
 * with seven certificates and no capability edits showed an empty log. That is
 * not the same as nothing having happened. The endpoint now composes the
 * version history, the certificates, the training records and the capability
 * audit into one trail.
 *
 * The filter options are read off the log itself, so a kind of event that
 * starts being recorded becomes filterable without anyone remembering to
 * register it here.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { apiFetch } from '@/lib/api-client'

interface Entry {
  id: string
  at: string
  verb: string
  subject: string
  what: string
  where: string
  before: string | null
  after: string | null
  actor: { id: string; name: string } | null
}

const VERBS: Record<string, { icon: string; tone: string }> = {
  created: { icon: '⊕', tone: 'good' },
  added: { icon: '+', tone: 'good' },
  updated: { icon: '✎', tone: 'info' },
  changed: { icon: '✎', tone: 'info' },
  deleted: { icon: '✕', tone: 'crit' },
  uploaded: { icon: '▣', tone: 'info' },
  archived: { icon: '⊘', tone: 'mute' },
  restored: { icon: '⟲', tone: 'good' },
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function longDay(iso: string) {
  const d = new Date(iso)
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${d.getFullYear() === new Date().getFullYear() ? '' : ' ' + d.getFullYear()}`
}

function dayLabel(key: string) {
  const today = new Date().toISOString().slice(0, 10)
  const yday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  if (key === today) return 'Today · ' + longDay(key)
  if (key === yday) return 'Yesterday · ' + longDay(key)
  return longDay(key)
}

const WHEN: [string, string][] = [
  ['all', 'Any time'],
  ['7', 'Last 7 days'],
  ['30', 'Last 30 days'],
  ['90', 'Last 3 months'],
]

function Val({ v }: { v: string | null }) {
  return v === null || v === '' ? <span className="anone">nothing</span> : <span className="mono">{v}</span>
}

export default function AuditLogTab({ instrumentId }: { instrumentId: string }) {
  const [entries, setEntries] = useState<Entry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [subject, setSubject] = useState('all')
  const [who, setWho] = useState('all')
  const [when, setWhen] = useState('all')

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await apiFetch(`/api/admin/instruments/${instrumentId}/history`)
      if (!res.ok) {
        setError(`Could not load the audit log (error ${res.status}).`)
        return
      }
      setEntries((await res.json()).entries ?? [])
    } catch {
      setError('Could not reach the server.')
    }
  }, [instrumentId])

  useEffect(() => {
    void load()
  }, [load])

  const shown = useMemo(() => {
    if (!entries) return []
    const cut = when === 'all' ? null : Date.now() - Number(when) * 86400000
    return entries.filter(
      (e) =>
        (subject === 'all' || e.subject === subject) &&
        (who === 'all' || (e.actor?.name ?? 'System') === who) &&
        (!cut || new Date(e.at).getTime() >= cut),
    )
  }, [entries, subject, who, when])

  if (error) {
    return (
      <div className="card sec">
        <p style={{ margin: 0, color: 'var(--crit-tx)' }}>{error}</p>
      </div>
    )
  }
  if (!entries) {
    return (
      <div className="card sec" style={{ display: 'grid', placeItems: 'center', minHeight: 120 }}>
        <Loader2 className="size-5 animate-spin text-[#94a3b8]" />
      </div>
    )
  }

  const subjects = ['all', ...new Set(entries.map((e) => e.subject))]
  const people = ['all', ...new Set(entries.map((e) => e.actor?.name ?? 'System'))]
  const days = [...new Set(shown.map((e) => e.at.slice(0, 10)))]
  const filtered = shown.length !== entries.length
  const earliest = entries.length ? longDay(entries[entries.length - 1].at) : '—'

  return (
    <>
      <div className="card audsum">
        <span>
          <b>{entries.length}</b> change{entries.length === 1 ? '' : 's'}
        </span>
        <span className="sep">·</span>
        <span>
          <b>{people.length - 1}</b> {people.length === 2 ? 'person' : 'people'}
        </span>
        <span className="sep">·</span>
        <span>since {earliest}</span>
      </div>

      <div className="card audbar">
        <select value={subject} onChange={(e) => setSubject(e.target.value)} aria-label="Filter by what changed">
          {subjects.map((s) => (
            <option key={s} value={s}>
              {s === 'all' ? 'Everything' : s}
            </option>
          ))}
        </select>
        <select value={who} onChange={(e) => setWho(e.target.value)} aria-label="Filter by person">
          {people.map((p) => (
            <option key={p} value={p}>
              {p === 'all' ? 'Anyone' : p}
            </option>
          ))}
        </select>
        <select value={when} onChange={(e) => setWhen(e.target.value)} aria-label="Filter by time">
          {WHEN.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        {filtered && (
          <button
            type="button"
            className="link"
            onClick={() => {
              setSubject('all')
              setWho('all')
              setWhen('all')
            }}
          >
            Clear
          </button>
        )}
        <span className="audcount">
          {shown.length} of {entries.length} shown
        </span>
      </div>

      {shown.length === 0 ? (
        <div className="card audempty">
          {entries.length ? 'Nothing matches these filters.' : 'Nothing has happened to this instrument yet.'}
        </div>
      ) : (
        days.map((d) => (
          <div className="audday" key={d}>
            <p className="audh">{dayLabel(d)}</p>
            <div className="card audlist">
              {shown
                .filter((e) => e.at.slice(0, 10) === d)
                .map((e) => {
                  const v = VERBS[e.verb] ?? VERBS.updated
                  const t = new Date(e.at)
                  return (
                    <div className="aud" key={e.id}>
                      <span className="at mono">
                        {String(t.getHours()).padStart(2, '0')}:{String(t.getMinutes()).padStart(2, '0')}
                      </span>
                      <span className="av">
                        <span className={'verb ' + v.tone}>
                          <span className="vi">{v.icon}</span>
                          {e.verb}
                        </span>
                        <span className="who">{e.actor?.name ?? 'System'}</span>
                      </span>
                      <span className="aw">
                        <span className="what">{e.what}</span>
                        <span className="where">{e.where}</span>
                      </span>
                      <span className="ad">
                        {e.before !== null ? (
                          <>
                            <Val v={e.before} />
                            <span className="arrow">→</span>
                            <Val v={e.after} />
                          </>
                        ) : (
                          <Val v={e.after} />
                        )}
                      </span>
                    </div>
                  )
                })}
            </div>
          </div>
        ))
      )}
    </>
  )
}
