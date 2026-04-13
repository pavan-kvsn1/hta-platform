import {
  MessageSquare,
  CheckCircle,
  AlertTriangle,
  XCircle,
  PenLine,
  Send,
  User,
  FileText,
  Target,
  Wrench,
  Thermometer,
  ClipboardList,
  MessageCircle,
  AlertCircle,
  type LucideIcon,
} from 'lucide-react'

// ============================================================================
// TYPES
// ============================================================================

export interface ReviewerEdit {
  field: string
  fieldLabel: string
  previousValue: string | null
  newValue: string
  reason: string
  autoCalculated?: boolean
}

export interface Feedback {
  id: string
  feedbackType: string
  comment: string | null
  createdAt: string
  revisionNumber: number
  targetSection?: string | null
  user: {
    name: string | null
    role: string | null
  }
  reviewerEdits?: ReviewerEdit[] | null
}

export interface CustomerEvent {
  id: string
  eventType: string
  eventData: {
    notes?: string
    message?: string
    response?: string
    customerEmail?: string
    customerName?: string
    customerCompany?: string
    requestedAt?: string
    sentAt?: string
    approvedAt?: string
  }
  createdAt: string
  revision: number
  user?: {
    name: string
    role: string
  }
}

export interface FeedbackStyle {
  icon: LucideIcon
  bgColor: string
  textColor: string
  borderColor: string
  label: string
}

export interface SectionConfig {
  label: string
  icon: LucideIcon
  bgClass: string
  iconClass: string
}

// ============================================================================
// SECTION CONFIGURATION
// ============================================================================

export const SECTION_CONFIG: Record<string, SectionConfig> = {
  'summary': { label: 'Summary', icon: FileText, bgClass: 'bg-blue-50', iconClass: 'text-blue-600' },
  'uuc-details': { label: 'UUC Details', icon: Target, bgClass: 'bg-indigo-50', iconClass: 'text-indigo-600' },
  'master-inst': { label: 'Master Instruments', icon: Wrench, bgClass: 'bg-violet-50', iconClass: 'text-violet-600' },
  'environment': { label: 'Environmental Conditions', icon: Thermometer, bgClass: 'bg-cyan-50', iconClass: 'text-cyan-600' },
  'results': { label: 'Calibration Results', icon: ClipboardList, bgClass: 'bg-emerald-50', iconClass: 'text-emerald-600' },
  'remarks': { label: 'Remarks', icon: MessageCircle, bgClass: 'bg-amber-50', iconClass: 'text-amber-600' },
  'conclusion': { label: 'Conclusion', icon: CheckCircle, bgClass: 'bg-green-50', iconClass: 'text-green-600' },
  'general': { label: 'General', icon: AlertCircle, bgClass: 'bg-slate-100', iconClass: 'text-slate-600' },
}

/**
 * Revision sections for dropdown selection in revision request forms.
 * Used by AdminReviewActions, ReviewerPageClient, TokenApprovalActions.
 */
export const REVISION_SECTIONS = [
  { id: 'summary', label: 'Section 1: Summary' },
  { id: 'uuc-details', label: 'Section 2: UUC Details' },
  { id: 'master-inst', label: 'Section 3: Master Instruments' },
  { id: 'environment', label: 'Section 4: Environmental Conditions' },
  { id: 'results', label: 'Section 5: Calibration Results' },
  { id: 'remarks', label: 'Section 6: Remarks' },
  { id: 'conclusion', label: 'Section 7: Conclusion' },
] as const

export type RevisionSectionId = typeof REVISION_SECTIONS[number]['id']

// ============================================================================
// FEEDBACK TYPE HELPERS
// ============================================================================

export function isRevisionRequest(feedbackType: string): boolean {
  return ['REVISION_REQUEST', 'REVISION_REQUESTED', 'CUSTOMER_REVISION_FORWARDED'].includes(feedbackType)
}

