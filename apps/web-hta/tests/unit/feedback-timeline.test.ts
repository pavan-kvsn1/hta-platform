/**
 * Feedback Timeline Logic Unit Tests
 *
 * Tests for feedback timeline functionality:
 * - Feedback grouping by revision
 * - Section grouping
 * - Revision label formatting
 * - Feedback count calculations
 * - Customer feedback integration
 *
 * Migrated from hta-calibration/src/components/__tests__/FeedbackTimeline.test.tsx
 * Self-contained version testing logic without React rendering
 */
import { describe, it, expect } from 'vitest'

// Types
type FeedbackType =
  | 'REVISION_REQUEST'
  | 'APPROVED'
  | 'REJECTED'
  | 'COMMENT'
  | 'CUSTOMER_REQUEST'
  | 'ENGINEER_RESPONSE'

interface Feedback {
  id: string
  feedbackType: FeedbackType
  comment: string
  createdAt: string
  revisionNumber: number
  targetSection?: string
  user?: {
    name: string
    role: string
  }
}

interface CustomerFeedback {
  notes: string
  sectionFeedbacks: Array<{ section: string; comment: string }>
  generalNotes: string | null
  customerName: string
  customerEmail: string
  requestedAt: string
  revision: number
}

interface RevisionGroup {
  revision: number
  feedbacks: Feedback[]
  isLatest: boolean
  hasApproval: boolean
  feedbackCount: number
  sectionCount: number
}

interface SectionGroup {
  section: string
  label: string
  feedbacks: Feedback[]
}

// Section label mapping
const SECTION_LABELS: Record<string, string> = {
  summary: 'Summary',
  results: 'Calibration Results',
  equipment: 'Equipment Used',
  environmental: 'Environmental Conditions',
  uncertainties: 'Measurement Uncertainties',
  traceability: 'Traceability',
  comments: 'Comments',
  general: 'General',
}

// Logic functions
function groupFeedbacksByRevision(
  feedbacks: Feedback[],
  currentRevision: number
): RevisionGroup[] {
  const groups = new Map<number, Feedback[]>()

  for (const feedback of feedbacks) {
    const rev = feedback.revisionNumber
    if (!groups.has(rev)) {
      groups.set(rev, [])
    }
    groups.get(rev)!.push(feedback)
  }

  return Array.from(groups.entries())
    .map(([revision, revFeedbacks]) => ({
      revision,
      feedbacks: revFeedbacks,
      isLatest: revision === currentRevision,
      hasApproval: revFeedbacks.some((f) => f.feedbackType === 'APPROVED'),
      feedbackCount: revFeedbacks.length,
      sectionCount: new Set(revFeedbacks.map((f) => f.targetSection).filter(Boolean)).size,
    }))
    .sort((a, b) => b.revision - a.revision)
}

function groupFeedbacksBySection(feedbacks: Feedback[]): SectionGroup[] {
  const groups = new Map<string, Feedback[]>()

  for (const feedback of feedbacks) {
    const section = feedback.targetSection || 'general'
    if (!groups.has(section)) {
      groups.set(section, [])
    }
    groups.get(section)!.push(feedback)
  }

  return Array.from(groups.entries()).map(([section, sectionFeedbacks]) => ({
    section,
    label: SECTION_LABELS[section] || section,
    feedbacks: sectionFeedbacks,
  }))
}

function formatRevisionLabel(revision: number, showTransition: boolean = true): string {
  if (showTransition) {
    return `Revision ${revision} → ${revision + 1}`
  }
  return `Version ${revision}`
}

function formatFeedbackCount(count: number): string {
  if (count === 1) {
    return '1 feedback'
  }
  return `${count} feedbacks`
}

function formatSectionCount(count: number): string {
  if (count === 1) {
    return '1 section'
  }
  return `${count} sections`
}

function formatRevisionCycles(count: number): string {
  if (count === 1) {
    return '1 revision cycle'
  }
  return `${count} revision cycles`
}

