'use client'

/**
 * What changed about this instrument's capabilities, who changed it and when.
 *
 * Field level, not version level. Version diffing cannot say that B2's least count went
 * from 0.05 bar to 0.01 bar, because a version records the instrument's description and
 * dates, not the ranges underneath it. Each entry here is one field of one range.
 *
 * The wireframe also shows a [Revert] on each entry. There is no API behind it, and a
 * button that silently does nothing on an audit trail is worse than no button, so it is
 * left out until reverting exists.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertCircle, Loader2 } from 'lucide-react'
import { apiFetch } from '@/lib/api-client'

interface Entry {
  id: string
  action: string
  profileKey: string | null
  subtypeKey: string | null
  bucketKey: string | null
  bucketLabel: string | null
  field: string | null
  before: string | null
  after: string | null
  createdAt: string
  actor: { id: string; name: string | null } | null
}

const ACTION_LABEL: Record<string, string> = {
  PROFILE_ADDED: 'PROFILE_ADDED',
  PROFILE_UPDATED: 'FIELD_UPDATED',
  PROFILE_DELETED: 'PROFILE_DELETED',
  SUBTYPE_ADDED: 'SUBTYPE_ADDED',
  SUBTYPE_DELETED: 'SUBTYPE_DELETED',
  BUCKET_ADDED: 'BUCKET_ADDED',
  BUCKET_UPDATED: 'FIELD_UPDATED',
  BUCKET_DELETED: 'BUCKET_DELETED',
}

/** Field names as an engineer would say them, not as the column is spelled. */
const FIELD_LABEL: Record<string, string> = {
  leastCountValue: 'Least Count',
  leastCountUnit: 'Least Count Unit',
  accuracyKind: 'Accuracy Type',
  accuracyValue: 'Accuracy',
  accuracyUnit: 'Accuracy Unit',
  accuracyPolarity: 'Accuracy Sign',
  accuracyFormula: 'Accuracy Formula',
  accuracyClass: 'Accuracy Class',
  minValue: 'Min',
  maxValue: 'Max',
  min: 'Min',
  max: 'Max',
  minInclusive: 'Min Inclusive',
  maxInclusive: 'Max Inclusive',
  sopReferences: 'Procedures',
  parameter: 'Parameter',
  unit: 'Unit',
  role: 'Role',
  kind: 'Kind',
  subtypeKind: 'Subtype Kind',
}

/**
 * Where the change landed, as the wireframe writes it:
 *   Profile: P1 → Subtype: Type J → Bucket B2 → Least Count
 */
function trail(e: Entry) {
  const parts: string[] = []
  if (e.profileKey) parts.push(`Profile: ${e.profileKey}`)
  if (e.subtypeKey) parts.push(`Subtype: ${e.subtypeKey}`)
  // The range itself, not its number: numbers shift when a range is deleted, and an old
  // entry pointing at "range 2" would quietly come to mean a different one.
  if (e.bucketLabel) parts.push(e.bucketLabel)
  else if (e.bucketKey) parts.push(`Range ${e.bucketKey.replace(/^B/, '')}`)
  if (e.field) parts.push(FIELD_LABEL[e.field] ?? e.field)
  return parts.join(' → ')
}

function Value({ v }: { v: string | null }) {
  // A field that was empty and now has a value is as much a change as one that moved,
  // so "nothing" is printed rather than left blank.
  return v === null || v === '' ? (
    <span className="text-[#94a3b8] italic">nothing</span>
  ) : (
    <span className="text-[#0f172a] tabular-nums">{v}</span>
  )
}

const select =
  'px-2.5 py-1.5 border border-[#e2e8f0] rounded-lg text-[12px] text-[#0f172a] bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none'

