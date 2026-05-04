'use client'

import { apiFetch } from '@/lib/api-client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  ChevronLeft,
  ChevronRight,
  Pencil,
  Calendar,
  User,
  FileText,
  Loader2,
  AlertTriangle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { DatePicker } from '@/components/ui/date-picker'

// Editable field definitions
const EDITABLE_SECTIONS = {
  'Certificate Details': {
    icon: FileText,
    fields: [
      { key: 'certificateNumber', label: 'Certificate Number', type: 'text' },
      { key: 'dateOfCalibration', label: 'Date of Calibration', type: 'date' },
      { key: 'calibrationDueDate', label: 'Calibration Due Date', type: 'date' },
    ],
  },
  'Assignment': {
    icon: User,
    fields: [
      { key: 'reviewerId', label: 'Reviewer', type: 'reviewer-select' },
    ],
  },
} as const

type SectionKey = keyof typeof EDITABLE_SECTIONS
type FieldKey = string

interface Reviewer {
  id: string
  name: string
  email: string
}

interface Certificate {
  id: string
  certificateNumber: string
  dateOfCalibration: string | null
  calibrationDueDate: string | null
  reviewerId: string | null
  createdById: string
}

interface EditActionsSidebarProps {
  certificate: Certificate
  reviewers?: Reviewer[]
  className?: string
}

type Step = 'section' | 'field' | 'edit'

export function EditActionsSidebar({
  certificate,
  reviewers = [],
  className,
}: EditActionsSidebarProps) {
  const router = useRouter()
  const [step, setStep] = useState<Step>('section')
  const [selectedSection, setSelectedSection] = useState<SectionKey | null>(null)
  const [selectedField, setSelectedField] = useState<FieldKey | null>(null)
  const [newValue, setNewValue] = useState<string>('')
  const [reason, setReason] = useState<string>('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSectionSelect = (section: SectionKey) => {
    setSelectedSection(section)
    setStep('field')
  }

  const handleFieldSelect = (fieldKey: string) => {
    setSelectedField(fieldKey)
    // Set current value
    const currentValue = getCertificateValue(fieldKey)
    setNewValue(currentValue)
    setReason('')
    setError(null)
    setStep('edit')
  }

  const getCertificateValue = (fieldKey: string): string => {
    switch (fieldKey) {
      case 'certificateNumber':
        return certificate.certificateNumber
      case 'dateOfCalibration':
        return certificate.dateOfCalibration?.split('T')[0] || ''
      case 'calibrationDueDate':
        return certificate.calibrationDueDate?.split('T')[0] || ''
      case 'reviewerId':
        return certificate.reviewerId || ''
      default:
        return ''
    }
  }

  const getFieldConfig = () => {
    if (!selectedSection || !selectedField) return null
    return EDITABLE_SECTIONS[selectedSection].fields.find(f => f.key === selectedField)
  }

  const handleSubmit = async () => {
    if (!selectedField || !reason.trim()) {
      setError('Reason is required for audit trail')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      const response = await apiFetch(`/api/admin/certificates/${certificate.id}/edit`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          field: selectedField,
          value: newValue,
          reason: reason.trim(),
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to update')
      }

      // Reset state and refresh
      setStep('section')
      setSelectedSection(null)
      setSelectedField(null)
      setNewValue('')
      setReason('')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleBack = () => {
    if (step === 'edit') {
      setStep('field')
      setSelectedField(null)
      setNewValue('')
      setReason('')
      setError(null)
    } else if (step === 'field') {
      setStep('section')
      setSelectedSection(null)
    }
  }

  return (
    <div className={cn('bg-white rounded-lg border shadow-sm', className)}>
      {/* Header */}
      <div className="px-4 py-3 border-b bg-amber-50">
        <div className="flex items-center gap-2">
          <Pencil className="h-5 w-5 text-amber-600" />
          <h3 className="font-semibold text-gray-900">Edit Actions</h3>
        </div>
        <p className="text-xs text-gray-500 mt-1">
          Admin-only certificate modifications
        </p>
      </div>

      {/* Content */}
      <div className="p-4">
        {/* Section Selection */}
        {step === 'section' && (
          <div className="space-y-2">
            <p className="text-sm text-gray-600 mb-3">Select a section to edit:</p>
            {(Object.keys(EDITABLE_SECTIONS) as SectionKey[]).map((sectionKey) => {
              const section = EDITABLE_SECTIONS[sectionKey]
              const Icon = section.icon
              return (
                <button
                  key={sectionKey}
                  onClick={() => handleSectionSelect(sectionKey)}
                  className="w-full flex items-center justify-between p-3 rounded-lg border hover:bg-gray-50 transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <Icon className="h-5 w-5 text-gray-400" />
                    <span className="font-medium text-gray-900">{sectionKey}</span>
                  </div>
                  <ChevronRight className="h-5 w-5 text-gray-400" />
                </button>
              )
            })}
          </div>
        )}

        {/* Field Selection */}
        {step === 'field' && selectedSection && (
          <div className="space-y-3">
            <button
              onClick={handleBack}
              className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
            >
              <ChevronLeft className="h-4 w-4" />
              Back to sections
            </button>

            <p className="text-sm text-gray-600">
              Select a field in <strong>{selectedSection}</strong>:
            </p>

            <div className="space-y-2">
              {EDITABLE_SECTIONS[selectedSection].fields.map((field) => {
                const currentValue = getCertificateValue(field.key)
                return (
                  <button
                    key={field.key}
                    onClick={() => handleFieldSelect(field.key)}
                    className="w-full flex items-center justify-between p-3 rounded-lg border hover:bg-gray-50 transition-colors text-left"
                  >
                    <div>
                      <span className="font-medium text-gray-900">{field.label}</span>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Current: {currentValue || '-'}
                      </p>
                    </div>
                    <ChevronRight className="h-5 w-5 text-gray-400" />
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Edit Form */}
        {step === 'edit' && selectedField && (
          <div className="space-y-4">
            <button
              onClick={handleBack}
              className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
            >
              <ChevronLeft className="h-4 w-4" />
              Back to fields
            </button>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <div>
              <Label htmlFor="new-value">{getFieldConfig()?.label}</Label>
              {renderFieldInput()}
            </div>

            <div>
              <Label htmlFor="reason">Reason for Change *</Label>
              <Textarea
                id="reason"
                placeholder="Explain why this change is needed (required for audit)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                className="resize-none mt-1"
              />
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handleBack}
                disabled={isSubmitting}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={isSubmitting || !reason.trim()}
                className="flex-1 bg-amber-600 hover:bg-amber-700"
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Pencil className="h-4 w-4 mr-2" />
                )}
                Save Change
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )

  function renderFieldInput() {
    const fieldConfig = getFieldConfig()
    if (!fieldConfig) return null

    switch (fieldConfig.type) {
      case 'date':
        return (
          <div className="mt-1">
            <DatePicker
              value={newValue}
              onChange={setNewValue}
            />
          </div>
        )

      case 'reviewer-select':
        return (
          <Select value={newValue} onValueChange={setNewValue}>
            <SelectTrigger className="mt-1">
              <SelectValue placeholder="Select reviewer..." />
            </SelectTrigger>
            <SelectContent>
              {reviewers
                .filter(r => r.id !== certificate.createdById)
                .map((reviewer) => (
                  <SelectItem key={reviewer.id} value={reviewer.id}>
                    {reviewer.name} ({reviewer.email})
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        )

      default:
        return (
          <Input
            id="new-value"
            type="text"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            className="mt-1"
          />
        )
    }
  }
}
