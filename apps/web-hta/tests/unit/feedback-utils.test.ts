/**
 * Feedback Utils Unit Tests
 *
 * Tests for feedback utility functions including:
 * - Section configuration
 * - Feedback type classification
 * - Feedback grouping by revision/section
 * - Date formatting
 * - User utilities
 *
 * Migrated from hta-calibration/src/components/__tests__/feedback-utils.test.ts
 */
import { describe, it, expect } from 'vitest'

// Types
interface Feedback {
  id: string
  feedbackType: string
  comment: string | null
  createdAt: string
  revisionNumber: number
  targetSection: string | null
  user: { name: string; role: string }
  reviewerEdits?: Array<{
    field: string
    fieldLabel: string
    previousValue: string
    newValue: string
    reason?: string
  }>
}

interface CustomerEvent {
  id: string
  eventType: string
  eventData: Record<string, unknown>
  createdAt: string
  revision: number
}

// Section configuration
const SECTION_CONFIG: Record<
  string,
  { label: string; icon: string; bgClass: string; iconClass: string }
> = {
  summary: {
    label: 'Summary',
    icon: 'FileText',
    bgClass: 'bg-blue-50',
    iconClass: 'text-blue-500',
  },
  'uuc-details': {
    label: 'UUC Details',
    icon: 'Package',
    bgClass: 'bg-purple-50',
    iconClass: 'text-purple-500',
  },
  'master-inst': {
    label: 'Master Instruments',
    icon: 'Wrench',
    bgClass: 'bg-amber-50',
    iconClass: 'text-amber-500',
  },
  environment: {
    label: 'Environment',
    icon: 'Thermometer',
    bgClass: 'bg-green-50',
    iconClass: 'text-green-500',
  },
  results: {
    label: 'Results',
    icon: 'BarChart',
    bgClass: 'bg-orange-50',
    iconClass: 'text-orange-500',
  },
  remarks: {
    label: 'Remarks',
    icon: 'MessageSquare',
    bgClass: 'bg-pink-50',
    iconClass: 'text-pink-500',
  },
  conclusion: {
    label: 'Conclusion',
    icon: 'CheckCircle',
    bgClass: 'bg-teal-50',
    iconClass: 'text-teal-500',
  },
  general: {
    label: 'General',
    icon: 'Info',
    bgClass: 'bg-slate-50',
    iconClass: 'text-slate-500',
  },
}

const REVISION_SECTIONS = [
  { id: 'summary', label: 'Section 1: Summary' },
  { id: 'uuc-details', label: 'Section 2: UUC Details' },
  { id: 'master-inst', label: 'Section 3: Master Instruments' },
  { id: 'environment', label: 'Section 4: Environment' },
  { id: 'results', label: 'Section 5: Results' },
  { id: 'remarks', label: 'Section 6: Remarks' },
  { id: 'conclusion', label: 'Section 7: Conclusion' },
]

// Type classification functions
function isRevisionRequest(type: string): boolean {
  return ['REVISION_REQUEST', 'REVISION_REQUESTED', 'CUSTOMER_REVISION_FORWARDED'].includes(type)
}

function isEngineerResponse(type: string): boolean {
  return ['REVISION_RESPONSE', 'ASSIGNEE_RESPONSE', 'ENGINEER_RESPONSE'].includes(type)
}

function isApproval(type: string): boolean {
  return ['APPROVED', 'APPROVAL', 'APPROVAL_NOTE'].includes(type)
}

function isRejection(type: string): boolean {
  return ['REJECTED', 'REJECTION_REASON'].includes(type)
}

function isCustomerFeedback(type: string): boolean {
  return type === 'CUSTOMER_REVISION_REQUEST'
}

// Style functions
function getFeedbackStyle(type: string) {
  if (isRevisionRequest(type)) {
    return { bgColor: 'bg-orange-100', textColor: 'text-orange-600', label: 'Revision Request' }
  }
  if (type === 'CUSTOMER_REVISION_REQUEST') {
    return {
      bgColor: 'bg-purple-100',
      textColor: 'text-purple-600',
      label: 'Customer Revision Request',
    }
  }
  if (isApproval(type)) {
    return { bgColor: 'bg-green-100', textColor: 'text-green-600', label: 'Approved' }
  }
  if (isRejection(type)) {
    return { bgColor: 'bg-red-100', textColor: 'text-red-600', label: 'Rejected' }
  }
  if (isEngineerResponse(type)) {
    return { bgColor: 'bg-blue-100', textColor: 'text-blue-600', label: 'Response' }
  }
  return { bgColor: 'bg-slate-100', textColor: 'text-slate-600', label: 'Comment' }
}

