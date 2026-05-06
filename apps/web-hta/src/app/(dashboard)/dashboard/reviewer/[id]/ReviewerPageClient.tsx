'use client'

import { apiFetch } from '@/lib/api-client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { ChatSidebar } from '@/components/chat/ChatSidebar'
import { ReviewerContent } from './ReviewerContent'
import { ReviewerApproveModal } from './ReviewerApproveModal'
import { InlinePDFViewer } from './InlinePDFViewer'
import {
  CheckCircle,
  RotateCcw,
  XCircle,
  Loader2,
  X,
  Send,
  ChevronLeft,
  // ChevronDown,
  // ChevronRight,
  User,
  Building2,
  MapPin,
  Plus,
  Trash2,
  Clock,
  AlertTriangle,
  MessageSquare,
  Settings2,
  PenLine,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { ViewToggleButton } from '@/components/certificate/ViewToggleButton'
import { MetaInfoItem } from '@/components/certificate/MetaInfoItem'
import { REVISION_SECTIONS } from '@/components/feedback/shared/feedback-utils'
import type { ClientEvidence } from '@/types/signatures'
import type {
  CertificateData,
  Assignee,
  Feedback,
  AdminHeaderData,
} from '@/types/certificate'

type HeaderData = AdminHeaderData

interface CustomerFeedback {
  notes: string
  sectionFeedbacks: { section: string; comment: string }[] | null
  generalNotes: string | null
  customerName: string
  customerEmail: string
  requestedAt: string
}

interface LastSentCustomerInfo {
  email: string | null
  name: string | null
}

interface FieldChangeRequest {
  id: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  fields: string[]
  description: string
  adminNote: string | null
  reviewedBy: string | null
  reviewedAt: string | null
  createdAt: string
}

const FIELD_OPTIONS = [
  { id: 'certificateNumber', label: 'Certificate Number' },
  { id: 'srfNumber', label: 'SRF Number' },
  { id: 'srfDate', label: 'SRF Date' },
  { id: 'customerName', label: 'Customer Name' },
  { id: 'customerAddress', label: 'Customer Address' },
  { id: 'customerContactName', label: 'Contact Name' },
  { id: 'customerContactEmail', label: 'Contact Email' },
  { id: 'calibratedAt', label: 'Calibrated At' },
  { id: 'dateOfCalibration', label: 'Date of Calibration' },
  { id: 'calibrationDueDate', label: 'Calibration Due Date' },
] as const

interface SectionUnlockRequestData {
  id: string
  type: 'SECTION_UNLOCK'
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  sections: string[]
  reason: string
  adminNote: string | null
  requestedByName?: string
  reviewedByName?: string | null
  createdAt: string
  revisionNumber?: number
}

interface ReviewerPageClientProps {
  certificate: CertificateData
  assignee: Assignee
  feedbacks: Feedback[]
  chatThreadId: string | null
  headerData: HeaderData
  userRole: string
  customerFeedback: CustomerFeedback | null
  lastSentCustomerInfo: LastSentCustomerInfo | null
  tatStartedAt: string | null
  certificateCreatedAt: string
  fieldChangeRequests: FieldChangeRequest[]
  sectionUnlockRequests: SectionUnlockRequestData[]
}

// ─── TAT Banner (12h target for reviewer) ───

function formatTATTime(ms: number): { hours: number; minutes: number } {
  const hours = Math.floor(ms / (1000 * 60 * 60))
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60))
  return { hours, minutes }
}

function TATBanner({ sentAt, certificateCreatedAt, targetHours = 12, totalTargetHours = 48 }: { sentAt: string; certificateCreatedAt: string; targetHours?: number; totalTargetHours?: number }) {
  const [elapsed, setElapsed] = useState<{ hours: number; minutes: number }>({ hours: 0, minutes: 0 })
  const [remaining, setRemaining] = useState<{ hours: number; minutes: number }>({ hours: 0, minutes: 0 })
  const [totalElapsed, setTotalElapsed] = useState<{ hours: number; minutes: number }>({ hours: 0, minutes: 0 })
  const [totalRemaining, setTotalRemaining] = useState<{ hours: number; minutes: number }>({ hours: 0, minutes: 0 })
  const [status, setStatus] = useState<'good' | 'warning' | 'critical'>('good')
  const [totalStatus, setTotalStatus] = useState<'good' | 'warning' | 'critical'>('good')

  useEffect(() => {
    const calculateTAT = () => {
      const now = Date.now()

      // Phase TAT (12h target)
      const sentTime = new Date(sentAt).getTime()
      const elapsedMs = now - sentTime
      const targetMs = targetHours * 60 * 60 * 1000
      const remainingMs = targetMs - elapsedMs

      setElapsed(formatTATTime(elapsedMs))

      if (remainingMs <= 0) {
        setRemaining({ hours: 0, minutes: 0 })
        setStatus('critical')
      } else if (remainingMs <= 3 * 60 * 60 * 1000) {
        setRemaining(formatTATTime(remainingMs))
        setStatus('warning')
      } else {
        setRemaining(formatTATTime(remainingMs))
        setStatus('good')
      }

      // Total TAT (48h target)
      const createdTime = new Date(certificateCreatedAt).getTime()
      const totalElapsedMs = now - createdTime
      const totalTargetMs = totalTargetHours * 60 * 60 * 1000
      const totalRemainingMs = totalTargetMs - totalElapsedMs

      setTotalElapsed(formatTATTime(totalElapsedMs))

      if (totalRemainingMs <= 0) {
        setTotalRemaining({ hours: 0, minutes: 0 })
        setTotalStatus('critical')
      } else if (totalRemainingMs <= 8 * 60 * 60 * 1000) {
        setTotalRemaining(formatTATTime(totalRemainingMs))
        setTotalStatus('warning')
      } else {
        setTotalRemaining(formatTATTime(totalRemainingMs))
        setTotalStatus('good')
      }
    }

    calculateTAT()
    const interval = setInterval(calculateTAT, 60000)
    return () => clearInterval(interval)
  }, [sentAt, certificateCreatedAt, targetHours, totalTargetHours])

  const config = {
    good: { bg: 'bg-[#f0fdf4]', border: 'border-[#bbf7d0]', text: 'text-[#166534]', icon: <Clock className="size-3.5 text-[#16a34a]" /> },
    warning: { bg: 'bg-[#fffbeb]', border: 'border-[#fde68a]', text: 'text-[#92400e]', icon: <AlertTriangle className="size-3.5 text-[#d97706]" /> },
    critical: { bg: 'bg-[#fef2f2]', border: 'border-[#fecaca]', text: 'text-[#991b1b]', icon: <AlertTriangle className="size-3.5 text-[#dc2626]" /> },
  }

  const c = config[status]

  const totalColor = totalStatus === 'critical' ? 'text-[#dc2626]' : totalStatus === 'warning' ? 'text-[#d97706]' : 'text-[#64748b]'

  return (
    <div className={cn('px-4 py-2 rounded-xl border flex items-center justify-between text-[12.5px]', c.bg, c.border, c.text)}>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          {c.icon}
          <span className="font-semibold">
            Phase: {elapsed.hours}h {elapsed.minutes}m
          </span>
        </div>
        <span className="text-[#e2e8f0]">|</span>
        {status === 'critical' ? (
          <span className="font-semibold">{targetHours}h target exceeded</span>
        ) : (
          <span>{remaining.hours}h {remaining.minutes}m of {targetHours}h left</span>
        )}
      </div>
      <div className={cn('flex items-center gap-1.5', totalColor)}>
        <span className="text-[#cbd5e1]">|</span>
        <span className="font-medium">
          Total: {totalElapsed.hours}h {totalElapsed.minutes}m
        </span>
        <span className="opacity-60">·</span>
        {totalStatus === 'critical' ? (
          <span className="font-semibold">{totalTargetHours}h exceeded</span>
        ) : (
          <span>{totalRemaining.hours}h {totalRemaining.minutes}m of {totalTargetHours}h left</span>
        )}
      </div>
    </div>
  )
}

