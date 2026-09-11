'use client'

/**
 * What an instrument measures or sources, at what resolution, and how accurately.
 *
 * Laid out as the wireframe has it: a toolbar, then one card per capability profile,
 * each holding its own range buckets.
 *
 *   CAPABILITY PROFILE 1: PRESSURE (measuring)
 *     Parameter / Role / Unit / Min / Max
 *     RANGE BUCKETS:
 *       B1  0 to 100 bar   0.01 bar   ±0.1%FS   [Edit] [Del]
 *
 * A profile with subtypes lists them instead, each with its own buckets, because Type J
 * stops at 1200 °C where Type K keeps going. The two are never shown at once, so nobody
 * has to work out which level a number belongs to.
 */

import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Loader2,
  Pencil,
  Plus,
  ShieldCheck,
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
const toolbarBtn =
  'px-3 py-1.5 text-[12px] rounded-lg border border-[#e2e8f0] bg-white text-[#0f172a] hover:bg-[#f8fafc] inline-flex items-center gap-1 disabled:opacity-50'

/**
 * A span, written the way an engineer would read it.
 *
 * An exclusive bound is spelled out, because two ranges meeting at 100 have to say which
 * one owns 100 - otherwise a reading at the boundary takes whichever accuracy is found
 * first.
 */
