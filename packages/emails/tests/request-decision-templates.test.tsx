import { render } from '@react-email/components'
import { describe, expect, it } from 'vitest'
import * as React from 'react'
import {
  InternalRequestDecision,
  type InternalRequestDecisionProps,
} from '../src/templates/InternalRequestDecision.js'
import {
  CustomerRequestDecision,
  type CustomerRequestDecisionProps,
} from '../src/templates/CustomerRequestDecision.js'

const internalBase = {
  recipientName: 'Engineer One',
  requestDate: '31 Aug 2026',
  certificateId: 'cert-1',
  certificateNumber: 'HTA/C00001/26/08',
  requestedItems: ['Results', 'Conclusion'],
  originalReason: 'Correction required',
  portalUrl: 'https://hta-calibration.com',
} as const

describe('InternalRequestDecision', () => {
  const cases = [
    ['SECTION_UNLOCK', 'APPROVED', 'Section Unlock Approved', 'Edit Certificate'],
    ['SECTION_UNLOCK', 'REJECTED', 'Section Unlock Rejected', 'View Certificate'],
    ['FIELD_CHANGE', 'APPROVED', 'Field Change Request Approved', 'Review Certificate'],
    ['FIELD_CHANGE', 'REJECTED', 'Field Change Request Rejected', 'Review Certificate'],
    ['OFFLINE_CODE_REQUEST', 'APPROVED', 'Offline Code Card Approved', 'View Offline Codes'],
    ['OFFLINE_CODE_REQUEST', 'REJECTED', 'Offline Code Card Request Rejected', 'View Offline Code Requests'],
    ['DESKTOP_VPN_REQUEST', 'APPROVED', 'Desktop VPN Access Approved', 'View VPN Setup Details'],
    ['DESKTOP_VPN_REQUEST', 'REJECTED', 'Desktop VPN Access Request Rejected', 'View VPN Access Request'],
  ] as const

  it.each(cases)('renders %s %s with its approved heading and action', async (requestType, decision, heading, action) => {
    const decisionProps = decision === 'REJECTED'
      ? { decision, adminNote: 'Insufficient evidence' }
      : { decision, adminNote: 'Reviewed' }
    const props = { ...internalBase, requestType, ...decisionProps } as InternalRequestDecisionProps

    const html = await render(<InternalRequestDecision {...props} />)

    expect(html).toContain(heading)
    expect(html).toContain(action)
    expect(html).toContain(decision === 'APPROVED' ? 'Approved' : 'Rejected')
    if (decision === 'REJECTED') expect(html).toContain('Insufficient evidence')
  })

  it('escapes user-provided detail text', async () => {
    const html = await render(
      <InternalRequestDecision
        {...internalBase}
        requestType="SECTION_UNLOCK"
        decision="REJECTED"
        adminNote={'<script>alert("x")</script>'}
      />
    )

    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('<script>alert')
  })
})

const customerBase = {
  recipientName: 'Requester One',
  companyName: 'Acme Calibration',
  requestDate: '31 Aug 2026',
  newUserName: 'New User',
  newUserEmail: 'new.user@example.com',
  previousPocName: 'Previous POC',
  newPocName: 'New POC',
  portalUrl: 'https://hta-calibration.com',
} as const

describe('CustomerRequestDecision', () => {
  const cases: Array<{
    props: CustomerRequestDecisionProps
    heading: string
    marker: string
  }> = [
    {
      props: { ...customerBase, requestType: 'USER_ADDITION', decision: 'APPROVED' },
      heading: 'User Addition Approved',
      marker: 'Manage Team',
    },
    {
      props: { ...customerBase, requestType: 'USER_ADDITION', decision: 'REJECTED', rejectionReason: 'Role not justified' },
      heading: 'User Addition Request Rejected',
      marker: 'Role not justified',
    },
    {
      props: { ...customerBase, requestType: 'POC_CHANGE', decision: 'APPROVED', audience: 'REQUESTER' },
      heading: 'POC Change Approved',
      marker: 'View Team Settings',
    },
    {
      props: { ...customerBase, recipientName: 'Previous POC', requestType: 'POC_CHANGE', decision: 'APPROVED', audience: 'PREVIOUS_POC' },
      heading: 'Your POC Role Has Changed',
      marker: 'ordinary account access remains unchanged',
    },
    {
      props: { ...customerBase, recipientName: 'New POC', requestType: 'POC_CHANGE', decision: 'APPROVED', audience: 'NEW_POC' },
      heading: 'You Are Now the Primary Point of Contact',
      marker: 'Open Customer Portal',
    },
    {
      props: { ...customerBase, requestType: 'POC_CHANGE', decision: 'REJECTED', rejectionReason: 'No authorization' },
      heading: 'POC Change Request Rejected',
      marker: 'No authorization',
    },
    {
      props: { ...customerBase, requestType: 'ACCOUNT_DELETION', decision: 'APPROVED', wasPoc: true },
      heading: 'Account Deletion Completed',
      marker: 'POC position is now vacant',
    },
    {
      props: { ...customerBase, requestType: 'ACCOUNT_DELETION', decision: 'REJECTED', rejectionReason: 'Records review pending' },
      heading: 'Account Deletion Request Rejected',
      marker: 'Records review pending',
    },
    {
      props: { ...customerBase, requestType: 'DATA_EXPORT', decision: 'APPROVED', adminNote: 'We will contact you securely' },
      heading: 'Data Export Request Approved',
      marker: 'approved for preparation',
    },
    {
      props: { ...customerBase, requestType: 'DATA_EXPORT', decision: 'REJECTED', rejectionReason: 'Scope is incomplete' },
      heading: 'Data Export Request Rejected',
      marker: 'Scope is incomplete',
    },
  ]

  it.each(cases)('renders $heading', async ({ props, heading, marker }) => {
    const html = await render(<CustomerRequestDecision {...props} />)

    expect(html).toContain(heading)
    expect(html).toContain(marker)
  })

  it('does not render a portal CTA for approved account deletion', async () => {
    const html = await render(
      <CustomerRequestDecision
        {...customerBase}
        requestType="ACCOUNT_DELETION"
        decision="APPROVED"
        wasPoc={false}
      />
    )

    expect(html).not.toContain('Open Account Settings')
  })

  it('does not claim an approved data export is ready or attached', async () => {
    const html = await render(
      <CustomerRequestDecision
        {...customerBase}
        requestType="DATA_EXPORT"
        decision="APPROVED"
      />
    )

    expect(html).toContain('approved for preparation')
    expect(html).not.toContain('file is ready')
    expect(html).not.toContain('attached')
  })
})
