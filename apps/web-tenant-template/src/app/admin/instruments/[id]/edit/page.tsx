'use client'

import { useState, useEffect, useRef, use, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
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

function SectionCard({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-lg border border-slate-200 overflow-hidden shadow-sm">
      <div className="px-4 py-3 bg-primary">
        <h2 className="font-semibold text-primary-foreground text-sm">{title}</h2>
      </div>
      <div className="p-4 bg-white">{children}</div>
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
      const response = await fetch(`/api/admin/instruments/${id}`)
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
  }, [fetchInstrument])

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
      const response = await fetch(`/api/admin/instruments/${id}`, {
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

      const response = await fetch(`/api/admin/instruments/${id}/certificates`, {
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
      <div className="h-full flex items-center justify-center bg-slate-100">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-slate-600">Loading instrument...</p>
        </div>
      </div>
    )
  }

  if (error && !instrument) {
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
    <div className="h-full bg-slate-100">
      <div className="h-full flex flex-col bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Header */}
        <div className="flex-shrink-0 border-b border-slate-200 px-3 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link
                href={`/admin/instruments/${id}`}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <ArrowLeft className="size-5" strokeWidth={2} />
              </Link>
              <span className="text-slate-300 text-xl">|</span>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                Edit Instrument 
              </h1>
            </div>
          </div>
          <p className="mt-1 text-lg font-bold text-slate-500 pt-5">
           <span className="ml-2 text-slate-900">{instrument?.description}</span> | Asset: {instrument?.assetNumber}
          </p>
        </div>

        {/* Form Content - Scrollable */}
        <div className="flex-1 overflow-auto bg-section-inner">
          <form onSubmit={handleSubmit} className="p-3 space-y-4">
            {/* Error Message */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
                {error}
              </div>
            )}

            {/* Identity Section */}
            <SectionCard title="Identity">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="category" className="block text-sm font-medium text-slate-700 mb-1">
                    Category <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="category"
                    name="category"
                    value={formData.category}
                    onChange={handleChange}
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  >
                    <option value="">Select category</option>
                    {CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="assetNumber" className="block text-sm font-medium text-slate-700 mb-1">
                    Asset Number <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    id="assetNumber"
                    name="assetNumber"
                    value={formData.assetNumber}
                    onChange={handleChange}
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  />
                </div>

                <div className="md:col-span-2">
                  <label htmlFor="description" className="block text-sm font-medium text-slate-700 mb-1">
                    Description <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    id="description"
                    name="description"
                    value={formData.description}
                    onChange={handleChange}
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  />
                </div>
              </div>
            </SectionCard>

            {/* Equipment Section */}
            <SectionCard title="Equipment Details">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label htmlFor="make" className="block text-sm font-medium text-slate-700 mb-1">
                    Make
                  </label>
                  <input
                    type="text"
                    id="make"
                    name="make"
                    value={formData.make}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  />
                </div>

                <div>
                  <label htmlFor="model" className="block text-sm font-medium text-slate-700 mb-1">
                    Model
                  </label>
                  <input
                    type="text"
                    id="model"
                    name="model"
                    value={formData.model}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  />
                </div>

                <div>
                  <label htmlFor="serialNumber" className="block text-sm font-medium text-slate-700 mb-1">
                    Serial Number
                  </label>
                  <input
                    type="text"
                    id="serialNumber"
                    name="serialNumber"
                    value={formData.serialNumber}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  />
                </div>
              </div>
            </SectionCard>

            {/* Parameters Section */}
            <SectionCard title="Parameter Information">
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="parameterGroup" className="block text-sm font-medium text-slate-700 mb-1">
                      Parameter Group
                    </label>
                    <select
                      id="parameterGroup"
                      name="parameterGroup"
                      value={formData.parameterGroup}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    >
                      <option value="">Select parameter group</option>
                      {PARAMETER_GROUPS.map(group => (
                        <option key={group} value={group}>{group}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Parameter Roles
                    </label>
                    <div className="flex flex-wrap gap-3 py-2">
                      {PARAMETER_ROLES.map(role => (
                        <label key={role.value} className="inline-flex items-center">
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
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="ml-2 text-sm text-slate-700">{role.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Parameter Capabilities
                  </label>
                  <div className="flex flex-wrap gap-3 py-2">
                    {PARAMETER_CAPABILITIES.map(cap => (
                      <label key={cap.value} className="inline-flex items-center">
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
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="ml-2 text-sm text-slate-700">{cap.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
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
                          className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
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
                          className="px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg"
                        >
                          <X className="w-4 h-4" />
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
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100"
                    >
                      <Plus className="w-4 h-4" />
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
                  <label htmlFor="usage" className="block text-sm font-medium text-slate-700 mb-1">
                    Usage
                  </label>
                  <input
                    type="text"
                    id="usage"
                    name="usage"
                    value={formData.usage}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  />
                </div>

                <div>
                  <label htmlFor="calibratedAtLocation" className="block text-sm font-medium text-slate-700 mb-1">
                    Calibrated At
                  </label>
                  <input
                    type="text"
                    id="calibratedAtLocation"
                    name="calibratedAtLocation"
                    value={formData.calibratedAtLocation}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  />
                </div>

                <div>
                  <label htmlFor="reportNo" className="block text-sm font-medium text-slate-700 mb-1">
                    Report Number
                  </label>
                  <input
                    type="text"
                    id="reportNo"
                    name="reportNo"
                    value={formData.reportNo}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  />
                </div>

                <div>
                  <label htmlFor="calibrationDueDate" className="block text-sm font-medium text-slate-700 mb-1">
                    Calibration Due Date
                  </label>
                  <input
                    type="date"
                    id="calibrationDueDate"
                    name="calibrationDueDate"
                    value={formData.calibrationDueDate}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  />
                </div>

                <div>
                  <label htmlFor="status" className="block text-sm font-medium text-slate-700 mb-1">
                    Status
                  </label>
                  <select
                    id="status"
                    name="status"
                    value={formData.status}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  >
                    {STATUS_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  <p className="text-xs text-slate-500 mt-1">
                    &quot;Active&quot; status is computed from calibration due date
                  </p>
                </div>

                <div className="md:col-span-2">
                  <label htmlFor="remarks" className="block text-sm font-medium text-slate-700 mb-1">
                    Remarks
                  </label>
                  <textarea
                    id="remarks"
                    name="remarks"
                    value={formData.remarks}
                    onChange={handleChange}
                    rows={3}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  />
                </div>
              </div>
            </SectionCard>

            {/* Range Data Section */}
            <SectionCard title="Range Data">
              <div className="space-y-4">
                {formData.rangeData.length === 0 ? (
                  <p className="text-slate-500 text-sm">No range data. Click &quot;Add Range&quot; to add parameters.</p>
                ) : (
                  formData.rangeData.map((range, idx) => (
                    <div key={idx} className="p-4 bg-slate-50 rounded-lg border space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-slate-700">Range {idx + 1}</span>
                        <button
                          type="button"
                          onClick={() => removeRangeItem(idx)}
                          className="text-red-500 hover:text-red-700"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">Parameter</label>
                          <input
                            type="text"
                            value={range.parameter || ''}
                            onChange={(e) => updateRangeItem(idx, 'parameter', e.target.value)}
                            placeholder="e.g., Temperature"
                            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">Min</label>
                          <input
                            type="text"
                            value={range.min || ''}
                            onChange={(e) => updateRangeItem(idx, 'min', e.target.value)}
                            placeholder="e.g., 0"
                            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">Max</label>
                          <input
                            type="text"
                            value={range.max || ''}
                            onChange={(e) => updateRangeItem(idx, 'max', e.target.value)}
                            placeholder="e.g., 100"
                            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">Unit</label>
                          <input
                            type="text"
                            value={range.unit || ''}
                            onChange={(e) => updateRangeItem(idx, 'unit', e.target.value)}
                            placeholder="e.g., °C"
                            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">Uncertainty</label>
                          <input
                            type="text"
                            value={range.uncertainty || ''}
                            onChange={(e) => updateRangeItem(idx, 'uncertainty', e.target.value)}
                            placeholder="e.g., ±0.5"
                            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">Reference Doc</label>
                          <input
                            type="text"
                            value={range.referencedoc || ''}
                            onChange={(e) => updateRangeItem(idx, 'referencedoc', e.target.value)}
                            placeholder="e.g., ISO 12345"
                            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          />
                        </div>
                      </div>
                    </div>
                  ))
                )}
                <button
                  type="button"
                  onClick={addRangeItem}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100"
                >
                  <Plus className="w-4 h-4" />
                  Add Range
                </button>
              </div>
            </SectionCard>

            {/* Certificate Upload Section */}
            <SectionCard title="Upload New Certificate">
              <div className="space-y-4">
                {certUploadError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                    {certUploadError}
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Certificate File (PDF)
                  </label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,application/pdf"
                    onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                    className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                  />
                </div>
                {selectedFile && (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">
                          Report Number
                        </label>
                        <input
                          type="text"
                          value={certFormData.reportNo}
                          onChange={(e) => setCertFormData(prev => ({ ...prev, reportNo: e.target.value }))}
                          placeholder="e.g., CAL-2024-001"
                          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">
                          Valid From
                        </label>
                        <input
                          type="date"
                          value={certFormData.validFrom}
                          onChange={(e) => setCertFormData(prev => ({ ...prev, validFrom: e.target.value }))}
                          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">
                          Valid Until
                        </label>
                        <input
                          type="date"
                          value={certFormData.validUntil}
                          onChange={(e) => setCertFormData(prev => ({ ...prev, validUntil: e.target.value }))}
                          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleCertUpload}
                      disabled={uploadingCert}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm"
                    >
                      {uploadingCert ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Uploading...
                        </>
                      ) : (
                        <>
                          <Upload className="w-4 h-4" />
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
                <label htmlFor="changeReason" className="block text-sm font-medium text-slate-700 mb-1">
                  Reason for Change
                </label>
                <input
                  type="text"
                  id="changeReason"
                  name="changeReason"
                  value={formData.changeReason}
                  onChange={handleChange}
                  placeholder="e.g., Updated calibration data, Corrected range values"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                />
                <p className="text-xs text-slate-500 mt-1">This will be recorded in the version history.</p>
              </div>
            </SectionCard>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-4">
              <Link
                href={`/admin/instruments/${id}`}
                className="px-4 py-2 text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors text-sm"
              >
                Cancel
              </Link>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors text-sm"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
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
    </div>
  )
}
