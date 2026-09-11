'use client'

/**
 * Who the instrument is: what it is called, what it is made of, and when it was last
 * calibrated.
 *
 * Read by default. The page's Edit button turns every field into an input in place -
 * nothing moves, so the page does not jump under the reader - and Save puts it back.
 *
 * Components live here because they are identity, not capability. An indicator and its
 * sensor each have their own make, model and serial, and they are not a fixed pair:
 * 188 HTAIPL/L is one indicator with three transducers, each pairing carrying its own
 * certificate. So they are added and removed one at a time.
 */

import { useCallback, useEffect, useId, useState } from 'react'
import { AlertCircle, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react'
import { apiFetch } from '@/lib/api-client'

export interface BasicInfoValues {
  description: string
  category: string
  make: string
  model: string
  serialNumber: string
  assetNumber: string
  usage: string
  calibratedAtLocation: string
  reportNo: string
  calibrationDueDate: string
  remarks: string
}

interface Component {
  id: string
  componentKey: string
  role: 'INDICATOR' | 'SENSOR'
  make: string | null
  model: string | null
  serialNumber: string | null
}

const input =
  'w-full px-2.5 py-1.5 border border-[#e2e8f0] rounded-lg text-[13px] text-[#0f172a] placeholder:text-[#94a3b8] focus:ring-2 focus:ring-[#7c3aed]/20 focus:border-[#7c3aed] outline-none'

/** The asset number without its lab suffix, which is what people say out loud. */
function normalised(assetNumber: string): string | null {
  const m = /^\s*([\d,\s]+)/.exec(assetNumber)
  const n = m?.[1]?.trim()
  return n && n !== assetNumber.trim() ? n : null
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-[#e2e8f0] p-5">
      <h3 className="text-[11px] font-semibold tracking-[0.06em] text-[#94a3b8] mb-4">{title}</h3>
      {children}
    </div>
  )
}

function Field({
  label,
  value,
  editing,
  onChange,
  hint,
  placeholder,
  type,
}: {
  label: string
  value: string
  editing: boolean
  onChange: (v: string) => void
  hint?: string | null
  placeholder?: string
  type?: string
}) {
  const id = useId()
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="block text-[11px] text-[#64748b] mb-1">
        {label}
      </label>
      {editing ? (
        <input
          id={id}
          type={type}
          className={input}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <p className="text-[13px] text-[#0f172a] py-1.5">
          {value?.trim() ? value : <span className="text-[#94a3b8]">—</span>}
          {hint && <span className="text-[#94a3b8]"> ({hint})</span>}
        </p>
      )}
    </div>
  )
}

function ComponentRow({
  component,
  onSave,
  onDelete,
  busy,
}: {
  component: Component
  onSave: (id: string, patch: Record<string, string>) => Promise<boolean>
  onDelete: (id: string) => void
  busy: string | null
}) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    make: component.make ?? '',
    model: component.model ?? '',
    serialNumber: component.serialNumber ?? '',
  })

  const label = component.role === 'INDICATOR' ? 'Indicator' : 'Sensor'

  if (editing) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-4 gap-2 items-end py-2 border-b border-[#f1f5f9] last:border-0">
        <div className="text-[12px] text-[#64748b] pb-2">{label}</div>
        {(['make', 'model', 'serialNumber'] as const).map((k) => (
          <div key={k}>
            <label className="block text-[11px] text-[#94a3b8] mb-1">
              {k === 'serialNumber' ? 'Serial' : k === 'make' ? 'Make' : 'Model'}
            </label>
            <input
              className={input}
              value={form[k]}
              placeholder="same as instrument"
              onChange={(e) => setForm({ ...form, [k]: e.target.value })}
            />
          </div>
        ))}
        <div className="flex gap-2 justify-end md:col-span-4">
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="px-3 py-1.5 text-[12px] rounded-lg border border-[#e2e8f0] text-[#64748b] hover:bg-[#f8fafc]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={async () => {
              setSaving(true)
              const ok = await onSave(component.id, form)
              setSaving(false)
              if (ok) setEditing(false)
            }}
            className="px-3 py-1.5 text-[12px] rounded-lg bg-[#7c3aed] text-white hover:bg-[#6d28d9] disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3 py-2 border-b border-[#f1f5f9] last:border-0 text-[13px]">
      <span className="text-[#64748b] w-20 shrink-0">{label}</span>
      <span className="text-[#0f172a] truncate flex-1 min-w-0">
        {[component.make, component.model].filter(Boolean).join(' ') || (
          <span className="text-[#94a3b8]">same as instrument</span>
        )}
        {component.serialNumber && <span className="text-[#64748b]"> · {component.serialNumber}</span>}
      </span>
      <button
        type="button"
        onClick={() => setEditing(true)}
        aria-label={`Edit ${label}`}
        className="text-[#94a3b8] hover:text-[#7c3aed] shrink-0"
      >
        <Pencil className="size-3.5" />
      </button>
      <button
        type="button"
        onClick={() => onDelete(component.id)}
        disabled={busy === component.id}
        aria-label={`Remove ${label}`}
        className="text-[#94a3b8] hover:text-[#dc2626] disabled:opacity-40 shrink-0"
      >
        {busy === component.id ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
      </button>
    </div>
  )
}

