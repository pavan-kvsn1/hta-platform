'use client'

/**
 * A master instrument: everything about it, on one page.
 *
 * The banner never moves, whichever tab is open, so you can always see which instrument
 * you are looking at. Reading is the default; Edit turns the Basic Info fields into
 * inputs in place rather than sending you to another page - there is no separate edit
 * page, because two places to change one record is how they drift apart.
 *
 * The other tabs save as they go, so Edit only applies to Basic Info.
 */

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { AlertCircle, ChevronLeft, Loader2, Pencil, Trash2 } from 'lucide-react'
import { apiFetch } from '@/lib/api-client'
import { formatCertificateDate, DEFAULT_DATE_FORMAT } from '@/lib/certificate-date-format'
import InstrumentBanner from '@/components/admin/InstrumentBanner'
import BasicInfoTab, { type BasicInfoValues } from '@/components/admin/BasicInfoTab'
import CapabilitiesTab from '@/components/admin/CapabilitiesTab'
import CertificatesTab from '@/components/admin/CertificatesTab'
import MetadataTab from '@/components/admin/MetadataTab'
import AuditLogTab from '@/components/admin/AuditLogTab'

interface Instrument extends BasicInfoValues {
  id: string
  instrumentId: string
  version: number
  status: string
  daysUntilExpiry: number
  isActive: boolean
  parameterGroup: string | null
  sopReferences: string[]
  createdAt: string
  createdBy: { id: string; name: string; email: string } | null
}

type TabKey = 'basic' | 'capabilities' | 'certificates' | 'metadata' | 'audit'

const TABS: [TabKey, string][] = [
  ['basic', 'Basic Info'],
  ['capabilities', 'Capabilities'],
  ['certificates', 'Certificates'],
  ['metadata', 'Metadata'],
  ['audit', 'Audit Log'],
]

const STATUS_TONE: Record<string, string> = {
  VALID: 'bg-[#dcfce7] text-[#15803d]',
  EXPIRING_SOON: 'bg-[#fef3c7] text-[#92400e]',
  EXPIRED: 'bg-[#fee2e2] text-[#b91c1c]',
  UNDER_RECAL: 'bg-[#dbeafe] text-[#1d4ed8]',
}

const blank: BasicInfoValues = {
  description: '',
  category: '',
  make: '',
  model: '',
  serialNumber: '',
  assetNumber: '',
  usage: '',
  calibratedAtLocation: '',
  reportNo: '',
  calibrationDueDate: '',
  remarks: '',
}

