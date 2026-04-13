'use client'

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
      // Check current reviewer first
      if (reviewer?.id === value) {
        return reviewer.name
      }
      // Then check reviewers list
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
        const response = await fetch(`/api/admin/certificates/${certificate.id}/edit`, {
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
        <label className="block text-xs font-medium text-slate-600 mb-1.5">
          Select Section
        </label>
        <Select value={selectedSection} onValueChange={handleSectionChange}>
          <SelectTrigger className="w-full">
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
          <label className="block text-xs font-medium text-slate-600 mb-1.5">
            Select Field
          </label>
          <Select value={selectedField} onValueChange={handleFieldChange}>
            <SelectTrigger className="w-full">
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
          <label className="block text-xs font-medium text-slate-600 mb-1.5">
            Current Value
          </label>
          <div className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-md text-sm text-slate-700">
            {getDisplayValue(selectedField, getCurrentValue(selectedField))}
          </div>
        </div>
      )}

      {/* New Value */}
      {selectedField && (
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">
            New Value
          </label>
          {fieldType === 'select' ? (
            reviewers.length === 0 ? (
              <div className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-md text-sm text-slate-500">
                No reviewers available
              </div>
            ) : (
              <Select value={newValue} onValueChange={setNewValue}>
                <SelectTrigger className="w-full">
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
            <Input
              type="date"
              value={formatDateForInput(newValue)}
              onChange={(e) => setNewValue(e.target.value)}
              className="w-full"
            />
          ) : (
            <Input
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              placeholder="Enter new value..."
              className="w-full"
            />
          )}
        </div>
      )}

      {/* Reason */}
      {selectedField && (
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">
            Reason for Change <span className="text-red-500">*</span>
          </label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Explain why this change is necessary..."
            rows={2}
            className="w-full resize-none"
          />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="p-2 bg-red-50 border border-red-200 rounded-md">
          <p className="text-xs text-red-700">{error}</p>
        </div>
      )}

      {/* Add to Queue Button */}
      {selectedField && (
        <Button
          onClick={handleApplyChange}
          disabled={!reason.trim() || !newValue}
          className="w-full"
        >
          <Plus className="h-4 w-4 mr-1.5" />
          Add to Queue
        </Button>
      )}

      {/* Pending Changes */}
      {pendingChanges.length > 0 && (
        <div className="border-t border-slate-200 pt-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-600">Pending Changes</span>
            <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-semibold rounded">
              {pendingChanges.length}
            </span>
          </div>

          <div className="space-y-2">
            {pendingChanges.map(change => (
              <div
                key={change.id}
                className="flex items-center gap-2 p-2 bg-amber-50 border border-amber-200 rounded-md"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-amber-900">{change.fieldLabel}</p>
                  <div className="flex items-center gap-1 text-[11px] text-amber-700">
                    <span className="truncate max-w-[100px]">{getDisplayValue(change.field, change.fromValue)}</span>
                    <ArrowRight className="h-3 w-3 flex-shrink-0" />
                    <span className="truncate max-w-[100px] font-medium">{getDisplayValue(change.field, change.toValue)}</span>
                  </div>
                </div>
                <button
                  onClick={() => handleRemoveChange(change.id)}
                  className="p-1 text-amber-500 hover:text-red-600 hover:bg-red-50 rounded"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>

          <Button
            onClick={handleSaveAllChanges}
            disabled={isSaving}
            className="w-full bg-amber-600 hover:bg-amber-700"
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-1.5" />
                Save All Changes
              </>
            )}
          </Button>
        </div>
      )}

      {/* Edit History */}
      <div className="border-t border-slate-200 pt-4">
        <button
          onClick={() => setIsHistoryExpanded(!isHistoryExpanded)}
          className="flex items-center justify-between w-full text-left"
        >
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-slate-400" />
            <span className="text-xs font-medium text-slate-600">Edit History</span>
            {editEvents.length > 0 && (
              <span className="text-[10px] text-slate-400">({editEvents.length})</span>
            )}
          </div>
          {isHistoryExpanded ? (
            <ChevronUp className="h-4 w-4 text-slate-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-slate-400" />
          )}
        </button>

        {isHistoryExpanded && (
          <div className="mt-3 space-y-2 max-h-[200px] overflow-y-auto">
            {editEvents.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-2">No edit history</p>
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
                    className="p-2 bg-slate-50 border border-slate-200 rounded-md"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-slate-700">
                        {String(eventData.field || 'Field')}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {formatEventDate(event.createdAt)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-[11px] text-slate-600 mt-0.5">
                      <span>{String(eventData.from || 'empty')}</span>
                      <ArrowRight className="h-3 w-3 text-slate-400" />
                      <span>{String(eventData.to || 'empty')}</span>
                    </div>
                    {typeof eventData.reason === 'string' && eventData.reason && (
                      <p className="text-[10px] text-slate-400 mt-0.5 italic">
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
