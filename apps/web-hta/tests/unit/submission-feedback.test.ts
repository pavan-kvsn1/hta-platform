import { describe, expect, it } from 'vitest'
import * as finalizeSection from '../../src/components/forms/FinalizeSection'

type SubmissionModalState = {
  title: string
  message: string
  type: 'success' | 'warning' | 'error'
}

const getSubmissionModalState = (
  finalizeSection as unknown as {
    getSubmissionModalState?: (result: { emailQueued?: boolean; warning?: string }) => SubmissionModalState
  }
).getSubmissionModalState

describe('certificate submission feedback', () => {
  it('shows a warning confirmation when the reviewer email was not queued', () => {
    expect(getSubmissionModalState).toBeTypeOf('function')

    expect(getSubmissionModalState!({
      emailQueued: false,
      warning: 'Reviewer email could not be queued.',
    })).toEqual({
      title: 'Submitted — Email Not Sent',
      message: 'Reviewer email could not be queued.',
      type: 'warning',
    })
  })
})
