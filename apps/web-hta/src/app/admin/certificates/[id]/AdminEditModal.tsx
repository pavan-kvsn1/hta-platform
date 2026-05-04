'use client'

import { apiFetch } from '@/lib/api-client'

import { useState } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { X, Loader2, Shield } from 'lucide-react'
import { DatePicker } from '@/components/ui/date-picker'

interface AdminEditModalProps {
  isOpen: boolean
  onClose: () => void
  certificateId: string
  field: string
  fieldLabel: string
  fieldType: 'text' | 'date' | 'select'
  currentValue: string
  options?: { value: string; label: string }[]
  onSuccess: () => void
}

export function AdminEditModal({
  isOpen,
  onClose,
  certificateId,
  field,
  fieldLabel,
  fieldType,
  currentValue,
  options,
  onSuccess,
}: AdminEditModalProps) {
  const [newValue, setNewValue] = useState(currentValue)
  const [reason, setReason] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  const handleSubmit = async () => {
    if (!reason.trim()) {
      setError('Reason is required for audit trail')
      return
    }

    if (newValue === currentValue) {
      setError('New value must be different from current value')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      const response = await apiFetch(`/api/admin/certificates/${certificateId}/edit`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          field,
          value: newValue,
          reason: reason.trim(),
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to update field')
      }

      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsSubmitting(false)
    }
  }

  const formatDateForInput = (dateStr: string): string => {
    if (!dateStr) return ''
    try {
      const date = new Date(dateStr)
      return date.toISOString().split('T')[0]
    } catch {
      return ''
    }
  }

  const getDisplayValue = (value: string): string => {
    if (fieldType === 'select' && options) {
      const option = options.find(o => o.value === value)
      return option?.label || value || 'Not set'
    }
    if (fieldType === 'date' && value) {
      return new Date(value).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    }
    return value || 'Not set'
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
      <div className="bg-white rounded-[14px] shadow-2xl max-w-md w-full overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-[#e2e8f0] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-[#fef3c7] rounded-[9px]">
              <Shield className="size-4 text-[#d97706]" />
            </div>
            <div>
              <h2 className="text-[13px] font-semibold text-[#0f172a]">Edit {fieldLabel}</h2>
              <p className="text-[11px] text-[#94a3b8]">Admin override with audit trail</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-[#f1f5f9] rounded-md transition-colors"
          >
            <X className="size-4 text-[#94a3b8]" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Current Value */}
          <div className="bg-[#f8fafc] rounded-[9px] p-3 border border-[#e2e8f0]">
            <p className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8] mb-1">
              Current Value
            </p>
            <p className="text-[13px] font-medium text-[#0f172a]">
              {getDisplayValue(currentValue)}
            </p>
          </div>

          {/* New Value Input */}
          <div>
            <label className="block text-[12px] font-semibold text-[#0f172a] mb-1.5">
              New Value <span className="text-[#dc2626]">*</span>
            </label>
            {fieldType === 'text' && (
              <input
                type="text"
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                placeholder={`Enter new ${fieldLabel.toLowerCase()}`}
                className="w-full px-3 py-2 text-[13px] text-[#0f172a] border border-[#e2e8f0] rounded-[9px] placeholder:text-[#94a3b8] focus:ring-2 focus:ring-[#7c3aed]/20 focus:border-[#7c3aed] outline-none"
              />
            )}
            {fieldType === 'date' && (
              <DatePicker
                value={formatDateForInput(newValue)}
                onChange={setNewValue}
              />
            )}
            {fieldType === 'select' && options && (
              <Select value={newValue} onValueChange={setNewValue}>
                <SelectTrigger className="w-full px-3 py-2 text-[13px] text-[#0f172a] border border-[#e2e8f0] rounded-[9px] bg-white focus:ring-2 focus:ring-[#7c3aed]/20 focus:border-[#7c3aed]">
                  <SelectValue placeholder={`Select ${fieldLabel.toLowerCase()}`} />
                </SelectTrigger>
                <SelectContent>
                  {options.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Reason */}
          <div>
            <label className="block text-[12px] font-semibold text-[#0f172a] mb-1.5">
              Reason for Change <span className="text-[#dc2626]">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain why this change is necessary..."
              rows={3}
              className="w-full px-3 py-2 text-[13px] text-[#0f172a] border border-[#e2e8f0] rounded-[9px] placeholder:text-[#94a3b8] focus:ring-2 focus:ring-[#7c3aed]/20 focus:border-[#7c3aed] outline-none resize-none"
            />
            <p className="text-[10px] text-[#94a3b8] mt-1">
              This will be recorded in the audit log.
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="p-2 bg-[#fef2f2] border border-[#fecaca] rounded-[9px]">
              <p className="text-[12px] text-[#dc2626]">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-[#e2e8f0] bg-[#f8fafc] flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="px-3 py-1.5 text-[12.5px] font-semibold text-[#64748b] border border-[#e2e8f0] hover:bg-[#f1f5f9] rounded-[9px] transition-colors disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || !newValue || !reason.trim()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12.5px] font-semibold text-white bg-[#d97706] hover:bg-[#b45309] rounded-[9px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Shield className="size-3.5" />
                Save Change
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
