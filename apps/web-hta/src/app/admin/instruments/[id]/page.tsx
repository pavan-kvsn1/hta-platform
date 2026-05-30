'use client'

import { apiFetch } from '@/lib/api-client'

import { useState, useEffect, use, useCallback } from 'react'
import Link from 'next/link'
import {
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  Pencil,
  Trash2,
  Loader2,
  AlertTriangle,
  User,
  Tag,
  Hash,
  GraduationCap,
  Eye,
  X,
} from 'lucide-react'
import { MetaInfoItem } from '@/components/certificate/MetaInfoItem'

interface RangeDataItem {
  parameter?: string
  min?: string
  max?: string
  unit?: string
  uncertainty?: string
  referencedoc?: string
}

interface Instrument {
  id: string
  instrumentId: string
  version: number
  category: string
  description: string
  make: string
  model: string
  assetNumber: string
  serialNumber: string
  usage: string | null
  calibratedAtLocation: string | null
  reportNo: string | null
  calibrationDueDate: string | null
  remarks: string | null
  isActive: boolean
  status: string
  daysUntilExpiry: number
  rangeData: RangeDataItem[]
  createdBy: { id: string; name: string; email: string } | null
  createdAt: string
  changeReason: string | null
  parameterGroup: string | null
  parameterCapabilities: string[]
  parameterRoles: string[]
  sopReferences: string[]
}

interface TrainingRecord {
  id: string
  engineer: {
    id: string
    name: string
    email: string
    role: string
    isActive: boolean
  }
  certificateFileName: string
  certificateFileSize: number
  trainedAt: string | null
  expiresAt: string | null
  notes: string | null
  uploadedBy: {
    id: string
    name: string
    email: string
  }
  uploadedAt: string
}

const PARAMETER_ROLES: Record<string, string> = {
  source: 'Source',
  measuring: 'Measuring',
}

const PARAMETER_CAPABILITIES: Record<string, string> = {
  rtd: 'RTD',
  thermocouple: 'Thermocouple',
  ac_voltage: 'AC Voltage',
  dc_voltage: 'DC Voltage',
  ac_current: 'AC Current',
  dc_current: 'DC Current',
  frequency: 'Frequency',
  resistance: 'Resistance',
  capacitance: 'Capacitance',
  temperature: 'Temperature',
  humidity: 'Humidity',
  pressure: 'Pressure',
  power: 'Power',
  conductivity: 'Conductivity',
  time: 'Time',
}

function getStatusBadge(status: string) {
  const config: Record<string, { className: string; label: string }> = {
    VALID: { className: 'bg-[#dcfce7] text-[#15803d] border-[#bbf7d0]', label: 'Valid' },
    EXPIRING_SOON: { className: 'bg-[#fef3c7] text-[#92400e] border-[#fde68a]', label: 'Expiring Soon' },
    EXPIRED: { className: 'bg-[#fee2e2] text-[#991b1b] border-[#fecaca]', label: 'Expired' },
    UNDER_RECAL: { className: 'bg-[#dbeafe] text-[#1e40af] border-[#bfdbfe]', label: 'Under Recal' },
  }
  const c = config[status]
  return (
    <span className={`px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-md border ${c?.className || 'bg-[#f1f5f9] text-[#64748b] border-[#e2e8f0]'}`}>
      {c?.label || status}
    </span>
  )
}

function CollapsibleSection({
  title,
  isExpanded,
  onToggle,
  children,
}: {
  title: string
  isExpanded: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-[14px] border border-[#e2e8f0] overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full px-[18px] py-[13px] flex items-center justify-between bg-[#f8fafc] border-b border-[#f1f5f9] hover:bg-[#f1f5f9] transition-colors"
      >
        <span className="text-[12px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">{title}</span>
        {isExpanded ? (
          <ChevronUp className="size-4 text-[#94a3b8]" />
        ) : (
          <ChevronDown className="size-4 text-[#94a3b8]" />
        )}
      </button>
      {isExpanded && <div className="p-5">{children}</div>}
    </div>
  )
}

function InfoField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">{label}</dt>
      <dd className="mt-1 text-[13px] text-[#0f172a]">{value || '-'}</dd>
    </div>
  )
}