export default function BasicInfoTab({
  instrumentId,
  values,
  editing,
  onChange,
  formatDate,
}: {
  instrumentId: string
  values: BasicInfoValues
  editing: boolean
  onChange: (patch: Partial<BasicInfoValues>) => void
  formatDate: (iso: string | null) => string
}) {
  const [components, setComponents] = useState<Component[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const base = `/api/admin/instruments/${instrumentId}`

  const load = useCallback(async () => {
    try {
      const res = await apiFetch(`${base}/capabilities`)
      if (!res.ok) return
      const d = await res.json().catch(() => null)
      setComponents(d?.components ?? [])
    } catch {
      // The identity fields still read fine without this; only the parts list is missing.
    }
  }, [base])

  useEffect(() => {
    void load()
  }, [load])

  const explain = async (res: Response, fallback: string) => {
    const body = await res.json().catch(() => null)
    return body?.error || `${fallback} (error ${res.status}).`
  }

  const addComponent = async (role: 'INDICATOR' | 'SENSOR') => {
    setAdding(true)
    setError(null)
    try {
      const res = await apiFetch(`${base}/components`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      })
      if (!res.ok) setError(await explain(res, 'Could not add the component'))
      else await load()
    } catch {
      setError('Could not reach the server.')
    } finally {
      setAdding(false)
    }
  }

  const saveComponent = async (id: string, patch: Record<string, string>) => {
    setError(null)
    try {
      const res = await apiFetch(`${base}/components/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!res.ok) {
        setError(await explain(res, 'Could not save the component'))
        return false
      }
      await load()
      return true
    } catch {
      setError('Could not reach the server.')
      return false
    }
  }

  const deleteComponent = async (id: string) => {
    setBusy(id)
    setError(null)
    try {
      const res = await apiFetch(`${base}/components/${id}`, { method: 'DELETE' })
      if (!res.ok) setError(await explain(res, 'Could not remove the component'))
      else await load()
    } catch {
      setError('Could not reach the server.')
    } finally {
      setBusy(null)
    }
  }

  const norm = normalised(values.assetNumber)

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-[#fef2f2] border border-[#fee2e2] rounded-lg p-3 flex items-start gap-2">
          <AlertCircle className="size-4 text-[#dc2626] mt-0.5 shrink-0" />
          <p className="text-[13px] text-[#dc2626] flex-1">{error}</p>
          <button type="button" onClick={() => setError(null)} aria-label="Dismiss" className="text-[#94a3b8]">
            <X className="size-4" />
          </button>
        </div>
      )}

      <Panel title="INSTRUMENT IDENTIFICATION">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
          <Field label="Description" value={values.description} editing={editing} onChange={(v) => onChange({ description: v })} />
          <Field label="Category" value={values.category} editing={editing} onChange={(v) => onChange({ category: v })} />
          <Field
            label="Asset Number"
            value={values.assetNumber}
            editing={editing}
            onChange={(v) => onChange({ assetNumber: v })}
            hint={norm ? `normalised: ${norm}` : null}
          />
          <Field label="Make" value={values.make} editing={editing} onChange={(v) => onChange({ make: v })} />
          <Field label="Model" value={values.model} editing={editing} onChange={(v) => onChange({ model: v })} />
          <Field label="Serial Number" value={values.serialNumber} editing={editing} onChange={(v) => onChange({ serialNumber: v })} />
        </div>

        <div className="mt-5 pt-4 border-t border-[#f1f5f9]">
          <div className="flex items-center justify-between mb-1">
            <h4 className="text-[11px] font-semibold tracking-[0.06em] text-[#94a3b8]">
              COMPONENTS
              {components && components.length > 0 && (
                <span className="ml-2 font-normal tracking-normal text-[#64748b]">composite</span>
              )}
            </h4>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => void addComponent('INDICATOR')}
                disabled={adding}
                className="text-[12px] text-[#7c3aed] hover:text-[#6d28d9] inline-flex items-center gap-1 disabled:opacity-50"
              >
                <Plus className="size-3.5" />
                Indicator
              </button>
              <button
                type="button"
                onClick={() => void addComponent('SENSOR')}
                disabled={adding}
                className="text-[12px] text-[#7c3aed] hover:text-[#6d28d9] inline-flex items-center gap-1 disabled:opacity-50"
              >
                <Plus className="size-3.5" />
                Sensor
              </button>
            </div>
          </div>

          {components === null ? (
            <p className="text-[12px] text-[#94a3b8] py-2">Loading…</p>
          ) : components.length === 0 ? (
            <p className="text-[12px] text-[#94a3b8] py-2">
              A simple instrument, in one piece. Add an indicator and a sensor if it is made of parts that are
              calibrated together.
            </p>
          ) : (
            <div>
              {components.map((c) => (
                <ComponentRow key={c.id} component={c} onSave={saveComponent} onDelete={deleteComponent} busy={busy} />
              ))}
            </div>
          )}
        </div>
      </Panel>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="OPERATIONAL DETAILS">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
            <Field label="Usage / Environment" value={values.usage} editing={editing} onChange={(v) => onChange({ usage: v })} />
            <Field
              label="Calibrated At"
              value={values.calibratedAtLocation}
              editing={editing}
              onChange={(v) => onChange({ calibratedAtLocation: v })}
            />
          </div>
        </Panel>

        <Panel title="CALIBRATION TRACKING">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
            <Field label="Report No." value={values.reportNo} editing={editing} onChange={(v) => onChange({ reportNo: v })} />
            {editing ? (
              <Field
                label="Next Due Date"
                value={values.calibrationDueDate}
                editing
                type="date"
                onChange={(v) => onChange({ calibrationDueDate: v })}
              />
            ) : (
              <div>
                <span className="block text-[11px] text-[#64748b] mb-1">Next Due Date</span>
                <p className="text-[13px] text-[#0f172a] py-1.5">{formatDate(values.calibrationDueDate || null)}</p>
              </div>
            )}
          </div>
        </Panel>
      </div>

      <Panel title="REMARKS / SPECIAL STATUS">
        {editing ? (
          <textarea
            className={`${input} min-h-[80px]`}
            value={values.remarks}
            placeholder="Under recalibration, service pending, and so on"
            onChange={(e) => onChange({ remarks: e.target.value })}
          />
        ) : (
          <p className="text-[13px] text-[#0f172a] whitespace-pre-wrap">
            {values.remarks?.trim() ? values.remarks : <span className="text-[#94a3b8]">—</span>}
          </p>
        )}
      </Panel>
    </div>
  )
}
