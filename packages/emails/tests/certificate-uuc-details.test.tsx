import { render } from '@react-email/components'
import * as React from 'react'
import { describe, expect, it } from 'vitest'
import {
  CertificateReviewed,
  CertificateSubmitted,
  CustomerApproval,
  CustomerAuthorizedRegistered,
  CustomerAuthorizedToken,
  CustomerReview,
  CustomerReviewRegistered,
  ReviewerCustomerExpired,
} from '../src/templates/index.js'

const uucDetails = {
  description: 'Digital Pressure Gauge',
  make: 'Wika',
  model: 'CPG1500',
  serialNumber: 'SN-90817',
  instrumentId: 'UUC-204',
  location: 'Utility Bay 3',
  machineName: 'Compressor Line A',
}

const commonProps = {
  recipientName: 'Recipient',
  reviewerName: 'Reviewer',
  assigneeName: 'Engineer',
  customerName: 'Acme Industries',
  approverName: 'Customer Approver',
  certificateNumber: 'HTA-2026-0042',
  instrumentDescription: uucDetails.description,
  status: 'approved',
  approved: true,
  dashboardUrl: 'https://example.com/dashboard',
  reviewUrl: 'https://example.com/review',
  loginUrl: 'https://example.com/login',
  downloadUrl: 'https://example.com/download',
  uucDetails,
}

const certificateTemplates = [
  ['certificate submitted', CertificateSubmitted],
  ['certificate reviewed', CertificateReviewed],
  ['customer approval result', CustomerApproval],
  ['customer token review', CustomerReview],
  ['customer registered review', CustomerReviewRegistered],
  ['customer token authorization', CustomerAuthorizedToken],
  ['customer registered authorization', CustomerAuthorizedRegistered],
  ['customer review expiry', ReviewerCustomerExpired],
] as const

describe('certificate lifecycle UUC details', () => {
  it.each(certificateTemplates)('includes all populated UUC details in the %s email', async (_name, Template) => {
    const element = React.createElement(
      Template as React.ComponentType<Record<string, unknown>>,
      commonProps,
    )
    const html = await render(element)

    expect(html).toContain('UUC Details')
    expect(html).toContain('Digital Pressure Gauge')
    expect(html).toContain('Wika')
    expect(html).toContain('CPG1500')
    expect(html).toContain('SN-90817')
    expect(html).toContain('UUC-204')
    expect(html).toContain('Utility Bay 3')
    expect(html).toContain('Compressor Line A')
  })

  it('omits empty UUC fields from certificate emails', async () => {
    const html = await render(
      React.createElement(
        CustomerApproval as React.ComponentType<Record<string, unknown>>,
        {
          ...commonProps,
          uucDetails: {
            description: 'Digital Pressure Gauge',
            make: '',
            model: null,
          },
        },
      ),
    )

    expect(html).toContain('Description')
    expect(html).toContain('Digital Pressure Gauge')
    expect(html).not.toContain('Make:')
    expect(html).not.toContain('Model:')
  })
})