export function ReviewerPageClient({
  certificate,
  assignee,
  feedbacks,
  chatThreadId: _chatThreadId,
  headerData,
  userRole,
  customerFeedback,
  lastSentCustomerInfo,
  tatStartedAt,
  certificateCreatedAt,
  fieldChangeRequests,
  sectionUnlockRequests,
}: ReviewerPageClientProps) {
  const router = useRouter()

  // Determine back link based on user role
  const backLink = userRole === 'ADMIN' ? '/admin/certificates' : '/dashboard/reviewer'
  const [_isApproving, setIsApproving] = useState(false)
  const [isRequestingRevision, setIsRequestingRevision] = useState(false)
  const [isRejecting, setIsRejecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Offline detection — disable review actions
  const isElectronOffline = typeof window !== 'undefined' && !!(window as unknown as { electronAPI?: { isOffline?: () => boolean } }).electronAPI?.isOffline?.()

  // Modal states
  const [showApproveModal, setShowApproveModal] = useState(false)
  const [showRevisionModal, setShowRevisionModal] = useState(false)
  const [showRejectModal, setShowRejectModal] = useState(false)

  // Form states - New section feedback entries structure
  const [sectionFeedbackEntries, setSectionFeedbackEntries] = useState<
    { id: string; section: string; comment: string; fromCustomer?: boolean }[]
  >([{ id: crypto.randomUUID(), section: '', comment: '' }])
  const [forwardedCustomerItems, setForwardedCustomerItems] = useState<Set<number>>(new Set())
  const [generalNotes, setGeneralNotes] = useState('')
  const [rejectReason, setRejectReason] = useState('')
  const [rejectStep, setRejectStep] = useState<'reason' | 'confirm'>('reason')
  const [rejectConfirmText, setRejectConfirmText] = useState('')

  // Chat tab state
  const [activeChatTab, setActiveChatTab] = useState<'engineer' | 'customer'>('engineer')

  // Collapsible panel states
  const [isChatExpanded, setIsChatExpanded] = useState(true)
  const [isActionsExpanded, setIsActionsExpanded] = useState(true)
  const [isRequestActionsExpanded, setIsRequestActionsExpanded] = useState(true)

  // Field change request modal states
  const [showFieldChangeModal, setShowFieldChangeModal] = useState(false)
  const [selectedFields, setSelectedFields] = useState<string[]>([])
  const [fieldChangeDescription, setFieldChangeDescription] = useState('')
  const [isSubmittingFieldChange, setIsSubmittingFieldChange] = useState(false)
  const [fieldChangeForwardedItems, setFieldChangeForwardedItems] = useState<Set<number>>(new Set())

  // Resend to customer state
  const [isResending, setIsResending] = useState(false)

  // View mode state: 'details' shows certificate content, 'pdf' shows PDF preview
  const [viewMode, setViewMode] = useState<'details' | 'pdf'>('details')
  const [isDownloading, setIsDownloading] = useState(false)

  const decisionMade = ['APPROVED', 'PENDING_CUSTOMER_APPROVAL', 'PENDING_ADMIN_AUTHORIZATION', 'AUTHORIZED', 'REJECTED', 'CUSTOMER_REVIEW_EXPIRED'].includes(certificate.status)
  const canReview = !decisionMade && certificate.status !== 'REVISION_REQUIRED'
  const isRevisionRequired = certificate.status === 'REVISION_REQUIRED'
  const isCustomerRevisionRequired = certificate.status === 'CUSTOMER_REVISION_REQUIRED'
  const isCustomerReviewExpired = certificate.status === 'CUSTOMER_REVIEW_EXPIRED'
  const isPendingCustomer = certificate.status === 'PENDING_CUSTOMER_APPROVAL'
  const isPendingAdminAuth = certificate.status === 'PENDING_ADMIN_AUTHORIZATION'
  const isApproved = certificate.status === 'APPROVED'
  const isAuthorized = certificate.status === 'AUTHORIZED'
  const isRejected = certificate.status === 'REJECTED'

  // Customer chat only available when sent to customer or customer has responded
  const canAccessCustomerChat = isPendingCustomer || isPendingAdminAuth || isApproved || isAuthorized || isCustomerRevisionRequired || isCustomerReviewExpired

  // Approval data type for the modal
  interface ApprovalData {
    comment?: string
    sendToCustomer?: {
      email: string
      name: string
      message?: string
    }
    signatureInfo: {
      signatureImage: string
      signerName: string
      clientEvidence: ClientEvidence
    }
  }

  const handleApprove = useCallback(async (data: ApprovalData) => {
    setIsApproving(true)
    setError(null)

    try {
      const response = await apiFetch(`/api/certificates/${certificate.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'approve',
          comment: data.comment,
          sendToCustomer: data.sendToCustomer,
          signatureData: data.signatureInfo.signatureImage,
          signerName: data.signatureInfo.signerName,
          clientEvidence: data.signatureInfo.clientEvidence,
        }),
      })

      if (!response.ok) {
        const responseData = await response.json()
        throw new Error(responseData.error || 'Failed to approve certificate')
      }

      setShowApproveModal(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
      throw err
    } finally {
      setIsApproving(false)
    }
  }, [certificate.id, router])

  const handleRequestRevision = async () => {
    // Validate at least one feedback entry has a section and comment
    const validSectionFeedbacks = sectionFeedbackEntries.filter(
      e => e.section && e.comment.trim()
    )

    // Section feedback is required - general notes alone are not sufficient
    if (validSectionFeedbacks.length === 0) {
      setError('Please select at least one section and provide feedback for it')
      return
    }

    setIsRequestingRevision(true)
    setError(null)

    try {
      const response = await apiFetch(`/api/certificates/${certificate.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'request_revision',
          sectionFeedbacks: validSectionFeedbacks.map(e => ({
            section: e.section,
            comment: e.comment.trim(),
          })),
          generalNotes: generalNotes.trim() || undefined,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to request revision')
      }

      setShowRevisionModal(false)
      setSectionFeedbackEntries([{ id: crypto.randomUUID(), section: '', comment: '' }])
      setForwardedCustomerItems(new Set())
      setGeneralNotes('')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsRequestingRevision(false)
    }
  }

  // Section feedback entry handlers
  const addSectionEntry = () => {
    setSectionFeedbackEntries(prev => [
      ...prev,
      { id: crypto.randomUUID(), section: '', comment: '' }
    ])
  }

  const removeSectionEntry = (id: string) => {
    setSectionFeedbackEntries(prev => {
      const entry = prev.find(e => e.id === id)
      // If removing a customer-forwarded entry, uncheck it
      if (entry?.fromCustomer && customerFeedback?.sectionFeedbacks) {
        const custIdx = customerFeedback.sectionFeedbacks.findIndex(f => f.section === entry.section)
        if (custIdx !== -1) {
          setForwardedCustomerItems(s => {
            const next = new Set(s)
            next.delete(custIdx)
            return next
          })
        }
      }
      if (prev.length <= 1) {
        return [{ id: crypto.randomUUID(), section: '', comment: '' }]
      }
      return prev.filter(e => e.id !== id)
    })
  }

  const updateSectionEntry = (id: string, field: 'section' | 'comment', value: string) => {
    setSectionFeedbackEntries(prev =>
      prev.map(e => e.id === id ? { ...e, [field]: value } : e)
    )
  }

  // Get available sections (not already selected in other entries)
  const getAvailableSections = (currentEntryId: string) => {
    const selectedSections = sectionFeedbackEntries
      .filter(e => e.id !== currentEntryId && e.section)
      .map(e => e.section)
    return REVISION_SECTIONS.filter(s => !selectedSections.includes(s.id))
  }

  // Customer feedback forwarding handlers
  const toggleCustomerFeedbackForward = (index: number) => {
    const item = customerFeedback?.sectionFeedbacks?.[index]
    if (!item) return

    setForwardedCustomerItems(prev => {
      const next = new Set(prev)
      if (next.has(index)) {
        // Unchecking — remove the auto-created entry
        next.delete(index)
        setSectionFeedbackEntries(entries => {
          const filtered = entries.filter(e => !(e.fromCustomer && e.section === item.section))
          return filtered.length === 0 ? [{ id: crypto.randomUUID(), section: '', comment: '' }] : filtered
        })
      } else {
        // Checking — add entry if section not already present
        next.add(index)
        setSectionFeedbackEntries(entries => {
          const alreadyHasSection = entries.some(e => e.section === item.section)
          if (alreadyHasSection) return entries
          // If there's only one empty entry, replace it
          if (entries.length === 1 && !entries[0].section && !entries[0].comment.trim()) {
            return [{ id: crypto.randomUUID(), section: item.section, comment: `${customerFeedback.customerName}: ${item.comment}`, fromCustomer: true }]
          }
          return [...entries, { id: crypto.randomUUID(), section: item.section, comment: `${customerFeedback.customerName}: ${item.comment}`, fromCustomer: true }]
        })
      }
      return next
    })
  }

  const forwardAllCustomerFeedback = () => {
    if (!customerFeedback?.sectionFeedbacks) return
    const allIndices = new Set(customerFeedback.sectionFeedbacks.map((_, i) => i))
    setForwardedCustomerItems(allIndices)

    setSectionFeedbackEntries(prev => {
      const existingSections = new Set(prev.filter(e => e.section && !e.fromCustomer).map(e => e.section))
      const customerEntries = customerFeedback.sectionFeedbacks!
        .filter(item => !existingSections.has(item.section))
        .map(item => ({
          id: crypto.randomUUID(),
          section: item.section,
          comment: `${customerFeedback.customerName}: ${item.comment}`,
          fromCustomer: true as const,
        }))
      // Remove old customer-forwarded entries, keep manual ones
      const manualEntries = prev.filter(e => !e.fromCustomer && (e.section || e.comment.trim()))
      const combined = [...customerEntries, ...manualEntries]
      return combined.length > 0 ? combined : [{ id: crypto.randomUUID(), section: '', comment: '' }]
    })

    if (customerFeedback.generalNotes && !generalNotes.trim()) {
      setGeneralNotes(`${customerFeedback.customerName}: ${customerFeedback.generalNotes}`)
    }
  }

  const clearAllCustomerFeedback = () => {
    if (!customerFeedback?.sectionFeedbacks) return
    setForwardedCustomerItems(new Set())
    setSectionFeedbackEntries(prev => {
      const remaining = prev.filter(e => !e.fromCustomer)
      return remaining.length > 0 ? remaining : [{ id: crypto.randomUUID(), section: '', comment: '' }]
    })
  }

  // ─── Field Change Request handlers ───

  const toggleFieldTag = (fieldId: string) => {
    setSelectedFields(prev =>
      prev.includes(fieldId) ? prev.filter(f => f !== fieldId) : [...prev, fieldId]
    )
  }

  const toggleFieldChangeCustomerForward = (index: number) => {
    const item = customerFeedback?.sectionFeedbacks?.[index]
    if (!item) return

    const isCurrentlyForwarded = fieldChangeForwardedItems.has(index)

    if (isCurrentlyForwarded) {
      setFieldChangeForwardedItems(prev => {
        const next = new Set(prev)
        next.delete(index)
        return next
      })
    } else {
      setFieldChangeForwardedItems(prev => {
        const next = new Set(prev)
        next.add(index)
        return next
      })
      const prefix = `${customerFeedback.customerName}: ${item.comment}`
      setFieldChangeDescription(d => d ? `${d}\n${prefix}` : prefix)
    }
  }

  const forwardAllFieldChangeCustomer = () => {
    if (!customerFeedback?.sectionFeedbacks) return
    const allIndices = new Set(customerFeedback.sectionFeedbacks.map((_, i) => i))
    setFieldChangeForwardedItems(allIndices)
    const lines = customerFeedback.sectionFeedbacks.map(
      item => `${customerFeedback.customerName}: ${item.comment}`
    )
    if (customerFeedback.generalNotes) {
      lines.push(`${customerFeedback.customerName} (General): ${customerFeedback.generalNotes}`)
    }
    setFieldChangeDescription(prev => prev ? `${prev}\n${lines.join('\n')}` : lines.join('\n'))
  }

  const handleSubmitFieldChange = async () => {
    if (selectedFields.length === 0) {
      setError('Please select at least one field')
      return
    }
    if (!fieldChangeDescription.trim()) {
      setError('Please provide a description')
      return
    }

    setIsSubmittingFieldChange(true)
    setError(null)

    try {
      const response = await apiFetch('/api/internal-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'FIELD_CHANGE',
          certificateId: certificate.id,
          fields: selectedFields,
          description: fieldChangeDescription.trim(),
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to submit request')
      }

      setShowFieldChangeModal(false)
      setSelectedFields([])
      setFieldChangeDescription('')
      setFieldChangeForwardedItems(new Set())
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsSubmittingFieldChange(false)
    }
  }

  const hasPendingFieldChange = fieldChangeRequests.some(r => r.status === 'PENDING')

  const handleReject = async () => {
    if (!rejectReason.trim()) {
      setError('Please provide a reason for rejection')
      return
    }

    setIsRejecting(true)
    setError(null)

    try {
      const response = await apiFetch(`/api/certificates/${certificate.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reject',
          comment: rejectReason.trim(),
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to reject certificate')
      }

      setShowRejectModal(false)
      setRejectReason('')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsRejecting(false)
    }
  }

  // Resend certificate to customer
  const handleResendToCustomer = async () => {
    const customerEmail = certificate.customerContactEmail || customerFeedback?.customerEmail || lastSentCustomerInfo?.email
    const customerName = certificate.customerName || customerFeedback?.customerName || lastSentCustomerInfo?.name

    if (!customerEmail || !customerName) {
      setError('Customer email and name are required to resend')
      return
    }

    setIsResending(true)
    setError(null)

    try {
      const response = await apiFetch(`/api/certificates/${certificate.id}/send-to-customer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerEmail,
          customerName,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to resend to customer')
      }

      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsResending(false)
    }
  }

  // Handle download PDF (only for authorized certificates)
  const handleDownload = useCallback(async () => {
    setIsDownloading(true)
    try {
      const response = await apiFetch(`/api/certificates/${certificate.id}/download-signed`)
      if (!response.ok) {
        throw new Error('Failed to download PDF')
      }
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      const fileName = `${certificate.certificateNumber.replace(/\//g, '-')}.pdf`
      link.download = fileName
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Error downloading PDF:', err)
      alert('Failed to download PDF')
    } finally {
      setIsDownloading(false)
    }
  }, [certificate.id, certificate.certificateNumber])

  return (
    <div className="flex h-screen bg-[#f1f5f9] overflow-hidden">
      {/* Left Side - Header + Content (Scrollable) */}
      <div className="flex-1 flex flex-col min-w-0 p-2.5 pr-0 overflow-hidden">
        {/* TAT Banner */}
        {tatStartedAt && !decisionMade && (
          <div className="flex-shrink-0 mb-1.5">
            <TATBanner sentAt={tatStartedAt} certificateCreatedAt={certificateCreatedAt} />
          </div>
        )}

        {/* Certificate Card - Bounding Box */}
        <div className="flex-1 flex flex-col bg-white rounded-[14px] border border-[#e2e8f0] overflow-hidden">
          {/* Header Section */}
          <div className="flex-shrink-0 border-b border-[#e2e8f0] px-5 py-3.5">
          {/* Header Content */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <Link
                href={backLink}
                className="text-[#94a3b8] hover:text-[#475569] transition-colors flex-shrink-0"
              >
                <ChevronLeft className="size-[18px]" strokeWidth={2} />
              </Link>
              <span className="text-[#e2e8f0] text-lg flex-shrink-0">|</span>
              <h1 className="text-[15px] font-mono font-medium text-[#0f172a] tracking-[0.01em] truncate">
                {headerData.certificateNumber}
              </h1>
              <Badge
                variant="outline"
                className={cn(
                  'px-2.5 py-0.5 text-[10px] font-mono font-medium uppercase tracking-[0.05em] flex-shrink-0',
                  headerData.statusClassName
                )}
              >
                {headerData.statusLabel}
              </Badge>
            </div>

            <div className="flex items-center gap-2.5 flex-shrink-0">
              <ViewToggleButton
                viewMode={viewMode}
                onViewModeChange={setViewMode}
                isAuthorized={isAuthorized}
                onDownload={isAuthorized ? handleDownload : undefined}
                isDownloading={isDownloading}
              />
            </div>
          </div>

          {/* Meta Info Row */}
          <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[12.5px] text-[#64748b] mt-2">
            <MetaInfoItem icon={User} emphasized>{headerData.assigneeName}</MetaInfoItem>
            <MetaInfoItem icon={Building2}>{headerData.customerName}</MetaInfoItem>
            <MetaInfoItem icon={MapPin}>
              {headerData.calibratedAt === 'LAB' ? 'Laboratory' : 'Site'}
            </MetaInfoItem>
            <span className="text-[#e2e8f0]">|</span>
            <span>Revision {headerData.currentRevision}</span>
          </div>
          </div>

          {/* Content Area - Scrollable */}
          <div className="flex-1 overflow-auto p-5 bg-[#f8fafc]">
            {viewMode === 'details' ? (
              <ReviewerContent
                certificate={certificate}
                assignee={assignee}
                feedbacks={feedbacks}
                customerFeedback={customerFeedback}
                internalRequests={[
                  ...sectionUnlockRequests,
                  ...fieldChangeRequests.map((r) => ({
                    id: r.id,
                    type: 'FIELD_CHANGE' as const,
                    status: r.status,
                    fields: r.fields,
                    description: r.description,
                    adminNote: r.adminNote,
                    reviewedByName: r.reviewedBy,
                    createdAt: r.createdAt,
                  })),
                ]}
              />
            ) : (
              <InlinePDFViewer
                certificateId={certificate.id}
                certificateNumber={certificate.certificateNumber}
              />
            )}
          </div>
        </div>
      </div>

      {/* Right Panel - Chat & Actions */}
      <div className="w-[380px] flex-shrink-0 flex flex-col gap-2.5 p-2.5 pl-0 h-full overflow-hidden">

        {/* ===== CHAT SECTION ===== */}
        <div className="flex-1 min-h-0 flex flex-col bg-white rounded-[14px] border border-[#f1f5f9] overflow-hidden">
          {/* Chat Header - Collapsible */}
          <button
            onClick={() => setIsChatExpanded(!isChatExpanded)}
            className="flex items-center justify-between px-[18px] py-[13px] hover:bg-[#f8fafc] transition-colors flex-shrink-0"
          >
            <div className="flex items-center gap-2">
              <MessageSquare className="size-[14px] text-[#94a3b8]" />
              <span className="text-[12px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Chat</span>
            </div>
            <div className="flex items-center gap-2">
              {!isChatExpanded && (
                <div className="flex items-center gap-2 text-[11px] text-[#94a3b8]">
                  <span>Eng</span>
                  {canAccessCustomerChat && (
                    <>
                      <span className="text-[#e2e8f0]">·</span>
                      <span>Cust</span>
                    </>
                  )}
                </div>
              )}
              {isChatExpanded ? (
                <ChevronUp className="size-3.5 text-[#94a3b8]" />
              ) : (
                <ChevronDown className="size-3.5 text-[#94a3b8]" />
              )}
            </div>
          </button>

          {/* Chat Content - Only when expanded */}
          {isChatExpanded && (
            <div className="flex-1 flex flex-col min-h-0">
              {/* Person Header */}
              <div className="flex-shrink-0 px-[18px] py-[14px] border-b border-[#f8fafc]">
                <div className="flex items-center gap-2.5">
                  <div className="w-[38px] h-[38px] rounded-full bg-[#0f1e2e] text-white flex items-center justify-center font-bold text-[13px] flex-shrink-0">
                    {activeChatTab === 'engineer'
                      ? assignee.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
                      : (certificate.customerName || 'C').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-bold text-[#0f172a] truncate">
                      {activeChatTab === 'engineer' ? assignee.name : (certificate.customerName || 'Customer')}
                    </p>
                    <p className="text-[12px] text-[#94a3b8] flex items-center gap-[5px] mt-px">
                      {activeChatTab === 'engineer' ? (
                        <>
                          <span>Engineer</span>
                          <span className="w-[7px] h-[7px] rounded-full bg-[#22c55e] inline-block flex-shrink-0" />
                          <span className="text-[#22c55e]">Online</span>
                        </>
                      ) : (
                        <>
                          <span>{certificate.customerName ? 'Customer' : 'No customer'}</span>
                          {isPendingCustomer && <span className="text-[#d97706]">· Pending response</span>}
                        </>
                      )}
                    </p>
                  </div>
                </div>
              </div>

              {/* Pill-Style Tab Switcher */}
              <div className="flex-shrink-0 px-[18px] py-2.5 border-b border-[#f1f5f9] bg-white">
                <div className="flex bg-[#f1f5f9] rounded-full p-0.5">
                  <button
                    onClick={() => setActiveChatTab('engineer')}
                    className={cn(
                      'flex-1 px-3.5 py-1.5 text-[12px] font-semibold rounded-full transition-all',
                      activeChatTab === 'engineer'
                        ? 'bg-white text-[#0f172a] shadow-sm'
                        : 'text-[#94a3b8] hover:text-[#64748b]'
                    )}
                  >
                    Engineer
                  </button>
                  <button
                    onClick={() => canAccessCustomerChat && setActiveChatTab('customer')}
                    disabled={!canAccessCustomerChat}
                    className={cn(
                      'flex-1 px-3.5 py-1.5 text-[12px] font-semibold rounded-full transition-all',
                      activeChatTab === 'customer'
                        ? 'bg-white text-[#0f172a] shadow-sm'
                        : 'text-[#94a3b8] hover:text-[#64748b]',
                      !canAccessCustomerChat && 'opacity-40 cursor-not-allowed'
                    )}
                    title={!canAccessCustomerChat ? 'Available after sending to customer' : ''}
                  >
                    Customer {!canAccessCustomerChat && '🔒'}
                  </button>
                </div>
              </div>

              {/* Chat Messages Area */}
              <div className="flex-1 min-h-0 overflow-hidden text-xs">
                {activeChatTab === 'engineer' ? (
                  <ChatSidebar
                    isOpen={true}
                    onClose={() => {}}
                    certificateId={certificate.id}
                    threadType="ASSIGNEE_REVIEWER"
                    embedded={true}
                  />
                ) : canAccessCustomerChat ? (
                  <ChatSidebar
                    isOpen={true}
                    onClose={() => {}}
                    certificateId={certificate.id}
                    threadType="REVIEWER_CUSTOMER"
                    embedded={true}
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-[#94a3b8] text-xs p-4 text-center">
                    Customer chat will be available after the certificate is sent for customer approval
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ===== REVIEW ACTIONS SECTION ===== */}
        <div className="flex flex-col bg-white rounded-[14px] border border-[#f1f5f9] overflow-hidden flex-shrink-0">
          <button
            onClick={() => setIsActionsExpanded(!isActionsExpanded)}
            className="flex items-center justify-between px-[18px] py-[13px] hover:bg-[#f8fafc] transition-colors"
          >
            <div className="flex items-center gap-2">
              <Settings2 className="size-[14px] text-[#94a3b8]" />
              <span className="text-[12px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Review Actions</span>
            </div>
            {isActionsExpanded ? (
              <ChevronUp className="size-3.5 text-[#94a3b8]" />
            ) : (
              <ChevronDown className="size-3.5 text-[#94a3b8]" />
            )}
          </button>

          {/* Actions Content - Only when expanded */}
          {isActionsExpanded && (
            <div className="px-[18px] pb-[18px] pt-3 space-y-2.5 border-t border-[#f1f5f9]">
              {error && (
                <div className="p-2.5 bg-[#fef2f2] border border-[#fecaca] rounded-lg text-[12px] text-[#dc2626]">
                  {error}
                </div>
              )}

              {canReview && isElectronOffline && (
                <div className="p-2.5 bg-[#fffbeb] border border-[#fde68a] rounded-lg text-[12px] text-[#92400e]">
                  Review actions require an online connection.
                </div>
              )}

              {canReview && !isElectronOffline && (
                <div className="space-y-2">
                  <Button
                    onClick={() => setShowApproveModal(true)}
                    size="sm"
                    className="w-full bg-[#16a34a] hover:bg-[#15803d] text-white h-9 rounded-[9px] text-[12.5px] font-semibold"
                  >
                    <CheckCircle className="size-3.5 mr-1.5" />
                    Approve & Send
                  </Button>
                  <Button
                    onClick={() => setShowRevisionModal(true)}
                    size="sm"
                    className="w-full bg-[#d97706] hover:bg-[#b45309] text-white h-9 rounded-[9px] text-[12.5px] font-semibold"
                  >
                    <RotateCcw className="size-3.5 mr-1.5" />
                    Request Revision
                  </Button>
                  <Button
                    onClick={() => setShowRejectModal(true)}
                    size="sm"
                    className="w-full bg-[#dc2626] hover:bg-[#b91c1c] text-white h-9 rounded-[9px] text-[12.5px] font-semibold"
                  >
                    <XCircle className="size-3.5 mr-1.5" />
                    Reject
                  </Button>
                </div>
              )}

              {/* Status Indicators */}
              {isRevisionRequired && (
                <div className="flex items-center gap-2.5 py-2.5 px-3.5 bg-[#fffbeb] rounded-xl border border-[#fde68a]">
                  <div className="size-7 rounded-lg bg-[#fef3c7] flex items-center justify-center flex-shrink-0">
                    <Clock className="size-3.5 text-[#d97706]" />
                  </div>
                  <div>
                    <p className="text-[12.5px] font-semibold text-[#92400e]">Waiting for Engineer</p>
                    <p className="text-[11px] text-[#d97706]">{assignee.name} is working on revisions</p>
                  </div>
                </div>
              )}

              {isPendingCustomer && (
                <div className="flex items-center gap-2.5 py-2.5 px-3.5 bg-[#eff6ff] rounded-xl border border-[#bfdbfe]">
                  <div className="size-7 rounded-lg bg-[#dbeafe] flex items-center justify-center flex-shrink-0">
                    <Send className="size-3.5 text-[#2563eb]" />
                  </div>
                  <div>
                    <p className="text-[12.5px] font-semibold text-[#1e40af]">Sent to Customer</p>
                    <p className="text-[11px] text-[#2563eb]">Awaiting customer approval</p>
                  </div>
                </div>
              )}

              {isCustomerReviewExpired && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2.5 py-2.5 px-3.5 bg-[#fef2f2] rounded-xl border border-[#fecaca]">
                    <div className="size-7 rounded-lg bg-[#fee2e2] flex items-center justify-center flex-shrink-0">
                      <AlertTriangle className="size-3.5 text-[#dc2626]" />
                    </div>
                    <div className="flex-1">
                      <p className="text-[12.5px] font-semibold text-[#991b1b]">Customer Review Expired</p>
                      <p className="text-[11px] text-[#dc2626]">Customer did not respond within 48 hours</p>
                    </div>
                  </div>
                  <Button
                    onClick={handleResendToCustomer}
                    disabled={isResending}
                    size="sm"
                    className="w-full bg-[#2563eb] hover:bg-[#1d4ed8] text-white h-9 rounded-[9px] text-[12.5px] font-semibold"
                  >
                    {isResending ? (
                      <Loader2 className="size-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <Send className="size-3.5 mr-1.5" />
                    )}
                    Resend to Customer
                  </Button>
                </div>
              )}

              {isCustomerRevisionRequired && customerFeedback && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2.5 py-2.5 px-3.5 bg-[#faf5ff] rounded-xl border border-[#e9d5ff]">
                    <div className="size-7 rounded-lg bg-[#f3e8ff] flex items-center justify-center flex-shrink-0">
                      <RotateCcw className="size-3.5 text-[#7c3aed]" />
                    </div>
                    <div className="flex-1">
                      <p className="text-[12.5px] font-semibold text-[#6b21a8]">Customer Requests Revision</p>
                      <p className="text-[11px] text-[#7c3aed]">
                        {customerFeedback.customerName} · {customerFeedback.sectionFeedbacks?.length || 0} section{(customerFeedback.sectionFeedbacks?.length || 0) !== 1 ? 's' : ''} flagged
                      </p>
                    </div>
                  </div>
                  <Button
                    onClick={handleResendToCustomer}
                    disabled={isResending}
                    size="sm"
                    className="w-full bg-[#2563eb] hover:bg-[#1d4ed8] text-white h-9 rounded-[9px] text-[12.5px] font-semibold"
                  >
                    {isResending ? (
                      <Loader2 className="size-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <Send className="size-3.5 mr-1.5" />
                    )}
                    Resend to Customer
                  </Button>
                </div>
              )}

              {isPendingAdminAuth && (
                <div className="flex items-center gap-2.5 py-2.5 px-3.5 bg-[#eef2ff] rounded-xl border border-[#c7d2fe]">
                  <div className="size-7 rounded-lg bg-[#e0e7ff] flex items-center justify-center flex-shrink-0">
                    <Clock className="size-3.5 text-[#4f46e5]" />
                  </div>
                  <div>
                    <p className="text-[12.5px] font-semibold text-[#3730a3]">Pending Admin Authorization</p>
                    <p className="text-[11px] text-[#4f46e5]">Awaiting final admin approval</p>
                  </div>
                </div>
              )}

              {isApproved && (
                <div className="flex items-center gap-2.5 py-2.5 px-3.5 bg-[#f0fdf4] rounded-xl border border-[#bbf7d0]">
                  <div className="size-7 rounded-lg bg-[#dcfce7] flex items-center justify-center flex-shrink-0">
                    <CheckCircle className="size-3.5 text-[#16a34a]" />
                  </div>
                  <div>
                    <p className="text-[12.5px] font-semibold text-[#166534]">Certificate Approved</p>
                    <p className="text-[11px] text-[#16a34a]">Finalized and complete</p>
                  </div>
                </div>
              )}

              {isAuthorized && (
                <div className="flex items-center gap-2.5 py-2.5 px-3.5 bg-[#f0fdf4] rounded-xl border border-[#bbf7d0]">
                  <div className="size-7 rounded-lg bg-[#dcfce7] flex items-center justify-center flex-shrink-0">
                    <CheckCircle className="size-3.5 text-[#16a34a]" />
                  </div>
                  <div>
                    <p className="text-[12.5px] font-semibold text-[#166534]">Certificate Authorized</p>
                    <p className="text-[11px] text-[#16a34a]">Fully authorized and complete</p>
                  </div>
                </div>
              )}

              {isRejected && (
                <div className="flex items-center gap-2.5 py-2.5 px-3.5 bg-[#fef2f2] rounded-xl border border-[#fecaca]">
                  <div className="size-7 rounded-lg bg-[#fee2e2] flex items-center justify-center flex-shrink-0">
                    <XCircle className="size-3.5 text-[#dc2626]" />
                  </div>
                  <div>
                    <p className="text-[12.5px] font-semibold text-[#991b1b]">Certificate Rejected</p>
                    <p className="text-[11px] text-[#dc2626]">Permanently rejected</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ===== REQUEST ACTIONS SECTION ===== */}
        <div className="flex flex-col bg-white rounded-[14px] border border-[#f1f5f9] overflow-hidden flex-shrink-0">
          <button
            onClick={() => setIsRequestActionsExpanded(!isRequestActionsExpanded)}
            className="flex items-center justify-between px-[18px] py-[13px] hover:bg-[#f8fafc] transition-colors"
          >
            <div className="flex items-center gap-2">
              <PenLine className="size-[14px] text-[#94a3b8]" />
              <span className="text-[12px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Request Actions</span>
            </div>
            <div className="flex items-center gap-2">
              {fieldChangeRequests.some(r => r.status === 'PENDING') && (
                <span className="px-1.5 py-0.5 bg-[#fef9c3] text-[#a16207] rounded text-[10px] font-semibold">
                  {fieldChangeRequests.filter(r => r.status === 'PENDING').length} pending
                </span>
              )}
              {isRequestActionsExpanded ? (
                <ChevronUp className="size-3.5 text-[#94a3b8]" />
              ) : (
                <ChevronDown className="size-3.5 text-[#94a3b8]" />
              )}
            </div>
          </button>

          {isRequestActionsExpanded && (
            <div className="px-[18px] pb-[18px] pt-3 space-y-2.5 border-t border-[#f1f5f9]">
              {/* New Request Button */}
              {!hasPendingFieldChange && (
                <Button
                  onClick={() => {
                    setError(null)
                    setShowFieldChangeModal(true)
                  }}
                  size="sm"
                  className="w-full bg-[#0f172a] hover:bg-[#1e293b] text-white h-9 rounded-[9px] text-[12.5px] font-semibold"
                >
                  <Plus className="size-3.5 mr-1.5" />
                  New Request
                </Button>
              )}

              {/* Existing Requests */}
              {fieldChangeRequests.length === 0 && (
                <p className="text-[12px] text-[#94a3b8] text-center py-2">No field change requests yet</p>
              )}

              {fieldChangeRequests.map((req) => {
                const fieldLabels = req.fields.map(
                  f => FIELD_OPTIONS.find(o => o.id === f)?.label || f
                )
                return (
                  <div
                    key={req.id}
                    className={cn(
                      'rounded-xl border p-3 space-y-1.5',
                      req.status === 'PENDING' && 'border-[#fde68a] bg-[#fefce8]',
                      req.status === 'APPROVED' && 'border-[#bbf7d0] bg-[#f0fdf4]',
                      req.status === 'REJECTED' && 'border-[#fecaca] bg-[#fef2f2]'
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex flex-wrap gap-1">
                        {fieldLabels.map((label) => (
                          <span
                            key={label}
                            className={cn(
                              'px-1.5 py-0.5 rounded text-[10px] font-medium',
                              req.status === 'PENDING' && 'bg-[#fef3c7] text-[#a16207]',
                              req.status === 'APPROVED' && 'bg-[#dcfce7] text-[#166534]',
                              req.status === 'REJECTED' && 'bg-[#fee2e2] text-[#991b1b]'
                            )}
                          >
                            {label}
                          </span>
                        ))}
                      </div>
                      <span className={cn(
                        'text-[10px] font-semibold',
                        req.status === 'PENDING' && 'text-[#d97706]',
                        req.status === 'APPROVED' && 'text-[#16a34a]',
                        req.status === 'REJECTED' && 'text-[#dc2626]'
                      )}>
                        {req.status === 'PENDING' ? 'Pending' : req.status === 'APPROVED' ? 'Applied' : 'Rejected'}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#64748b] line-clamp-2">{req.description}</p>
                    {req.adminNote && (
                      <p className="text-[11px] text-[#94a3b8] italic">&ldquo;{req.adminNote}&rdquo;</p>
                    )}
                    <p className="text-[10px] text-[#94a3b8]">
                      {new Date(req.createdAt).toLocaleDateString()}
                      {req.reviewedBy && ` · ${req.reviewedBy}`}
                    </p>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Approve Modal */}
      <ReviewerApproveModal
        isOpen={showApproveModal}
        onClose={() => {
          setShowApproveModal(false)
          setError(null)
        }}
        certificateId={certificate.id}
        certificateNumber={certificate.certificateNumber}
        uucDescription={certificate.uucDescription}
        customerName={certificate.customerContactName || certificate.customerName}
        customerEmail={certificate.customerContactEmail || customerFeedback?.customerEmail || lastSentCustomerInfo?.email || null}
        onApprove={handleApprove}
      />

      {/* Revision Modal */}
      {showRevisionModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-[14px] border border-[#e2e8f0] shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="px-5 py-3.5 border-b border-[#f1f5f9] flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 bg-[#fef3c7] rounded-[9px]">
                  <RotateCcw className="size-4 text-[#d97706]" />
                </div>
                <div>
                  <h2 className="text-[14px] font-semibold text-[#0f172a]">Request Revision</h2>
                  <p className="text-[11px] font-mono text-[#94a3b8]">{certificate.certificateNumber}</p>
                </div>
              </div>
              <button
                onClick={() => setShowRevisionModal(false)}
                className="p-1.5 hover:bg-[#f8fafc] rounded-lg transition-colors"
              >
                <X className="size-4 text-[#94a3b8]" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Summary Strip */}
              <div className="flex items-center gap-2 px-3.5 py-2.5 bg-[#f8fafc] border border-[#f1f5f9] rounded-lg text-[12px] text-[#64748b]">
                <span className="font-semibold text-[#0f172a]">{certificate.uucDescription || '—'}</span>
                <span className="text-[#e2e8f0]">·</span>
                <span>{certificate.customerName || '—'}</span>
                <span className="text-[#e2e8f0]">·</span>
                <span>{assignee.name}</span>
              </div>

              {/* Customer Feedback — Forward to Engineer */}
              {isCustomerRevisionRequired && customerFeedback?.sectionFeedbacks && customerFeedback.sectionFeedbacks.length > 0 && (
                <div className="border border-[#e9d5ff] rounded-xl bg-[#faf5ff] overflow-hidden">
                  <div className="px-3.5 py-2.5 flex items-center justify-between border-b border-[#e9d5ff]">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-[0.07em] text-[#7c3aed]">
                        Customer Feedback
                      </span>
                      <span className="text-[10px] font-mono text-[#a78bfa]">
                        {customerFeedback.customerName} · {customerFeedback.sectionFeedbacks.length} section{customerFeedback.sectionFeedbacks.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (forwardedCustomerItems.size === customerFeedback.sectionFeedbacks!.length) {
                          clearAllCustomerFeedback()
                        } else {
                          forwardAllCustomerFeedback()
                        }
                      }}
                      className="text-[11px] font-semibold text-[#7c3aed] hover:text-[#6b21a8] px-2 py-0.5 hover:bg-[#f3e8ff] rounded-md transition-colors"
                    >
                      {forwardedCustomerItems.size === customerFeedback.sectionFeedbacks.length ? 'Clear All' : 'Forward All'}
                    </button>
                  </div>
                  <div className="p-3 space-y-2">
                    {customerFeedback.sectionFeedbacks.map((item, index) => {
                      const sectionLabel = REVISION_SECTIONS.find(s => s.id === item.section)?.label || item.section
                      const isForwarded = forwardedCustomerItems.has(index)
                      return (
                        <label
                          key={index}
                          className={cn(
                            'flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors',
                            isForwarded
                              ? 'border-[#c4b5fd] bg-[#ede9fe]'
                              : 'border-[#e9d5ff] bg-white hover:bg-[#faf5ff]'
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={isForwarded}
                            onChange={() => toggleCustomerFeedbackForward(index)}
                            className="mt-0.5 size-3.5 rounded border-[#d8b4fe] text-[#7c3aed] focus:ring-[#7c3aed]/20 accent-[#7c3aed]"
                          />
                          <div className="flex-1 min-w-0">
                            <span className="text-[11px] font-semibold text-[#6b21a8]">{sectionLabel}</span>
                            <p className="text-[12px] text-[#7c3aed] mt-0.5 leading-relaxed">{item.comment}</p>
                          </div>
                        </label>
                      )
                    })}
                    {customerFeedback.generalNotes && (
                      <div className="pt-2 border-t border-[#e9d5ff]">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-[#a78bfa]">General Notes</span>
                        <p className="text-[12px] text-[#7c3aed] mt-1 leading-relaxed">{customerFeedback.generalNotes}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Section Feedback */}
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <label className="text-[12.5px] font-semibold text-[#0f172a]">
                    Section Feedback <span className="text-[#dc2626]">*</span>
                  </label>
                  <span className="text-[10px] font-mono text-[#94a3b8]">
                    {sectionFeedbackEntries.filter(e => e.section && e.comment.trim()).length} of {sectionFeedbackEntries.length} complete
                  </span>
                </div>

                <div className="space-y-2">
                  {sectionFeedbackEntries.map((entry) => {
                    const availableSections = getAvailableSections(entry.id)
                    const currentSection = REVISION_SECTIONS.find(s => s.id === entry.section)
                    const isComplete = !!(entry.section && entry.comment.trim())

                    return (
                      <div
                        key={entry.id}
                        className={cn(
                          'border rounded-xl p-3 transition-colors',
                          isComplete
                            ? 'border-[#fde68a] bg-[#fffbeb]'
                            : 'border-[#e2e8f0] bg-white'
                        )}
                      >
                        <div className="flex items-start gap-3">
                          {/* Section dropdown — fixed width left column */}
                          <div className="w-[180px] flex-shrink-0">
                            <select
                              value={entry.section}
                              onChange={(e) => updateSectionEntry(entry.id, 'section', e.target.value)}
                              className="w-full px-2.5 py-2 text-[12.5px] border border-[#e2e8f0] rounded-lg bg-white text-[#0f172a] focus:ring-2 focus:ring-[#d97706]/20 focus:border-[#d97706]"
                            >
                              <option value="">Select section...</option>
                              {(currentSection ? [currentSection, ...availableSections.filter(s => s.id !== currentSection.id)] : availableSections).map((section) => (
                                <option key={section.id} value={section.id}>
                                  {section.label}
                                </option>
                              ))}
                            </select>
                            {entry.fromCustomer && (
                              <span className="text-[10px] text-[#7c3aed] font-medium mt-1 block">From customer</span>
                            )}
                            {isComplete && !entry.fromCustomer && (
                              <span className="text-[10px] text-[#16a34a] font-medium mt-1 block">Complete</span>
                            )}
                          </div>

                          {/* Feedback textarea — fills remaining space */}
                          <div className="flex-1 min-w-0">
                            <Textarea
                              placeholder="Describe what needs to be revised..."
                              value={entry.comment}
                              onChange={(e) => updateSectionEntry(entry.id, 'comment', e.target.value)}
                              rows={2}
                              className="resize-none text-[12.5px] md:text-[12.5px] border-[#e2e8f0] rounded-lg focus:ring-[#d97706]/20 focus:border-[#d97706] placeholder:text-[#94a3b8]"
                            />
                          </div>

                          {/* Delete button */}
                          <button
                            type="button"
                            onClick={() => removeSectionEntry(entry.id)}
                            className="p-1.5 text-[#94a3b8] hover:text-[#dc2626] hover:bg-[#fef2f2] rounded-lg transition-colors flex-shrink-0 mt-1"
                            title="Remove entry"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {sectionFeedbackEntries.length < REVISION_SECTIONS.length && (
                  <button
                    type="button"
                    onClick={addSectionEntry}
                    className="mt-2 flex items-center gap-1.5 text-[12px] text-[#d97706] hover:text-[#b45309] font-semibold px-2.5 py-1.5 hover:bg-[#fffbeb] rounded-lg transition-colors"
                  >
                    <Plus className="size-3.5" />
                    Add Another Section
                  </button>
                )}
              </div>

              {/* General Notes */}
              <div className="pt-3 border-t border-[#f1f5f9]">
                <label className="block text-[12.5px] font-semibold text-[#0f172a] mb-1.5">
                  General Notes
                  <span className="text-[#94a3b8] font-normal ml-1">(optional)</span>
                </label>
                <Textarea
                  placeholder="Any overall feedback or notes..."
                  value={generalNotes}
                  onChange={(e) => setGeneralNotes(e.target.value)}
                  rows={2}
                  className="resize-none text-[12.5px] md:text-[12.5px] border-[#e2e8f0] rounded-lg focus:ring-[#d97706]/20 focus:border-[#d97706] placeholder:text-[#94a3b8]"
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 p-2.5 bg-[#fef2f2] border border-[#fecaca] rounded-lg">
                  <XCircle className="size-3.5 text-[#dc2626] flex-shrink-0" />
                  <p className="text-[12px] text-[#dc2626]">{error}</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-[#f1f5f9] bg-[#f8fafc] flex items-center justify-end gap-2 flex-shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowRevisionModal(false)
                  setSectionFeedbackEntries([{ id: crypto.randomUUID(), section: '', comment: '' }])
                  setForwardedCustomerItems(new Set())
                  setGeneralNotes('')
                  setError(null)
                }}
                disabled={isRequestingRevision}
                className="rounded-[9px] border-[#e2e8f0] text-[12.5px] font-semibold text-[#475569]"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleRequestRevision}
                disabled={isRequestingRevision || sectionFeedbackEntries.every(e => !e.section || !e.comment.trim())}
                className="bg-[#d97706] hover:bg-[#b45309] text-white rounded-[9px] text-[12.5px] font-semibold"
              >
                {isRequestingRevision ? (
                  <Loader2 className="size-3.5 mr-1.5 animate-spin" />
                ) : (
                  <RotateCcw className="size-3.5 mr-1.5" />
                )}
                Request Revision
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal — Two-Step Confirmation */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-[14px] border border-[#e2e8f0] shadow-2xl max-w-lg w-full overflow-hidden flex flex-col">
            {/* Header */}
            <div className="px-5 py-3.5 border-b border-[#f1f5f9] flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 bg-[#fee2e2] rounded-[9px]">
                  <XCircle className="size-4 text-[#dc2626]" />
                </div>
                <div>
                  <h2 className="text-[14px] font-semibold text-[#0f172a]">Reject Certificate</h2>
                  <p className="text-[11px] font-mono text-[#94a3b8]">{certificate.certificateNumber}</p>
                </div>
              </div>
              <button
                onClick={() => setShowRejectModal(false)}
                className="p-1.5 hover:bg-[#f8fafc] rounded-lg transition-colors"
              >
                <X className="size-4 text-[#94a3b8]" />
              </button>
            </div>

            {/* Content */}
            <div className="p-5 space-y-4">
              {/* Summary Strip */}
              <div className="flex items-center gap-2 px-3.5 py-2.5 bg-[#f8fafc] border border-[#f1f5f9] rounded-lg text-[12px] text-[#64748b]">
                <span className="font-semibold text-[#0f172a]">{certificate.uucDescription || '—'}</span>
                <span className="text-[#e2e8f0]">·</span>
                <span>{certificate.customerName || '—'}</span>
                <span className="text-[#e2e8f0]">·</span>
                <span>{assignee.name}</span>
              </div>

              {/* Step 1: Reason */}
              {rejectStep === 'reason' && (
                <>
                  <div className="flex gap-2.5 p-3 bg-[#fef2f2] border border-[#fecaca] rounded-xl">
                    <div className="flex-shrink-0 mt-0.5">
                      <svg className="size-4 text-[#dc2626]" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div>
                      <h4 className="text-[12px] font-semibold text-[#991b1b]">This action is permanent</h4>
                      <p className="text-[12px] text-[#dc2626]">
                        The certificate will be permanently rejected and cannot be recovered.
                      </p>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[12.5px] font-semibold text-[#0f172a] mb-1.5">
                      Rejection Reason <span className="text-[#dc2626]">*</span>
                    </label>
                    <Textarea
                      placeholder="Explain why this certificate is being rejected..."
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      rows={3}
                      className="resize-none text-[12.5px] md:text-[12.5px] border-[#e2e8f0] rounded-lg focus:ring-[#dc2626]/20 focus:border-[#dc2626] placeholder:text-[#94a3b8]"
                    />
                  </div>
                </>
              )}

              {/* Step 2: Confirm */}
              {rejectStep === 'confirm' && (
                <>
                  <div className="bg-[#fef2f2] border border-[#fecaca] rounded-xl p-4 text-center space-y-2">
                    <svg className="size-8 text-[#dc2626] mx-auto" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                    </svg>
                    <p className="text-[13px] font-semibold text-[#991b1b]">
                      You are about to permanently reject<br />
                      certificate <span className="font-mono">{certificate.certificateNumber}</span>
                    </p>
                    <div className="bg-white/60 rounded-lg px-3 py-2 mt-2 text-left">
                      <p className="text-[11px] font-semibold text-[#94a3b8] uppercase tracking-wider mb-1">Your reason</p>
                      <p className="text-[12.5px] text-[#0f172a] italic">&ldquo;{rejectReason.trim()}&rdquo;</p>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[12.5px] font-semibold text-[#0f172a] mb-1.5">
                      Type <span className="font-mono text-[#dc2626]">{certificate.certificateNumber}</span> to confirm
                    </label>
                    <input
                      type="text"
                      value={rejectConfirmText}
                      onChange={(e) => setRejectConfirmText(e.target.value)}
                      placeholder={certificate.certificateNumber}
                      className="w-full px-3 py-2 text-[12.5px] font-mono border border-[#e2e8f0] rounded-lg bg-white text-[#0f172a] focus:ring-2 focus:ring-[#dc2626]/20 focus:border-[#dc2626] placeholder:text-[#cbd5e1]"
                    />
                  </div>
                </>
              )}

              {error && (
                <div className="flex items-center gap-2 p-2.5 bg-[#fef2f2] border border-[#fecaca] rounded-lg">
                  <XCircle className="size-3.5 text-[#dc2626] flex-shrink-0" />
                  <p className="text-[12px] text-[#dc2626]">{error}</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-[#f1f5f9] bg-[#f8fafc] flex items-center justify-between flex-shrink-0">
              <div>
                {rejectStep === 'confirm' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setRejectStep('reason')
                      setRejectConfirmText('')
                      setError(null)
                    }}
                    disabled={isRejecting}
                    className="text-[12.5px] font-semibold text-[#475569] hover:text-[#0f172a]"
                  >
                    Back
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setShowRejectModal(false)
                    setRejectReason('')
                    setRejectStep('reason')
                    setRejectConfirmText('')
                    setError(null)
                  }}
                  disabled={isRejecting}
                  className="rounded-[9px] border-[#e2e8f0] text-[12.5px] font-semibold text-[#475569]"
                >
                  Cancel
                </Button>
                {rejectStep === 'reason' ? (
                  <Button
                    size="sm"
                    onClick={() => {
                      if (!rejectReason.trim()) {
                        setError('Please provide a rejection reason')
                        return
                      }
                      setError(null)
                      setRejectStep('confirm')
                    }}
                    disabled={!rejectReason.trim()}
                    className="bg-[#0f172a] hover:bg-[#1e293b] text-white rounded-[9px] text-[12.5px] font-semibold"
                  >
                    Continue
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={handleReject}
                    disabled={isRejecting || rejectConfirmText !== certificate.certificateNumber}
                    className="bg-[#dc2626] hover:bg-[#b91c1c] text-white rounded-[9px] text-[12.5px] font-semibold"
                  >
                    {isRejecting ? (
                      <Loader2 className="size-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <XCircle className="size-3.5 mr-1.5" />
                    )}
                    Reject Forever
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Field Change Request Modal */}
      {showFieldChangeModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-[14px] border border-[#e2e8f0] shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="px-5 py-3.5 border-b border-[#f1f5f9] flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 bg-[#fef9c3] rounded-[9px]">
                  <PenLine className="size-4 text-[#a16207]" />
                </div>
                <div>
                  <h2 className="text-[14px] font-semibold text-[#0f172a]">Request Admin Changes</h2>
                  <p className="text-[11px] font-mono text-[#94a3b8]">{certificate.certificateNumber}</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowFieldChangeModal(false)
                  setSelectedFields([])
                  setFieldChangeDescription('')
                  setFieldChangeForwardedItems(new Set())
                  setError(null)
                }}
                className="p-1.5 hover:bg-[#f8fafc] rounded-lg transition-colors"
              >
                <X className="size-4 text-[#94a3b8]" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Summary Strip */}
              <div className="flex items-center gap-2 px-3.5 py-2.5 bg-[#f8fafc] border border-[#f1f5f9] rounded-lg text-[12px] text-[#64748b]">
                <span className="font-semibold text-[#0f172a]">{certificate.uucDescription || '—'}</span>
                <span className="text-[#e2e8f0]">·</span>
                <span>{certificate.customerName || '—'}</span>
                <span className="text-[#e2e8f0]">·</span>
                <span>{assignee.name}</span>
              </div>

              {/* Customer Feedback Forwarding — shown whenever customer feedback exists */}
              {customerFeedback?.sectionFeedbacks && customerFeedback.sectionFeedbacks.length > 0 && (
                <div className="border border-[#e9d5ff] rounded-xl bg-[#faf5ff] overflow-hidden">
                  <div className="px-3.5 py-2.5 flex items-center justify-between border-b border-[#e9d5ff]">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-[0.07em] text-[#7c3aed]">
                        Customer Feedback
                      </span>
                      <span className="text-[10px] font-mono text-[#a78bfa]">
                        {customerFeedback.customerName} · {customerFeedback.sectionFeedbacks.length} section{customerFeedback.sectionFeedbacks.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (fieldChangeForwardedItems.size === customerFeedback.sectionFeedbacks!.length) {
                          setFieldChangeForwardedItems(new Set())
                        } else {
                          forwardAllFieldChangeCustomer()
                        }
                      }}
                      className="text-[11px] font-semibold text-[#7c3aed] hover:text-[#6b21a8] px-2 py-0.5 hover:bg-[#f3e8ff] rounded-md transition-colors"
                    >
                      {fieldChangeForwardedItems.size === customerFeedback.sectionFeedbacks.length ? 'Clear All' : 'Forward All'}
                    </button>
                  </div>
                  <div className="p-3 space-y-2">
                    {customerFeedback.sectionFeedbacks.map((item, index) => {
                      const sectionLabel = REVISION_SECTIONS.find(s => s.id === item.section)?.label || item.section
                      const isForwarded = fieldChangeForwardedItems.has(index)
                      return (
                        <label
                          key={index}
                          className={cn(
                            'flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors',
                            isForwarded
                              ? 'border-[#c4b5fd] bg-[#ede9fe]'
                              : 'border-[#e9d5ff] bg-white hover:bg-[#faf5ff]'
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={isForwarded}
                            onChange={() => toggleFieldChangeCustomerForward(index)}
                            className="mt-0.5 size-3.5 rounded border-[#d8b4fe] text-[#7c3aed] focus:ring-[#7c3aed]/20 accent-[#7c3aed]"
                          />
                          <div className="flex-1 min-w-0">
                            <span className="text-[11px] font-semibold text-[#6b21a8]">{sectionLabel}</span>
                            <p className="text-[12px] text-[#7c3aed] mt-0.5 leading-relaxed">{item.comment}</p>
                          </div>
                        </label>
                      )
                    })}
                    {customerFeedback.generalNotes && (
                      <div className="pt-2 border-t border-[#e9d5ff]">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-[#a78bfa]">General Notes</span>
                        <p className="text-[12px] text-[#7c3aed] mt-1 leading-relaxed">{customerFeedback.generalNotes}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Fields Selection */}
              <div>
                <label className="block text-[12.5px] font-semibold text-[#0f172a] mb-2">
                  Fields that need changes <span className="text-[#dc2626]">*</span>
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {FIELD_OPTIONS.map((field) => {
                    const isSelected = selectedFields.includes(field.id)
                    return (
                      <button
                        key={field.id}
                        type="button"
                        onClick={() => toggleFieldTag(field.id)}
                        className={cn(
                          'px-2.5 py-1.5 rounded-lg text-[12px] font-medium border transition-colors',
                          isSelected
                            ? 'bg-[#fef9c3] border-[#fde68a] text-[#a16207]'
                            : 'bg-white border-[#e2e8f0] text-[#64748b] hover:border-[#fde68a] hover:bg-[#fffbeb]'
                        )}
                      >
                        {field.label}
                        {isSelected && (
                          <X className="size-3 ml-1 inline-block" />
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-[12.5px] font-semibold text-[#0f172a] mb-1.5">
                  Description <span className="text-[#dc2626]">*</span>
                </label>
                <Textarea
                  placeholder="Describe what needs to be changed and the correct values..."
                  value={fieldChangeDescription}
                  onChange={(e) => setFieldChangeDescription(e.target.value)}
                  rows={4}
                  className="resize-none text-[12.5px] md:text-[12.5px] border-[#e2e8f0] rounded-lg focus:ring-[#eab308]/20 focus:border-[#eab308] placeholder:text-[#94a3b8]"
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 p-2.5 bg-[#fef2f2] border border-[#fecaca] rounded-lg">
                  <XCircle className="size-3.5 text-[#dc2626] flex-shrink-0" />
                  <p className="text-[12px] text-[#dc2626]">{error}</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-[#f1f5f9] bg-[#f8fafc] flex items-center justify-end gap-2 flex-shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowFieldChangeModal(false)
                  setSelectedFields([])
                  setFieldChangeDescription('')
                  setFieldChangeForwardedItems(new Set())
                  setError(null)
                }}
                disabled={isSubmittingFieldChange}
                className="rounded-[9px] border-[#e2e8f0] text-[12.5px] font-semibold text-[#475569]"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSubmitFieldChange}
                disabled={isSubmittingFieldChange || selectedFields.length === 0 || !fieldChangeDescription.trim()}
                className="bg-[#0f172a] hover:bg-[#1e293b] text-white rounded-[9px] text-[12.5px] font-semibold"
              >
                {isSubmittingFieldChange ? (
                  <Loader2 className="size-3.5 mr-1.5 animate-spin" />
                ) : (
                  <PenLine className="size-3.5 mr-1.5" />
                )}
                Submit Request
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
