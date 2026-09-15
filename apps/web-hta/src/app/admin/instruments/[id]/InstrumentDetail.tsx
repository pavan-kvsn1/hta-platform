'use client'

/**
 * A master instrument: everything about it, on one page.
 *
 * The banner never moves, whichever section is open, so you can always see
 * which instrument you are looking at. The sections run across the page as one
 * band, each carrying its own state and count, so what needs attention is
 * visible without opening anything.
 *
 * Editing is one panel wide. There is no page-level Edit and no separate edit
 * page: each panel carries its own pencil, so changing a due date never puts
 * three unrelated blocks into edit mode, and moving between sections never has
 * to be blocked by an edit in progress.
 *
 * The layout and the class names come from the reviewed mockup; the stylesheet
 * beside this file is generated from it, scoped under .mid.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { AlertCircle, Loader2 } from 'lucide-react'
import { apiFetch } from '@/lib/api-client'
import { formatCertificateDate, DEFAULT_DATE_FORMAT } from '@/lib/certificate-date-format'
import InstrumentBanner, { StatusPill } from '@/components/admin/instruments/InstrumentBanner'
import SectionRail, { type Section } from '@/components/admin/instruments/SectionRail'
import { Icon } from '@/components/admin/instruments/Icons'
import BasicInfoTab, { type BasicInfoValues } from '@/components/admin/instruments/basic/BasicInfoTab'
import CapabilitiesTab from '@/components/admin/instruments/capabilities/CapabilitiesTab'
import CertificatesTab from '@/components/admin/instruments/certificates/CertificatesTab'
import MetadataTab from '@/components/admin/instruments/metadata/MetadataTab'
import TrainingTab from '@/components/admin/instruments/training/TrainingTab'
import AuditLogTab from '@/components/admin/instruments/audit/AuditLogTab'
import './instrument-detail.css'

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

type TabKey = 'basic' | 'capabilities' | 'certificates' | 'metadata' | 'training' | 'audit'

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

/** Sixty days is a recalibration cycle's notice, the same window Training uses. */
const LAPSING_SOON_DAYS = 60

