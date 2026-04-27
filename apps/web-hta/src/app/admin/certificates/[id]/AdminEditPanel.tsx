'use client'

import { apiFetch } from '@/lib/api-client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ChevronDown,
  ChevronUp,
  X,
  Loader2,
  History,
  Plus,
  ArrowRight,
  Save,
} from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { CertificateData, Reviewer, CertificateEvent } from './AdminCertificateClient'

interface AdminEditPanelProps {
  certificate: CertificateData
  reviewer: Reviewer | null
  reviewers: Reviewer[]
  events: CertificateEvent[]
}

const SECTIONS = [
  {
    id: 'summary',
    label: 'Summary',
    fields: [
      { id: 'certificateNumber', label: 'Certificate Number', type: 'text' },
      { id: 'dateOfCalibration', label: 'Date of Calibration', type: 'date' },
      { id: 'calibrationDueDate', label: 'Calibration Due Date', type: 'date' },
      { id: 'srfNumber', label: 'SRF Number', type: 'text' },
      { id: 'srfDate', label: 'SRF Date', type: 'date' },
    ],
  },
  {
    id: 'assignee-reviewer',
    label: 'Assignee/Reviewer',
    fields: [
      { id: 'reviewerId', label: 'Reviewer', type: 'select' },
    ],
  },
]

interface PendingChange {
  id: string
  section: string
  sectionLabel: string
  field: string
  fieldLabel: string
  fromValue: string
  toValue: string
  reason: string
}

