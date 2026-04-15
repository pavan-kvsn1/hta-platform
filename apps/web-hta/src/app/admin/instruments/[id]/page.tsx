'use client'

import { useState, useEffect, use, useCallback } from 'react'
import Link from 'next/link'
import {
  ChevronDown,
  ChevronUp,
  Pencil,
  Trash2,
  ArrowLeft,
  Loader2,
  AlertTriangle,
} from 'lucide-react'

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
  const styles: Record<string, string> = {
    VALID: 'bg-green-100 text-green-700',
    EXPIRING_SOON: 'bg-yellow-100 text-yellow-700',
    EXPIRED: 'bg-red-100 text-red-700',
    UNDER_RECAL: 'bg-blue-100 text-blue-700',
  }
  const labels: Record<string, string> = {
    VALID: 'Valid',
    EXPIRING_SOON: 'Expiring Soon',
    EXPIRED: 'Expired',
    UNDER_RECAL: 'Under Recal',
  }
  return (
    <span className={`px-2 py-1 text-xs font-medium rounded-full ${styles[status] || 'bg-slate-100 text-slate-700'}`}>
      {labels[status] || status}
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
    <div className="rounded-lg border border-slate-200 overflow-hidden shadow-sm">
      <button
        onClick={onToggle}
        className="w-full px-4 py-3 flex items-center justify-between bg-primary hover:bg-primary/90 transition-colors"
      >
        <span className="font-semibold text-primary-foreground text-sm">{title}</span>
        {isExpanded ? (
          <ChevronUp className="h-5 w-5 text-primary-foreground/70" />
        ) : (
          <ChevronDown className="h-5 w-5 text-primary-foreground/70" />
        )}
      </button>
      {isExpanded && <div className="p-4 bg-white">{children}</div>}
    </div>
  )
}

