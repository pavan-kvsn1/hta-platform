'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import {
  ChevronDown,
  ChevronRight,
  Info,
  Loader2,
  Clock,
  CheckCircle,
  XCircle,
  Lock,
  Unlock,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

// Section definitions - must match the certificate form sections
const SECTIONS = [
  { id: 'summary', label: 'Section 1: Summary' },
  { id: 'uuc-details', label: 'Section 2: UUC Details' },
  { id: 'master-inst', label: 'Section 3: Master Instruments' },
  { id: 'environment', label: 'Section 4: Environmental Conditions' },
  { id: 'results', label: 'Section 5: Calibration Results' },
  { id: 'remarks', label: 'Section 6: Remarks' },
  { id: 'conclusion', label: 'Section 7: Conclusion' },
]

interface UnlockRequest {
  id: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  data: { sections: string[]; reason: string }
  requestedBy: { id: string; name: string }
  reviewedBy: { id: string; name: string } | null
  reviewedAt: string | null
  adminNote: string | null
  createdAt: string
}

interface UnlockedSections {
  fromFeedback: string[]
  fromApprovedRequests: string[]
  all: string[]
}

interface SectionUnlockRequestProps {
  certificateId: string
  certificateStatus: string
}

export function SectionUnlockRequest({ certificateId, certificateStatus }: SectionUnlockRequestProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [selectedSections, setSelectedSections] = useState<string[]>([])
  const [reason, setReason] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [requests, setRequests] = useState<UnlockRequest[]>([])
  const [unlockedSections, setUnlockedSections] = useState<UnlockedSections>({
    fromFeedback: [],
    fromApprovedRequests: [],
    all: [],
  })
  const [isLoading, setIsLoading] = useState(true)

  const fetchUnlockRequests = useCallback(async () => {
    try {
      const res = await fetch(`/api/certificates/${certificateId}/unlock-requests`)
      if (res.ok) {
        const data = await res.json()
        setRequests(data.requests)
        setUnlockedSections(data.unlockedSections)
      }
    } catch (err) {
      console.error('Failed to fetch unlock requests:', err)
    } finally {
      setIsLoading(false)
    }
  }, [certificateId])

  useEffect(() => {
    if (certificateStatus === 'REVISION_REQUIRED') {
      fetchUnlockRequests()
    }
  }, [certificateStatus, fetchUnlockRequests])

  // Only show for REVISION_REQUIRED status
  if (certificateStatus !== 'REVISION_REQUIRED') {
    return null
  }

  const handleSectionToggle = (sectionId: string) => {
    // Don't allow toggling already unlocked sections
    if (unlockedSections.all.includes(sectionId)) return

    setSelectedSections((prev) =>
      prev.includes(sectionId)
        ? prev.filter((s) => s !== sectionId)
        : [...prev, sectionId]
    )
  }

  const handleSubmit = async () => {
    if (selectedSections.length === 0) {
      setError('Please select at least one section to unlock')
      return
    }

    if (!reason.trim()) {
      setError('Please provide a reason for the unlock request')
      return
    }

    setIsSubmitting(true)
    setError(null)
    setSuccess(null)

    try {
      const res = await fetch('/api/internal-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'SECTION_UNLOCK',
          certificateId,
          sections: selectedSections,
          reason: reason.trim(),
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit request')
      }

      setSuccess('Section unlock request submitted successfully')
      setSelectedSections([])
      setReason('')
      fetchUnlockRequests()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit request')
    } finally {
      setIsSubmitting(false)
    }
  }

  const pendingRequests = requests.filter((r) => r.status === 'PENDING')
  const processedRequests = requests.filter((r) => r.status !== 'PENDING')
  const hasPendingRequest = pendingRequests.length > 0

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'PENDING':
        return <Clock className="size-4 text-amber-500" />
      case 'APPROVED':
        return <CheckCircle className="size-4 text-green-500" />
      case 'REJECTED':
        return <XCircle className="size-4 text-red-500" />
      default:
        return null
    }
  }

  const getSectionLabel = (sectionId: string) => {
    const section = SECTIONS.find((s) => s.id === sectionId)
    return section?.label || sectionId
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Header - Collapsible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          {isExpanded ? (
            <ChevronDown className="size-4 text-slate-400" />
          ) : (
            <ChevronRight className="size-4 text-slate-400" />
          )}
          <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            Request Section Unlock
          </span>
          {hasPendingRequest && (
            <span className="px-1.5 py-0.5 text-[10px] font-medium bg-amber-100 text-amber-700 rounded">
              {pendingRequests.length} pending
            </span>
          )}
        </div>
      </button>

      {/* Content - Only when expanded */}
      {isExpanded && (
        <div className="px-4 pb-4 border-t border-slate-100">
          {/* Info banner */}
          <div className="flex items-start gap-2 p-3 mt-3 bg-blue-50 border border-blue-100 rounded-lg">
            <Info className="size-4 text-blue-500 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-blue-700">
              Need to edit a locked section? Request admin approval to unlock additional sections.
            </p>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="size-5 animate-spin text-slate-400" />
            </div>
          ) : (
            <>
              {/* Section selection */}
              <div className="mt-4">
                <Label className="text-xs font-medium text-slate-700 mb-2 block">
                  Select sections to unlock:
                </Label>
                <div className="border rounded-lg divide-y">
                  {SECTIONS.map((section) => {
                    const isUnlocked = unlockedSections.all.includes(section.id)
                    const isPendingInRequest = pendingRequests.some((r) =>
                      r.data.sections.includes(section.id)
                    )

                    return (
                      <label
                        key={section.id}
                        className={cn(
                          'flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-slate-50 transition-colors text-xs',
                          isUnlocked && 'bg-slate-50 cursor-not-allowed',
                          isPendingInRequest && 'bg-amber-50/50'
                        )}
                      >
                        <Checkbox
                          checked={isUnlocked || selectedSections.includes(section.id)}
                          disabled={isUnlocked || hasPendingRequest}
                          onCheckedChange={() => handleSectionToggle(section.id)}
                          className={cn(isUnlocked && 'opacity-50')}
                        />
                        <span
                          className={cn(
                            'text-xs flex-1',
                            isUnlocked ? 'text-slate-500' : 'text-slate-700'
                          )}
                        >
                          {section.label}
                        </span>
                        {isUnlocked ? (
                          <Unlock className="size-3.5 text-green-500" />
                        ) : isPendingInRequest ? (
                          <Clock className="size-3.5 text-amber-500" />
                        ) : (
                          <Lock className="size-3.5 text-slate-300" />
                        )}
                      </label>
                    )
                  })}
                </div>
              </div>

              {/* Reason input */}
              {!hasPendingRequest && (
                <div className="mt-4">
                  <Label
                    htmlFor="unlock-reason"
                    className="text-xs font-medium text-slate-700 mb-2 block"
                  >
                    Reason for unlock: <span className="text-red-500">*</span>
                  </Label>
                  <Textarea
                    id="unlock-reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Explain why you need to edit these sections..."
                    rows={3}
                    className="text-xs md:text-xs"
                  />
                </div>
              )}

              {/* Error/Success messages */}
              {error && (
                <div className="mt-3 p-2 text-xs text-red-600 bg-red-50 rounded border border-red-100">
                  {error}
                </div>
              )}
              {success && (
                <div className="mt-3 p-2 text-xs text-green-600 bg-green-50 rounded border border-green-100">
                  {success}
                </div>
              )}

              {/* Submit button */}
              {!hasPendingRequest && (
                <Button
                  onClick={handleSubmit}
                  disabled={isSubmitting || selectedSections.length === 0 || !reason.trim()}
                  className="mt-4 w-full"
                  size="sm"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="size-4 mr-2 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    'Request Unlock'
                  )}
                </Button>
              )}

              {/* Existing requests */}
              {requests.length > 0 && (
                <div className="mt-4 pt-4 border-t border-slate-200">
                  <Label className="text-xs font-medium text-slate-700 mb-2 block">
                    Your Requests:
                  </Label>
                  <div className="space-y-2">
                    {requests.map((request) => (
                      <div
                        key={request.id}
                        className={cn(
                          'p-2 rounded-lg border text-xs',
                          request.status === 'PENDING' && 'bg-amber-50 border-amber-200',
                          request.status === 'APPROVED' && 'bg-green-50 border-green-200',
                          request.status === 'REJECTED' && 'bg-red-50 border-red-200'
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 mb-1">
                              {getStatusIcon(request.status)}
                              <span className="font-medium text-slate-700">
                                {request.data.sections.map(getSectionLabel).join(', ')}
                              </span>
                            </div>
                            <p className="text-slate-500 truncate">{request.data.reason}</p>
                          </div>
                          <span className="text-slate-400 flex-shrink-0">
                            {formatDistanceToNow(new Date(request.createdAt), { addSuffix: true })}
                          </span>
                        </div>
                        {request.adminNote && request.status !== 'PENDING' && (
                          <p className="mt-1 pt-1 border-t border-slate-200 text-slate-600 italic">
                            Admin: {request.adminNote}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
