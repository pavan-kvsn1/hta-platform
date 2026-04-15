import { describe, it, expect } from 'vitest'
import * as emails from '../src/index'

describe('@hta/emails exports', () => {
  describe('rendering utilities', () => {
    it('exports renderEmail function', () => {
      expect(emails.renderEmail).toBeDefined()
      expect(typeof emails.renderEmail).toBe('function')
    })

    it('exports getEmailSubject function', () => {
      expect(emails.getEmailSubject).toBeDefined()
      expect(typeof emails.getEmailSubject).toBe('function')
    })
  })

  describe('components', () => {
    it('exports Layout component', () => {
      expect(emails.Layout).toBeDefined()
      expect(typeof emails.Layout).toBe('function')
    })

    it('exports Button component', () => {
      expect(emails.Button).toBeDefined()
      expect(typeof emails.Button).toBe('function')
    })
  })

  describe('templates', () => {
    it('exports PasswordReset template', () => {
      expect(emails.PasswordReset).toBeDefined()
      expect(typeof emails.PasswordReset).toBe('function')
    })

    it('exports StaffActivation template', () => {
      expect(emails.StaffActivation).toBeDefined()
      expect(typeof emails.StaffActivation).toBe('function')
    })

    it('exports CertificateSubmitted template', () => {
      expect(emails.CertificateSubmitted).toBeDefined()
      expect(typeof emails.CertificateSubmitted).toBe('function')
    })

    it('exports CertificateReviewed template', () => {
      expect(emails.CertificateReviewed).toBeDefined()
      expect(typeof emails.CertificateReviewed).toBe('function')
    })

    it('exports CustomerApproval template', () => {
      expect(emails.CustomerApproval).toBeDefined()
      expect(typeof emails.CustomerApproval).toBe('function')
    })

    it('exports CustomerReview template', () => {
      expect(emails.CustomerReview).toBeDefined()
      expect(typeof emails.CustomerReview).toBe('function')
    })
  })
})
