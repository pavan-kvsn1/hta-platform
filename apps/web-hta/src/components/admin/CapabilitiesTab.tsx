'use client'

/**
 * What an instrument measures or sources, at what resolution, and how accurately.
 *
 * A capability is three levels deep and the nesting is the point:
 *
 *   profile   Thermocouple, sourcing, in °C, over -210 to 1820
 *     subtype   Type J, which only reaches 1200
 *       range     -210 to -200, least count 0.1 °C, accuracy ±0.6 °C
 *
 * Most profiles have no subtypes and their ranges hang straight off the profile. Where
 * subtypes exist the profile has no ranges of its own, so the two are never shown at
 * once and the reader is never asked which level a number belongs to.
 */

import { useCallback, useEffect, useId, useState } from 'react'
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Loader2,
  Plus,
  Trash2,
  X,
} from 'lucide-react'
import { apiFetch } from '@/lib/api-client'

type AccuracyKind = 'SYMMETRIC' | 'FORMULA' | 'CLASS'
type CapabilityRole = 'MEASURING' | 'SOURCE'
type CapabilityKind = 'RANGE' | 'ARTIFACT'

interface Bucket {
  id: string
  bucketKey: string
  min: number | null
  max: number | null
  minInclusive: boolean
  maxInclusive: boolean
  leastCountValue: number | null
  leastCountUnit: string | null
  accuracyKind: AccuracyKind | null
  accuracyValue: number | null
  accuracyUnit: string | null
  accuracyPolarity: string | null
  accuracyFormula: string | null
  accuracyClass: string | null
  sortOrder: number
}

interface Subtype {
  id: string
  subtypeKey: string
  min: number | null
  max: number | null
  minInclusive: boolean
  maxInclusive: boolean
  sortOrder: number
  buckets: Bucket[]
}

interface Profile {
  id: string
  profileKey: string
  parameter: string
  role: CapabilityRole
  unit: string
  kind: CapabilityKind
  min: number | null
  max: number | null
  minInclusive: boolean
  maxInclusive: boolean
  subtypeKind: string | null
  sopReferences: string[]
  source: string
  sortOrder: number
  subtypes: Subtype[]
  buckets: Bucket[]
}

interface Component {
  id: string
  componentKey: string
  role: 'INDICATOR' | 'SENSOR'
  make: string | null
  model: string | null
  serialNumber: string | null
}

interface Payload {
  profiles: Profile[]
  components: Component[]
  assetType: 'simple' | 'composite'
}

const input =
  'w-full px-2.5 py-1.5 border border-[#e2e8f0] rounded-lg text-[13px] text-[#0f172a] placeholder:text-[#94a3b8] focus:ring-2 focus:ring-[#7c3aed]/20 focus:border-[#7c3aed] outline-none'

/**
 * A span, written the way an engineer would read it.
 *
 * An exclusive bound is shown, because two ranges meeting at 100 have to say which one
 * owns 100 - otherwise a reading at the boundary picks up whichever accuracy happens to
 * be found first.
 */
function span(x: { min: number | null; max: number | null; minInclusive: boolean; maxInclusive: boolean }, unit?: string) {
  if (x.min === null && x.max === null) return '—'
  const suffix = unit ? ` ${unit}` : ''
  if (x.min === x.max) return `${x.max}${suffix}`
  const lo = x.minInclusive ? `${x.min}` : `above ${x.min}`
  return `${lo} to ${x.max}${suffix}`
}

/** An accuracy as it should be read, keeping "not declared" different from zero. */
function accuracyText(b: Bucket): string {
  switch (b.accuracyKind) {
    case 'SYMMETRIC':
      return b.accuracyValue === null
        ? 'not declared'
        : `${b.accuracyPolarity ?? '±'}${b.accuracyValue}${b.accuracyUnit ? ` ${b.accuracyUnit}` : ''}`
    case 'FORMULA':
      return b.accuracyFormula || 'not declared'
    case 'CLASS':
      return b.accuracyClass || 'not declared'
    default:
      return 'not declared'
  }
}

function leastCountText(b: Bucket): string {
  if (b.leastCountValue === null) return 'not declared'
  return `${b.leastCountValue}${b.leastCountUnit ? ` ${b.leastCountUnit}` : ''}`
}

function Undeclared({ children }: { children: string }) {
  return children === 'not declared' ? (
    <span className="text-[#94a3b8] italic">not declared</span>
  ) : (
    <span className="tabular-nums">{children}</span>
  )
}