function getRevisionStatusLabel(group: RevisionGroup, variant: 'default' | 'sidebar'): string {
  if (group.isLatest) {
    return variant === 'sidebar' ? 'Current' : 'Latest'
  }
  return ''
}

function getApprovalLabel(group: RevisionGroup): string {
  if (group.hasApproval) {
    return '✓ Approved'
  }
  return ''
}

function convertCustomerFeedback(
  customerFeedback: CustomerFeedback
): Feedback[] {
  const feedbacks: Feedback[] = []

  // Add section feedbacks
  for (const sf of customerFeedback.sectionFeedbacks) {
    feedbacks.push({
      id: `customer-section-${sf.section}`,
      feedbackType: 'CUSTOMER_REQUEST',
      comment: sf.comment,
      createdAt: customerFeedback.requestedAt,
      revisionNumber: customerFeedback.revision,
      targetSection: sf.section,
      user: {
        name: customerFeedback.customerName,
        role: 'CUSTOMER',
      },
    })
  }

  // Add general notes
  if (customerFeedback.generalNotes) {
    feedbacks.push({
      id: 'customer-general',
      feedbackType: 'CUSTOMER_REQUEST',
      comment: customerFeedback.generalNotes,
      createdAt: customerFeedback.requestedAt,
      revisionNumber: customerFeedback.revision,
      targetSection: 'general',
      user: {
        name: customerFeedback.customerName,
        role: 'CUSTOMER',
      },
    })
  }

  return feedbacks
}

function isCurrentUser(feedback: Feedback, currentUserName?: string): boolean {
  if (!currentUserName || !feedback.user) return false
  return feedback.user.name === currentUserName
}

function getDisplayName(feedback: Feedback, currentUserName?: string): string {
  if (isCurrentUser(feedback, currentUserName)) {
    return 'You'
  }
  return feedback.user?.name || 'Unknown'
}

// Test data factory
function createMockFeedback(overrides: Partial<Feedback> = {}): Feedback {
  return {
    id: 'fb-1',
    feedbackType: 'REVISION_REQUEST',
    comment: 'Please fix this',
    createdAt: '2024-01-15T10:30:00.000Z',
    revisionNumber: 1,
    targetSection: 'summary',
    user: {
      name: 'John Reviewer',
      role: 'ADMIN',
    },
    ...overrides,
  }
}