export default function InstrumentDetail({ id }: { id: string }) {
  const router = useRouter()
  const [instrument, setInstrument] = useState<Instrument | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<TabKey>('basic')
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<BasicInfoValues>(blank)
  const [certificateCount, setCertificateCount] = useState<number | null>(null)

  const showDate = useCallback((iso: string | null) => formatCertificateDate(iso, DEFAULT_DATE_FORMAT, '—'), [])
  const showDateTime = useCallback((iso: string) => {
    const d = new Date(iso)
    const time = Number.isNaN(d.getTime())
      ? ''
      : ` ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    return `${formatCertificateDate(iso, DEFAULT_DATE_FORMAT, '—')}${time}`
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiFetch(`/api/admin/instruments/${id}`)
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        setInstrument(null)
        setError(
          body?.error ||
            (res.status === 404
              ? 'This instrument does not exist, or it belongs to another lab.'
              : res.status === 401 || res.status === 403
                ? 'Your session has expired. Sign in again.'
                : `Could not load the instrument (error ${res.status}).`),
        )
        return
      }
      const d = await res.json()
      setInstrument(d)
      setForm({
        description: d.description ?? '',
        category: d.category ?? '',
        make: d.make ?? '',
        model: d.model ?? '',
        serialNumber: d.serialNumber ?? '',
        assetNumber: d.assetNumber ?? '',
        usage: d.usage ?? '',
        calibratedAtLocation: d.calibratedAtLocation ?? '',
        reportNo: d.reportNo ?? '',
        calibrationDueDate: d.calibrationDueDate ? String(d.calibrationDueDate).slice(0, 10) : '',
        remarks: d.remarks ?? '',
      })
    } catch {
      setInstrument(null)
      setError('Could not reach the server. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  // Only the count, for the Metadata tab. Null until known, so it reads as "not counted"
  // rather than "none on file".
  useEffect(() => {
    let cancelled = false
    apiFetch(`/api/admin/instruments/${id}/certificates?includeInactive=true`)
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => {
        if (!cancelled && d) setCertificateCount(d.certificates?.length ?? 0)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [id])

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      const res = await apiFetch(`/api/admin/instruments/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, calibrationDueDate: form.calibrationDueDate || null }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        setError(body?.error || `Could not save the instrument (error ${res.status}).`)
        return
      }
      setEditing(false)
      // Saving makes a new version, which is a new row id, so the page has to follow it
      // or every later change would be written against the version it replaced.
      const nextId = body?.instrument?.id
      if (nextId && nextId !== id) router.replace(`/admin/instruments/${nextId}`)
      else await load()
    } catch {
      setError('Could not reach the server. Check your connection and try again.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-[#f1f5f9]">
        <Loader2 className="size-6 animate-spin text-[#94a3b8]" />
      </div>
    )
  }

  if (!instrument) {
    return (
      <div className="h-full flex items-center justify-center bg-[#f1f5f9] p-8">
        <div className="bg-white rounded-xl border border-[#e2e8f0] p-8 text-center max-w-md">
          <AlertCircle className="size-8 mx-auto mb-3 text-[#fca5a5]" />
          <p className="text-[14px] text-[#0f172a] mb-4">{error ?? 'Instrument not found'}</p>
          <div className="flex gap-2 justify-center">
            <button
              type="button"
              onClick={() => void load()}
              className="px-4 py-2 text-[13px] rounded-lg border border-[#e2e8f0] text-[#475569] hover:bg-[#f8fafc]"
            >
              Try again
            </button>
            <Link
              href="/admin/instruments"
              className="px-4 py-2 text-[13px] rounded-lg bg-[#0f172a] text-white hover:bg-[#1e293b]"
            >
              Back to Instruments
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto bg-[#f1f5f9]">
      {/* Full width. The range tables and the certificate grid both need it. */}
      <div className="p-6">
        <Link
          href="/admin/instruments"
          className="inline-flex items-center gap-1 text-[13px] text-[#64748b] hover:text-[#0f172a] mb-4 transition-colors"
        >
          <ChevronLeft className="size-4" />
          Back to Instruments
        </Link>

        <div className="flex items-center gap-3 flex-wrap mb-5">
          <h1 className="text-[20px] font-bold text-[#0f172a] tracking-tight min-w-0 truncate">
            {instrument.assetNumber}
            <span className="font-normal text-[#64748b]">: {instrument.description}</span>
          </h1>
          <span
            className={`px-2 py-0.5 text-[11px] font-semibold rounded-md ${STATUS_TONE[instrument.status] ?? STATUS_TONE.VALID}`}
          >
            {instrument.status.replace('_', ' ')}
          </span>
          {!instrument.isActive && (
            <span className="px-2 py-0.5 text-[11px] font-semibold rounded-md bg-[#f1f5f9] text-[#475569]">
              INACTIVE
            </span>
          )}

          <div className="flex items-center gap-2 ml-auto shrink-0">
            {editing ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setEditing(false)
                    void load()
                  }}
                  className="px-4 py-2 text-[12.5px] font-semibold rounded-[9px] border border-[#e2e8f0] text-[#64748b] hover:bg-white"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={saving}
                  className="px-4 py-2 text-[12.5px] font-semibold rounded-[9px] bg-[#7c3aed] text-white hover:bg-[#6d28d9] disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setTab('basic')
                    setEditing(true)
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-[12.5px] font-semibold text-white bg-[#0f172a] hover:bg-[#1e293b] rounded-[9px] transition-colors"
                >
                  <Pencil className="size-3.5" />
                  Edit
                </button>
                <Link
                  href={`/admin/instruments?deactivate=${instrument.id}`}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-[12.5px] font-semibold text-[#dc2626] bg-[#fef2f2] hover:bg-[#fee2e2] rounded-[9px] transition-colors"
                >
                  <Trash2 className="size-3.5" />
                  Deactivate
                </Link>
              </>
            )}
          </div>
        </div>

        <InstrumentBanner instrument={instrument} formatDate={showDate} />

        {error && (
          <div className="bg-[#fef2f2] border border-[#fee2e2] rounded-lg p-3 mb-4 flex items-start gap-2">
            <AlertCircle className="size-4 text-[#dc2626] mt-0.5 shrink-0" />
            <p className="text-[13px] text-[#dc2626]">{error}</p>
          </div>
        )}

        <div className="flex gap-1 mb-5 border-b border-[#e2e8f0] overflow-x-auto">
          {TABS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              // Leaving Basic Info mid-edit would hide fields that still hold unsaved
              // changes, so the other tabs wait until it is saved or cancelled.
              disabled={editing && key !== 'basic'}
              title={editing && key !== 'basic' ? 'Save or cancel your changes first' : undefined}
              aria-current={tab === key ? 'page' : undefined}
              className={
                tab === key
                  ? 'px-4 py-2 text-[13px] font-medium text-[#7c3aed] border-b-2 border-[#7c3aed] -mb-px whitespace-nowrap'
                  : 'px-4 py-2 text-[13px] text-[#64748b] hover:text-[#0f172a] border-b-2 border-transparent -mb-px whitespace-nowrap disabled:opacity-40'
              }
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'basic' && (
          <BasicInfoTab
            instrumentId={id}
            values={form}
            editing={editing}
            onChange={(patch) => setForm((f) => ({ ...f, ...patch }))}
            formatDate={showDate}
          />
        )}
        {tab === 'capabilities' && <CapabilitiesTab instrumentId={id} />}
        {tab === 'certificates' && <CertificatesTab instrumentId={id} formatDate={showDate} />}
        {tab === 'metadata' && (
          <MetadataTab
            instrumentId={id}
            version={instrument.version}
            createdAt={instrument.createdAt}
            createdByName={instrument.createdBy?.name ?? null}
            parameterGroup={instrument.parameterGroup}
            sopReferences={instrument.sopReferences}
            certificateCount={certificateCount}
            formatDate={showDate}
          />
        )}
        {tab === 'audit' && <AuditLogTab instrumentId={id} formatDateTime={showDateTime} />}
      </div>
    </div>
  )
}