// ---------------------------------------------------------------------------

function RangeTable({
  buckets,
  unit,
  onDelete,
  busy,
}: {
  buckets: Bucket[]
  unit: string
  onDelete: (bucketId: string) => void
  busy: string | null
}) {
  if (!buckets.length) {
    return <p className="text-[12px] text-[#94a3b8] py-2">No ranges recorded.</p>
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="text-left text-[#64748b] border-b border-[#e2e8f0]">
            <th className="py-1.5 pr-3 font-medium w-10">ID</th>
            <th className="py-1.5 pr-3 font-medium">Range</th>
            <th className="py-1.5 pr-3 font-medium">Least count</th>
            <th className="py-1.5 pr-3 font-medium">Accuracy</th>
            <th className="py-1.5 w-8" />
          </tr>
        </thead>
        <tbody>
          {buckets.map((b) => (
            <tr key={b.id} className="border-b border-[#f1f5f9] last:border-0">
              <td className="py-1.5 pr-3 text-[#94a3b8]">{b.bucketKey}</td>
              <td className="py-1.5 pr-3 text-[#0f172a] tabular-nums">{span(b, unit)}</td>
              <td className="py-1.5 pr-3 text-[#334155]">
                <Undeclared>{leastCountText(b)}</Undeclared>
              </td>
              <td className="py-1.5 pr-3 text-[#334155]">
                <Undeclared>{accuracyText(b)}</Undeclared>
              </td>
              <td className="py-1.5 text-right">
                <button
                  type="button"
                  onClick={() => onDelete(b.id)}
                  disabled={busy === b.id}
                  aria-label={`Delete range ${b.bucketKey}`}
                  className="text-[#94a3b8] hover:text-[#dc2626] disabled:opacity-40"
                >
                  {busy === b.id ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function AddRangeForm({
  unit,
  onCancel,
  onAdd,
  saving,
}: {
  unit: string
  onCancel: () => void
  onAdd: (body: Record<string, unknown>) => void
  saving: boolean
}) {
  const [min, setMin] = useState('')
  const [max, setMax] = useState('')
  const [minInclusive, setMinInclusive] = useState(true)
  const [leastCount, setLeastCount] = useState('')
  const [kind, setKind] = useState<AccuracyKind>('SYMMETRIC')
  const [value, setValue] = useState('')
  const [accUnit, setAccUnit] = useState(unit)
  const [formula, setFormula] = useState('')
  const [cls, setCls] = useState('')
  // Several of these can be open at once, one per subtype, so the ids have to be
  // unique per instance or a label points at another form's input.
  const uid = useId()
  const f = (name: string) => `${uid}-${name}`

  return (
    <div className="mt-3 p-3 rounded-lg border border-[#e2e8f0] bg-[#f8fafc]">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-2">
        <div>
          <label htmlFor={f('min')} className="block text-[11px] text-[#64748b] mb-1">From</label>
          <input id={f('min')} className={input} value={min} onChange={(e) => setMin(e.target.value)} inputMode="decimal" />
        </div>
        <div>
          <label htmlFor={f('max')} className="block text-[11px] text-[#64748b] mb-1">To</label>
          <input id={f('max')} className={input} value={max} onChange={(e) => setMax(e.target.value)} inputMode="decimal" />
        </div>
        <div>
          <label htmlFor={f('lc')} className="block text-[11px] text-[#64748b] mb-1">Least count</label>
          <input
            id={f('lc')}
            className={input}
            value={leastCount}
            onChange={(e) => setLeastCount(e.target.value)}
            placeholder="leave blank if none"
            inputMode="decimal"
          />
        </div>
        <div>
          <label htmlFor={f('acckind')} className="block text-[11px] text-[#64748b] mb-1">Accuracy</label>
          <select id={f('acckind')} className={input} value={kind} onChange={(e) => setKind(e.target.value as AccuracyKind)}>
            <option value="SYMMETRIC">± a value</option>
            <option value="FORMULA">a formula</option>
            <option value="CLASS">a class</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 items-end">
        {kind === 'SYMMETRIC' && (
          <>
            <div>
              <label htmlFor={f('accval')} className="block text-[11px] text-[#64748b] mb-1">± value</label>
              <input id={f('accval')} className={input} value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" />
            </div>
            <div>
              <label htmlFor={f('accunit')} className="block text-[11px] text-[#64748b] mb-1">Accuracy unit</label>
              <input id={f('accunit')} className={input} value={accUnit} onChange={(e) => setAccUnit(e.target.value)} placeholder="°C, %FS" />
            </div>
          </>
        )}
        {kind === 'FORMULA' && (
          <div className="col-span-2 md:col-span-3">
            <label htmlFor={f('formula')} className="block text-[11px] text-[#64748b] mb-1">Formula, exactly as the certificate states it</label>
            <input
              id={f('formula')}
              className={input}
              value={formula}
              onChange={(e) => setFormula(e.target.value)}
              placeholder="±(0.02% of reading + 2 counts)"
            />
          </div>
        )}
        {kind === 'CLASS' && (
          <div>
            <label htmlFor={f('class')} className="block text-[11px] text-[#64748b] mb-1">Class</label>
            <input id={f('class')} className={input} value={cls} onChange={(e) => setCls(e.target.value)} placeholder="Class 1" />
          </div>
        )}

        <label className="flex items-center gap-1.5 text-[12px] text-[#64748b] pb-2">
          <input type="checkbox" checked={minInclusive} onChange={(e) => setMinInclusive(e.target.checked)} />
          Includes the lower bound
        </label>

        <div className="flex gap-2 justify-end col-span-2 md:col-span-1">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 text-[12px] rounded-lg border border-[#e2e8f0] text-[#64748b] hover:bg-white"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() =>
              onAdd({
                min,
                max,
                minInclusive,
                maxInclusive: true,
                leastCountValue: leastCount,
                leastCountUnit: leastCount === '' ? null : unit,
                accuracyKind: kind,
                accuracyValue: value,
                accuracyUnit: accUnit,
                accuracyPolarity: '±',
                accuracyFormula: formula,
                accuracyClass: cls,
              })
            }
            className="px-3 py-1.5 text-[12px] rounded-lg bg-[#7c3aed] text-white hover:bg-[#6d28d9] disabled:opacity-50"
          >
            {saving ? 'Adding…' : 'Add range'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ProfileCard({
  profile,
  onDeleteProfile,
  onAddBucket,
  onDeleteBucket,
  busyId,
}: {
  profile: Profile
  onDeleteProfile: (id: string) => void
  onAddBucket: (profileId: string, subtypeId: string | null, body: Record<string, unknown>) => Promise<void>
  onDeleteBucket: (profileId: string, bucketId: string) => void
  busyId: string | null
}) {
  const [open, setOpen] = useState(false)
  const [addingTo, setAddingTo] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const rangeCount = profile.buckets.length + profile.subtypes.reduce((n, s) => n + s.buckets.length, 0)

  const add = async (subtypeId: string | null, body: Record<string, unknown>) => {
    setSaving(true)
    try {
      await onAddBucket(profile.id, subtypeId, body)
      setAddingTo(null)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-[#e2e8f0] overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={`${open ? 'Collapse' : 'Expand'} ${profile.parameter}`}
          className="flex items-center gap-2 flex-1 text-left min-w-0"
        >
          {open ? (
            <ChevronDown className="size-4 text-[#94a3b8] shrink-0" />
          ) : (
            <ChevronRight className="size-4 text-[#94a3b8] shrink-0" />
          )}
          <span className="text-[11px] text-[#94a3b8] tabular-nums shrink-0">{profile.profileKey}</span>
          <span className="text-[14px] font-semibold text-[#0f172a] truncate">{profile.parameter}</span>
          <span className="text-[12px] text-[#64748b] shrink-0">
            {profile.role === 'SOURCE' ? 'source' : 'measuring'}
            {profile.unit ? ` · ${profile.unit}` : ''}
          </span>
          {profile.source === 'manual' && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#f1f5f9] text-[#64748b] shrink-0">added here</span>
          )}
        </button>

        <span className="text-[12px] text-[#94a3b8] shrink-0">
          {profile.subtypes.length > 0
            ? `${profile.subtypes.length} subtypes · ${rangeCount} ranges`
            : `${rangeCount} range${rangeCount === 1 ? '' : 's'}`}
        </span>

        <button
          type="button"
          onClick={() => onDeleteProfile(profile.id)}
          disabled={busyId === profile.id}
          aria-label={`Delete capability ${profile.parameter}`}
          className="text-[#94a3b8] hover:text-[#dc2626] disabled:opacity-40 shrink-0"
        >
          {busyId === profile.id ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
        </button>
      </div>

      {open && (
        <div className="px-4 pb-4 border-t border-[#f1f5f9] pt-3">
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-[12px] text-[#64748b] mb-3">
            <span>
              Overall <span className="text-[#0f172a] tabular-nums">{span(profile, profile.unit)}</span>
            </span>
            {profile.sopReferences.length > 0 && (
              <span>
                Procedures <span className="text-[#0f172a]">{profile.sopReferences.join(', ')}</span>
              </span>
            )}
          </div>

          {profile.subtypes.length > 0 ? (
            <div className="space-y-3">
              {profile.subtypes.map((s) => (
                <div key={s.id} className="rounded-lg border border-[#e2e8f0] p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="text-[13px] font-medium text-[#0f172a]">
                      {s.subtypeKey}
                      <span className="ml-2 text-[12px] font-normal text-[#64748b] tabular-nums">
                        {span(s, profile.unit)}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setAddingTo(addingTo === s.id ? null : s.id)}
                      className="text-[12px] text-[#7c3aed] hover:text-[#6d28d9] inline-flex items-center gap-1"
                    >
                      <Plus className="size-3.5" />
                      Range
                    </button>
                  </div>
                  <RangeTable
                    buckets={s.buckets}
                    unit={profile.unit}
                    onDelete={(bid) => onDeleteBucket(profile.id, bid)}
                    busy={busyId}
                  />
                  {addingTo === s.id && (
                    <AddRangeForm
                      unit={profile.unit}
                      saving={saving}
                      onCancel={() => setAddingTo(null)}
                      onAdd={(body) => add(s.id, body)}
                    />
                  )}
                </div>
              ))}
            </div>
          ) : (
            <>
              <RangeTable
                buckets={profile.buckets}
                unit={profile.unit}
                onDelete={(bid) => onDeleteBucket(profile.id, bid)}
                busy={busyId}
              />
              {addingTo === profile.id ? (
                <AddRangeForm
                  unit={profile.unit}
                  saving={saving}
                  onCancel={() => setAddingTo(null)}
                  onAdd={(body) => add(null, body)}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setAddingTo(profile.id)}
                  className="mt-2 text-[12px] text-[#7c3aed] hover:text-[#6d28d9] inline-flex items-center gap-1"
                >
                  <Plus className="size-3.5" />
                  Add range
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function AddProfileForm({ onCancel, onAdd, saving }: { onCancel: () => void; onAdd: (b: Record<string, unknown>) => void; saving: boolean }) {
  const [parameter, setParameter] = useState('')
  const [role, setRole] = useState<CapabilityRole>('MEASURING')
  const [unit, setUnit] = useState('')
  const [min, setMin] = useState('')
  const [max, setMax] = useState('')
  const uid = useId()
  const f = (name: string) => `${uid}-${name}`

  return (
    <div className="bg-white rounded-xl border border-[#e2e8f0] p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[14px] font-semibold text-[#0f172a]">New capability</h3>
        <button type="button" onClick={onCancel} aria-label="Cancel" className="text-[#94a3b8] hover:text-[#0f172a]">
          <X className="size-4" />
        </button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <div className="col-span-2">
          <label htmlFor={f('param')} className="block text-[11px] text-[#64748b] mb-1">Parameter</label>
          <input id={f('param')} className={input} value={parameter} onChange={(e) => setParameter(e.target.value)} placeholder="Pressure" />
        </div>
        <div>
          <label htmlFor={f('role')} className="block text-[11px] text-[#64748b] mb-1">Role</label>
          <select id={f('role')} className={input} value={role} onChange={(e) => setRole(e.target.value as CapabilityRole)}>
            <option value="MEASURING">Measuring</option>
            <option value="SOURCE">Source</option>
          </select>
        </div>
        <div>
          <label htmlFor={f('unit')} className="block text-[11px] text-[#64748b] mb-1">Unit</label>
          <input id={f('unit')} className={input} value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="bar" />
        </div>
        <div className="flex gap-1">
          <div>
            <label htmlFor={f('pmin')} className="block text-[11px] text-[#64748b] mb-1">From</label>
            <input id={f('pmin')} className={input} value={min} onChange={(e) => setMin(e.target.value)} inputMode="decimal" />
          </div>
          <div>
            <label htmlFor={f('pmax')} className="block text-[11px] text-[#64748b] mb-1">To</label>
            <input id={f('pmax')} className={input} value={max} onChange={(e) => setMax(e.target.value)} inputMode="decimal" />
          </div>
        </div>
      </div>
      <div className="flex justify-end mt-3">
        <button
          type="button"
          disabled={saving || !parameter.trim()}
          onClick={() => onAdd({ parameter, role, unit, min, max })}
          className="px-3 py-1.5 text-[12px] rounded-lg bg-[#7c3aed] text-white hover:bg-[#6d28d9] disabled:opacity-50"
        >
          {saving ? 'Adding…' : 'Add capability'}
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

export default function CapabilitiesTab({ instrumentId }: { instrumentId: string }) {
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [savingProfile, setSavingProfile] = useState(false)

  const base = `/api/admin/instruments/${instrumentId}/capabilities`

  /** Every failure says what went wrong. An empty list must mean "none", nothing else. */
  const explain = useCallback(async (res: Response, fallback: string) => {
    const body = await res.json().catch(() => null)
    if (body?.error) return body.error as string
    if (res.status === 401 || res.status === 403) return 'Your session has expired. Sign in again.'
    return `${fallback} (error ${res.status}).`
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiFetch(base)
      if (res.ok) {
        setData(await res.json())
      } else {
        setData(null)
        setError(await explain(res, 'Could not load capabilities'))
      }
    } catch {
      setData(null)
      setError('Could not reach the server. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }, [base, explain])

  useEffect(() => {
    void load()
  }, [load])

  /** Runs a change, then reloads, so what is shown is what the server holds. */
  const mutate = useCallback(
    async (url: string, init: RequestInit, fallback: string, busy?: string) => {
      setBusyId(busy ?? null)
      setError(null)
      try {
        const res = await apiFetch(url, {
          ...init,
          headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
        })
        if (!res.ok) {
          setError(await explain(res, fallback))
          return false
        }
        await load()
        return true
      } catch {
        setError('Could not reach the server. Check your connection and try again.')
        return false
      } finally {
        setBusyId(null)
      }
    },
    [explain, load],
  )

  const addProfile = async (body: Record<string, unknown>) => {
    setSavingProfile(true)
    try {
      const ok = await mutate(base, { method: 'POST', body: JSON.stringify(body) }, 'Could not add the capability')
      if (ok) setAdding(false)
    } finally {
      setSavingProfile(false)
    }
  }

  const deleteProfile = (profileId: string) =>
    mutate(`${base}/${profileId}`, { method: 'DELETE' }, 'Could not delete the capability', profileId)

  const addBucket = async (profileId: string, subtypeId: string | null, body: Record<string, unknown>) => {
    await mutate(
      `${base}/${profileId}/buckets`,
      { method: 'POST', body: JSON.stringify({ ...body, subtypeId }) },
      'Could not add the range',
    )
  }

  const deleteBucket = (profileId: string, bucketId: string) =>
    mutate(`${base}/${profileId}/buckets/${bucketId}`, { method: 'DELETE' }, 'Could not delete the range', bucketId)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="size-6 animate-spin text-[#94a3b8]" />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="bg-[#fef2f2] border border-[#fee2e2] rounded-lg p-3 flex items-start gap-2">
          <AlertCircle className="size-4 text-[#dc2626] mt-0.5 shrink-0" />
          <p className="text-[13px] text-[#dc2626] flex-1">{error}</p>
          <button type="button" onClick={() => void load()} className="text-[12px] text-[#dc2626] underline shrink-0">
            Try again
          </button>
        </div>
      )}

      {data && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-[13px] text-[#64748b]">
              {data.profiles.length === 0
                ? 'No capabilities recorded yet.'
                : `${data.profiles.length} capabilit${data.profiles.length === 1 ? 'y' : 'ies'}`}
              {data.assetType === 'composite' && data.components.length > 0 && (
                <>
                  {' · '}
                  {data.components
                    .map((c) => `${c.role === 'INDICATOR' ? 'Indicator' : 'Sensor'} ${c.serialNumber ?? c.model ?? ''}`.trim())
                    .join(', ')}
                </>
              )}
            </p>
            {!adding && (
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="px-3 py-1.5 text-[12px] rounded-lg border border-[#e2e8f0] text-[#0f172a] hover:bg-white inline-flex items-center gap-1"
              >
                <Plus className="size-3.5" />
                Add capability
              </button>
            )}
          </div>

          {adding && <AddProfileForm onCancel={() => setAdding(false)} onAdd={addProfile} saving={savingProfile} />}

          {data.profiles.map((p) => (
            <ProfileCard
              key={p.id}
              profile={p}
              busyId={busyId}
              onDeleteProfile={deleteProfile}
              onAddBucket={addBucket}
              onDeleteBucket={deleteBucket}
            />
          ))}
        </>
      )}
    </div>
  )
}
