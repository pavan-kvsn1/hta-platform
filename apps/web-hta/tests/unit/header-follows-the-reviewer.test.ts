/**
 * The name beside a certificate, when the reviewer is changed.
 *
 * The list of reviewers was private to the picker, so the picker was the only thing on
 * the page that could turn a reviewer's id into a name. The header used a name captured
 * when the certificate loaded and never looked again - so choosing somebody else
 * changed the dropdown and left the header naming the person who had been replaced,
 * until a reload. Two places on one screen, disagreeing about who was answerable.
 */
import { describe, expect, it } from 'vitest'

import { reviewerNameFrom, type Reviewer } from '@/lib/hooks/useReviewers'

const reviewer = (id: string, name: string): Reviewer => ({
  id,
  name,
  email: `${id}@hta.test`,
  role: 'ENGINEER',
  hasSignature: true,
  pendingReviews: 0,
})

const reviewers = [reviewer('rev-1', 'Prakash'), reviewer('rev-2', 'Sandeep')]

describe('the name the header shows', () => {
  it('follows the reviewer the form currently holds', () => {
    expect(reviewerNameFrom(reviewers, 'rev-2', 'Prakash')).toBe('Sandeep')
  })

  it('shows nobody once the reviewer is cleared', () => {
    // Even though the certificate was loaded with one; the form is what is being saved.
    expect(reviewerNameFrom(reviewers, null, 'Prakash')).toBeNull()
  })

  it('keeps the loaded name while the list is still in flight', () => {
    // The header must not blank out for the second it takes to fetch.
    expect(reviewerNameFrom([], 'rev-1', 'Prakash')).toBe('Prakash')
  })

  it('keeps the loaded name for a reviewer who has since left the list', () => {
    // Deactivated since the certificate was written: the certificate still records who
    // it was assigned to, and that is the honest thing to print.
    expect(reviewerNameFrom(reviewers, 'rev-gone', 'Retired Reviewer')).toBe('Retired Reviewer')
  })

  it('shows nothing rather than an id it cannot resolve', () => {
    expect(reviewerNameFrom(reviewers, 'rev-gone')).toBeNull()
  })
})