export function isEngineerResponse(feedbackType: string): boolean {
  return ['REVISION_RESPONSE', 'ASSIGNEE_RESPONSE', 'ENGINEER_RESPONSE'].includes(feedbackType)
}

export function isApproval(feedbackType: string): boolean {
  return ['APPROVED', 'APPROVAL', 'APPROVAL_NOTE'].includes(feedbackType)
}

export function isRejection(feedbackType: string): boolean {
  return ['REJECTED', 'REJECTION_REASON'].includes(feedbackType)
}

export function isCustomerFeedback(feedbackType: string): boolean {
  return feedbackType === 'CUSTOMER_REVISION_REQUEST'
}

// ============================================================================
// STYLING FUNCTIONS
// ============================================================================

export function getFeedbackStyle(feedbackType: string): FeedbackStyle {
  switch (feedbackType) {
    case 'REVISION_REQUEST':
    case 'REVISION_REQUESTED':
      return {
        icon: AlertTriangle,
        bgColor: 'bg-orange-100',
        textColor: 'text-orange-600',
        borderColor: 'border-orange-200',
        label: 'Revision Request',
      }
    case 'CUSTOMER_REVISION_FORWARDED':
      return {
        icon: AlertTriangle,
        bgColor: 'bg-orange-100',
        textColor: 'text-orange-600',
        borderColor: 'border-orange-200',
        label: 'Revision Request',
      }
    case 'CUSTOMER_REVISION_REQUEST':
      return {
        icon: AlertTriangle,
        bgColor: 'bg-purple-100',
        textColor: 'text-purple-600',
        borderColor: 'border-purple-200',
        label: 'Customer Revision Request',
      }
    case 'APPROVED':
    case 'APPROVAL':
    case 'APPROVAL_NOTE':
      return {
        icon: CheckCircle,
        bgColor: 'bg-green-100',
        textColor: 'text-green-600',
        borderColor: 'border-green-200',
        label: 'Approved',
      }
    case 'REJECTED':
    case 'REJECTION_REASON':
      return {
        icon: XCircle,
        bgColor: 'bg-red-100',
        textColor: 'text-red-600',
        borderColor: 'border-red-200',
        label: 'Rejected',
      }
    case 'REVISION_RESPONSE':
    case 'ASSIGNEE_RESPONSE':
    case 'ENGINEER_RESPONSE':
      return {
        icon: PenLine,
        bgColor: 'bg-blue-100',
        textColor: 'text-blue-600',
        borderColor: 'border-blue-200',
        label: 'Response',
      }
    default:
      return {
        icon: MessageSquare,
        bgColor: 'bg-slate-100',
        textColor: 'text-slate-600',
        borderColor: 'border-slate-200',
        label: 'Comment',
      }
  }
}

export function getCustomerEventStyle(eventType: string): FeedbackStyle {
  switch (eventType) {
    case 'SENT_TO_CUSTOMER':
      return {
        icon: Send,
        bgColor: 'bg-blue-100',
        textColor: 'text-blue-600',
        borderColor: 'border-blue-200',
        label: 'Sent to Customer',
      }
    case 'CUSTOMER_REVISION_REQUESTED':
      return {
        icon: AlertTriangle,
        bgColor: 'bg-purple-100',
        textColor: 'text-purple-600',
        borderColor: 'border-purple-200',
        label: 'Customer Revision Request',
      }
    case 'CUSTOMER_APPROVED':
      return {
        icon: CheckCircle,
        bgColor: 'bg-green-100',
        textColor: 'text-green-600',
        borderColor: 'border-green-200',
        label: 'Customer Approved',
      }
    case 'CUSTOMER_REVISION_FORWARDED':
      return {
        icon: Send,
        bgColor: 'bg-orange-100',
        textColor: 'text-orange-600',
        borderColor: 'border-orange-200',
        label: 'Forwarded to Engineer',
      }
    case 'ADMIN_REPLIED_TO_CUSTOMER':
      return {
        icon: MessageSquare,
        bgColor: 'bg-amber-100',
        textColor: 'text-amber-600',
        borderColor: 'border-amber-200',
        label: 'Admin Response',
      }
    default:
      return {
        icon: MessageSquare,
        bgColor: 'bg-slate-100',
        textColor: 'text-slate-600',
        borderColor: 'border-slate-200',
        label: 'Event',
      }
  }
}