export default function AuditLogTab({
  instrumentId,
  formatDateTime,
}: {
  instrumentId: string
  formatDateTime: (iso: string) => string
}) {
  const [entries, setEntries] = useState<Entry[] | null>(null)
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [action, setAction] = useState('ALL')
  const [user, setUser] = useState('ALL')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const base = `/api/admin/instruments/${instrumentId}/capabilities/audit`

  const fetchPage = useCallback(
    async (after?: string) => {
      const res = await apiFetch(after ? `${base}?cursor=${encodeURIComponent(after)}` : base)
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        if (res.status === 401 || res.status === 403) throw new Error('Your session has expired. Sign in again.')
        throw new Error(body?.error || `Could not load the audit log (error ${res.status}).`)
      }
      return (await res.json()) as { entries: Entry[]; nextCursor: string | null }
    },
    [base],
  )

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const d = await fetchPage()
      setEntries(d.entries)
      setCursor(d.nextCursor)
    } catch (e) {
      setEntries(null)
      setError(e instanceof Error ? e.message : 'Could not reach the server.')
    } finally {
      setLoading(false)
    }
  }, [fetchPage])

  useEffect(() => {
    void load()
  }, [load])

  const more = async () => {
    if (!cursor) return
    setLoadingMore(true)
    try {
      const d = await fetchPage(cursor)
      setEntries((prev) => [...(prev ?? []), ...d.entries])
      setCursor(d.nextCursor)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reach the server.')
    } finally {
      setLoadingMore(false)
    }
  }

  // Filtering happens over what has been loaded. The list is small and paged, and
  // filtering server-side would mean "Show earlier" and the filters disagreeing about
  // what page they are on.
  const actions = useMemo(
    () => Array.from(new Set((entries ?? []).map((e) => ACTION_LABEL[e.action] ?? e.action))).sort(),
    [entries],
  )
  const users = useMemo(
    () => Array.from(new Set((entries ?? []).map((e) => e.actor?.name).filter((n): n is string => !!n))).sort(),
    [entries],
  )

  const shown = useMemo(
    () =>
      (entries ?? []).filter((e) => {
        if (action !== 'ALL' && (ACTION_LABEL[e.action] ?? e.action) !== action) return false
        if (user !== 'ALL' && e.actor?.name !== user) return false
        const at = e.createdAt.slice(0, 10)
        if (from && at < from) return false
        if (to && at > to) return false
        return true
      }),
    [entries, action, user, from, to],
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="size-6 animate-spin text-[#94a3b8]" />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <label className="text-[12px] text-[#64748b] inline-flex items-center gap-1.5">
          Filter:
          <select className={select} value={action} onChange={(e) => setAction(e.target.value)} aria-label="Filter by action">
            <option value="ALL">All</option>
            {actions.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>

        <label className="text-[12px] text-[#64748b] inline-flex items-center gap-1.5">
          Date Range:
          <input type="date" className={select} value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
          to
          <input type="date" className={select} value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
        </label>

        <label className="text-[12px] text-[#64748b] inline-flex items-center gap-1.5">
          User:
          <select className={select} value={user} onChange={(e) => setUser(e.target.value)} aria-label="Filter by user">
            <option value="ALL">All</option>
            {users.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </label>

        {(action !== 'ALL' || user !== 'ALL' || from || to) && (
          <button
            type="button"
            onClick={() => {
              setAction('ALL')
              setUser('ALL')
              setFrom('')
              setTo('')
            }}
            className="text-[12px] text-primary hover:opacity-80 underline"
          >
            Clear
          </button>
        )}
      </div>

      {error && (
        <div className="bg-[#fef2f2] border border-[#fee2e2] rounded-lg p-3 flex items-start gap-2">
          <AlertCircle className="size-4 text-[#dc2626] mt-0.5 shrink-0" />
          <p className="text-[13px] text-[#dc2626] flex-1">{error}</p>
          <button type="button" onClick={() => void load()} className="text-[12px] text-[#dc2626] underline shrink-0">
            Try again
          </button>
        </div>
      )}

      {entries && entries.length === 0 && (
        <div className="bg-white rounded-xl border border-[#e2e8f0] p-6 text-center">
          <p className="text-[13px] text-[#94a3b8]">
            Nothing has changed since these capabilities were loaded from the master registry.
          </p>
        </div>
      )}

      {entries && entries.length > 0 && shown.length === 0 && (
        <div className="bg-white rounded-xl border border-[#e2e8f0] p-6 text-center">
          <p className="text-[13px] text-[#94a3b8]">No changes match these filters.</p>
        </div>
      )}

      {shown.length > 0 && (
        <div className="bg-white rounded-xl border border-[#e2e8f0] divide-y divide-[#f1f5f9]">
          {shown.map((e) => (
            <div key={e.id} className="px-4 py-3">
              <div className="flex items-baseline gap-2 text-[12px] text-[#64748b]">
                <span className="tabular-nums">{formatDateTime(e.createdAt)}</span>
                <span className="text-[#cbd5e1]">│</span>
                <span>{e.actor?.name ?? 'System'}</span>
              </div>

              <div className="mt-1.5 flex items-baseline gap-2 flex-wrap text-[12px]">
                <span className="text-[#64748b]">Action:</span>
                <span className="font-medium text-[#0f172a]">{ACTION_LABEL[e.action] ?? e.action}</span>
                {trail(e) && (
                  <>
                    <span className="text-[#cbd5e1]">│</span>
                    <span className="text-[#334155]">{trail(e)}</span>
                  </>
                )}
              </div>

              {e.field ? (
                <p className="text-[12px] text-[#64748b] mt-1">
                  Before: <Value v={e.before} />
                  <span className="mx-1.5">→</span>
                  After: <Value v={e.after} />
                </p>
              ) : (
                (e.after || e.before) && <p className="text-[12px] text-[#64748b] mt-1">{e.after || e.before}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {cursor && (
        <button
          type="button"
          onClick={() => void more()}
          disabled={loadingMore}
          className="w-full py-2 text-[13px] text-[#64748b] rounded-lg border border-[#e2e8f0] bg-white hover:text-[#0f172a] disabled:opacity-50"
        >
          {loadingMore ? 'Loading…' : 'Show earlier changes'}
        </button>
      )}
    </div>
  )
}
