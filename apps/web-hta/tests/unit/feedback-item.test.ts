/**
 * Feedback Item Logic Unit Tests
 *
 * Tests for feedback item rendering logic:
 * - User display name handling (You vs actual name)
 * - User initials extraction
 * - Feedback type labels and styling
 * - Timeline connector logic
 * - Reviewer edits display logic
 * - Empty/null value handling
 *
 * Self-contained version testing logic without React rendering
 */
import { describe, it, expect } from 'vitest'

// Types
type FeedbackType =
  | 'REVISION_REQUEST'
  | 'APPROVED'
  | 'REJECTED'
  | 'ENGINEER_RESPONSE'
  | 'CUSTOMER_REVISION_REQUEST'
  | 'CUSTOMER_APPROVED'
  | 'GENERAL_COMMENT'
  | string

type UserRole = 'ADMIN' | 'ENGINEER' | 'CUSTOMER' | string

interface FeedbackUser {
  name: string
  role: UserRole
}

interface ReviewerEdit {
  field: string
  fieldLabel: string
  previousValue: string | null
  newValue: string
  reason?: string
}

interface Feedback {
  id: string
  feedbackType: FeedbackType
  comment: string | null
  createdAt: string
  revisionNumber?: number
  targetSection?: string
  user: FeedbackUser
  reviewerEdits?: ReviewerEdit[]
}

interface FeedbackConfig {
  label: string
  bgClass: string
  borderClass: string
  textClass: string
  iconColor: string
}

// Feedback type configuration
const FEEDBACK_CONFIG: Record<string, FeedbackConfig> = {
  REVISION_REQUEST: {
    label: 'Revision Request',
    bgClass: 'bg-orange-50',
    borderClass: 'border-orange-100',
    textClass: 'text-orange-800',
    iconColor: 'text-orange-500',
  },
  APPROVED: {
    label: 'Approved',
    bgClass: 'bg-green-50',
    borderClass: 'border-green-100',
    textClass: 'text-green-800',
    iconColor: 'text-green-500',
  },
  REJECTED: {
    label: 'Rejected',
    bgClass: 'bg-red-50',
    borderClass: 'border-red-100',
    textClass: 'text-red-800',
    iconColor: 'text-red-500',
  },
  ENGINEER_RESPONSE: {
    label: 'Response',
    bgClass: 'bg-blue-50',
    borderClass: 'border-blue-100',
    textClass: 'text-blue-800',
    iconColor: 'text-blue-500',
  },
  CUSTOMER_REVISION_REQUEST: {
    label: 'Customer Revision',
    bgClass: 'bg-purple-50',
    borderClass: 'border-purple-100',
    textClass: 'text-purple-800',
    iconColor: 'text-purple-500',
  },
  CUSTOMER_APPROVED: {
    label: 'Customer Approved',
    bgClass: 'bg-teal-50',
    borderClass: 'border-teal-100',
    textClass: 'text-teal-800',
    iconColor: 'text-teal-500',
  },
  GENERAL_COMMENT: {
    label: 'Comment',
    bgClass: 'bg-gray-50',
    borderClass: 'border-gray-100',
    textClass: 'text-gray-800',
    iconColor: 'text-gray-500',
  },
}

// Logic functions
function getFeedbackTypeLabel(feedbackType: FeedbackType): string {
  return FEEDBACK_CONFIG[feedbackType]?.label ?? feedbackType
}

function getFeedbackTypeConfig(feedbackType: FeedbackType): FeedbackConfig {
  return (
    FEEDBACK_CONFIG[feedbackType] ?? {
      label: feedbackType,
      bgClass: 'bg-gray-50',
      borderClass: 'border-gray-100',
      textClass: 'text-gray-800',
      iconColor: 'text-gray-500',
    }
  )
}

function getDisplayName(userName: string, currentUserName?: string): string {
  if (!userName || userName.trim() === '') {
    return 'Unknown'
  }

  if (currentUserName && userName.toLowerCase().trim() === currentUserName.toLowerCase().trim()) {
    return 'You'
  }

  return userName
}

function getUserInitials(userName: string): string {
  if (!userName || userName.trim() === '') {
    return '?'
  }

  const parts = userName.trim().split(/\s+/)

  if (parts.length === 1) {
    return parts[0].charAt(0).toUpperCase()
  }

  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
}

function shouldShowTimelineConnector(showTimeline: boolean, isLast: boolean): boolean {
  return showTimeline && !isLast
}

function hasReviewerEdits(feedback: Feedback): boolean {
  return !!feedback.reviewerEdits && feedback.reviewerEdits.length > 0
}

function getVariantClasses(variant: 'default' | 'compact'): string {
  return variant === 'compact' ? 'p-2' : 'p-3'
}

function hasComment(feedback: Feedback): boolean {
  return !!feedback.comment && feedback.comment.trim() !== ''
}