export default function InstrumentDetail({ id }: { id: string }) {
  const router = useRouter()
  const [instrument, setInstrument] = useState<Instrument | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<TabKey>('basic')
  const [form, setForm] = useState<BasicInfoValues>(blank)
  /**
   * A capability ticked on a component but not yet declared.
   *
   * It crosses sections: the tick happens in Basic Info and the unit, range and
   * accuracy are asked for in Capabilities, so the parameter has to travel with
   * the reader rather than being retyped.
   */
  const [seed, setSeed] = useState<{ componentId: string; parameter: string; role: string } | null>(null)

  // Counts for the rail. Null until known, so a tab shows no badge rather than a
  // zero it has not actually counted.
  const [counts, setCounts] = useState<{
    capabilities: number | null
    certificates: number | null
    activeCertificates: number | null
    trainings: number | null
    lapsed: number
    lapsing: number
  }>({ capabilities: null, certificates: null, activeCertificates: null, trainings: null, lapsed: 0, lapsing: 0 })

  const showDate = useCallback(
    (iso: string | null) => formatCertificateDate(iso, DEFAULT_DATE_FORMAT, '—'),
    [],
  )
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

  // What the rail needs to show state, fetched once. Each one fails quietly on its
  // own: a count the page could not get shows as no badge, never as zero.
  useEffect(() => {
    let cancelled = false
    const get = (path: string) =>
      apiFetch(`/api/admin/instruments/${id}${path}`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null)

    void Promise.all([
      get('/capabilities'),
      get('/certificates?includeInactive=true'),
      get('/trainings'),
    ]).then(([caps, certs, trainings]) => {
      if (cancelled) return
      const certList: { isActive: boolean }[] = certs?.certificates ?? []
      const list: { expiresAt: string | null }[] = trainings?.trainings ?? []
      const days = (iso: string | null) =>
        iso ? Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000) : null
      setCounts({
        capabilities: caps?.profiles?.length ?? caps?.capabilities?.length ?? null,
        certificates: certs ? certList.length : null,
        activeCertificates: certs ? certList.filter((c) => c.isActive).length : null,
        trainings: trainings ? list.length : null,
        lapsed: list.filter((t) => (days(t.expiresAt) ?? 1) < 0).length,
        lapsing: list.filter((t) => {
          const n = days(t.expiresAt)
          return n !== null && n >= 0 && n <= LAPSING_SOON_DAYS
        }).length,
      })
    })
    return () => {
      cancelled = true
    }
  }, [id])

  /** Saves one panel's fields. Used by the panels as they move across. */
  const save = async (patch: Partial<BasicInfoValues>) => {
    setError(null)
    const next = { ...form, ...patch }
    try {
      const res = await apiFetch(`/api/admin/instruments/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...next, calibrationDueDate: next.calibrationDueDate || null }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        setError(body?.error || `Could not save the instrument (error ${res.status}).`)
        return false
      }
      // Saving makes a new version, which is a new row id, so the page has to follow
      // it or every later change would be written against the version it replaced.
      const nextId = body?.instrument?.id
      if (nextId && nextId !== id) router.replace(`/admin/instruments/${nextId}`)
      else await load()
      return true
    } catch {
      setError('Could not reach the server. Check your connection and try again.')
      return false
    }
  }

  const sections: Section[] = useMemo(() => {
    const has = (n: number | null) => (n === null ? 'dot' : n > 0 ? 'ok' : 'warn')
    return [
      { id: 'basic', label: 'Basic Info', state: 'ok' },
      { id: 'capabilities', label: 'Capabilities', state: has(counts.capabilities), count: counts.capabilities },
      { id: 'certificates', label: 'Certificates', state: has(counts.certificates), count: counts.certificates },
      { id: 'metadata', label: 'Metadata', state: 'ok' },
      {
        id: 'training',
        label: 'Training',
        // Amber the moment somebody has lapsed or is about to: an expired sign-off
        // makes a certificate that engineer signs challengeable.
        state: counts.trainings === null ? 'dot' : counts.lapsed || counts.lapsing ? 'warn' : 'ok',
        count: counts.trainings,
      },
      { id: 'audit', label: 'Audit Log', state: 'dot' },
    ]
  }, [counts])

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
          <p className="text-[13px] text-[#0f172a] mb-4">{error ?? 'Instrument not found'}</p>
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
    <div className="mid h-full overflow-auto">
      <div className="shell">
        <div className="titlerow">
          <Link href="/admin/instruments" className="back">
            <Icon.left />
            Back to Instruments
          </Link>
          <span className="titlesep" />
          <h1>
            <span className="mono" style={{ color: 'var(--primary)' }}>
              {instrument.assetNumber}
            </span>
            <span className="desc"> · {instrument.description}</span>
          </h1>
          <StatusPill status={instrument.status} />
          {!instrument.isActive && <span className="pill flat">INACTIVE</span>}

          <div className="actions">
            <Link href={`/admin/instruments?deactivate=${instrument.id}`} className="btn danger">
              <Icon.bin />
              Deactivate
            </Link>
          </div>
        </div>

        <InstrumentBanner instrument={instrument} formatDate={showDate} />

        <SectionRail sections={sections} active={tab} onGo={(k) => setTab(k as TabKey)} />

        {error && (
          <div className="card sec" style={{ borderColor: 'var(--crit-br)', background: 'var(--crit-bg)', marginBottom: 14 }}>
            <p style={{ margin: 0, color: 'var(--crit-tx)' }}>{error}</p>
          </div>
        )}

        <div className="content">
          {tab === 'basic' && (
            <BasicInfoTab
              instrumentId={id}
              values={form}
              onChange={(patch) => setForm((f) => ({ ...f, ...patch }))}
              onSave={save}
              formatDate={showDate}
              onDeclare={(componentId, parameter, role) => {
                setSeed({ componentId, parameter, role })
                setTab('capabilities')
              }}
            />
          )}
          {tab === 'capabilities' && (
            <CapabilitiesTab
              instrumentId={id}
              sopReferences={instrument.sopReferences}
              seed={seed}
              onSeedUsed={() => setSeed(null)}
            />
          )}
          {tab === 'certificates' && <CertificatesTab instrumentId={id} formatDate={showDate} />}
          {tab === 'metadata' && (
            <MetadataTab
              instrumentId={id}
              version={instrument.version}
              createdAt={instrument.createdAt}
              createdByName={instrument.createdBy?.name ?? null}
              parameterGroup={instrument.parameterGroup}
              sopReferences={instrument.sopReferences}
              certificateCount={counts.certificates}
              activeCertificates={counts.activeCertificates}
              trainingCount={counts.trainings}
              formatDate={showDate}
              onOpenTraining={() => setTab('training')}
            />
          )}
          {tab === 'training' && <TrainingTab instrumentId={id} formatDate={showDate} />}
          {tab === 'audit' && <AuditLogTab instrumentId={id} />}
        </div>
      </div>
    </div>
  )
}