export default function InstrumentViewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [instrument, setInstrument] = useState<Instrument | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [pdfReady, setPdfReady] = useState(false)
  const [pdfStatus, setPdfStatus] = useState<string>('Loading certificate...')
  const [trainings, setTrainings] = useState<TrainingRecord[]>([])
  const [trainingLoading, setTrainingLoading] = useState(false)
  const [trainingError, setTrainingError] = useState<string | null>(null)
  const [trainingPdfUrl, setTrainingPdfUrl] = useState<string | null>(null)
  const [trainingPdfTitle, setTrainingPdfTitle] = useState<string>('Training certificate')
  const [trainingPdfViewMode, setTrainingPdfViewMode] = useState<'iframe' | 'card'>('iframe')
  const [editingTrainingId, setEditingTrainingId] = useState<string | null>(null)
  const [editTrainingForm, setEditTrainingForm] = useState({ trainedAt: '', expiresAt: '', notes: '' })

  // Section expansion state
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    identity: true,
    equipment: true,
    parameters: true,
    calibration: true,
    ranges: true,
    training: true,
    record: true,
  })

  const fetchInstrument = useCallback(async () => {
    try {
      const response = await apiFetch(`/api/admin/instruments/${id}`)
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Instrument not found')
        }
        throw new Error('Failed to fetch instrument')
      }
      const data = await response.json()
      setInstrument(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    fetchInstrument()
  }, [id, fetchInstrument])

  useEffect(() => {
    return () => {
      if (trainingPdfUrl) URL.revokeObjectURL(trainingPdfUrl)
    }
  }, [trainingPdfUrl])

  const fetchTrainings = useCallback(async () => {
    try {
      setTrainingLoading(true)
      setTrainingError(null)
      const res = await apiFetch(`/api/admin/instruments/${id}/trainings`)
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || 'Failed to load training records')
      }
      const data = await res.json()
      setTrainings(data.trainings || [])
    } catch (err) {
      setTrainingError(err instanceof Error ? err.message : 'Failed to load training records')
    } finally {
      setTrainingLoading(false)
    }
  }, [id])

  useEffect(() => {
    if (!instrument) return
    fetchTrainings()
  }, [instrument, fetchTrainings])

  // Fetch certificate PDF for the viewer. Prefer the signed GCS URL because it
  // avoids API/gateway binary streaming issues; keep the API stream as fallback.
  useEffect(() => {
    if (!instrument) return
    let objectUrl: string | null = null
    let cancelled = false

    async function fetchPdfUrl() {
      setPdfStatus('Loading certificate...')
      try {
        const res = await apiFetch(`/api/admin/instruments/${id}/certificates/latest`)
        if (!res.ok) {
          if (res.status === 404) {
            if (cancelled) return
            setPdfUrl(null)
            setPdfReady(false)
            setPdfStatus('No certificate available')
            return
          }

          const data = await res.json().catch(() => null)
          throw new Error(data?.error || 'Failed to load certificate')
        }

        const data = await res.json()
        if (typeof data?.url === 'string' && data.url) {
          if (cancelled) return
          setPdfUrl(data.url)
          setPdfReady(true)
          setPdfStatus('')
          return
        }

        const pdfRes = await apiFetch(`/api/admin/instruments/${id}/certificates/latest/pdf`)

        if (!pdfRes.ok) {
          const fallbackData = await pdfRes.json().catch(() => null)
          throw new Error(fallbackData?.error || data?.urlError || 'Failed to load certificate PDF')
        }

        if (!cancelled) {
          const blob = await pdfRes.blob()
          objectUrl = URL.createObjectURL(blob)
          setPdfUrl(objectUrl)
          setPdfReady(true)
          setPdfStatus('')
        }
      } catch (err) {
        if (cancelled) return
        setPdfUrl(null)
        setPdfReady(false)
        setPdfStatus(err instanceof Error ? err.message : 'Failed to load certificate')
      }
    }
    fetchPdfUrl()

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [id, instrument])

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }))
  }

  const handleDelete = async () => {
    setDeleting(true)
    setError(null)

    try {
      const response = await apiFetch(`/api/admin/instruments/${id}`, {
        method: 'DELETE',
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete instrument')
      }

      window.location.href = '/admin/instruments'
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
      setShowDeleteConfirm(false)
    } finally {
      setDeleting(false)
    }
  }

  const openTrainingPdf = async (training: TrainingRecord) => {
    try {
      setTrainingError(null)
      const res = await apiFetch(`/api/admin/instruments/${id}/trainings/${training.id}/pdf`)
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || 'Failed to load training certificate')
      }
      const blob = await res.blob()
      if (trainingPdfUrl) URL.revokeObjectURL(trainingPdfUrl)
      setTrainingPdfUrl(URL.createObjectURL(blob))
      setTrainingPdfTitle(`${training.engineer.name} - ${training.certificateFileName}`)
      setTrainingPdfViewMode('iframe')
    } catch (err) {
      setTrainingError(err instanceof Error ? err.message : 'Failed to load training certificate')
    }
  }

  const closeTrainingPdf = () => {
    if (trainingPdfUrl) URL.revokeObjectURL(trainingPdfUrl)
    setTrainingPdfUrl(null)
  }

  const startEditTraining = (training: TrainingRecord) => {
    setEditingTrainingId(training.id)
    setEditTrainingForm({
      trainedAt: training.trainedAt ? training.trainedAt.slice(0, 10) : '',
      expiresAt: training.expiresAt ? training.expiresAt.slice(0, 10) : '',
      notes: training.notes || '',
    })
  }

  const saveTrainingEdit = async (trainingId: string) => {
    try {
      setTrainingError(null)
      const res = await apiFetch(`/api/admin/instruments/${id}/trainings/${trainingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trainedAt: editTrainingForm.trainedAt || null,
          expiresAt: editTrainingForm.expiresAt || null,
          notes: editTrainingForm.notes,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || 'Failed to update training evidence')
      setEditingTrainingId(null)
      await fetchTrainings()
    } catch (err) {
      setTrainingError(err instanceof Error ? err.message : 'Failed to update training evidence')
    }
  }

  const removeTraining = async (trainingId: string) => {
    if (!window.confirm('Remove this training evidence?')) return
    try {
      setTrainingError(null)
      const res = await apiFetch(`/api/admin/instruments/${id}/trainings/${trainingId}`, {
        method: 'DELETE',
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || 'Failed to remove training evidence')
      await fetchTrainings()
    } catch (err) {
      setTrainingError(err instanceof Error ? err.message : 'Failed to remove training evidence')
    }
  }

  const formatOptionalDate = (value: string | null) =>
    value ? new Date(value).toLocaleDateString() : '-'

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-[#f1f5f9]">
        <div className="text-center">
          <Loader2 className="size-8 animate-spin text-[#94a3b8] mx-auto mb-4" />
          <p className="text-[#64748b]">Loading instrument...</p>
        </div>
      </div>
    )
  }

  if (error || !instrument) {
    return (
      <div className="h-full flex items-center justify-center bg-[#f1f5f9]">
        <div className="text-center">
          <AlertTriangle className="size-12 text-[#d97706] mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-[#0f172a] mb-2">
            {error || 'Instrument not found'}
          </h2>
          <Link
            href="/admin/instruments"
            className="inline-flex items-center gap-2 px-4 py-2 text-[12.5px] font-semibold bg-white border border-[#e2e8f0] rounded-[9px] hover:bg-[#f8fafc] transition-colors"
          >
            <ChevronLeft className="size-4" />
            Back to Instruments
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full bg-[#f1f5f9] overflow-hidden">
      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-[14px] border border-[#e2e8f0] p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-[#0f172a] mb-2">Deactivate Instrument?</h3>
            <p className="text-[#64748b] text-sm mb-4">
              This will mark the instrument as inactive. It will no longer appear in the active
              instruments list but can be restored later.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 text-[12.5px] font-semibold text-[#0f172a] bg-white border border-[#e2e8f0] rounded-[9px] hover:bg-[#f8fafc] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2 text-[12.5px] font-semibold text-white bg-[#dc2626] hover:bg-[#b91c1c] rounded-[9px] disabled:opacity-50 transition-colors"
              >
                {deleting ? 'Deactivating...' : 'Deactivate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {trainingPdfUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6">
          <div className="bg-white rounded-[14px] border border-[#e2e8f0] w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#e2e8f0]">
              <div className="min-w-0">
                <p className="text-[12px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Training Certificate</p>
                <p className="text-[13px] font-semibold text-[#0f172a] truncate">{trainingPdfTitle}</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex h-8 rounded-lg border border-[#e2e8f0] bg-[#f8fafc] p-0.5">
                  <button
                    type="button"
                    onClick={() => setTrainingPdfViewMode('iframe')}
                    className={`px-3 text-[12px] font-semibold rounded-md transition-colors ${
                      trainingPdfViewMode === 'iframe'
                        ? 'bg-white text-[#0f172a] shadow-sm'
                        : 'text-[#64748b] hover:text-[#0f172a]'
                    }`}
                  >
                    Iframe
                  </button>
                  <button
                    type="button"
                    onClick={() => setTrainingPdfViewMode('card')}
                    className={`px-3 text-[12px] font-semibold rounded-md transition-colors ${
                      trainingPdfViewMode === 'card'
                        ? 'bg-white text-[#0f172a] shadow-sm'
                        : 'text-[#64748b] hover:text-[#0f172a]'
                    }`}
                  >
                    Card
                  </button>
                </div>
                <button
                  onClick={closeTrainingPdf}
                  className="size-8 rounded-lg border border-[#e2e8f0] flex items-center justify-center hover:bg-[#f8fafc]"
                  aria-label="Close training certificate preview"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>
            {trainingPdfViewMode === 'iframe' ? (
              <iframe src={trainingPdfUrl} title={trainingPdfTitle} className="flex-1 w-full" />
            ) : (
              <div className="flex-1 overflow-auto bg-[#f1f5f9] p-6">
                <div className="mx-auto flex min-h-full max-w-4xl flex-col overflow-hidden rounded-[12px] border border-[#cbd5e1] bg-white shadow-sm">
                  <div className="flex items-center justify-between gap-3 border-b border-[#e2e8f0] px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold text-[#0f172a]">{trainingPdfTitle}</p>
                      <p className="text-[12px] text-[#94a3b8]">PDF card view</p>
                    </div>
                    <a
                      href={trainingPdfUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0 rounded-[8px] border border-[#e2e8f0] px-3 py-1.5 text-[12px] font-semibold text-[#0f172a] hover:bg-[#f8fafc]"
                    >
                      Open
                    </a>
                  </div>
                  <object data={trainingPdfUrl} type="application/pdf" className="h-[70vh] w-full">
                    <iframe src={trainingPdfUrl} title={trainingPdfTitle} className="h-[70vh] w-full" />
                  </object>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Left Side - Header + Content (Scrollable) */}
      <div className="flex-1 flex flex-col min-w-0 overflow-auto p-6 pr-3">
        {/* Header */}
        <div className="flex-shrink-0 mb-5">
          {/* Back Link */}
          <Link
            href="/admin/instruments"
            className="inline-flex items-center gap-1 text-[13px] text-[#64748b] hover:text-[#0f172a] mb-4 transition-colors"
          >
            <ChevronLeft className="size-4" />
            Back to Instruments
          </Link>

          {/* Title Row */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <h1 className="text-[22px] font-bold text-[#0f172a] tracking-tight">
                {instrument.description}
              </h1>
              {getStatusBadge(instrument.status)}
              {!instrument.isActive && (
                <span className="px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-md border bg-[#f1f5f9] text-[#475569] border-[#e2e8f0]">
                  Inactive
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Link
                href={`/admin/instruments/${id}/edit`}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-[12.5px] font-semibold text-white bg-[#0f172a] hover:bg-[#1e293b] rounded-[9px] transition-colors"
              >
                <Pencil className="size-3.5" />
                Edit
              </Link>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-[12.5px] font-semibold text-[#dc2626] bg-[#fef2f2] hover:bg-[#fee2e2] rounded-[9px] transition-colors"
              >
                <Trash2 className="size-3.5" />
                Deactivate
              </button>
            </div>
          </div>

          {/* Meta Info Row */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[13px] mt-3">
            <MetaInfoItem icon={Hash} emphasized>{instrument.assetNumber}</MetaInfoItem>
            <MetaInfoItem icon={Tag}>{instrument.category}</MetaInfoItem>
            {instrument.createdBy && (
              <MetaInfoItem icon={User}>{instrument.createdBy.name}</MetaInfoItem>
            )}
            <div className="flex items-center gap-2 text-[#94a3b8]">
              <span className="text-[#cbd5e1]">|</span>
              <span>Version {instrument.version}</span>
            </div>
          </div>
        </div>

        {/* Content Sections */}
        <div className="space-y-3">
          {/* Identity Section */}
          <CollapsibleSection
            title="Identity"
            isExpanded={expandedSections.identity}
            onToggle={() => toggleSection('identity')}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <InfoField label="Asset Number" value={instrument.assetNumber} />
              <InfoField label="Category" value={instrument.category} />
              <div className="md:col-span-2">
                <InfoField label="Description" value={instrument.description} />
              </div>
            </div>
          </CollapsibleSection>

          {/* Equipment Section */}
          <CollapsibleSection
            title="Equipment Details"
            isExpanded={expandedSections.equipment}
            onToggle={() => toggleSection('equipment')}
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <InfoField label="Make" value={instrument.make} />
              <InfoField label="Model" value={instrument.model} />
              <InfoField label="Serial Number" value={instrument.serialNumber} />
            </div>
          </CollapsibleSection>

          {/* Parameters Section */}
          <CollapsibleSection
            title="Parameter Information"
            isExpanded={expandedSections.parameters}
            onToggle={() => toggleSection('parameters')}
          >
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <InfoField label="Parameter Group" value={instrument.parameterGroup} />
                <div>
                  <dt className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Parameter Roles</dt>
                  <dd className="mt-1 text-[13px] text-[#0f172a]">
                    {(instrument.parameterRoles || []).length > 0
                      ? instrument.parameterRoles.map(r => PARAMETER_ROLES[r] || r).join(', ')
                      : '-'}
                  </dd>
                </div>
              </div>
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Parameter Capabilities</dt>
                <dd className="mt-2 flex flex-wrap gap-1.5">
                  {(instrument.parameterCapabilities || []).length > 0 ? (
                    instrument.parameterCapabilities.map(cap => (
                      <span key={cap} className="px-2 py-0.5 bg-[#eff6ff] text-[#1d4ed8] text-xs rounded-full">
                        {PARAMETER_CAPABILITIES[cap] || cap}
                      </span>
                    ))
                  ) : (
                    <span className="text-[13px] text-[#64748b]">-</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">SOP References</dt>
                <dd className="mt-2 flex flex-wrap gap-1.5">
                  {(instrument.sopReferences || []).length > 0 ? (
                    instrument.sopReferences.map((sop, idx) => (
                      <span key={idx} className="px-2 py-0.5 bg-[#f1f5f9] text-[#334155] text-xs rounded-full">
                        {sop}
                      </span>
                    ))
                  ) : (
                    <span className="text-[13px] text-[#64748b]">-</span>
                  )}
                </dd>
              </div>
            </div>
          </CollapsibleSection>

          {/* Calibration Section */}
          <CollapsibleSection
            title="Calibration Information"
            isExpanded={expandedSections.calibration}
            onToggle={() => toggleSection('calibration')}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <InfoField label="Usage" value={instrument.usage} />
              <InfoField label="Calibrated At" value={instrument.calibratedAtLocation} />
              <InfoField label="Report Number" value={instrument.reportNo} />
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Calibration Due Date</dt>
                <dd className="mt-1 text-[13px] text-[#0f172a]">
                  {instrument.calibrationDueDate
                    ? new Date(instrument.calibrationDueDate).toLocaleDateString()
                    : '-'}
                </dd>
              </div>
              {instrument.daysUntilExpiry !== 999 && (
                <div>
                  <dt className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Days Until Expiry</dt>
                  <dd className={`mt-1 text-[13px] font-medium ${
                    instrument.daysUntilExpiry < 0 ? 'text-[#dc2626]' :
                    instrument.daysUntilExpiry <= 30 ? 'text-[#d97706]' : 'text-[#16a34a]'
                  }`}>
                    {instrument.daysUntilExpiry < 0
                      ? `${Math.abs(instrument.daysUntilExpiry)} days overdue`
                      : `${instrument.daysUntilExpiry} days`}
                  </dd>
                </div>
              )}
              <div className="md:col-span-2">
                <InfoField label="Remarks" value={instrument.remarks} />
              </div>
            </div>
          </CollapsibleSection>

          {/* Range Data Section */}
          <CollapsibleSection
            title="Range Data"
            isExpanded={expandedSections.ranges}
            onToggle={() => toggleSection('ranges')}
          >
            {instrument.rangeData && instrument.rangeData.length > 0 ? (
              <div className="overflow-x-auto rounded-xl border border-[#e2e8f0]">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-[#e2e8f0] bg-[#f8fafc]">
                      <th className="px-4 py-2 text-left text-[11px] font-bold text-[#94a3b8] uppercase tracking-[0.07em]">Parameter</th>
                      <th className="px-4 py-2 text-left text-[11px] font-bold text-[#94a3b8] uppercase tracking-[0.07em]">Min</th>
                      <th className="px-4 py-2 text-left text-[11px] font-bold text-[#94a3b8] uppercase tracking-[0.07em]">Max</th>
                      <th className="px-4 py-2 text-left text-[11px] font-bold text-[#94a3b8] uppercase tracking-[0.07em]">Unit</th>
                      <th className="px-4 py-2 text-left text-[11px] font-bold text-[#94a3b8] uppercase tracking-[0.07em]">Uncertainty</th>
                      <th className="px-4 py-2 text-left text-[11px] font-bold text-[#94a3b8] uppercase tracking-[0.07em]">Reference</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f1f5f9]">
                    {instrument.rangeData.map((range, idx) => (
                      <tr key={idx}>
                        <td className="px-4 py-2 text-[#0f172a]">{range.parameter || '-'}</td>
                        <td className="px-4 py-2 text-[#64748b]">{range.min || '-'}</td>
                        <td className="px-4 py-2 text-[#64748b]">{range.max || '-'}</td>
                        <td className="px-4 py-2 text-[#64748b]">{range.unit || '-'}</td>
                        <td className="px-4 py-2 text-[#64748b]">{range.uncertainty || '-'}</td>
                        <td className="px-4 py-2 text-[#64748b]">{range.referencedoc || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-[#64748b] text-[13px]">No range data available.</p>
            )}
          </CollapsibleSection>

          {/* Record Information Section */}
          <CollapsibleSection
            title="Record Information"
            isExpanded={expandedSections.record}
            onToggle={() => toggleSection('record')}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <InfoField label="Version" value={`v${instrument.version}`} />
              <InfoField
                label="Last Updated"
                value={new Date(instrument.createdAt).toLocaleString()}
              />
              {instrument.createdBy && (
                <InfoField label="Modified By" value={instrument.createdBy.name} />
              )}
              {instrument.changeReason && (
                <InfoField label="Change Reason" value={instrument.changeReason} />
              )}
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            title="Training Records"
            isExpanded={expandedSections.training}
            onToggle={() => toggleSection('training')}
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-[13px] text-[#64748b]">
                  <GraduationCap className="size-4 text-[#94a3b8]" />
                  <span>{trainings.length} active training record{trainings.length !== 1 ? 's' : ''}</span>
                </div>
              </div>

              {trainingError && (
                <div className="rounded-[9px] border border-[#fecaca] bg-[#fef2f2] px-3 py-2 text-[12px] font-medium text-[#dc2626]">
                  {trainingError}
                </div>
              )}

              {trainingLoading ? (
                <div className="flex items-center justify-center py-8 text-[#94a3b8]">
                  <Loader2 className="size-5 animate-spin" />
                </div>
              ) : trainings.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[#cbd5e1] bg-[#f8fafc] p-6 text-center">
                  <GraduationCap className="size-8 mx-auto mb-2 text-[#cbd5e1]" />
                  <p className="text-[13px] font-semibold text-[#475569]">No training evidence recorded</p>
                  <p className="text-[12px] text-[#94a3b8] mt-1">Training records will appear here after they are assigned.</p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-[#e2e8f0]">
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="border-b border-[#e2e8f0] bg-[#f8fafc]">
                        <th className="px-4 py-2 text-left text-[11px] font-bold text-[#94a3b8] uppercase tracking-[0.07em]">User</th>
                        <th className="px-4 py-2 text-left text-[11px] font-bold text-[#94a3b8] uppercase tracking-[0.07em]">Trained</th>
                        <th className="px-4 py-2 text-left text-[11px] font-bold text-[#94a3b8] uppercase tracking-[0.07em]">Expires</th>
                        <th className="px-4 py-2 text-left text-[11px] font-bold text-[#94a3b8] uppercase tracking-[0.07em]">Certificate</th>
                        <th className="px-4 py-2 text-left text-[11px] font-bold text-[#94a3b8] uppercase tracking-[0.07em]">Uploaded</th>
                        <th className="px-4 py-2 text-right text-[11px] font-bold text-[#94a3b8] uppercase tracking-[0.07em]">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#f1f5f9]">
                      {trainings.map((training) => {
                        const isEditing = editingTrainingId === training.id
                        return (
                          <tr key={training.id} className="align-top">
                            <td className="px-4 py-3">
                              <p className="font-semibold text-[#0f172a]">{training.engineer.name}</p>
                              <p className="text-[12px] text-[#64748b]">{training.engineer.email}</p>
                              {isEditing && (
                                <textarea
                                  value={editTrainingForm.notes}
                                  onChange={(event) => setEditTrainingForm(prev => ({ ...prev, notes: event.target.value }))}
                                  rows={2}
                                  className="mt-2 w-full min-w-[220px] rounded-[8px] border border-[#e2e8f0] px-2 py-1 text-[12px]"
                                  placeholder="Notes"
                                />
                              )}
                              {!isEditing && training.notes && (
                                <p className="text-[12px] text-[#64748b] mt-1 italic">{training.notes}</p>
                              )}
                            </td>
                            <td className="px-4 py-3 text-[#64748b]">
                              {isEditing ? (
                                <input
                                  type="date"
                                  value={editTrainingForm.trainedAt}
                                  onChange={(event) => setEditTrainingForm(prev => ({ ...prev, trainedAt: event.target.value }))}
                                  className="h-8 rounded-[8px] border border-[#e2e8f0] px-2 text-[12px]"
                                />
                              ) : formatOptionalDate(training.trainedAt)}
                            </td>
                            <td className="px-4 py-3 text-[#64748b]">
                              {isEditing ? (
                                <input
                                  type="date"
                                  value={editTrainingForm.expiresAt}
                                  onChange={(event) => setEditTrainingForm(prev => ({ ...prev, expiresAt: event.target.value }))}
                                  className="h-8 rounded-[8px] border border-[#e2e8f0] px-2 text-[12px]"
                                />
                              ) : formatOptionalDate(training.expiresAt)}
                            </td>
                            <td className="px-4 py-3">
                              <p className="text-[#0f172a] truncate max-w-[190px]" title={training.certificateFileName}>{training.certificateFileName}</p>
                              <p className="text-[12px] text-[#94a3b8]">{formatFileSize(training.certificateFileSize)}</p>
                            </td>
                            <td className="px-4 py-3 text-[#64748b]">
                              <p>{formatOptionalDate(training.uploadedAt)}</p>
                              <p className="text-[12px] text-[#94a3b8]">{training.uploadedBy.name}</p>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex justify-end gap-1.5">
                                {isEditing ? (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => saveTrainingEdit(training.id)}
                                      className="px-2.5 py-1.5 text-[12px] font-semibold text-white bg-[#0f172a] rounded-[8px]"
                                    >
                                      Save
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setEditingTrainingId(null)}
                                      className="px-2.5 py-1.5 text-[12px] font-semibold text-[#475569] border border-[#e2e8f0] rounded-[8px]"
                                    >
                                      Cancel
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => openTrainingPdf(training)}
                                      className="inline-flex h-8 items-center gap-1.5 rounded-[8px] border border-[#e2e8f0] px-2.5 text-[12px] font-semibold text-[#0f172a] hover:bg-[#f8fafc]"
                                      title="View certificate"
                                    >
                                      <Eye className="size-3.5" />
                                      PDF
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => startEditTraining(training)}
                                      className="size-8 rounded-[8px] border border-[#e2e8f0] flex items-center justify-center hover:bg-[#f8fafc]"
                                      title="Edit training"
                                    >
                                      <Pencil className="size-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => removeTraining(training.id)}
                                      className="size-8 rounded-[8px] border border-[#fecaca] text-[#dc2626] flex items-center justify-center hover:bg-[#fef2f2]"
                                      title="Remove training"
                                    >
                                      <Trash2 className="size-3.5" />
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </CollapsibleSection>
        </div>
      </div>

      {/* Right Panel - PDF Viewer */}
      <div className="w-[45%] flex-shrink-0 flex flex-col p-6 pl-3">
        <div className="flex-1 flex flex-col bg-white rounded-[14px] border border-[#e2e8f0] overflow-hidden">
          {/* PDF Header */}
          <div className="flex items-center gap-2 px-[18px] py-[13px] bg-[#f8fafc] border-b border-[#f1f5f9] flex-shrink-0">
            <span className="text-[12px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Calibration Certificate</span>
          </div>
          {/* PDF Viewer */}
          <div className="flex-1 bg-[#f1f5f9]">
            {pdfReady && pdfUrl ? (
              <iframe
                src={pdfUrl}
                className="w-full h-full"
                title="Calibration Certificate"
              />
            ) : (
              <div className="flex items-center justify-center h-full p-6 text-center">
                <div>
                  <p className="text-[13px] font-semibold text-[#475569]">
                    Calibration certificate unavailable
                  </p>
                  <p className="mt-1 text-[12px] text-[#94a3b8]">
                    {pdfStatus}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
