'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

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

export default function NewInstrumentPage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
  })

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSaving(true)

    try {
      const response = await fetch('/api/admin/instruments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          calibrationDueDate: formData.calibrationDueDate || null,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create instrument')
      }

      router.push('/admin/instruments')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-3 h-full">
      {/* Master Bounding Box */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden h-full">
        <div className="p-6 overflow-auto h-full">
          <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/admin/instruments"
          className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Add New Instrument</h1>
          <p className="text-sm text-slate-600 mt-1">Create a new master instrument record</p>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          {error}
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="bg-white rounded-lg border shadow-sm">
        <div className="p-6 space-y-6">
          {/* Basic Information */}
          <div>
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Basic Information</h2>
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
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="e.g., HTA-001"
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
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="e.g., Digital Multimeter"
                />
              </div>
            </div>
          </div>

          {/* Equipment Details */}
          <div>
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Equipment Details</h2>
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
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="e.g., Fluke"
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
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="e.g., 87V"
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
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="e.g., SN123456"
                />
              </div>
            </div>
          </div>

          {/* Calibration Information */}
          <div>
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Calibration Information</h2>
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
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="e.g., Reference Standard"
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
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="e.g., NABL Lab"
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
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="e.g., CAL-2024-001"
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
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Remarks */}
          <div>
            <label htmlFor="remarks" className="block text-sm font-medium text-slate-700 mb-1">
              Remarks
            </label>
            <textarea
              id="remarks"
              name="remarks"
              value={formData.remarks}
              onChange={handleChange}
              rows={3}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Any additional notes..."
            />
          </div>
        </div>

        {/* Actions */}
        <div className="px-6 py-4 bg-slate-50 border-t flex justify-end gap-3 rounded-b-lg">
          <Link
            href="/admin/instruments"
            className="px-4 py-2 text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? 'Creating...' : 'Create Instrument'}
          </button>
        </div>
      </form>
          </div>
        </div>
      </div>
    </div>
  )
}