function getCustomerEventStyle(type: string) {
  const styles: Record<string, { bgColor: string; textColor: string; label: string }> = {
    SENT_TO_CUSTOMER: {
      bgColor: 'bg-blue-100',
      textColor: 'text-blue-600',
      label: 'Sent to Customer',
    },
    CUSTOMER_REVISION_REQUESTED: {
      bgColor: 'bg-purple-100',
      textColor: 'text-purple-600',
      label: 'Customer Revision Request',
    },
    CUSTOMER_APPROVED: {
      bgColor: 'bg-green-100',
      textColor: 'text-green-600',
      label: 'Customer Approved',
    },
    CUSTOMER_REVISION_FORWARDED: {
      bgColor: 'bg-orange-100',
      textColor: 'text-orange-600',
      label: 'Forwarded to Engineer',
    },
    ADMIN_REPLIED_TO_CUSTOMER: {
      bgColor: 'bg-amber-100',
      textColor: 'text-amber-600',
      label: 'Admin Response',
    },
  }
  return styles[type] || { bgColor: 'bg-slate-100', textColor: 'text-slate-600', label: 'Event' }
}

// Grouping functions
function groupFeedbacksByRevision(feedbacks: Feedback[]) {
  const groups: Map<number, { feedbacks: Feedback[]; approvals: Feedback[] }> = new Map()

  for (const fb of feedbacks) {
    const rev = fb.revisionNumber || 1
    if (!groups.has(rev)) {
      groups.set(rev, { feedbacks: [], approvals: [] })
    }
    const group = groups.get(rev)!
    if (isApproval(fb.feedbackType)) {
      group.approvals.push(fb)
    } else {
      group.feedbacks.push(fb)
    }
  }

  return Array.from(groups.entries())
    .map(([revision, data]) => ({ revision, ...data }))
    .sort((a, b) => b.revision - a.revision)
}

function groupFeedbacksBySection(feedbacks: Feedback[]) {
  const sectionOrder = [...REVISION_SECTIONS.map((s) => s.id), 'general']
  const groups: Map<string, Feedback[]> = new Map()

  for (const fb of feedbacks) {
    const section = fb.targetSection || 'general'
    if (!groups.has(section)) {
      groups.set(section, [])
    }
    groups.get(section)!.push(fb)
  }

  // Sort feedbacks within each section by date descending
  for (const [, fbs] of groups) {
    fbs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }

  return sectionOrder
    .filter((s) => groups.has(s))
    .map((section) => ({ section, feedbacks: groups.get(section)! }))
}

function groupCustomerEventsByRevision(events: CustomerEvent[]) {
  const groups: Map<number, CustomerEvent[]> = new Map()

  for (const evt of events) {
    const rev = evt.revision || 1
    if (!groups.has(rev)) {
      groups.set(rev, [])
    }
    groups.get(rev)!.push(evt)
  }

  // Sort events within each revision by date ascending
  for (const [, evts] of groups) {
    evts.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
  }

  return Array.from(groups.entries())
    .map(([revision, events]) => ({ revision, events }))
    .sort((a, b) => b.revision - a.revision)
}

