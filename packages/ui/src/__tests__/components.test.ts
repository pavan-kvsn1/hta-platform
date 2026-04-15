/**
 * Unit tests for @hta/ui components utilities
 */
import { describe, it, expect } from 'vitest'
import { cn, getStatusClasses, statusVariants } from '../components'

describe('cn (class name merger)', () => {
  it('should merge simple class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar')
  })

  it('should handle conditional classes', () => {
    const isActive = true
    const isDisabled = false
    expect(cn('base', isActive && 'active', isDisabled && 'disabled')).toBe('base active')
  })

  it('should handle undefined and null values', () => {
    expect(cn('base', undefined, null, 'end')).toBe('base end')
  })

  it('should merge Tailwind classes and resolve conflicts', () => {
    // twMerge should keep the last conflicting class
    expect(cn('p-4', 'p-2')).toBe('p-2')
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500')
  })

  it('should handle array inputs', () => {
    expect(cn(['foo', 'bar'])).toBe('foo bar')
  })

  it('should handle object inputs', () => {
    expect(cn({ foo: true, bar: false, baz: true })).toBe('foo baz')
  })

  it('should handle mixed inputs', () => {
    expect(cn('base', ['array'], { object: true })).toBe('base array object')
  })

  it('should return empty string for no inputs', () => {
    expect(cn()).toBe('')
  })
})

describe('statusVariants', () => {
  it('should have all expected status variants', () => {
    expect(statusVariants).toHaveProperty('draft')
    expect(statusVariants).toHaveProperty('pending')
    expect(statusVariants).toHaveProperty('submitted')
    expect(statusVariants).toHaveProperty('review')
    expect(statusVariants).toHaveProperty('approved')
    expect(statusVariants).toHaveProperty('rejected')
  })

  it('should have string values for all variants', () => {
    Object.values(statusVariants).forEach(value => {
      expect(typeof value).toBe('string')
      expect(value.length).toBeGreaterThan(0)
    })
  })
})

describe('getStatusClasses', () => {
  it('should return draft classes for draft status', () => {
    expect(getStatusClasses('draft')).toBe(statusVariants.draft)
    expect(getStatusClasses('DRAFT')).toBe(statusVariants.draft)
    expect(getStatusClasses('Draft')).toBe(statusVariants.draft)
  })

  it('should return pending classes for pending status', () => {
    expect(getStatusClasses('pending')).toBe(statusVariants.pending)
    expect(getStatusClasses('PENDING')).toBe(statusVariants.pending)
  })

  it('should return submitted classes for submitted status', () => {
    expect(getStatusClasses('submitted')).toBe(statusVariants.submitted)
    expect(getStatusClasses('submit')).toBe(statusVariants.submitted)
    expect(getStatusClasses('SUBMITTED')).toBe(statusVariants.submitted)
  })

  it('should return review classes for review status', () => {
    expect(getStatusClasses('review')).toBe(statusVariants.review)
    expect(getStatusClasses('in_review')).toBe(statusVariants.review)
    expect(getStatusClasses('REVIEW')).toBe(statusVariants.review)
  })

  it('should return approved classes for approved status', () => {
    expect(getStatusClasses('approved')).toBe(statusVariants.approved)
    expect(getStatusClasses('APPROVED')).toBe(statusVariants.approved)
  })

  it('should return approved classes for authorized status', () => {
    expect(getStatusClasses('authorized')).toBe(statusVariants.approved)
    expect(getStatusClasses('AUTHORIZED')).toBe(statusVariants.approved)
  })

  it('should return rejected classes for rejected status', () => {
    expect(getStatusClasses('rejected')).toBe(statusVariants.rejected)
    expect(getStatusClasses('REJECTED')).toBe(statusVariants.rejected)
  })

  it('should return draft classes as default for unknown status', () => {
    expect(getStatusClasses('unknown')).toBe(statusVariants.draft)
    expect(getStatusClasses('random')).toBe(statusVariants.draft)
    expect(getStatusClasses('')).toBe(statusVariants.draft)
  })

  it('should handle underscores in status names', () => {
    expect(getStatusClasses('in_draft')).toBe(statusVariants.draft)
    expect(getStatusClasses('pending_review')).toBe(statusVariants.pending)
  })
})
