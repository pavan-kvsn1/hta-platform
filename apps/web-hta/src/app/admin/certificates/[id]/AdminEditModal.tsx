'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { X, Loader2, Shield } from 'lucide-react'

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
      const response = await fetch(`/api/admin/certificates/${certificateId}/edit`, {
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
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-amber-100 rounded-lg">
              <Shield className="h-4 w-4 text-amber-600" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Edit {fieldLabel}</h2>
              <p className="text-xs text-slate-500">Admin override with audit trail</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="h-4 w-4 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Current Value */}
          <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
            <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider mb-1">
              Current Value
            </p>
            <p className="text-sm font-medium text-slate-900">
              {getDisplayValue(currentValue)}
            </p>
          </div>

          {/* New Value Input */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">
              New Value <span className="text-red-500">*</span>
            </label>
            {fieldType === 'text' && (
              <Input
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                placeholder={`Enter new ${fieldLabel.toLowerCase()}`}
                className="text-sm"
              />
            )}
            {fieldType === 'date' && (
              <Input
                type="date"
                value={formatDateForInput(newValue)}
                onChange={(e) => setNewValue(e.target.value)}
                className="text-sm"
              />
            )}
            {fieldType === 'select' && options && (
              <Select value={newValue} onValueChange={setNewValue}>
                <SelectTrigger className="text-sm">
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
            <label className="block text-xs font-medium text-gray-700 mb-1.5">
              Reason for Change <span className="text-red-500">*</span>
            </label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain why this change is necessary..."
              rows={3}
              className="resize-none text-sm"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              This will be recorded in the audit log.
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="p-2 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-xs text-red-700">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t bg-gray-50 flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={isSubmitting}
            className="text-xs"
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={isSubmitting || !newValue || !reason.trim()}
            className="bg-amber-600 hover:bg-amber-700 text-white text-xs"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Shield className="h-3.5 w-3.5 mr-1.5" />
                Save Change
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