// Date formatting functions
function formatDateDisplay(dateStr: string | null): string {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`

  return formatDateDisplay(dateStr)
}

// User utilities
function getUserInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0][0].toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

function getRoleBadge(role: string) {
  const normalizedRole = role.toUpperCase()
  const badges: Record<string, { label: string; className: string }> = {
    HOD: { label: 'Reviewer', className: 'bg-slate-100 text-slate-600' },
    ADMIN: { label: 'Reviewer', className: 'bg-slate-100 text-slate-600' },
    ENGINEER: { label: 'Engineer', className: 'bg-blue-100 text-blue-600' },
    CUSTOMER: { label: 'Customer', className: 'bg-purple-100 text-purple-600' },
  }
  return badges[normalizedRole] || { label: role, className: 'bg-slate-100 text-slate-600' }
}

describe('feedback-utils', () => {
  describe('SECTION_CONFIG', () => {
    it('contains all required sections', () => {
      expect(SECTION_CONFIG).toHaveProperty('summary')
      expect(SECTION_CONFIG).toHaveProperty('uuc-details')
      expect(SECTION_CONFIG).toHaveProperty('master-inst')
      expect(SECTION_CONFIG).toHaveProperty('environment')
      expect(SECTION_CONFIG).toHaveProperty('results')
      expect(SECTION_CONFIG).toHaveProperty('remarks')
      expect(SECTION_CONFIG).toHaveProperty('conclusion')
      expect(SECTION_CONFIG).toHaveProperty('general')
    })

    it('each section has required properties', () => {
      Object.values(SECTION_CONFIG).forEach((config) => {
        expect(config).toHaveProperty('label')
        expect(config).toHaveProperty('icon')
        expect(config).toHaveProperty('bgClass')
        expect(config).toHaveProperty('iconClass')
      })
    })
  })

  describe('REVISION_SECTIONS', () => {
    it('contains all certificate sections in order', () => {
      expect(REVISION_SECTIONS).toHaveLength(7)
      expect(REVISION_SECTIONS[0].id).toBe('summary')
      expect(REVISION_SECTIONS[6].id).toBe('conclusion')
    })

    it('each section has id and label', () => {
      REVISION_SECTIONS.forEach((section) => {
        expect(section).toHaveProperty('id')
        expect(section).toHaveProperty('label')
        expect(section.label).toContain('Section')
      })
    })
  })

  describe('isRevisionRequest', () => {
    it('returns true for REVISION_REQUEST', () => {
      expect(isRevisionRequest('REVISION_REQUEST')).toBe(true)
    })

    it('returns true for REVISION_REQUESTED', () => {
      expect(isRevisionRequest('REVISION_REQUESTED')).toBe(true)
    })

    it('returns true for CUSTOMER_REVISION_FORWARDED', () => {
      expect(isRevisionRequest('CUSTOMER_REVISION_FORWARDED')).toBe(true)
    })

    it('returns false for other types', () => {
      expect(isRevisionRequest('APPROVED')).toBe(false)
      expect(isRevisionRequest('REJECTED')).toBe(false)
      expect(isRevisionRequest('ENGINEER_RESPONSE')).toBe(false)
    })
  })

  describe('isEngineerResponse', () => {
    it('returns true for REVISION_RESPONSE', () => {
      expect(isEngineerResponse('REVISION_RESPONSE')).toBe(true)
    })

    it('returns true for ASSIGNEE_RESPONSE', () => {
      expect(isEngineerResponse('ASSIGNEE_RESPONSE')).toBe(true)
    })

    it('returns true for ENGINEER_RESPONSE', () => {
      expect(isEngineerResponse('ENGINEER_RESPONSE')).toBe(true)
    })

    it('returns false for other types', () => {
      expect(isEngineerResponse('REVISION_REQUEST')).toBe(false)
      expect(isEngineerResponse('APPROVED')).toBe(false)
    })
  })

  describe('isApproval', () => {
    it('returns true for APPROVED', () => {
      expect(isApproval('APPROVED')).toBe(true)
    })

    it('returns true for APPROVAL', () => {
      expect(isApproval('APPROVAL')).toBe(true)
    })

    it('returns true for APPROVAL_NOTE', () => {
      expect(isApproval('APPROVAL_NOTE')).toBe(true)
    })

    it('returns false for other types', () => {
      expect(isApproval('REJECTED')).toBe(false)
      expect(isApproval('REVISION_REQUEST')).toBe(false)
    })
  })

  describe('isRejection', () => {
    it('returns true for REJECTED', () => {
      expect(isRejection('REJECTED')).toBe(true)
    })

    it('returns true for REJECTION_REASON', () => {
      expect(isRejection('REJECTION_REASON')).toBe(true)
    })

    it('returns false for other types', () => {
      expect(isRejection('APPROVED')).toBe(false)
      expect(isRejection('REVISION_REQUEST')).toBe(false)
    })
  })

  describe('isCustomerFeedback', () => {
    it('returns true for CUSTOMER_REVISION_REQUEST', () => {
      expect(isCustomerFeedback('CUSTOMER_REVISION_REQUEST')).toBe(true)
    })

    it('returns false for other types', () => {
      expect(isCustomerFeedback('REVISION_REQUEST')).toBe(false)
      expect(isCustomerFeedback('CUSTOMER_REVISION_FORWARDED')).toBe(false)
    })
  })

  describe('getFeedbackStyle', () => {
    it('returns orange style for revision requests', () => {
      const style = getFeedbackStyle('REVISION_REQUEST')
      expect(style.bgColor).toBe('bg-orange-100')
      expect(style.textColor).toBe('text-orange-600')
      expect(style.label).toBe('Revision Request')
    })

    it('returns purple style for customer revision request', () => {
      const style = getFeedbackStyle('CUSTOMER_REVISION_REQUEST')
      expect(style.bgColor).toBe('bg-purple-100')
      expect(style.label).toBe('Customer Revision Request')
    })

    it('returns green style for approvals', () => {
      const style = getFeedbackStyle('APPROVED')
      expect(style.bgColor).toBe('bg-green-100')
      expect(style.label).toBe('Approved')
    })

    it('returns red style for rejections', () => {
      const style = getFeedbackStyle('REJECTED')
      expect(style.bgColor).toBe('bg-red-100')
      expect(style.label).toBe('Rejected')
    })

    it('returns blue style for engineer responses', () => {
      const style = getFeedbackStyle('ENGINEER_RESPONSE')
      expect(style.bgColor).toBe('bg-blue-100')
      expect(style.label).toBe('Response')
    })

    it('returns slate style for unknown types', () => {
      const style = getFeedbackStyle('UNKNOWN_TYPE')
      expect(style.bgColor).toBe('bg-slate-100')
      expect(style.label).toBe('Comment')
    })
  })

  describe('getCustomerEventStyle', () => {
    it('returns blue style for SENT_TO_CUSTOMER', () => {
      const style = getCustomerEventStyle('SENT_TO_CUSTOMER')
      expect(style.bgColor).toBe('bg-blue-100')
      expect(style.label).toBe('Sent to Customer')
    })

    it('returns purple style for CUSTOMER_REVISION_REQUESTED', () => {
      const style = getCustomerEventStyle('CUSTOMER_REVISION_REQUESTED')
      expect(style.bgColor).toBe('bg-purple-100')
      expect(style.label).toBe('Customer Revision Request')
    })

    it('returns green style for CUSTOMER_APPROVED', () => {
      const style = getCustomerEventStyle('CUSTOMER_APPROVED')
      expect(style.bgColor).toBe('bg-green-100')
      expect(style.label).toBe('Customer Approved')
    })

    it('returns orange style for CUSTOMER_REVISION_FORWARDED', () => {
      const style = getCustomerEventStyle('CUSTOMER_REVISION_FORWARDED')
      expect(style.bgColor).toBe('bg-orange-100')
      expect(style.label).toBe('Forwarded to Engineer')
    })

    it('returns amber style for ADMIN_REPLIED_TO_CUSTOMER', () => {
      const style = getCustomerEventStyle('ADMIN_REPLIED_TO_CUSTOMER')
      expect(style.bgColor).toBe('bg-amber-100')
      expect(style.label).toBe('Admin Response')
    })

    it('returns slate style for unknown events', () => {
      const style = getCustomerEventStyle('UNKNOWN_EVENT')
      expect(style.bgColor).toBe('bg-slate-100')
      expect(style.label).toBe('Event')
    })
  })

  describe('groupFeedbacksByRevision', () => {
    const createFeedback = (overrides: Partial<Feedback> = {}): Feedback => ({
      id: 'fb-1',
      feedbackType: 'REVISION_REQUEST',
      comment: 'Test comment',
      createdAt: '2024-01-01T10:00:00.000Z',
      revisionNumber: 1,
      targetSection: 'summary',
      user: { name: 'Test User', role: 'ENGINEER' },
      ...overrides,
    })

    it('groups feedbacks by revision number', () => {
      const feedbacks = [
        createFeedback({ id: 'fb-1', revisionNumber: 1 }),
        createFeedback({ id: 'fb-2', revisionNumber: 1 }),
        createFeedback({ id: 'fb-3', revisionNumber: 2 }),
      ]

      const groups = groupFeedbacksByRevision(feedbacks)

      expect(groups).toHaveLength(2)
      expect(groups.find((g) => g.revision === 1)?.feedbacks).toHaveLength(2)
      expect(groups.find((g) => g.revision === 2)?.feedbacks).toHaveLength(1)
    })

    it('separates approvals from other feedbacks', () => {
      const feedbacks = [
        createFeedback({ id: 'fb-1', feedbackType: 'REVISION_REQUEST', revisionNumber: 1 }),
        createFeedback({ id: 'fb-2', feedbackType: 'APPROVED', revisionNumber: 1 }),
      ]

      const groups = groupFeedbacksByRevision(feedbacks)

      expect(groups[0].feedbacks).toHaveLength(1)
      expect(groups[0].approvals).toHaveLength(1)
    })

    it('sorts revisions in descending order (most recent first)', () => {
      const feedbacks = [
        createFeedback({ id: 'fb-1', revisionNumber: 1 }),
        createFeedback({ id: 'fb-2', revisionNumber: 3 }),
        createFeedback({ id: 'fb-3', revisionNumber: 2 }),
      ]

      const groups = groupFeedbacksByRevision(feedbacks)

      expect(groups[0].revision).toBe(3)
      expect(groups[1].revision).toBe(2)
      expect(groups[2].revision).toBe(1)
    })

    it('defaults to revision 1 when revisionNumber is undefined', () => {
      const feedbacks = [
        createFeedback({ id: 'fb-1', revisionNumber: undefined as unknown as number }),
      ]

      const groups = groupFeedbacksByRevision(feedbacks)

      expect(groups[0].revision).toBe(1)
    })
  })

  describe('groupFeedbacksBySection', () => {
    const createFeedback = (overrides: Partial<Feedback> = {}): Feedback => ({
      id: 'fb-1',
      feedbackType: 'REVISION_REQUEST',
      comment: 'Test comment',
      createdAt: '2024-01-01T10:00:00.000Z',
      revisionNumber: 1,
      targetSection: 'summary',
      user: { name: 'Test User', role: 'ENGINEER' },
      ...overrides,
    })

    it('groups feedbacks by target section', () => {
      const feedbacks = [
        createFeedback({ id: 'fb-1', targetSection: 'summary' }),
        createFeedback({ id: 'fb-2', targetSection: 'summary' }),
        createFeedback({ id: 'fb-3', targetSection: 'results' }),
      ]

      const groups = groupFeedbacksBySection(feedbacks)

      expect(groups.find((g) => g.section === 'summary')?.feedbacks).toHaveLength(2)
      expect(groups.find((g) => g.section === 'results')?.feedbacks).toHaveLength(1)
    })

    it('uses "general" for feedbacks without targetSection', () => {
      const feedbacks = [
        createFeedback({ id: 'fb-1', targetSection: null }),
        createFeedback({ id: 'fb-2', targetSection: undefined as unknown as null }),
      ]

      const groups = groupFeedbacksBySection(feedbacks)

      expect(groups.find((g) => g.section === 'general')?.feedbacks).toHaveLength(2)
    })

    it('returns sections in consistent order', () => {
      const feedbacks = [
        createFeedback({ id: 'fb-1', targetSection: 'results' }),
        createFeedback({ id: 'fb-2', targetSection: 'summary' }),
        createFeedback({ id: 'fb-3', targetSection: 'general' }),
      ]

      const groups = groupFeedbacksBySection(feedbacks)
      const sectionOrder = groups.map((g) => g.section)

      expect(sectionOrder.indexOf('summary')).toBeLessThan(sectionOrder.indexOf('results'))
      expect(sectionOrder.indexOf('results')).toBeLessThan(sectionOrder.indexOf('general'))
    })

    it('sorts feedbacks within section by date descending', () => {
      const feedbacks = [
        createFeedback({
          id: 'fb-1',
          targetSection: 'summary',
          createdAt: '2024-01-01T08:00:00.000Z',
        }),
        createFeedback({
          id: 'fb-2',
          targetSection: 'summary',
          createdAt: '2024-01-01T12:00:00.000Z',
        }),
        createFeedback({
          id: 'fb-3',
          targetSection: 'summary',
          createdAt: '2024-01-01T10:00:00.000Z',
        }),
      ]

      const groups = groupFeedbacksBySection(feedbacks)
      const summaryGroup = groups.find((g) => g.section === 'summary')!

      expect(summaryGroup.feedbacks[0].id).toBe('fb-2')
      expect(summaryGroup.feedbacks[1].id).toBe('fb-3')
      expect(summaryGroup.feedbacks[2].id).toBe('fb-1')
    })
  })

  describe('groupCustomerEventsByRevision', () => {
    const createEvent = (overrides: Partial<CustomerEvent> = {}): CustomerEvent => ({
      id: 'evt-1',
      eventType: 'SENT_TO_CUSTOMER',
      eventData: {},
      createdAt: '2024-01-01T10:00:00.000Z',
      revision: 1,
      ...overrides,
    })

    it('groups events by revision number', () => {
      const events = [
        createEvent({ id: 'evt-1', revision: 1 }),
        createEvent({ id: 'evt-2', revision: 1 }),
        createEvent({ id: 'evt-3', revision: 2 }),
      ]

      const groups = groupCustomerEventsByRevision(events)

      expect(groups).toHaveLength(2)
      expect(groups.find((g) => g.revision === 1)?.events).toHaveLength(2)
      expect(groups.find((g) => g.revision === 2)?.events).toHaveLength(1)
    })

    it('sorts revisions in descending order', () => {
      const events = [
        createEvent({ id: 'evt-1', revision: 1 }),
        createEvent({ id: 'evt-2', revision: 3 }),
      ]

      const groups = groupCustomerEventsByRevision(events)

      expect(groups[0].revision).toBe(3)
      expect(groups[1].revision).toBe(1)
    })

    it('sorts events within revision by date ascending', () => {
      const events = [
        createEvent({ id: 'evt-1', revision: 1, createdAt: '2024-01-01T12:00:00.000Z' }),
        createEvent({ id: 'evt-2', revision: 1, createdAt: '2024-01-01T08:00:00.000Z' }),
      ]

      const groups = groupCustomerEventsByRevision(events)

      expect(groups[0].events[0].id).toBe('evt-2')
      expect(groups[0].events[1].id).toBe('evt-1')
    })
  })

  describe('formatDateDisplay', () => {
    it('formats date in en-GB format', () => {
      const result = formatDateDisplay('2024-01-15T10:00:00.000Z')
      expect(result).toBe('15 Jan 2024')
    })

    it('returns "-" for null input', () => {
      expect(formatDateDisplay(null)).toBe('-')
    })
  })

  describe('formatDateTime', () => {
    it('formats date with time', () => {
      const result = formatDateTime('2024-01-15T10:30:00.000Z')
      // Note: exact format depends on locale settings
      expect(result).toContain('15')
      expect(result).toContain('Jan')
      expect(result).toContain('2024')
    })
  })

  describe('formatTimeAgo', () => {
    it('returns "just now" for very recent dates', () => {
      const now = new Date()
      const result = formatTimeAgo(now.toISOString())
      expect(result).toBe('just now')
    })

    it('returns minutes for dates less than an hour ago', () => {
      const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000)
      const result = formatTimeAgo(thirtyMinsAgo.toISOString())
      expect(result).toBe('30m ago')
    })

    it('returns hours for dates less than a day ago', () => {
      const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000)
      const result = formatTimeAgo(fiveHoursAgo.toISOString())
      expect(result).toBe('5h ago')
    })

    it('returns days for dates less than a week ago', () => {
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
      const result = formatTimeAgo(threeDaysAgo.toISOString())
      expect(result).toBe('3d ago')
    })

    it('returns formatted date for dates more than a week ago', () => {
      const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
      const result = formatTimeAgo(twoWeeksAgo.toISOString())
      expect(result).toMatch(/\d{1,2} \w{3} \d{4}/)
    })
  })

  describe('getUserInitials', () => {
    it('returns first letters of first and last name', () => {
      expect(getUserInitials('John Doe')).toBe('JD')
    })

    it('handles single name', () => {
      expect(getUserInitials('John')).toBe('J')
    })

    it('handles multiple names, returns first two initials', () => {
      expect(getUserInitials('John Robert Doe')).toBe('JR')
    })

    it('returns uppercase initials', () => {
      expect(getUserInitials('john doe')).toBe('JD')
    })
  })

  describe('getRoleBadge', () => {
    it('returns Reviewer for HOD role', () => {
      const badge = getRoleBadge('HOD')
      expect(badge.label).toBe('Reviewer')
      expect(badge.className).toBe('bg-slate-100 text-slate-600')
    })

    it('returns Reviewer for ADMIN role', () => {
      const badge = getRoleBadge('ADMIN')
      expect(badge.label).toBe('Reviewer')
    })

    it('returns Engineer for ENGINEER role', () => {
      const badge = getRoleBadge('ENGINEER')
      expect(badge.label).toBe('Engineer')
      expect(badge.className).toBe('bg-blue-100 text-blue-600')
    })

    it('returns Customer for CUSTOMER role', () => {
      const badge = getRoleBadge('CUSTOMER')
      expect(badge.label).toBe('Customer')
      expect(badge.className).toBe('bg-purple-100 text-purple-600')
    })

    it('returns role as-is for unknown roles', () => {
      const badge = getRoleBadge('UNKNOWN')
      expect(badge.label).toBe('UNKNOWN')
    })

    it('handles lowercase role input', () => {
      const badge = getRoleBadge('engineer')
      expect(badge.label).toBe('Engineer')
    })
  })
})