function span(
  x: { min: number | null; max: number | null; minInclusive: boolean; maxInclusive: boolean },
  unit?: string,
) {
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

/**
 * What "Validate All" checks: the things that make a range table unusable at the moment
 * an engineer needs it, rather than everything that could be tidier.
 */
function validate(profiles: Profile[]): string[] {
  const problems: string[] = []
  for (const p of profiles) {
    const groups: [string, Bucket[]][] = p.subtypes.length
      ? p.subtypes.map((s) => [`${p.profileKey} › ${s.subtypeKey}`, s.buckets])
      : [[p.profileKey, p.buckets]]

    if (!p.unit) problems.push(`${p.profileKey} ${p.parameter}: no unit`)
    if (p.subtypes.length === 0 && p.buckets.length === 0)
      problems.push(`${p.profileKey} ${p.parameter}: no ranges recorded`)

    for (const [where, buckets] of groups) {
      const ordered = [...buckets]
        .filter((b) => b.min !== null && b.max !== null)
        .sort((a, b) => (a.min ?? 0) - (b.min ?? 0))

      // Named by position, as the table numbers them.
      const numberOf = (b: Bucket) => buckets.indexOf(b) + 1
      for (let i = 1; i < ordered.length; i++) {
        const prev = ordered[i - 1]
        const cur = ordered[i]
        // Both claiming the boundary is the failure that matters: a reading at exactly
        // that value would take whichever accuracy happened to be found first.
        if ((cur.min as number) < (prev.max as number))
          problems.push(`${where}: ranges ${numberOf(prev)} and ${numberOf(cur)} overlap`)
        else if ((cur.min as number) === (prev.max as number) && cur.minInclusive && prev.maxInclusive)
          problems.push(`${where}: ranges ${numberOf(prev)} and ${numberOf(cur)} both include ${cur.min}`)
        else if ((cur.min as number) > (prev.max as number))
          problems.push(`${where}: nothing covers ${prev.max} to ${cur.min}`)
      }
    }
  }
  return problems
}

// ---------------------------------------------------------------------------

function RangeTable({
  buckets,
  unit,
  onEdit,
  onDelete,
  busy,
}: {
  buckets: Bucket[]
  unit: string
  onEdit: (b: Bucket) => void
  onDelete: (bucketId: string) => void
  busy: string | null
}) {
  if (!buckets.length) return <p className="text-[12px] text-[#94a3b8] py-2">No ranges recorded.</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="text-left text-[#64748b] border-b border-[#e2e8f0]">
            <th className="py-1.5 pr-3 font-medium w-8">#</th>
            <th className="py-1.5 pr-3 font-medium">Range</th>
            <th className="py-1.5 pr-3 font-medium">Least Count</th>
            <th className="py-1.5 pr-3 font-medium">Accuracy</th>
            <th className="py-1.5 font-medium w-24 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {/* Numbered by position. The internal key is kept out of sight: it exists so the
              audit log can point at a range that outlives its row number. */}
          {buckets.map((b, i) => (
            <tr key={b.id} className="border-b border-[#f1f5f9] last:border-0">
              <td className="py-1.5 pr-3 text-[#94a3b8] tabular-nums">{i + 1}</td>
              <td className="py-1.5 pr-3 text-[#0f172a] tabular-nums">{span(b, unit)}</td>
              <td className="py-1.5 pr-3 text-[#334155]">
                <Undeclared>{leastCountText(b)}</Undeclared>
              </td>
              <td className="py-1.5 pr-3 text-[#334155]">
                <Undeclared>{accuracyText(b)}</Undeclared>
              </td>
              <td className="py-1.5 text-right whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => onEdit(b)}
                  disabled={busy === b.id}
                  aria-label={`Edit range ${i + 1}`}
                  className="text-[#94a3b8] hover:text-[#7c3aed] disabled:opacity-40 mr-2"
                >
                  <Pencil className="size-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(b.id)}
                  disabled={busy === b.id}
                  aria-label={`Delete range ${i + 1}`}
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

function RangeForm({
  unit,
  existing,
  onCancel,
  onSave,
  saving,
}: {
  unit: string
  existing: Bucket | null
  onCancel: () => void
  onSave: (body: Record<string, unknown>) => void
  saving: boolean
}) {
  const [min, setMin] = useState(existing?.min?.toString() ?? '')
  const [max, setMax] = useState(existing?.max?.toString() ?? '')
  const [minInclusive, setMinInclusive] = useState(existing?.minInclusive ?? true)
  const [maxInclusive, setMaxInclusive] = useState(existing?.maxInclusive ?? true)
  const [leastCount, setLeastCount] = useState(existing?.leastCountValue?.toString() ?? '')
  const [kind, setKind] = useState<AccuracyKind>(existing?.accuracyKind ?? 'SYMMETRIC')
  const [value, setValue] = useState(existing?.accuracyValue?.toString() ?? '')
  const [accUnit, setAccUnit] = useState(existing?.accuracyUnit ?? unit)
  const [formula, setFormula] = useState(existing?.accuracyFormula ?? '')
  const [cls, setCls] = useState(existing?.accuracyClass ?? '')
  // Several of these can be open at once, one per subtype, so the ids have to be unique
  // per instance or a label points at another form's input.
  const uid = useId()
  const f = (n: string) => `${uid}-${n}`

  return (
    <div className="mt-3 p-3 rounded-lg border border-[#e2e8f0] bg-[#f8fafc]">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-2">
        <div>
          <label htmlFor={f('min')} className="block text-[11px] text-[#64748b] mb-1">
            Min
          </label>
          <input id={f('min')} className={input} value={min} onChange={(e) => setMin(e.target.value)} inputMode="decimal" />
        </div>
        <div>
          <label htmlFor={f('max')} className="block text-[11px] text-[#64748b] mb-1">
            Max
          </label>
          <input id={f('max')} className={input} value={max} onChange={(e) => setMax(e.target.value)} inputMode="decimal" />
        </div>
        <div>
          <label htmlFor={f('lc')} className="block text-[11px] text-[#64748b] mb-1">
            Least Count
          </label>
          <input
            id={f('lc')}
            className={input}
            value={leastCount}
            onChange={(e) => setLeastCount(e.target.value)}
            placeholder="blank if none"
            inputMode="decimal"
          />
        </div>
        <div>
          <label htmlFor={f('acckind')} className="block text-[11px] text-[#64748b] mb-1">
            Accuracy
          </label>
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
              <label htmlFor={f('accval')} className="block text-[11px] text-[#64748b] mb-1">
                ± value
              </label>
              <input id={f('accval')} className={input} value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" />
            </div>
            <div>
              <label htmlFor={f('accunit')} className="block text-[11px] text-[#64748b] mb-1">
                Accuracy unit
              </label>
              <input id={f('accunit')} className={input} value={accUnit} onChange={(e) => setAccUnit(e.target.value)} placeholder="°C, %FS" />
            </div>
          </>
        )}
        {kind === 'FORMULA' && (
          <div className="col-span-2 md:col-span-3">
            <label htmlFor={f('formula')} className="block text-[11px] text-[#64748b] mb-1">
              Formula, exactly as the certificate states it
            </label>
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
            <label htmlFor={f('class')} className="block text-[11px] text-[#64748b] mb-1">
              Class
            </label>
            <input id={f('class')} className={input} value={cls} onChange={(e) => setCls(e.target.value)} placeholder="Class 1" />
          </div>
        )}

        <div className="flex flex-col gap-1 text-[12px] text-[#64748b]">
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={minInclusive} onChange={(e) => setMinInclusive(e.target.checked)} />
            Min Inc.
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={maxInclusive} onChange={(e) => setMaxInclusive(e.target.checked)} />
            Max Inc.
          </label>
        </div>

        <div className="flex gap-2 justify-end col-span-2 md:col-span-1">
          <button type="button" onClick={onCancel} className="px-3 py-1.5 text-[12px] rounded-lg border border-[#e2e8f0] text-[#64748b] hover:bg-white">
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() =>
              onSave({
                min,
                max,
                minInclusive,
                maxInclusive,
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
            {saving ? 'Saving…' : existing ? 'Save range' : 'Add Bucket'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ProfileCard({
  profile,
  index,
  open,
  onToggle,
  onDeleteProfile,
  onUpdateProfile,
  onSaveBucket,
  onDeleteBucket,
  busyId,
}: {
  profile: Profile
  index: number
  open: boolean
  onToggle: () => void
  onDeleteProfile: (id: string) => void
  onUpdateProfile: (id: string, body: Record<string, unknown>) => Promise<boolean>
  onSaveBucket: (profileId: string, subtypeId: string | null, bucket: Bucket | null, body: Record<string, unknown>) => Promise<void>
  onDeleteBucket: (profileId: string, bucketId: string) => void
  busyId: string | null
}) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    parameter: profile.parameter,
    role: profile.role,
    unit: profile.unit,
    min: profile.min?.toString() ?? '',
    max: profile.max?.toString() ?? '',
    minInclusive: profile.minInclusive,
    maxInclusive: profile.maxInclusive,
  })
  /** null = not adding; a subtype id or 'profile' = adding there. */
  const [addingTo, setAddingTo] = useState<string | null>(null)
  const [editingBucket, setEditingBucket] = useState<Bucket | null>(null)
  const uid = useId()
  const f = (n: string) => `${uid}-${n}`

  const rangeCount = profile.buckets.length + profile.subtypes.reduce((n, s) => n + s.buckets.length, 0)

  const saveBucket = async (subtypeId: string | null, bucket: Bucket | null, body: Record<string, unknown>) => {
    setSaving(true)
    try {
      await onSaveBucket(profile.id, subtypeId, bucket, body)
      setAddingTo(null)
      setEditingBucket(null)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-[#e2e8f0] overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-label={`${open ? 'Collapse' : 'Expand'} ${profile.parameter}`}
          className="flex items-center gap-2 flex-1 text-left min-w-0"
        >
          {open ? (
            <ChevronDown className="size-4 text-[#94a3b8] shrink-0" />
          ) : (
            <ChevronRight className="size-4 text-[#94a3b8] shrink-0" />
          )}
          <span className="text-[13px] font-semibold text-[#0f172a] truncate">
            CAPABILITY PROFILE {index + 1}: {profile.parameter.toUpperCase()}{' '}
            <span className="font-normal text-[#64748b]">({profile.role.toLowerCase()})</span>
            {profile.subtypes.length > 0 && <span className="font-normal text-[#94a3b8]"> — WITH SUBTYPES</span>}
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
          onClick={() => {
            setEditing((e) => !e)
            if (!open) onToggle()
          }}
          aria-label={`Edit capability ${profile.parameter}`}
          className="text-[#94a3b8] hover:text-[#7c3aed] shrink-0"
        >
          <Pencil className="size-4" />
        </button>
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
          {editing ? (
            <div className="mb-4 p-3 rounded-lg border border-[#e2e8f0] bg-[#f8fafc]">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-2">
                <div>
                  <label htmlFor={f('param')} className="block text-[11px] text-[#64748b] mb-1">
                    Parameter
                  </label>
                  <input id={f('param')} className={input} value={form.parameter} onChange={(e) => setForm({ ...form, parameter: e.target.value })} />
                </div>
                <div>
                  <label htmlFor={f('role')} className="block text-[11px] text-[#64748b] mb-1">
                    Role
                  </label>
                  <select id={f('role')} className={input} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as CapabilityRole })}>
                    <option value="MEASURING">Measuring</option>
                    <option value="SOURCE">Source</option>
                  </select>
                </div>
                <div>
                  <label htmlFor={f('unit')} className="block text-[11px] text-[#64748b] mb-1">
                    Unit
                  </label>
                  <input id={f('unit')} className={input} value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 items-end">
                <div>
                  <label htmlFor={f('pmin')} className="block text-[11px] text-[#64748b] mb-1">
                    Min
                  </label>
                  <input id={f('pmin')} className={input} value={form.min} onChange={(e) => setForm({ ...form, min: e.target.value })} inputMode="decimal" />
                </div>
                <div>
                  <label htmlFor={f('pmax')} className="block text-[11px] text-[#64748b] mb-1">
                    Max
                  </label>
                  <input id={f('pmax')} className={input} value={form.max} onChange={(e) => setForm({ ...form, max: e.target.value })} inputMode="decimal" />
                </div>
                <div className="flex flex-col gap-1 text-[12px] text-[#64748b]">
                  <label className="flex items-center gap-1.5">
                    <input type="checkbox" checked={form.minInclusive} onChange={(e) => setForm({ ...form, minInclusive: e.target.checked })} />
                    Min Inc.
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input type="checkbox" checked={form.maxInclusive} onChange={(e) => setForm({ ...form, maxInclusive: e.target.checked })} />
                    Max Inc.
                  </label>
                </div>
                <div className="flex gap-2 justify-end">
                  <button type="button" onClick={() => setEditing(false)} className="px-3 py-1.5 text-[12px] rounded-lg border border-[#e2e8f0] text-[#64748b] hover:bg-white">
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={async () => {
                      setSaving(true)
                      const ok = await onUpdateProfile(profile.id, form)
                      setSaving(false)
                      if (ok) setEditing(false)
                    }}
                    className="px-3 py-1.5 text-[12px] rounded-lg bg-[#7c3aed] text-white hover:bg-[#6d28d9] disabled:opacity-50"
                  >
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-[12px] text-[#64748b] mb-3">
              <span>
                Parameter <span className="text-[#0f172a]">{profile.parameter}</span>
              </span>
              <span>
                Role <span className="text-[#0f172a]">{profile.role.toLowerCase()}</span>
              </span>
              <span>
                Unit <span className="text-[#0f172a]">{profile.unit || '—'}</span>
              </span>
              <span>
                Min / Max <span className="text-[#0f172a] tabular-nums">{span(profile, profile.unit)}</span>
              </span>
              {profile.sopReferences.length > 0 && (
                <span>
                  Procedures <span className="text-[#0f172a]">{profile.sopReferences.join(', ')}</span>
                </span>
              )}
            </div>
          )}

          {profile.subtypes.length > 0 ? (
            <>
              <p className="text-[11px] font-semibold text-[#64748b] mb-2">
                AVAILABLE SUBTYPES:{' '}
                <span className="font-normal text-[#0f172a]">
                  {profile.subtypes.map((s) => s.subtypeKey).join('  ·  ')}
                </span>
              </p>
              <div className="space-y-3">
                {profile.subtypes.map((s) => (
                  <div key={s.id} className="rounded-lg border border-[#e2e8f0] p-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="text-[13px] font-medium text-[#0f172a]">
                        {s.subtypeKey}
                        <span className="ml-2 text-[12px] font-normal text-[#64748b] tabular-nums">{span(s, profile.unit)}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingBucket(null)
                          setAddingTo(addingTo === s.id ? null : s.id)
                        }}
                        className="text-[12px] text-[#7c3aed] hover:text-[#6d28d9] inline-flex items-center gap-1"
                      >
                        <Plus className="size-3.5" />
                        Add Bucket
                      </button>
                    </div>
                    <p className="text-[11px] font-semibold text-[#64748b] mb-1">RANGE BUCKETS:</p>
                    <RangeTable
                      buckets={s.buckets}
                      unit={profile.unit}
                      onEdit={(b) => {
                        setAddingTo(null)
                        setEditingBucket(b)
                      }}
                      onDelete={(bid) => onDeleteBucket(profile.id, bid)}
                      busy={busyId}
                    />
                    {addingTo === s.id && (
                      <RangeForm unit={profile.unit} existing={null} saving={saving} onCancel={() => setAddingTo(null)} onSave={(b) => saveBucket(s.id, null, b)} />
                    )}
                    {editingBucket && s.buckets.some((b) => b.id === editingBucket.id) && (
                      <RangeForm
                        unit={profile.unit}
                        existing={editingBucket}
                        saving={saving}
                        onCancel={() => setEditingBucket(null)}
                        onSave={(b) => saveBucket(s.id, editingBucket, b)}
                      />
                    )}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              <p className="text-[11px] font-semibold text-[#64748b] mb-1">RANGE BUCKETS:</p>
              <RangeTable
                buckets={profile.buckets}
                unit={profile.unit}
                onEdit={(b) => {
                  setAddingTo(null)
                  setEditingBucket(b)
                }}
                onDelete={(bid) => onDeleteBucket(profile.id, bid)}
                busy={busyId}
              />
              {addingTo === 'profile' && (
                <RangeForm unit={profile.unit} existing={null} saving={saving} onCancel={() => setAddingTo(null)} onSave={(b) => saveBucket(null, null, b)} />
              )}
              {editingBucket && (
                <RangeForm
                  unit={profile.unit}
                  existing={editingBucket}
                  saving={saving}
                  onCancel={() => setEditingBucket(null)}
                  onSave={(b) => saveBucket(null, editingBucket, b)}
                />
              )}
              {addingTo !== 'profile' && !editingBucket && (
                <button
                  type="button"
                  onClick={() => setAddingTo('profile')}
                  className="mt-2 text-[12px] text-[#7c3aed] hover:text-[#6d28d9] inline-flex items-center gap-1"
                >
                  <Plus className="size-3.5" />
                  Add Bucket
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
  const f = (n: string) => `${uid}-${n}`

  return (
    <div className="bg-white rounded-xl border border-[#e2e8f0] p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[14px] font-semibold text-[#0f172a]">New capability profile</h3>
        <button type="button" onClick={onCancel} aria-label="Cancel" className="text-[#94a3b8] hover:text-[#0f172a]">
          <X className="size-4" />
        </button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <div className="col-span-2">
          <label htmlFor={f('param')} className="block text-[11px] text-[#64748b] mb-1">
            Parameter
          </label>
          <input id={f('param')} className={input} value={parameter} onChange={(e) => setParameter(e.target.value)} placeholder="Pressure" />
        </div>
        <div>
          <label htmlFor={f('role')} className="block text-[11px] text-[#64748b] mb-1">
            Role
          </label>
          <select id={f('role')} className={input} value={role} onChange={(e) => setRole(e.target.value as CapabilityRole)}>
            <option value="MEASURING">Measuring</option>
            <option value="SOURCE">Source</option>
          </select>
        </div>
        <div>
          <label htmlFor={f('unit')} className="block text-[11px] text-[#64748b] mb-1">
            Unit
          </label>
          <input id={f('unit')} className={input} value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="bar" />
        </div>
        <div className="flex gap-1">
          <div>
            <label htmlFor={f('pmin')} className="block text-[11px] text-[#64748b] mb-1">
              Min
            </label>
            <input id={f('pmin')} className={input} value={min} onChange={(e) => setMin(e.target.value)} inputMode="decimal" />
          </div>
          <div>
            <label htmlFor={f('pmax')} className="block text-[11px] text-[#64748b] mb-1">
              Max
            </label>
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
          {saving ? 'Adding…' : 'Add Profile'}
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
  const [openIds, setOpenIds] = useState<Set<string>>(new Set())
  const [problems, setProblems] = useState<string[] | null>(null)

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
      if (res.ok) setData(await res.json())
      else {
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
        const res = await apiFetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) } })
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

  const updateProfile = (profileId: string, body: Record<string, unknown>) =>
    mutate(`${base}/${profileId}`, { method: 'PATCH', body: JSON.stringify(body) }, 'Could not save the capability', profileId)

  const deleteProfile = (profileId: string) =>
    mutate(`${base}/${profileId}`, { method: 'DELETE' }, 'Could not delete the capability', profileId)

  const saveBucket = async (profileId: string, subtypeId: string | null, bucket: Bucket | null, body: Record<string, unknown>) => {
    if (bucket) {
      await mutate(`${base}/${profileId}/buckets/${bucket.id}`, { method: 'PATCH', body: JSON.stringify(body) }, 'Could not save the range', bucket.id)
    } else {
      await mutate(`${base}/${profileId}/buckets`, { method: 'POST', body: JSON.stringify({ ...body, subtypeId }) }, 'Could not add the range')
    }
  }

  const deleteBucket = (profileId: string, bucketId: string) =>
    mutate(`${base}/${profileId}/buckets/${bucketId}`, { method: 'DELETE' }, 'Could not delete the range', bucketId)

  const allIds = useMemo(() => (data?.profiles ?? []).map((p) => p.id), [data])

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
        <button type="button" onClick={() => setAdding(true)} disabled={adding} className={toolbarBtn}>
          <Plus className="size-3.5" />
          Add Profile
        </button>
        <button
          type="button"
          onClick={() => setProblems(validate(data?.profiles ?? []))}
          disabled={!data?.profiles.length}
          className={toolbarBtn}
        >
          <ShieldCheck className="size-3.5" />
          Validate All
        </button>
        <button type="button" onClick={() => setOpenIds(new Set())} className={toolbarBtn}>
          Collapse All
        </button>
        <button type="button" onClick={() => setOpenIds(new Set(allIds))} className={toolbarBtn}>
          Expand All
        </button>

        {data && (
          <span className="text-[12px] text-[#94a3b8] ml-auto">
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
          </span>
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

      {problems !== null && (
        <div
          className={`rounded-lg border p-3 ${problems.length ? 'bg-[#fffbeb] border-[#fde68a]' : 'bg-[#f0fdf4] border-[#bbf7d0]'}`}
        >
          <div className="flex items-start gap-2">
            <ShieldCheck className={`size-4 mt-0.5 shrink-0 ${problems.length ? 'text-[#b45309]' : 'text-[#15803d]'}`} />
            <div className="flex-1">
              <p className={`text-[13px] ${problems.length ? 'text-[#b45309]' : 'text-[#15803d]'}`}>
                {problems.length === 0
                  ? 'Every range is covered once, with no gaps and no overlaps.'
                  : `${problems.length} thing${problems.length === 1 ? '' : 's'} to look at`}
              </p>
              {problems.length > 0 && (
                <ul className="mt-1.5 space-y-0.5 text-[12px] text-[#92400e] list-disc list-inside">
                  {problems.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              )}
            </div>
            <button type="button" onClick={() => setProblems(null)} aria-label="Dismiss" className="text-[#94a3b8] hover:text-[#0f172a]">
              <X className="size-4" />
            </button>
          </div>
        </div>
      )}

      {adding && <AddProfileForm onCancel={() => setAdding(false)} onAdd={addProfile} saving={savingProfile} />}

      {data?.profiles.map((p, i) => (
        <ProfileCard
          key={p.id}
          profile={p}
          index={i}
          open={openIds.has(p.id)}
          onToggle={() =>
            setOpenIds((prev) => {
              const next = new Set(prev)
              if (next.has(p.id)) next.delete(p.id)
              else next.add(p.id)
              return next
            })
          }
          busyId={busyId}
          onDeleteProfile={deleteProfile}
          onUpdateProfile={updateProfile}
          onSaveBucket={saveBucket}
          onDeleteBucket={deleteBucket}
        />
      ))}
    </div>
  )
}
