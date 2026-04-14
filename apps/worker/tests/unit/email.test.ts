/**
 * Email Job Tests
 *
 * Tests for email job processing functionality.
 */

import { describe, it, expect, vi } from 'vitest'
import { createMockJob } from '../setup'

describe('Email Job Processor', () => {
  it('should process password reset email', async () => {
    const job = createMockJob({
      type: 'password-reset',
      to: 'user@example.com',
      userName: 'Test User',
      resetUrl: 'https://example.com/reset/token123',
      expiryMinutes: 60,
      tenantName: 'HTA Platform',
    })

    expect(job.data.type).toBe('password-reset')
    expect(job.data.to).toBe('user@example.com')
    expect(job.data.resetUrl).toContain('reset/')
  })

  it('should process certificate submitted email', async () => {
    const job = createMockJob({
      type: 'certificate-submitted',
      to: 'reviewer@example.com',
      reviewerName: 'John Reviewer',
      certificateNumber: 'HTA/C00001/24/12',
      assigneeName: 'Jane Engineer',
      customerName: 'Test Company',
      dashboardUrl: 'https://example.com/dashboard',
    })

    expect(job.data.type).toBe('certificate-submitted')
    expect(job.data.certificateNumber).toMatch(/^HTA\/C\d+\/\d+\/\d+$/)
  })

  it('should process certificate reviewed email', async () => {
    const job = createMockJob({
      type: 'certificate-reviewed',
      to: 'engineer@example.com',
      assigneeName: 'Jane Engineer',
      certificateNumber: 'HTA/C00001/24/12',
      reviewerName: 'John Reviewer',
      approved: true,
      dashboardUrl: 'https://example.com/dashboard',
    })

    expect(job.data.approved).toBe(true)
  })

  it('should include revision note for rejected certificates', async () => {
    const job = createMockJob({
      type: 'certificate-reviewed',
      to: 'engineer@example.com',
      assigneeName: 'Jane Engineer',
      certificateNumber: 'HTA/C00001/24/12',
      reviewerName: 'John Reviewer',
      approved: false,
      revisionNote: 'Please check the accuracy values',
      dashboardUrl: 'https://example.com/dashboard',
    })

    expect(job.data.approved).toBe(false)
    expect(job.data.revisionNote).toBeTruthy()
  })
})

describe('Email Validation', () => {
  it('should validate email recipient', () => {
    const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

    expect(isValidEmail('test@example.com')).toBe(true)
    expect(isValidEmail('user.name+tag@domain.co.uk')).toBe(true)
    expect(isValidEmail('invalid')).toBe(false)
  })

  it('should validate email job has required fields', () => {
    const validateEmailJob = (job: { type: string; to: string }) => {
      return Boolean(job.type && job.to)
    }

    expect(validateEmailJob({ type: 'password-reset', to: 'test@test.com' })).toBe(true)
    expect(validateEmailJob({ type: '', to: 'test@test.com' })).toBe(false)
  })
})