function InfoField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs font-semibold text-slate-600 tracking-wider">{label}</dt>
      <dd className="mt-1 text-sm text-slate-900">{value || '-'}</dd>
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

  // Section expansion state
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    identity: true,
    equipment: true,
    parameters: true,
    calibration: true,
    ranges: true,
    record: true,
  })

  const fetchInstrument = useCallback(async () => {
    try {
      const response = await fetch(`/api/admin/instruments/${id}`)
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

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }))
  }

  const handleDelete = async () => {
    setDeleting(true)
    setError(null)

    try {
      const response = await fetch(`/api/admin/instruments/${id}`, {
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

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-100">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-slate-600">Loading instrument...</p>
        </div>
      </div>
    )
  }

  if (error || !instrument) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-100">
        <div className="text-center">
          <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-slate-900 mb-2">
            {error || 'Instrument not found'}
          </h2>
          <Link
            href="/admin/instruments"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Instruments
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full bg-slate-100">
      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-slate-900 mb-2">Deactivate Instrument?</h3>
            <p className="text-slate-600 mb-4">
              This will mark the instrument as inactive. It will no longer appear in the active
              instruments list but can be restored later.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? 'Deactivating...' : 'Deactivate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Left Column - Specs */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="flex-1 flex flex-col bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Header */}
          <div className="flex-shrink-0 border-b border-slate-200 pl-6 pb-5 pt-5 pr-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Link
                  href="/admin/instruments"
                  className="text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <ArrowLeft className="size-5" strokeWidth={2} />
                </Link>
                <span className="text-slate-300 text-xl">|</span>
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                  {instrument.description}
                </h1>
                {getStatusBadge(instrument.status)}
                {!instrument.isActive && (
                  <span className="px-2 py-1 text-xs font-medium rounded-full bg-slate-100 text-slate-600">
                    Inactive
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href={`/admin/instruments/${id}/edit`}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                >
                  <Pencil className="w-4 h-4" />
                  Edit
                </Link>
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors text-sm"
                >
                  <Trash2 className="w-4 h-4" />
                  Deactivate
                </button>
              </div>
            </div>

            {/* Meta Info Row */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm mt-3">
              <div className="flex items-center gap-2 text-slate-600">
                <span className="text-slate-400">Asset:</span>
                <span className="font-medium text-slate-700">{instrument.assetNumber}</span>
              </div>
              <div className="flex items-center gap-2 text-slate-600">
                <span className="text-slate-400">Category:</span>
                <span>{instrument.category}</span>
              </div>
              <div className="flex items-center gap-2 text-slate-600">
                <span className="text-slate-400">Version:</span>
                <span>v{instrument.version}</span>
              </div>
            </div>
          </div>

          {/* Content - Scrollable */}
          <div className="flex-1 overflow-auto bg-slate-50/30">
            <div className="p-3 space-y-2 bg-section-inner">
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
                      <dt className="text-xs font-semibold text-slate-600 tracking-wider">Parameter Roles</dt>
                      <dd className="mt-1 text-sm text-slate-900">
                        {(instrument.parameterRoles || []).length > 0
                          ? instrument.parameterRoles.map(r => PARAMETER_ROLES[r] || r).join(', ')
                          : '-'}
                      </dd>
                    </div>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold text-slate-600 tracking-wider">Parameter Capabilities</dt>
                    <dd className="mt-2 flex flex-wrap gap-1.5">
                      {(instrument.parameterCapabilities || []).length > 0 ? (
                        instrument.parameterCapabilities.map(cap => (
                          <span key={cap} className="px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded-full">
                            {PARAMETER_CAPABILITIES[cap] || cap}
                          </span>
                        ))
                      ) : (
                        <span className="text-sm text-slate-500">-</span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold text-slate-600 tracking-wider">SOP References</dt>
                    <dd className="mt-2 flex flex-wrap gap-1.5">
                      {(instrument.sopReferences || []).length > 0 ? (
                        instrument.sopReferences.map((sop, idx) => (
                          <span key={idx} className="px-2 py-0.5 bg-slate-100 text-slate-700 text-xs rounded-full">
                            {sop}
                          </span>
                        ))
                      ) : (
                        <span className="text-sm text-slate-500">-</span>
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
                    <dt className="text-xs font-semibold text-slate-600 tracking-wider">Calibration Due Date</dt>
                    <dd className="mt-1 text-sm text-slate-900">
                      {instrument.calibrationDueDate
                        ? new Date(instrument.calibrationDueDate).toLocaleDateString()
                        : '-'}
                    </dd>
                  </div>
                  {instrument.daysUntilExpiry !== 999 && (
                    <div>
                      <dt className="text-xs font-semibold text-slate-600 tracking-wider">Days Until Expiry</dt>
                      <dd className={`mt-1 text-sm font-medium ${
                        instrument.daysUntilExpiry < 0 ? 'text-red-600' :
                        instrument.daysUntilExpiry <= 30 ? 'text-yellow-600' : 'text-green-600'
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
                  <div className="overflow-x-auto rounded-lg border border-slate-200">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-semibold text-slate-700 uppercase">
                            Parameter
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-semibold text-slate-700 uppercase">
                            Min
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-semibold text-slate-700 uppercase">
                            Max
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-semibold text-slate-700 uppercase">
                            Unit
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-semibold text-slate-700 uppercase">
                            Uncertainty
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-semibold text-slate-700 uppercase">
                            Reference
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {instrument.rangeData.map((range, idx) => (
                          <tr key={idx}>
                            <td className="px-4 py-2 text-slate-900">{range.parameter || '-'}</td>
                            <td className="px-4 py-2 text-slate-700">{range.min || '-'}</td>
                            <td className="px-4 py-2 text-slate-700">{range.max || '-'}</td>
                            <td className="px-4 py-2 text-slate-700">{range.unit || '-'}</td>
                            <td className="px-4 py-2 text-slate-700">{range.uncertainty || '-'}</td>
                            <td className="px-4 py-2 text-slate-700">{range.referencedoc || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-slate-500 text-sm">No range data available.</p>
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
            </div>
          </div>
        </div>
      </div>

      {/* Right Column - PDF Viewer */}
      <div className="w-[45%] flex-shrink-0 flex flex-col">
        <div className="flex-1 flex flex-col bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {/* PDF Header */}
          <div className="flex-shrink-0 px-4 py-3 border-b border-slate-200 bg-primary">
            <h2 className="font-semibold text-primary-foreground text-sm">Calibration Certificate</h2>
          </div>
          {/* PDF Viewer */}
          <div className="flex-1 bg-slate-100">
            <iframe
              src={`/api/admin/instruments/${id}/certificates/latest?download=true`}
              className="w-full h-full"
              title="Calibration Certificate"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