describe('Feedback Timeline Logic', () => {
  describe('groupFeedbacksByRevision', () => {
    it('groups feedbacks by revision number', () => {
      const feedbacks = [
        createMockFeedback({ id: 'fb-1', revisionNumber: 1 }),
        createMockFeedback({ id: 'fb-2', revisionNumber: 1 }),
        createMockFeedback({ id: 'fb-3', revisionNumber: 2 }),
      ]

      const groups = groupFeedbacksByRevision(feedbacks, 2)

      expect(groups).toHaveLength(2)
      expect(groups.find((g) => g.revision === 1)?.feedbackCount).toBe(2)
      expect(groups.find((g) => g.revision === 2)?.feedbackCount).toBe(1)
    })

    it('marks current revision as latest', () => {
      const feedbacks = [
        createMockFeedback({ id: 'fb-1', revisionNumber: 1 }),
        createMockFeedback({ id: 'fb-2', revisionNumber: 2 }),
      ]

      const groups = groupFeedbacksByRevision(feedbacks, 2)

      expect(groups.find((g) => g.revision === 2)?.isLatest).toBe(true)
      expect(groups.find((g) => g.revision === 1)?.isLatest).toBe(false)
    })

    it('detects approvals in revision', () => {
      const feedbacks = [
        createMockFeedback({ id: 'fb-1', feedbackType: 'REVISION_REQUEST' }),
        createMockFeedback({ id: 'fb-2', feedbackType: 'APPROVED' }),
      ]

      const groups = groupFeedbacksByRevision(feedbacks, 1)

      expect(groups[0].hasApproval).toBe(true)
    })

    it('counts unique sections', () => {
      const feedbacks = [
        createMockFeedback({ id: 'fb-1', targetSection: 'summary' }),
        createMockFeedback({ id: 'fb-2', targetSection: 'results' }),
        createMockFeedback({ id: 'fb-3', targetSection: 'summary' }),
      ]

      const groups = groupFeedbacksByRevision(feedbacks, 1)

      expect(groups[0].sectionCount).toBe(2)
    })

    it('sorts revisions in descending order', () => {
      const feedbacks = [
        createMockFeedback({ id: 'fb-1', revisionNumber: 1 }),
        createMockFeedback({ id: 'fb-2', revisionNumber: 3 }),
        createMockFeedback({ id: 'fb-3', revisionNumber: 2 }),
      ]

      const groups = groupFeedbacksByRevision(feedbacks, 3)

      expect(groups.map((g) => g.revision)).toEqual([3, 2, 1])
    })
  })

  describe('groupFeedbacksBySection', () => {
    it('groups feedbacks by section', () => {
      const feedbacks = [
        createMockFeedback({ id: 'fb-1', targetSection: 'summary' }),
        createMockFeedback({ id: 'fb-2', targetSection: 'results' }),
      ]

      const groups = groupFeedbacksBySection(feedbacks)

      expect(groups).toHaveLength(2)
      expect(groups.find((g) => g.section === 'summary')).toBeDefined()
      expect(groups.find((g) => g.section === 'results')).toBeDefined()
    })

    it('uses correct section labels', () => {
      const feedbacks = [createMockFeedback({ targetSection: 'results' })]

      const groups = groupFeedbacksBySection(feedbacks)

      expect(groups[0].label).toBe('Calibration Results')
    })

    it('defaults to general section when no section specified', () => {
      const feedbacks = [createMockFeedback({ targetSection: undefined })]

      const groups = groupFeedbacksBySection(feedbacks)

      expect(groups[0].section).toBe('general')
      expect(groups[0].label).toBe('General')
    })
  })

  describe('formatRevisionLabel', () => {
    it('shows transition format by default', () => {
      expect(formatRevisionLabel(1)).toBe('Revision 1 → 2')
      expect(formatRevisionLabel(3)).toBe('Revision 3 → 4')
    })

    it('shows version format when transition disabled', () => {
      expect(formatRevisionLabel(1, false)).toBe('Version 1')
      expect(formatRevisionLabel(3, false)).toBe('Version 3')
    })
  })

  describe('formatFeedbackCount', () => {
    it('uses singular for 1', () => {
      expect(formatFeedbackCount(1)).toBe('1 feedback')
    })

    it('uses plural for > 1', () => {
      expect(formatFeedbackCount(2)).toBe('2 feedbacks')
      expect(formatFeedbackCount(10)).toBe('10 feedbacks')
    })

    it('uses plural for 0', () => {
      expect(formatFeedbackCount(0)).toBe('0 feedbacks')
    })
  })

  describe('formatSectionCount', () => {
    it('uses singular for 1', () => {
      expect(formatSectionCount(1)).toBe('1 section')
    })

    it('uses plural for > 1', () => {
      expect(formatSectionCount(2)).toBe('2 sections')
    })
  })

  describe('formatRevisionCycles', () => {
    it('uses singular for 1', () => {
      expect(formatRevisionCycles(1)).toBe('1 revision cycle')
    })

    it('uses plural for > 1', () => {
      expect(formatRevisionCycles(2)).toBe('2 revision cycles')
    })
  })

  describe('getRevisionStatusLabel', () => {
    it('returns "Latest" for current revision in default variant', () => {
      const group: RevisionGroup = {
        revision: 2,
        feedbacks: [],
        isLatest: true,
        hasApproval: false,
        feedbackCount: 0,
        sectionCount: 0,
      }

      expect(getRevisionStatusLabel(group, 'default')).toBe('Latest')
    })

    it('returns "Current" for current revision in sidebar variant', () => {
      const group: RevisionGroup = {
        revision: 2,
        feedbacks: [],
        isLatest: true,
        hasApproval: false,
        feedbackCount: 0,
        sectionCount: 0,
      }

      expect(getRevisionStatusLabel(group, 'sidebar')).toBe('Current')
    })

    it('returns empty string for non-current revision', () => {
      const group: RevisionGroup = {
        revision: 1,
        feedbacks: [],
        isLatest: false,
        hasApproval: false,
        feedbackCount: 0,
        sectionCount: 0,
      }

      expect(getRevisionStatusLabel(group, 'default')).toBe('')
    })
  })

  describe('getApprovalLabel', () => {
    it('returns approval label when approved', () => {
      const group: RevisionGroup = {
        revision: 1,
        feedbacks: [],
        isLatest: true,
        hasApproval: true,
        feedbackCount: 0,
        sectionCount: 0,
      }

      expect(getApprovalLabel(group)).toBe('✓ Approved')
    })

    it('returns empty string when not approved', () => {
      const group: RevisionGroup = {
        revision: 1,
        feedbacks: [],
        isLatest: true,
        hasApproval: false,
        feedbackCount: 0,
        sectionCount: 0,
      }

      expect(getApprovalLabel(group)).toBe('')
    })
  })

  describe('convertCustomerFeedback', () => {
    it('converts section feedbacks to feedback items', () => {
      const customerFeedback: CustomerFeedback = {
        notes: '',
        sectionFeedbacks: [
          { section: 'summary', comment: 'Wrong date' },
          { section: 'results', comment: 'Missing value' },
        ],
        generalNotes: null,
        customerName: 'Acme Corp',
        customerEmail: 'acme@test.com',
        requestedAt: '2024-01-15T10:30:00.000Z',
        revision: 1,
      }

      const feedbacks = convertCustomerFeedback(customerFeedback)

      expect(feedbacks).toHaveLength(2)
      expect(feedbacks[0].comment).toBe('Wrong date')
      expect(feedbacks[0].targetSection).toBe('summary')
      expect(feedbacks[1].comment).toBe('Missing value')
    })

    it('includes general notes as separate feedback', () => {
      const customerFeedback: CustomerFeedback = {
        notes: '',
        sectionFeedbacks: [],
        generalNotes: 'Please review overall',
        customerName: 'Test Corp',
        customerEmail: 'test@test.com',
        requestedAt: '2024-01-15T10:30:00.000Z',
        revision: 1,
      }

      const feedbacks = convertCustomerFeedback(customerFeedback)

      expect(feedbacks).toHaveLength(1)
      expect(feedbacks[0].comment).toBe('Please review overall')
      expect(feedbacks[0].targetSection).toBe('general')
    })

    it('sets customer name on feedbacks', () => {
      const customerFeedback: CustomerFeedback = {
        notes: '',
        sectionFeedbacks: [{ section: 'summary', comment: 'Fix this' }],
        generalNotes: null,
        customerName: 'Customer Corp',
        customerEmail: 'customer@test.com',
        requestedAt: '2024-01-15T10:30:00.000Z',
        revision: 1,
      }

      const feedbacks = convertCustomerFeedback(customerFeedback)

      expect(feedbacks[0].user?.name).toBe('Customer Corp')
      expect(feedbacks[0].user?.role).toBe('CUSTOMER')
    })
  })

  describe('getDisplayName', () => {
    it('returns "You" for current user', () => {
      const feedback = createMockFeedback({ user: { name: 'John Doe', role: 'ENGINEER' } })

      expect(getDisplayName(feedback, 'John Doe')).toBe('You')
    })

    it('returns user name for other users', () => {
      const feedback = createMockFeedback({ user: { name: 'Jane Smith', role: 'ADMIN' } })

      expect(getDisplayName(feedback, 'John Doe')).toBe('Jane Smith')
    })

    it('returns "Unknown" when no user', () => {
      const feedback = createMockFeedback({ user: undefined })

      expect(getDisplayName(feedback)).toBe('Unknown')
    })
  })

  describe('empty state handling', () => {
    it('returns empty array when no feedbacks', () => {
      const groups = groupFeedbacksByRevision([], 1)

      expect(groups).toHaveLength(0)
    })

    it('handles empty section groups', () => {
      const groups = groupFeedbacksBySection([])

      expect(groups).toHaveLength(0)
    })
  })
})
