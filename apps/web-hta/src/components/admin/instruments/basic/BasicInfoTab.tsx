'use client'

/**
 * What the instrument is, and what it is made of.
 *
 * Editing is one panel wide. A pencil in a panel's corner edits that panel and
 * nothing else, so changing a due date never puts three unrelated blocks into
 * edit mode and leaves them looking changed when they are not - and the
 * sections never have to lock while an edit is open.
 */

import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api-client'
import { Icon } from '../Icons'
import ComponentsTable from './ComponentsTable'
import type { Component, Profile } from '../capabilities/CapabilitiesTab'

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

type PaneId = 'ident' | 'ops' | 'cal' | 'remarks'

/** Which panel owns each field, so a save sends only that panel's changes. */
const PANE_OF: Record<keyof BasicInfoValues, PaneId> = {
  description: 'ident',
  category: 'ident',
  assetNumber: 'ident',
  make: 'ident',
  model: 'ident',
  serialNumber: 'ident',
  usage: 'ops',
  calibratedAtLocation: 'ops',
  reportNo: 'cal',
  calibrationDueDate: 'cal',
  remarks: 'remarks',
}

function SectionCard({
  id,
  label,
  open,
  saving,
  onEdit,
  onCancel,
  onSave,
  children,
}: {
  id: PaneId
  label: string
  open: boolean
  saving: boolean
  onEdit: (id: PaneId) => void
  onCancel: () => void
  onSave: (id: PaneId) => void
  children: React.ReactNode
}) {
  return (
    <div className="card sec">
      <div className="sechead">
        <span className="lbl">{label}</span>
        {open ? (
          <span className="secacts">
            <button type="button" className="tbtn xs" onClick={onCancel} disabled={saving}>
              Cancel
            </button>
            <button type="button" className="tbtn xs solid" onClick={() => onSave(id)} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </span>
        ) : (
          <button type="button" className="iconbtn secedit" aria-label={`Edit ${label}`} onClick={() => onEdit(id)}>
            <Icon.pen />
          </button>
        )}
      </div>
      {children}
    </div>
  )
}