// ============================================================================
// GROUPING FUNCTIONS
// ============================================================================

export interface RevisionGroup {
  revision: number
  feedbacks: Feedback[]
  approvals: Feedback[]
}

export interface SectionGroup {
  section: string
  feedbacks: Feedback[]
}

/**
 * Groups feedbacks by revision, with approvals separated.
 * Returns revisions sorted in descending order (most recent first).
 */
export function groupFeedbacksByRevision(feedbacks: Feedback[]): RevisionGroup[] {
  const groups: Record<number, { feedbacks: Feedback[]; approvals: Feedback[] }> = {}

  // Sort by createdAt first
  const sortedFeedbacks = [...feedbacks].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  )

  for (const feedback of sortedFeedbacks) {
    const revision = feedback.revisionNumber || 1

    if (!groups[revision]) {
      groups[revision] = { feedbacks: [], approvals: [] }
    }

    if (isApproval(feedback.feedbackType)) {
      groups[revision].approvals.push(feedback)
    } else {
      groups[revision].feedbacks.push(feedback)
    }
  }

  return Object.entries(groups)
    .sort(([a], [b]) => Number(b) - Number(a))
    .map(([revision, data]) => ({
      revision: Number(revision),
      feedbacks: data.feedbacks,
      approvals: data.approvals,
    }))
}

/**
 * Groups feedbacks within a revision by section.
 * Returns sections in a consistent order.
 */
export function groupFeedbacksBySection(feedbacks: Feedback[]): SectionGroup[] {
  const sectionOrder = ['summary', 'uuc-details', 'master-inst', 'environment', 'results', 'remarks', 'conclusion', 'general']
  const groups: Record<string, Feedback[]> = {}

  for (const feedback of feedbacks) {
    const section = feedback.targetSection || 'general'
    if (!groups[section]) {
      groups[section] = []
    }
    groups[section].push(feedback)
  }

  return sectionOrder
    .filter(section => groups[section]?.length > 0)
    .map(section => ({
      section,
      feedbacks: groups[section].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ),
    }))
}

/**
 * Groups customer events by revision.
 * Returns revisions sorted in descending order (most recent first).
 */
export function groupCustomerEventsByRevision(events: CustomerEvent[]) {
  const groups: Record<number, CustomerEvent[]> = {}

  for (const event of events) {
    const revision = event.revision || 1
    if (!groups[revision]) {
      groups[revision] = []
    }
    groups[revision].push(event)
  }

  return Object.entries(groups)
    .sort(([a], [b]) => Number(b) - Number(a))
    .map(([revision, items]) => ({
      revision: Number(revision),
      events: items.sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      ),
    }))
}

// ============================================================================
// FORMATTING FUNCTIONS
// ============================================================================

export function formatDateDisplay(dateStr: string | null): string {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function formatDateTime(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return formatDateDisplay(dateStr)
}

export function getUserInitials(name: string): string {
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export function getRoleBadge(role: string): { label: string; className: string } {
  switch (role.toUpperCase()) {
    case 'HOD':
    case 'ADMIN':
      return { label: 'Reviewer', className: 'bg-slate-100 text-slate-600' }
    case 'ENGINEER':
      return { label: 'Engineer', className: 'bg-blue-100 text-blue-600' }
    case 'CUSTOMER':
      return { label: 'Customer', className: 'bg-purple-100 text-purple-600' }
    default:
      return { label: role, className: 'bg-slate-100 text-slate-600' }
  }
}