export function AdminEditPanel({
  certificate,
  reviewer,
  reviewers,
  events,
}: AdminEditPanelProps) {
  const router = useRouter()

  const [selectedSection, setSelectedSection] = useState<string>('')
  const [selectedField, setSelectedField] = useState<string>('')
  const [newValue, setNewValue] = useState<string>('')
  const [reason, setReason] = useState<string>('')
  const [pendingChanges, setPendingChanges] = useState<PendingChange[]>([])
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedSectionData = SECTIONS.find(s => s.id === selectedSection)
  const availableFields = selectedSectionData?.fields || []

  const getCurrentValue = (fieldId: string): string => {
    switch (fieldId) {
      case 'certificateNumber':
        return certificate.certificateNumber || ''
      case 'dateOfCalibration':
        return certificate.dateOfCalibration || ''
      case 'calibrationDueDate':
        return certificate.calibrationDueDate || ''
      case 'srfNumber':
        return certificate.srfNumber || ''
      case 'srfDate':
        return certificate.srfDate || ''
      case 'reviewerId':
        return reviewer?.id || ''
      default:
        return ''
    }
  }

  const getDisplayValue = (fieldId: string, value: string): string => {
    if (!value) return 'Not set'
    if (fieldId === 'reviewerId') {
      if (reviewer?.id === value) {
        return reviewer.name
      }
      const rev = reviewers.find(r => r.id === value)
      return rev?.name || value
    }
    if (['dateOfCalibration', 'calibrationDueDate', 'srfDate'].includes(fieldId)) {
      try {
        return new Date(value).toLocaleDateString('en-GB', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        })
      } catch {
        return value
      }
    }
    return value
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

  const handleSectionChange = (sectionId: string) => {
    setSelectedSection(sectionId)
    setSelectedField('')
    setNewValue('')
    setReason('')
    setError(null)
  }

  const handleFieldChange = (fieldId: string) => {
    setSelectedField(fieldId)
    setNewValue('')
    setReason('')
    setError(null)
  }

  const handleApplyChange = () => {
    if (!selectedSection || !selectedField || !reason.trim()) {
      setError('Please fill all required fields')
      return
    }
    const currentValue = getCurrentValue(selectedField)
    if (newValue === currentValue) {
      setError('New value must be different from current value')
      return
    }

    const existingIndex = pendingChanges.findIndex(
      c => c.section === selectedSection && c.field === selectedField
    )
    const fieldData = availableFields.find(f => f.id === selectedField)
    const change: PendingChange = {
      id: crypto.randomUUID(),
      section: selectedSection,
      sectionLabel: selectedSectionData?.label || selectedSection,
      field: selectedField,
      fieldLabel: fieldData?.label || selectedField,
      fromValue: currentValue,
      toValue: newValue,
      reason: reason.trim(),
    }

    if (existingIndex >= 0) {
      setPendingChanges(prev => {
        const updated = [...prev]
        updated[existingIndex] = change
        return updated
      })
    } else {
      setPendingChanges(prev => [...prev, change])
    }

    setSelectedSection('')
    setSelectedField('')
    setNewValue('')
    setReason('')
    setError(null)
  }

  const handleRemoveChange = (changeId: string) => {
    setPendingChanges(prev => prev.filter(c => c.id !== changeId))
  }

  const handleSaveAllChanges = async () => {
    if (pendingChanges.length === 0) return
    setIsSaving(true)
    setError(null)

    try {
      for (const change of pendingChanges) {
        const response = await apiFetch(`/api/admin/certificates/${certificate.id}/edit`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            field: change.field,
            value: change.toValue,
            reason: change.reason,
          }),
        })
        if (!response.ok) {
          const data = await response.json()
          throw new Error(data.error || `Failed to update ${change.fieldLabel}`)
        }
      }
      setPendingChanges([])
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsSaving(false)
    }
  }

  const editEvents = events
    .filter(e => e.eventType === 'ADMIN_EDIT')
    .slice(0, 10)

  const formatEventDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    if (date.toDateString() === today.toDateString()) {
      return `Today ${date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`
    }
    if (date.toDateString() === yesterday.toDateString()) {
      return `Yesterday ${date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`
    }
    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const fieldType = availableFields.find(f => f.id === selectedField)?.type

  return (
    <div className="p-4 space-y-4">
      {/* Select Section */}
      <div>
        <label className="block text-[12px] font-semibold text-[#0f172a] mb-1.5">
          Select Section
        </label>
        <Select value={selectedSection} onValueChange={handleSectionChange}>
          <SelectTrigger className="w-full px-3 py-2 text-[13px] text-[#0f172a] border border-[#e2e8f0] rounded-[9px] bg-white focus:ring-2 focus:ring-[#7c3aed]/20 focus:border-[#7c3aed]">
            <SelectValue placeholder="Choose a section..." />
          </SelectTrigger>
          <SelectContent>
            {SECTIONS.map(section => (
              <SelectItem key={section.id} value={section.id}>
                {section.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Select Field */}
      {selectedSection && (
        <div>
          <label className="block text-[12px] font-semibold text-[#0f172a] mb-1.5">
            Select Field
          </label>
          <Select value={selectedField} onValueChange={handleFieldChange}>
            <SelectTrigger className="w-full px-3 py-2 text-[13px] text-[#0f172a] border border-[#e2e8f0] rounded-[9px] bg-white focus:ring-2 focus:ring-[#7c3aed]/20 focus:border-[#7c3aed]">
              <SelectValue placeholder="Choose a field..." />
            </SelectTrigger>
            <SelectContent>
              {availableFields.map(field => (
                <SelectItem key={field.id} value={field.id}>
                  {field.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Current Value */}
      {selectedField && (
        <div>
          <label className="block text-[12px] font-semibold text-[#0f172a] mb-1.5">
            Current Value
          </label>
          <div className="w-full px-3 py-2 bg-[#f8fafc] border border-[#e2e8f0] rounded-[9px] text-[13px] text-[#64748b]">
            {getDisplayValue(selectedField, getCurrentValue(selectedField))}
          </div>
        </div>
      )}

      {/* New Value */}
      {selectedField && (
        <div>
          <label className="block text-[12px] font-semibold text-[#0f172a] mb-1.5">
            New Value
          </label>
          {fieldType === 'select' ? (
            reviewers.length === 0 ? (
              <div className="w-full px-3 py-2 bg-[#f8fafc] border border-[#e2e8f0] rounded-[9px] text-[13px] text-[#94a3b8]">
                No reviewers available
              </div>
            ) : (
              <Select value={newValue} onValueChange={setNewValue}>
                <SelectTrigger className="w-full px-3 py-2 text-[13px] text-[#0f172a] border border-[#e2e8f0] rounded-[9px] bg-white focus:ring-2 focus:ring-[#7c3aed]/20 focus:border-[#7c3aed]">
                  <SelectValue placeholder="Select new value..." />
                </SelectTrigger>
                <SelectContent>
                  {reviewers.map(rev => (
                    <SelectItem key={rev.id} value={rev.id}>
                      {rev.name || rev.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )
          ) : fieldType === 'date' ? (
            <input
              type="date"
              value={formatDateForInput(newValue)}
              onChange={(e) => setNewValue(e.target.value)}
              className="w-full px-3 py-2 text-[13px] text-[#0f172a] border border-[#e2e8f0] rounded-[9px] focus:ring-2 focus:ring-[#7c3aed]/20 focus:border-[#7c3aed] outline-none"
            />
          ) : (
            <input
              type="text"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              placeholder="Enter new value..."
              className="w-full px-3 py-2 text-[13px] text-[#0f172a] border border-[#e2e8f0] rounded-[9px] placeholder:text-[#94a3b8] focus:ring-2 focus:ring-[#7c3aed]/20 focus:border-[#7c3aed] outline-none"
            />
          )}
        </div>
      )}

      {/* Reason */}
      {selectedField && (
        <div>
          <label className="block text-[12px] font-semibold text-[#0f172a] mb-1.5">
            Reason for Change <span className="text-[#dc2626]">*</span>
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Explain why this change is necessary..."
            rows={2}
            className="w-full px-3 py-2 text-[13px] text-[#0f172a] border border-[#e2e8f0] rounded-[9px] placeholder:text-[#94a3b8] focus:ring-2 focus:ring-[#7c3aed]/20 focus:border-[#7c3aed] outline-none resize-none"
          />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="p-2 bg-[#fef2f2] border border-[#fecaca] rounded-[9px]">
          <p className="text-[12px] text-[#dc2626]">{error}</p>
        </div>
      )}

      {/* Add to Queue Button */}
      {selectedField && (
        <button
          onClick={handleApplyChange}
          disabled={!reason.trim() || !newValue}
          className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 text-[12.5px] font-semibold text-white bg-[#0f172a] hover:bg-[#1e293b] rounded-[9px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Plus className="size-4" />
          Add to Queue
        </button>
      )}

      {/* Pending Changes */}
      {pendingChanges.length > 0 && (
        <div className="border-t border-[#e2e8f0] pt-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-semibold text-[#0f172a]">Pending Changes</span>
            <span className="px-1.5 py-0.5 bg-[#fef3c7] text-[#d97706] text-[10px] font-bold rounded">
              {pendingChanges.length}
            </span>
          </div>

          <div className="space-y-2">
            {pendingChanges.map(change => (
              <div
                key={change.id}
                className="flex items-center gap-2 p-2 bg-[#fffbeb] border border-[#fde68a] rounded-[9px]"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-medium text-[#92400e]">{change.fieldLabel}</p>
                  <div className="flex items-center gap-1 text-[11px] text-[#d97706]">
                    <span className="truncate max-w-[100px]">{getDisplayValue(change.field, change.fromValue)}</span>
                    <ArrowRight className="size-3 flex-shrink-0" />
                    <span className="truncate max-w-[100px] font-medium">{getDisplayValue(change.field, change.toValue)}</span>
                  </div>
                </div>
                <button
                  onClick={() => handleRemoveChange(change.id)}
                  className="p-1 text-[#d97706] hover:text-[#dc2626] hover:bg-[#fef2f2] rounded transition-colors"
                >
                  <X className="size-4" />
                </button>
              </div>
            ))}
          </div>

          <button
            onClick={handleSaveAllChanges}
            disabled={isSaving}
            className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 text-[12.5px] font-semibold text-white bg-[#d97706] hover:bg-[#b45309] rounded-[9px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isSaving ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="size-4" />
                Save All Changes
              </>
            )}
          </button>
        </div>
      )}

      {/* Edit History */}
      <div className="border-t border-[#e2e8f0] pt-4">
        <button
          onClick={() => setIsHistoryExpanded(!isHistoryExpanded)}
          className="flex items-center justify-between w-full text-left"
        >
          <div className="flex items-center gap-2">
            <History className="size-4 text-[#94a3b8]" />
            <span className="text-[12px] font-semibold text-[#0f172a]">Edit History</span>
            {editEvents.length > 0 && (
              <span className="text-[10px] text-[#94a3b8]">({editEvents.length})</span>
            )}
          </div>
          {isHistoryExpanded ? (
            <ChevronUp className="size-4 text-[#94a3b8]" />
          ) : (
            <ChevronDown className="size-4 text-[#94a3b8]" />
          )}
        </button>

        {isHistoryExpanded && (
          <div className="mt-3 space-y-2 max-h-[200px] overflow-y-auto">
            {editEvents.length === 0 ? (
              <p className="text-[12px] text-[#94a3b8] text-center py-2">No edit history</p>
            ) : (
              editEvents.map(event => {
                let eventData: Record<string, unknown> = {}
                try {
                  eventData = JSON.parse(event.eventData)
                } catch {
                  // ignore
                }

                return (
                  <div
                    key={event.id}
                    className="p-2 bg-[#f8fafc] border border-[#e2e8f0] rounded-[9px]"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] font-medium text-[#0f172a]">
                        {String(eventData.field || 'Field')}
                      </span>
                      <span className="text-[10px] text-[#94a3b8]">
                        {formatEventDate(event.createdAt)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-[11px] text-[#64748b] mt-0.5">
                      <span>{String(eventData.from || 'empty')}</span>
                      <ArrowRight className="size-3 text-[#94a3b8]" />
                      <span>{String(eventData.to || 'empty')}</span>
                    </div>
                    {typeof eventData.reason === 'string' && eventData.reason && (
                      <p className="text-[10px] text-[#94a3b8] mt-0.5 italic">
                        &ldquo;{eventData.reason}&rdquo;
                      </p>
                    )}
                  </div>
                )
              })
            )}
          </div>
        )}
      </div>
    </div>
  )
}