export default function BasicInfoTab({
  instrumentId,
  values,
  onChange,
  onSave,
  formatDate,
  onDeclare,
}: {
  instrumentId: string
  values: BasicInfoValues
  onChange: (patch: Partial<BasicInfoValues>) => void
  onSave: (patch: Partial<BasicInfoValues>) => Promise<boolean>
  formatDate: (iso: string | null) => string
  /** Open the capability form on this component and parameter. */
  onDeclare: (componentId: string, parameter: string, role: string) => void
}) {
  const [pane, setPane] = useState<PaneId | null>(null)
  const [saving, setSaving] = useState(false)
  const [before, setBefore] = useState<BasicInfoValues | null>(null)

  const [components, setComponents] = useState<Component[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadParts = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/admin/instruments/${instrumentId}/capabilities`)
      if (!res.ok) return
      const d = await res.json()
      setComponents(d.components ?? [])
      setProfiles(d.profiles ?? [])
    } catch {
      /* the table shows what it has; a failed refresh is not an error state */
    }
  }, [instrumentId])

  useEffect(() => {
    void loadParts()
  }, [loadParts])

  const openPane = (id: PaneId) => {
    setBefore(values)
    setPane(id)
  }
  const cancel = () => {
    // Put back what was there, so an abandoned edit leaves nothing behind.
    if (before) onChange(before)
    setBefore(null)
    setPane(null)
  }
  const savePane = async (id: PaneId) => {
    setSaving(true)
    const patch: Partial<BasicInfoValues> = {}
    for (const k of Object.keys(PANE_OF) as (keyof BasicInfoValues)[]) {
      if (PANE_OF[k] === id) patch[k] = values[k]
    }
    const ok = await onSave(patch)
    setSaving(false)
    if (ok) {
      setBefore(null)
      setPane(null)
    }
  }

  const field = (
    k: keyof BasicInfoValues,
    label: string,
    shown?: React.ReactNode,
    hint?: string,
  ) => {
    const editing = pane === PANE_OF[k]
    return (
      <div className="f" key={k}>
        <span className="k">{label}</span>
        {editing ? (
          <input value={values[k]} onChange={(e) => onChange({ [k]: e.target.value })} />
        ) : (
          <span className={'v' + (values[k] ? '' : ' empty')}>
            {shown ?? (values[k] || '—')}
            {hint ? <span className="hint"> ({hint})</span> : null}
          </span>
        )}
      </div>
    )
  }

  const componentCall = async (run: () => Promise<Response>) => {
    setBusy(true)
    setError(null)
    try {
      const res = await run()
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        setError(body?.error || `The server refused that (error ${res.status}).`)
        return false
      }
      await loadParts()
      return true
    } catch {
      setError('Could not reach the server.')
      return false
    } finally {
      setBusy(false)
    }
  }

  const pane_ = { open: false, saving, onEdit: openPane, onCancel: cancel, onSave: savePane }

  return (
    <>
      {error && (
        <div className="card sec" style={{ borderColor: 'var(--crit-br)', background: 'var(--crit-bg)' }}>
          <p style={{ margin: 0, color: 'var(--crit-tx)' }}>{error}</p>
        </div>
      )}

      <SectionCard {...pane_} id="ident" label="Instrument Identification" open={pane === 'ident'}>
        <div className="grid3">
          {field('description', 'Description')}
          {field('category', 'Category')}
          {field('assetNumber', 'Asset Number', <span className="mono">{values.assetNumber || '—'}</span>)}
          {field('make', 'Make')}
          {field('model', 'Model')}
          {field('serialNumber', 'Serial Number', <span className="mono">{values.serialNumber || '—'}</span>)}
        </div>

        <ComponentsTable
          components={components}
          profiles={profiles}
          busy={busy}
          onAdd={async (d) => {
            setBusy(true)
            setError(null)
            try {
              const res = await apiFetch(`/api/admin/instruments/${instrumentId}/components`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(d),
              })
              const body = await res.json().catch(() => null)
              if (!res.ok) {
                setError(body?.error || `The server refused that (error ${res.status}).`)
                return null
              }
              await loadParts()
              return body?.component?.id ?? null
            } catch {
              setError('Could not reach the server.')
              return null
            } finally {
              setBusy(false)
            }
          }}
          onSave={async (cid, d, removed) => {
            const ok = await componentCall(() =>
              apiFetch(`/api/admin/instruments/${instrumentId}/components/${cid}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(d),
              }),
            )
            if (!ok || removed.length === 0) return ok
            // Taking a parameter off a component removes the capabilities under it;
            // their ranges go with them, which is what the confirmation said.
            for (const pr of profiles.filter(
              (x) => x.componentId === cid && removed.includes(x.parameter),
            )) {
              const gone = await componentCall(() =>
                apiFetch(`/api/admin/instruments/${instrumentId}/capabilities/${pr.id}`, {
                  method: 'DELETE',
                }),
              )
              if (!gone) return false
            }
            return true
          }}
          onDeclare={onDeclare}
          onDelete={async (c) => {
            const mine = profiles.filter((p) => p.componentId === c.id)
            const warning = mine.length
              ? `Remove ${c.name}? Its ${mine.length} capabilit${mine.length === 1 ? 'y' : 'ies'} and their ranges go with it.`
              : `Remove ${c.name}?`
            if (!window.confirm(warning)) return
            await componentCall(() =>
              apiFetch(`/api/admin/instruments/${instrumentId}/components/${c.id}`, { method: 'DELETE' }),
            )
          }}
        />
      </SectionCard>

      <div className="grid2" style={{ gap: 14 }}>
        <SectionCard {...pane_} id="ops" label="Operational Details" open={pane === 'ops'}>
          <div className="grid2">
            {field('usage', 'Usage / Environment')}
            {field('calibratedAtLocation', 'Calibrated At')}
          </div>
        </SectionCard>

        <SectionCard {...pane_} id="cal" label="Calibration Tracking" open={pane === 'cal'}>
          <div className="grid2">
            {field('reportNo', 'Report No.', <span className="mono">{values.reportNo || '—'}</span>)}
            {field(
              'calibrationDueDate',
              'Next Due Date',
              <span className="mono">{formatDate(values.calibrationDueDate || null)}</span>,
            )}
          </div>
        </SectionCard>
      </div>

      <SectionCard {...pane_} id="remarks" label="Remarks / Special Status" open={pane === 'remarks'}>
        {pane === 'remarks' ? (
          <div className="f">
            <textarea
              rows={3}
              value={values.remarks}
              placeholder="Under recalibration, service pending, and so on"
              onChange={(e) => onChange({ remarks: e.target.value })}
            />
          </div>
        ) : (
          <span className={'v' + (values.remarks ? '' : ' empty')}>{values.remarks || '—'}</span>
        )}
      </SectionCard>
    </>
  )
}
