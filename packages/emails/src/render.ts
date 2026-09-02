/**
 * Email Rendering Utilities
 *
 * Server-side rendering of email templates to HTML.
 */

import { render } from '@react-email/components'
import * as React from 'react'
import {
  PasswordReset,
  StaffActivation,
  CustomerActivation,
  CertificateSubmitted,
  CertificateReviewed,
  CustomerApproval,
  CustomerReview,
  CustomerReviewRegistered,
  CustomerAuthorizedRegistered,
  CustomerAuthorizedToken,
  MasterInstrumentChange,
  SecurityAlert,
  ReviewerCustomerExpired,
  OfflineCodesExpiry,
  InternalRequestDecision,
  CustomerRequestDecision,
  getInternalRequestDecisionSubject,
  getCustomerRequestDecisionSubject,
  type InternalRequestDecisionSubjectInput,
  type CustomerRequestDecisionSubjectInput,
} from './templates/index.js'

export type EmailTemplate =
  | 'password-reset'
  | 'staff-activation'
  | 'customer-activation'
  | 'certificate-submitted'
  | 'certificate-reviewed'
  | 'customer-approval'
  | 'customer-review'
  | 'customer-review-registered'
  | 'customer-authorized-registered'
  | 'customer-authorized-token'
  | 'master-instrument-change'
  | 'security-alert'
  | 'reviewer-customer-expired'
  | 'offline-codes-expiry'
  | 'internal-request-decision'
  | 'customer-request-decision'

export interface RenderEmailOptions {
  template: EmailTemplate
  props: Record<string, unknown>
}

/**
 * Render an email template to HTML string
 */
export async function renderEmail(options: RenderEmailOptions): Promise<{
  html: string
  subject: string
}> {
  const { template, props } = options

  let element: React.ReactElement
  let subject: string

  switch (template) {
    case 'password-reset':
      element = React.createElement(PasswordReset, props as unknown as React.ComponentProps<typeof PasswordReset>)
      subject = 'Reset Your Password'
      break

    case 'staff-activation':
      element = React.createElement(StaffActivation, props as unknown as React.ComponentProps<typeof StaffActivation>)
      subject = 'Activate Your Account'
      break

    case 'customer-activation':
      element = React.createElement(CustomerActivation, props as unknown as React.ComponentProps<typeof CustomerActivation>)
      subject = 'Activate Your HTA Calibration Portal Account'
      break

    case 'certificate-submitted':
      element = React.createElement(CertificateSubmitted, props as unknown as React.ComponentProps<typeof CertificateSubmitted>)
      subject = `Certificate ${(props as { certificateNumber?: string }).certificateNumber || ''} Submitted for Review`
      break

    case 'certificate-reviewed':
      element = React.createElement(CertificateReviewed, props as unknown as React.ComponentProps<typeof CertificateReviewed>)
      subject = `Certificate ${(props as { certificateNumber?: string }).certificateNumber || ''} Review Complete`
      break

    case 'customer-approval':
      element = React.createElement(CustomerApproval, props as unknown as React.ComponentProps<typeof CustomerApproval>)
      subject = `Customer ${(props as { status?: string }).status === 'approved' ? 'Approved' : 'Requested Changes'} - Certificate ${(props as { certificateNumber?: string }).certificateNumber || ''}`
      break

    case 'customer-review':
      element = React.createElement(CustomerReview, props as unknown as React.ComponentProps<typeof CustomerReview>)
      subject = `Certificate ${(props as { certificateNumber?: string }).certificateNumber || ''} Ready for Review`
      break

    case 'customer-review-registered':
      element = React.createElement(CustomerReviewRegistered, props as unknown as React.ComponentProps<typeof CustomerReviewRegistered>)
      subject = `Certificate ${(props as { certificateNumber?: string }).certificateNumber || ''} Ready for Review`
      break

    case 'customer-authorized-registered':
      element = React.createElement(CustomerAuthorizedRegistered, props as unknown as React.ComponentProps<typeof CustomerAuthorizedRegistered>)
      subject = `Certificate ${(props as { certificateNumber?: string }).certificateNumber || ''} Authorized`
      break

    case 'customer-authorized-token':
      element = React.createElement(CustomerAuthorizedToken, props as unknown as React.ComponentProps<typeof CustomerAuthorizedToken>)
      subject = `Certificate ${(props as { certificateNumber?: string }).certificateNumber || ''} Authorized - Download Available`
      break

    case 'master-instrument-change':
      element = React.createElement(MasterInstrumentChange, props as unknown as React.ComponentProps<typeof MasterInstrumentChange>)
      subject = `Security Alert: Master Instrument ${(props as { action?: string }).action || 'Changed'} - ${(props as { assetNumber?: string }).assetNumber || ''}`
      break

    case 'security-alert':
      element = React.createElement(SecurityAlert, props as unknown as React.ComponentProps<typeof SecurityAlert>)
      subject = `[${(props as { severity?: string }).severity || 'HIGH'}] Security Alert: ${(props as { alertType?: string }).alertType?.replace(/_/g, ' ') || 'Suspicious Activity'}`
      break

    case 'reviewer-customer-expired':
      element = React.createElement(ReviewerCustomerExpired, props as unknown as React.ComponentProps<typeof ReviewerCustomerExpired>)
      subject = `Customer Review Expired - Certificate ${(props as { certificateNumber?: string }).certificateNumber || ''}`
      break

    case 'offline-codes-expiry':
      element = React.createElement(OfflineCodesExpiry, props as unknown as React.ComponentProps<typeof OfflineCodesExpiry>)
      subject = 'Your Offline Access Codes Have Expired'
      break

    case 'internal-request-decision':
      element = React.createElement(InternalRequestDecision, props as unknown as React.ComponentProps<typeof InternalRequestDecision>)
      subject = getInternalRequestDecisionSubject(props as unknown as InternalRequestDecisionSubjectInput)
      break

    case 'customer-request-decision':
      element = React.createElement(CustomerRequestDecision, props as unknown as React.ComponentProps<typeof CustomerRequestDecision>)
      subject = getCustomerRequestDecisionSubject(props as unknown as CustomerRequestDecisionSubjectInput)
      break

    default:
      throw new Error(`Unknown email template: ${template}`)
  }

  const html = await render(element)

  return { html, subject }
}

