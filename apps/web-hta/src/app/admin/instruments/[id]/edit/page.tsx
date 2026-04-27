'use client'

import { apiFetch } from '@/lib/api-client'

import { useState, useEffect, useRef, use, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ChevronLeft,
  Loader2,
  AlertTriangle,
  Upload,
  X,
  Plus,
  Trash2,
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

interface InstrumentFormData {
  category: string
  description: string
  make: string
  model: string
  assetNumber: string
  serialNumber: string
  usage: string
  calibratedAtLocation: string
  reportNo: string
  calibrationDueDate: string
  remarks: string
  status: string
  isActive: boolean
  rangeData: RangeDataItem[]
  changeReason: string
  parameterGroup: string
  parameterCapabilities: string[]
  parameterRoles: string[]
  sopReferences: string[]
}

const CATEGORIES = [
  'DIMENSIONAL',
  'ELECTRICAL',
  'TEMPERATURE',
  'PRESSURE',
  'MASS',
  'FORCE',
  'FLOW',
  'TIME',
  'OPTICAL',
  'CHEMICAL',
  'OTHER',
]

const STATUS_OPTIONS = [
  { value: '', label: 'Active' },
  { value: 'UNDER_RECAL', label: 'Under Recalibration' },
]

const PARAMETER_GROUPS = [
  'Electrical (multi-function)',
  'Voltage & Current',
  'Resistance',
  'Temperature',
  'Temperature & Humidity',
  'Temperature (readout)',
  'Pressure',
  'Mass',
  'Force',
  'Flow',
  'Time',
  'Frequency',
  'Power',
  'Conductivity',
  'Dimensional',
  'Optical',
  'Other',
]

const PARAMETER_ROLES = [
  { value: 'source', label: 'Source' },
  { value: 'measuring', label: 'Measuring' },
]

const PARAMETER_CAPABILITIES = [
  { value: 'rtd', label: 'RTD' },
  { value: 'thermocouple', label: 'Thermocouple' },
  { value: 'ac_voltage', label: 'AC Voltage' },
  { value: 'dc_voltage', label: 'DC Voltage' },
  { value: 'ac_current', label: 'AC Current' },
  { value: 'dc_current', label: 'DC Current' },
  { value: 'frequency', label: 'Frequency' },
  { value: 'resistance', label: 'Resistance' },
  { value: 'capacitance', label: 'Capacitance' },
  { value: 'temperature', label: 'Temperature' },
  { value: 'humidity', label: 'Humidity' },
  { value: 'pressure', label: 'Pressure' },
  { value: 'power', label: 'Power' },
  { value: 'conductivity', label: 'Conductivity' },
  { value: 'time', label: 'Time' },
]

const CAPABILITY_UNITS: Record<string, string[]> = {
  rtd: ['°C', '°F', 'K', 'Ω'],
  thermocouple: ['°C', '°F', 'K', 'mV'],
  ac_voltage: ['V', 'mV', 'kV'],
  dc_voltage: ['V', 'mV', 'kV'],
  ac_current: ['A', 'mA', 'µA'],
  dc_current: ['A', 'mA', 'µA'],
  frequency: ['Hz', 'kHz', 'MHz', 'GHz'],
  resistance: ['Ω', 'kΩ', 'MΩ'],
  capacitance: ['F', 'µF', 'nF', 'pF'],
  temperature: ['°C', '°F', 'K'],
  humidity: ['%RH'],
  pressure: ['Pa', 'kPa', 'MPa', 'bar', 'mbar', 'psi', 'mmHg'],
  power: ['W', 'mW', 'kW', 'dBm'],
  conductivity: ['S/m', 'mS/cm', 'µS/cm'],
  time: ['s', 'ms', 'µs', 'min'],
}

function getAvailableUnits(selectedCapabilities: string[]): string[] {
  const units = new Set<string>()
  for (const cap of selectedCapabilities) {
    const capUnits = CAPABILITY_UNITS[cap]
    if (capUnits) capUnits.forEach(u => units.add(u))
  }
  return Array.from(units).sort()
}

const inputClass = 'w-full px-3 py-2 border border-[#e2e8f0] rounded-lg text-[13px] text-[#0f172a] placeholder:text-[#94a3b8] focus:ring-2 focus:ring-[#7c3aed]/20 focus:border-[#7c3aed] outline-none'

function SectionCard({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-xl border border-[#e2e8f0] p-6">
      <h2 className="text-[15px] font-semibold text-[#0f172a] mb-5">{title}</h2>
      {children}
    </div>
  )
}

export default function EditInstrumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [instrument, setInstrument] = useState<Instrument | null>(null)

  const [formData, setFormData] = useState<InstrumentFormData>({
    category: '',
    description: '',
    make: '',
    model: '',
    assetNumber: '',
    serialNumber: '',
    usage: '',
    calibratedAtLocation: '',
    reportNo: '',
    calibrationDueDate: '',
    remarks: '',
    status: '',
    isActive: true,
    rangeData: [],
    changeReason: '',
    parameterGroup: '',
    parameterCapabilities: [],
    parameterRoles: [],
    sopReferences: [],
  })

  // Certificate upload state
  const [uploadingCert, setUploadingCert] = useState(false)
  const [certUploadError, setCertUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [certFormData, setCertFormData] = useState({
    reportNo: '',
    validFrom: '',
    validUntil: '',
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

      const rawStatus = STATUS_OPTIONS.find(opt => opt.value === data.status && opt.value !== '')
        ? data.status
        : ''

      setFormData({
        category: data.category || '',
        description: data.description || '',
        make: data.make || '',
        model: data.model || '',
        assetNumber: data.assetNumber || '',
        serialNumber: data.serialNumber || '',
        usage: data.usage || '',
        calibratedAtLocation: data.calibratedAtLocation || '',
        reportNo: data.reportNo || '',
        calibrationDueDate: data.calibrationDueDate
          ? new Date(data.calibrationDueDate).toISOString().split('T')[0]
          : '',
        remarks: data.remarks || '',
        status: rawStatus,
        isActive: data.isActive,
        rangeData: data.rangeData || [],
        changeReason: '',
        parameterGroup: data.parameterGroup || '',
        parameterCapabilities: data.parameterCapabilities || [],
        parameterRoles: data.parameterRoles || [],
        sopReferences: data.sopReferences || [],
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    fetchInstrument()
  }, [id, fetchInstrument])

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked
      setFormData(prev => ({ ...prev, [name]: checked }))
    } else {
      setFormData(prev => ({ ...prev, [name]: value }))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSaving(true)

    try {
      const response = await apiFetch(`/api/admin/instruments/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          calibrationDueDate: formData.calibrationDueDate || null,
          parameterGroup: formData.parameterGroup || null,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update instrument')
      }

      router.push(`/admin/instruments/${data.instrument.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setSaving(false)
    }
  }

  // Range data handlers
  const addRangeItem = () => {
    setFormData(prev => ({
      ...prev,
      rangeData: [...prev.rangeData, { parameter: '', min: '', max: '', unit: '', uncertainty: '', referencedoc: '' }],
    }))
  }

  const updateRangeItem = (index: number, field: keyof RangeDataItem, value: string) => {
    setFormData(prev => ({
      ...prev,
      rangeData: prev.rangeData.map((item, i) =>
        i === index ? { ...item, [field]: value } : item
      ),
    }))
  }

  const removeRangeItem = (index: number) => {
    setFormData(prev => ({
      ...prev,
      rangeData: prev.rangeData.filter((_, i) => i !== index),
    }))
  }

  const handleCertUpload = async () => {
    if (!selectedFile) return

    setUploadingCert(true)
    setCertUploadError(null)

    try {
      const uploadFormData = new FormData()
      uploadFormData.append('file', selectedFile)
      if (certFormData.reportNo) uploadFormData.append('reportNo', certFormData.reportNo)
      if (certFormData.validFrom) uploadFormData.append('validFrom', certFormData.validFrom)
      if (certFormData.validUntil) uploadFormData.append('validUntil', certFormData.validUntil)

      const response = await apiFetch(`/api/admin/instruments/${id}/certificates`, {
        method: 'POST',
        body: uploadFormData,
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to upload certificate')
      }

      // Reset form
      setSelectedFile(null)
      setCertFormData({ reportNo: '', validFrom: '', validUntil: '' })
      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch (err) {
      setCertUploadError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploadingCert(false)
    }
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

  if (error && !instrument) {
    return (
      <div className="h-full flex items-center justify-center bg-[#f1f5f9]">
        <div className="text-center">
          <AlertTriangle className="size-12 text-[#d97706] mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-[#0f172a] mb-2">
            {error || 'Instrument not found'}
          </h2>
          <Link
            href="/admin/instruments"
            className="inline-flex items-center gap-1 text-[13px] text-[#64748b] hover:text-[#0f172a] transition-colors"
          >
            <ChevronLeft className="size-4" />
            Back to Instruments
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto bg-[#f1f5f9]">
      <div className="p-8 max-w-[820px] mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Link
            href={`/admin/instruments/${id}`}
            className="inline-flex items-center gap-1 text-[13px] text-[#64748b] hover:text-[#0f172a] transition-colors mb-4"
          >
            <ChevronLeft className="size-4" />
            Back to Instrument
          </Link>
          <h1 className="text-[22px] font-bold text-[#0f172a] tracking-tight">
            Edit Instrument
          </h1>
          <p className="text-[13px] text-[#94a3b8] mt-1">
            {instrument?.description} &middot; Asset: {instrument?.assetNumber}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
            {/* Error Message */}
            {error && (
              <div className="bg-[#fef2f2] border border-[#fee2e2] rounded-lg p-4 text-[#dc2626] text-[13px]">
                {error}
              </div>
            )}

            {/* Identity Section */}
            <SectionCard title="Identity">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="category" className="block text-[13px] text-[#64748b] mb-1.5">
                    Category <span className="text-[#ef4444]">*</span>
                  </label>
                  <select
                    id="category"
                    name="category"
                    value={formData.category}
                    onChange={handleChange}
                    required
                    className={inputClass}
                  >
                    <option value="">Select category</option>
                    {CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="assetNumber" className="block text-[13px] text-[#64748b] mb-1.5">
                    Asset Number <span className="text-[#ef4444]">*</span>
                  </label>
                  <input
                    type="text"
                    id="assetNumber"
                    name="assetNumber"
                    value={formData.assetNumber}
                    onChange={handleChange}
                    required
                    className={inputClass}
                  />
                </div>

                <div className="md:col-span-2">
                  <label htmlFor="description" className="block text-[13px] text-[#64748b] mb-1.5">
                    Description <span className="text-[#ef4444]">*</span>
                  </label>
                  <input
                    type="text"
                    id="description"
                    name="description"
                    value={formData.description}
                    onChange={handleChange}
                    required
                    className={inputClass}
                  />
                </div>
              </div>
            </SectionCard>

            {/* Equipment Section */}
            <SectionCard title="Equipment Details">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label htmlFor="make" className="block text-[13px] text-[#64748b] mb-1.5">
                    Make
                  </label>
                  <input
                    type="text"
                    id="make"
                    name="make"
                    value={formData.make}
                    onChange={handleChange}
                    className={inputClass}
                  />
                </div>

                <div>
                  <label htmlFor="model" className="block text-[13px] text-[#64748b] mb-1.5">
                    Model
                  </label>
                  <input
                    type="text"
                    id="model"
                    name="model"
                    value={formData.model}
                    onChange={handleChange}
                    className={inputClass}
                  />
                </div>

                <div>
                  <label htmlFor="serialNumber" className="block text-[13px] text-[#64748b] mb-1.5">
                    Serial Number
                  </label>
                  <input
                    type="text"
                    id="serialNumber"
                    name="serialNumber"
                    value={formData.serialNumber}
                    onChange={handleChange}
                    className={inputClass}
                  />
                </div>
              </div>
            </SectionCard>

            {/* Parameters Section */}
            <SectionCard title="Parameter Information">
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="parameterGroup" className="block text-[13px] text-[#64748b] mb-1.5">
                      Parameter Group
                    </label>
                    <select
                      id="parameterGroup"
                      name="parameterGroup"
                      value={formData.parameterGroup}
                      onChange={handleChange}
                      className={inputClass}
                    >
                      <option value="">Select parameter group</option>
                      {PARAMETER_GROUPS.map(group => (
                        <option key={group} value={group}>{group}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[13px] text-[#64748b] mb-1.5">
                      Parameter Roles
                    </label>
                    <div className="flex flex-wrap gap-3 py-2">
                      {PARAMETER_ROLES.map(role => (
                        <label key={role.value} className="inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={(formData.parameterRoles || []).includes(role.value)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setFormData(prev => ({
                                  ...prev,
                                  parameterRoles: [...(prev.parameterRoles || []), role.value]
                                }))
                              } else {
                                setFormData(prev => ({
                                  ...prev,
                                  parameterRoles: (prev.parameterRoles || []).filter(r => r !== role.value)
                                }))
                              }
                            }}
                            className="rounded border-[#cbd5e1] text-[#7c3aed] focus:ring-[#7c3aed]/20"
                          />
                          <span className="ml-2 text-[13px] text-[#0f172a]">{role.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-[13px] text-[#64748b] mb-1.5">
                    Parameter Capabilities
                  </label>
                  <div className="flex flex-wrap gap-3 py-2">
                    {PARAMETER_CAPABILITIES.map(cap => (
                      <label key={cap.value} className="inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={(formData.parameterCapabilities || []).includes(cap.value)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setFormData(prev => ({
                                ...prev,
                                parameterCapabilities: [...(prev.parameterCapabilities || []), cap.value]
                              }))
                            } else {
                              setFormData(prev => ({
                                ...prev,
                                parameterCapabilities: (prev.parameterCapabilities || []).filter(c => c !== cap.value)
                              }))
                            }
                          }}
                          className="rounded border-[#cbd5e1] text-[#7c3aed] focus:ring-[#7c3aed]/20"
                        />
                        <span className="ml-2 text-[13px] text-[#0f172a]">{cap.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-[13px] text-[#64748b] mb-1.5">
                    SOP References
                  </label>
                  <div className="space-y-2">
                    {(formData.sopReferences || []).map((sop, idx) => (
                      <div key={idx} className="flex gap-2">
                        <input
                          type="text"
                          value={sop}
                          onChange={(e) => {
                            const newSops = [...(formData.sopReferences || [])]
                            newSops[idx] = e.target.value
                            setFormData(prev => ({ ...prev, sopReferences: newSops }))
                          }}
                          className={`flex-1 ${inputClass}`}
                          placeholder="e.g., NLAB/CAL/ET1/R01"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setFormData(prev => ({
                              ...prev,
                              sopReferences: prev.sopReferences.filter((_, i) => i !== idx)
                            }))
                          }}
                          className="px-3 py-2 text-[#dc2626] hover:bg-[#fef2f2] rounded-lg transition-colors"
                        >
                          <X className="size-4" />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => {
                        setFormData(prev => ({
                          ...prev,
                          sopReferences: [...(prev.sopReferences || []), '']
                        }))
                      }}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-[13px] font-medium bg-[#eff6ff] text-[#1d4ed8] rounded-lg hover:bg-[#dbeafe] transition-colors"
                    >
                      <Plus className="size-4" />
                      Add SOP Reference
                    </button>
                  </div>
                </div>
              </div>
            </SectionCard>

            {/* Calibration Section */}
            <SectionCard title="Calibration Information">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="usage" className="block text-[13px] text-[#64748b] mb-1.5">
                    Usage
                  </label>
                  <input
                    type="text"
                    id="usage"
                    name="usage"
                    value={formData.usage}
                    onChange={handleChange}
                    className={inputClass}
                  />
                </div>

                <div>
                  <label htmlFor="calibratedAtLocation" className="block text-[13px] text-[#64748b] mb-1.5">
                    Calibrated At
                  </label>
                  <input
                    type="text"
                    id="calibratedAtLocation"
                    name="calibratedAtLocation"
                    value={formData.calibratedAtLocation}
                    onChange={handleChange}
                    className={inputClass}
                  />
                </div>

                <div>
                  <label htmlFor="reportNo" className="block text-[13px] text-[#64748b] mb-1.5">
                    Report Number
                  </label>
                  <input
                    type="text"
                    id="reportNo"
                    name="reportNo"
                    value={formData.reportNo}
                    onChange={handleChange}
                    className={inputClass}
                  />
                </div>

                <div>
                  <label htmlFor="calibrationDueDate" className="block text-[13px] text-[#64748b] mb-1.5">
                    Calibration Due Date
                  </label>
                  <input
                    type="date"
                    id="calibrationDueDate"
                    name="calibrationDueDate"
                    value={formData.calibrationDueDate}
                    onChange={handleChange}
                    className={inputClass}
                  />
                </div>

                <div>
                  <label htmlFor="status" className="block text-[13px] text-[#64748b] mb-1.5">
                    Status
                  </label>
                  <select
                    id="status"
                    name="status"
                    value={formData.status}
                    onChange={handleChange}
                    className={inputClass}
                  >
                    {STATUS_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  <p className="text-[12px] text-[#94a3b8] mt-1.5">
                    &quot;Active&quot; status is computed from calibration due date
                  </p>
                </div>

                <div className="md:col-span-2">
                  <label htmlFor="remarks" className="block text-[13px] text-[#64748b] mb-1.5">
                    Remarks
                  </label>
                  <textarea
                    id="remarks"
                    name="remarks"
                    value={formData.remarks}
                    onChange={handleChange}
                    rows={3}
                    className={inputClass}
                  />
                </div>
              </div>
            </SectionCard>

            {/* Range Data Section */}
            <SectionCard title="Range Data">
              <div className="space-y-4">
                {formData.rangeData.length === 0 ? (
                  <p className="text-[13px] text-[#94a3b8]">No range data. Click &quot;Add Range&quot; to add parameters.</p>
                ) : (
                  formData.rangeData.map((range, idx) => (
                    <div key={idx} className="p-4 bg-[#f8fafc] rounded-xl border border-[#e2e8f0] space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[13px] font-medium text-[#0f172a]">Range {idx + 1}</span>
                        <button
                          type="button"
                          onClick={() => removeRangeItem(idx)}
                          className="text-[#dc2626] hover:text-[#b91c1c] transition-colors"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-[13px] text-[#64748b] mb-1.5">Parameter</label>
                          <input
                            type="text"
                            value={range.parameter || ''}
                            onChange={(e) => updateRangeItem(idx, 'parameter', e.target.value)}
                            placeholder="e.g., Temperature"
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <label className="block text-[13px] text-[#64748b] mb-1.5">Min</label>
                          <input
                            type="text"
                            value={range.min || ''}
                            onChange={(e) => updateRangeItem(idx, 'min', e.target.value)}
                            placeholder="e.g., 0"
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <label className="block text-[13px] text-[#64748b] mb-1.5">Max</label>
                          <input
                            type="text"
                            value={range.max || ''}
                            onChange={(e) => updateRangeItem(idx, 'max', e.target.value)}
                            placeholder="e.g., 100"
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <label className="block text-[13px] text-[#64748b] mb-1.5">Unit</label>
                          <select
                            value={range.unit || ''}
                            onChange={(e) => updateRangeItem(idx, 'unit', e.target.value)}
                            className={inputClass}
                          >
                            <option value="">Select unit</option>
                            {getAvailableUnits(formData.parameterCapabilities).map(unit => (
                              <option key={unit} value={unit}>{unit}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[13px] text-[#64748b] mb-1.5">Uncertainty</label>
                          <input
                            type="text"
                            value={range.uncertainty || ''}
                            onChange={(e) => updateRangeItem(idx, 'uncertainty', e.target.value)}
                            placeholder="e.g., ±0.5"
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <label className="block text-[13px] text-[#64748b] mb-1.5">Reference Doc</label>
                          <input
                            type="text"
                            value={range.referencedoc || ''}
                            onChange={(e) => updateRangeItem(idx, 'referencedoc', e.target.value)}
                            placeholder="e.g., ISO 12345"
                            className={inputClass}
                          />
                        </div>
                      </div>
                    </div>
                  ))
                )}
                <button
                  type="button"
                  onClick={addRangeItem}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-[13px] font-medium bg-[#eff6ff] text-[#1d4ed8] rounded-lg hover:bg-[#dbeafe] transition-colors"
                >
                  <Plus className="size-4" />
                  Add Range
                </button>
              </div>
            </SectionCard>

            {/* Certificate Upload Section */}
            <SectionCard title="Upload New Certificate">
              <div className="space-y-4">
                {certUploadError && (
                  <div className="p-3 bg-[#fef2f2] border border-[#fee2e2] rounded-lg text-[#dc2626] text-[13px]">
                    {certUploadError}
                  </div>
                )}
                <div>
                  <label className="block text-[13px] text-[#64748b] mb-1.5">
                    Certificate File (PDF)
                  </label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,application/pdf"
                    onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                    className="w-full text-[13px] text-[#64748b] file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-[13px] file:font-medium file:bg-[#eff6ff] file:text-[#1d4ed8] hover:file:bg-[#dbeafe]"
                  />
                </div>
                {selectedFile && (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-[13px] text-[#64748b] mb-1.5">
                          Report Number
                        </label>
                        <input
                          type="text"
                          value={certFormData.reportNo}
                          onChange={(e) => setCertFormData(prev => ({ ...prev, reportNo: e.target.value }))}
                          placeholder="e.g., CAL-2024-001"
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className="block text-[13px] text-[#64748b] mb-1.5">
                          Valid From
                        </label>
                        <input
                          type="date"
                          value={certFormData.validFrom}
                          onChange={(e) => setCertFormData(prev => ({ ...prev, validFrom: e.target.value }))}
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className="block text-[13px] text-[#64748b] mb-1.5">
                          Valid Until
                        </label>
                        <input
                          type="date"
                          value={certFormData.validUntil}
                          onChange={(e) => setCertFormData(prev => ({ ...prev, validUntil: e.target.value }))}
                          className={inputClass}
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleCertUpload}
                      disabled={uploadingCert}
                      className="inline-flex items-center gap-2 px-4 py-2 text-[13px] font-medium text-white bg-[#16a34a] hover:bg-[#15803d] rounded-lg disabled:opacity-50 transition-colors"
                    >
                      {uploadingCert ? (
                        <>
                          <Loader2 className="size-4 animate-spin" />
                          Uploading...
                        </>
                      ) : (
                        <>
                          <Upload className="size-4" />
                          Upload Certificate
                        </>
                      )}
                    </button>
                  </>
                )}
              </div>
            </SectionCard>

            {/* Change Reason Section */}
            <SectionCard title="Change Reason">
              <div>
                <label htmlFor="changeReason" className="block text-[13px] text-[#64748b] mb-1.5">
                  Reason for Change
                </label>
                <input
                  type="text"
                  id="changeReason"
                  name="changeReason"
                  value={formData.changeReason}
                  onChange={handleChange}
                  placeholder="e.g., Updated calibration data, Corrected range values"
                  className={inputClass}
                />
                <p className="text-[12px] text-[#94a3b8] mt-1.5">This will be recorded in the version history.</p>
              </div>
            </SectionCard>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-2">
              <Link
                href={`/admin/instruments/${id}`}
                className="px-4 py-2 text-[13px] font-medium text-[#0f172a] bg-white border border-[#e2e8f0] rounded-lg hover:bg-[#f8fafc] transition-colors"
              >
                Cancel
              </Link>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2 text-[13px] font-medium text-white bg-[#0f172a] hover:bg-[#1e293b] rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save Changes'
                )}
              </button>
            </div>
        </form>
      </div>
    </div>
  )
}