// Create mock feedback helper
function createMockFeedback(overrides: Partial<Feedback> = {}): Feedback {
  return {
    id: 'fb-1',
    feedbackType: 'REVISION_REQUEST',
    comment: 'Please update the calibration data',
    createdAt: '2024-01-15T10:30:00.000Z',
    revisionNumber: 1,
    targetSection: 'results',
    user: {
      name: 'John Reviewer',
      role: 'ADMIN',
    },
    ...overrides,
  }
}

describe('FeedbackItem Logic', () => {
  describe('getFeedbackTypeLabel', () => {
    it('returns "Revision Request" for REVISION_REQUEST', () => {
      expect(getFeedbackTypeLabel('REVISION_REQUEST')).toBe('Revision Request')
    })

    it('returns "Approved" for APPROVED', () => {
      expect(getFeedbackTypeLabel('APPROVED')).toBe('Approved')
    })

    it('returns "Rejected" for REJECTED', () => {
      expect(getFeedbackTypeLabel('REJECTED')).toBe('Rejected')
    })

    it('returns "Response" for ENGINEER_RESPONSE', () => {
      expect(getFeedbackTypeLabel('ENGINEER_RESPONSE')).toBe('Response')
    })

    it('returns "Customer Revision" for CUSTOMER_REVISION_REQUEST', () => {
      expect(getFeedbackTypeLabel('CUSTOMER_REVISION_REQUEST')).toBe('Customer Revision')
    })

    it('returns "Customer Approved" for CUSTOMER_APPROVED', () => {
      expect(getFeedbackTypeLabel('CUSTOMER_APPROVED')).toBe('Customer Approved')
    })

    it('returns "Comment" for GENERAL_COMMENT', () => {
      expect(getFeedbackTypeLabel('GENERAL_COMMENT')).toBe('Comment')
    })

    it('returns feedback type as-is for unknown types', () => {
      expect(getFeedbackTypeLabel('UNKNOWN_TYPE')).toBe('UNKNOWN_TYPE')
    })
  })

  describe('getFeedbackTypeConfig', () => {
    it('returns orange styling for REVISION_REQUEST', () => {
      const config = getFeedbackTypeConfig('REVISION_REQUEST')
      expect(config.bgClass).toBe('bg-orange-50')
      expect(config.borderClass).toBe('border-orange-100')
    })

    it('returns green styling for APPROVED', () => {
      const config = getFeedbackTypeConfig('APPROVED')
      expect(config.bgClass).toBe('bg-green-50')
      expect(config.borderClass).toBe('border-green-100')
    })

    it('returns red styling for REJECTED', () => {
      const config = getFeedbackTypeConfig('REJECTED')
      expect(config.bgClass).toBe('bg-red-50')
      expect(config.textClass).toBe('text-red-800')
    })

    it('returns blue styling for ENGINEER_RESPONSE', () => {
      const config = getFeedbackTypeConfig('ENGINEER_RESPONSE')
      expect(config.bgClass).toBe('bg-blue-50')
      expect(config.textClass).toBe('text-blue-800')
    })

    it('returns purple styling for CUSTOMER_REVISION_REQUEST', () => {
      const config = getFeedbackTypeConfig('CUSTOMER_REVISION_REQUEST')
      expect(config.bgClass).toBe('bg-purple-50')
      expect(config.textClass).toBe('text-purple-800')
    })

    it('returns default gray styling for unknown types', () => {
      const config = getFeedbackTypeConfig('UNKNOWN_TYPE')
      expect(config.bgClass).toBe('bg-gray-50')
      expect(config.textClass).toBe('text-gray-800')
    })
  })

  describe('getDisplayName', () => {
    it('shows "You" for current user', () => {
      expect(getDisplayName('John Doe', 'John Doe')).toBe('You')
    })

    it('shows actual name for different user', () => {
      expect(getDisplayName('John Doe', 'Jane Smith')).toBe('John Doe')
    })

    it('handles case-insensitive comparison', () => {
      expect(getDisplayName('JOHN DOE', 'john doe')).toBe('You')
      expect(getDisplayName('john doe', 'JOHN DOE')).toBe('You')
    })

    it('handles trimmed comparison', () => {
      expect(getDisplayName('  John Doe  ', 'John Doe')).toBe('You')
      expect(getDisplayName('John Doe', '  John Doe  ')).toBe('You')
    })

    it('shows "Unknown" for empty name', () => {
      expect(getDisplayName('')).toBe('Unknown')
      expect(getDisplayName('   ')).toBe('Unknown')
    })

    it('shows actual name when no current user provided', () => {
      expect(getDisplayName('John Doe')).toBe('John Doe')
    })
  })

  describe('getUserInitials', () => {
    it('returns two initials for full name', () => {
      expect(getUserInitials('John Doe')).toBe('JD')
      expect(getUserInitials('Jane Smith')).toBe('JS')
    })

    it('returns single initial for single name', () => {
      expect(getUserInitials('John')).toBe('J')
    })

    it('handles multiple names (uses first and last)', () => {
      expect(getUserInitials('John Michael Doe')).toBe('JD')
      expect(getUserInitials('Mary Jane Watson')).toBe('MW')
    })

    it('returns uppercase initials', () => {
      expect(getUserInitials('john doe')).toBe('JD')
    })

    it('returns "?" for empty name', () => {
      expect(getUserInitials('')).toBe('?')
      expect(getUserInitials('   ')).toBe('?')
    })

    it('handles extra whitespace', () => {
      expect(getUserInitials('  John   Doe  ')).toBe('JD')
    })
  })

  describe('shouldShowTimelineConnector', () => {
    it('returns true when showTimeline is true and not last', () => {
      expect(shouldShowTimelineConnector(true, false)).toBe(true)
    })

    it('returns false when isLast is true', () => {
      expect(shouldShowTimelineConnector(true, true)).toBe(false)
    })

    it('returns false when showTimeline is false', () => {
      expect(shouldShowTimelineConnector(false, false)).toBe(false)
      expect(shouldShowTimelineConnector(false, true)).toBe(false)
    })
  })

  describe('hasReviewerEdits', () => {
    it('returns true when feedback has reviewer edits', () => {
      const feedback = createMockFeedback({
        reviewerEdits: [
          {
            field: 'calibrationDueDate',
            fieldLabel: 'Calibration Due Date',
            previousValue: '2024-01-01',
            newValue: '2024-06-01',
            reason: 'Extended warranty',
          },
        ],
      })
      expect(hasReviewerEdits(feedback)).toBe(true)
    })

    it('returns false when feedback has no reviewer edits', () => {
      const feedback = createMockFeedback()
      expect(hasReviewerEdits(feedback)).toBe(false)
    })

    it('returns false when reviewer edits is empty array', () => {
      const feedback = createMockFeedback({ reviewerEdits: [] })
      expect(hasReviewerEdits(feedback)).toBe(false)
    })
  })

  describe('getVariantClasses', () => {
    it('returns "p-2" for compact variant', () => {
      expect(getVariantClasses('compact')).toBe('p-2')
    })

    it('returns "p-3" for default variant', () => {
      expect(getVariantClasses('default')).toBe('p-3')
    })
  })

  describe('hasComment', () => {
    it('returns true when comment is present', () => {
      const feedback = createMockFeedback({ comment: 'Some comment' })
      expect(hasComment(feedback)).toBe(true)
    })

    it('returns false when comment is null', () => {
      const feedback = createMockFeedback({ comment: null })
      expect(hasComment(feedback)).toBe(false)
    })

    it('returns false when comment is empty string', () => {
      const feedback = createMockFeedback({ comment: '' })
      expect(hasComment(feedback)).toBe(false)
    })

    it('returns false when comment is only whitespace', () => {
      const feedback = createMockFeedback({ comment: '   ' })
      expect(hasComment(feedback)).toBe(false)
    })
  })

  describe('FEEDBACK_CONFIG completeness', () => {
    it('has configuration for all known feedback types', () => {
      const knownTypes: FeedbackType[] = [
        'REVISION_REQUEST',
        'APPROVED',
        'REJECTED',
        'ENGINEER_RESPONSE',
        'CUSTOMER_REVISION_REQUEST',
        'CUSTOMER_APPROVED',
        'GENERAL_COMMENT',
      ]

      for (const type of knownTypes) {
        const config = FEEDBACK_CONFIG[type]
        expect(config).toBeDefined()
        expect(config.label).toBeDefined()
        expect(config.bgClass).toBeDefined()
        expect(config.borderClass).toBeDefined()
        expect(config.textClass).toBeDefined()
        expect(config.iconColor).toBeDefined()
      }
    })

    it('all configs have unique labels', () => {
      const labels = Object.values(FEEDBACK_CONFIG).map((c) => c.label)
      const uniqueLabels = new Set(labels)
      expect(uniqueLabels.size).toBe(labels.length)
    })
  })

  describe('createMockFeedback helper', () => {
    it('creates default feedback with expected values', () => {
      const feedback = createMockFeedback()

      expect(feedback.id).toBe('fb-1')
      expect(feedback.feedbackType).toBe('REVISION_REQUEST')
      expect(feedback.comment).toBe('Please update the calibration data')
      expect(feedback.user.name).toBe('John Reviewer')
      expect(feedback.user.role).toBe('ADMIN')
    })

    it('allows overriding values', () => {
      const feedback = createMockFeedback({
        id: 'fb-custom',
        feedbackType: 'APPROVED',
        user: { name: 'Jane Smith', role: 'ENGINEER' },
      })

      expect(feedback.id).toBe('fb-custom')
      expect(feedback.feedbackType).toBe('APPROVED')
      expect(feedback.user.name).toBe('Jane Smith')
    })
  })
})