/**
 * Get the subject line for an email template
 */
export function getEmailSubject(template: EmailTemplate, props: Record<string, unknown>): string {
  switch (template) {
    case 'password-reset':
      return 'Reset Your Password'
    case 'staff-activation':
      return 'Activate Your Account'
    case 'customer-activation':
      return 'Activate Your HTA Calibration Portal Account'
    case 'certificate-submitted':
      return `Certificate ${props.certificateNumber || ''} Submitted for Review`
    case 'certificate-reviewed':
      return `Certificate ${props.certificateNumber || ''} Review Complete`
    case 'customer-approval':
      return `Customer ${props.status === 'approved' ? 'Approved' : 'Requested Changes'} - Certificate ${props.certificateNumber || ''}`
    case 'customer-review':
      return `Certificate ${props.certificateNumber || ''} Ready for Review`
    case 'customer-review-registered':
      return `Certificate ${props.certificateNumber || ''} Ready for Review`
    case 'customer-authorized-registered':
      return `Certificate ${props.certificateNumber || ''} Authorized`
    case 'customer-authorized-token':
      return `Certificate ${props.certificateNumber || ''} Authorized - Download Available`
    case 'master-instrument-change':
      return `Security Alert: Master Instrument ${props.action || 'Changed'} - ${props.assetNumber || ''}`
    case 'security-alert':
      return `[${props.severity || 'HIGH'}] Security Alert: ${(props.alertType as string)?.replace(/_/g, ' ') || 'Suspicious Activity'}`
    case 'reviewer-customer-expired':
      return `Customer Review Expired - Certificate ${props.certificateNumber || ''}`
    case 'offline-codes-expiry':
      return 'Your Offline Access Codes Have Expired'
    case 'internal-request-decision':
      return getInternalRequestDecisionSubject(props as unknown as InternalRequestDecisionSubjectInput)
    case 'customer-request-decision':
      return getCustomerRequestDecisionSubject(props as unknown as CustomerRequestDecisionSubjectInput)
    default:
      return 'HTA Calibration Notification'
  }
}
