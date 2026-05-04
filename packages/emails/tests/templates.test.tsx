import { describe, it, expect } from 'vitest'
import { render } from '@react-email/components'
import * as React from 'react'
import { SecurityAlert } from '../src/templates/SecurityAlert.js'
import { MasterInstrumentChange } from '../src/templates/MasterInstrumentChange.js'
import { CustomerApproval } from '../src/templates/CustomerApproval.js'
import { CertificateReviewed } from '../src/templates/CertificateReviewed.js'
import { CertificateSubmitted } from '../src/templates/CertificateSubmitted.js'
import { PasswordReset } from '../src/templates/PasswordReset.js'
import { StaffActivation } from '../src/templates/StaffActivation.js'
import { CustomerReview } from '../src/templates/CustomerReview.js'
import { CustomerReviewRegistered } from '../src/templates/CustomerReviewRegistered.js'
import { CustomerAuthorizedToken } from '../src/templates/CustomerAuthorizedToken.js'
import { CustomerAuthorizedRegistered } from '../src/templates/CustomerAuthorizedRegistered.js'
import { ReviewerCustomerExpired } from '../src/templates/ReviewerCustomerExpired.js'
import { OfflineCodesExpiry } from '../src/templates/OfflineCodesExpiry.js'

// Helper to render a React Email component to HTML string
async function renderHtml(element: React.ReactElement): Promise<string> {
  return render(element)
}

describe('SecurityAlert template', () => {
  const baseProps = {
    recipientName: 'Admin User',
    alertType: 'SUSPICIOUS_LOGIN' as const,
    severity: 'HIGH' as const,
    summary: 'Multiple failed login attempts detected from unusual IP address.',
    details: [
      { label: 'IP Address', value: '192.168.1.100' },
      { label: 'Location', value: 'Unknown' },
    ],
    timestamp: '2026-05-04T12:00:00Z',
    dashboardUrl: 'https://app.example.com/security',
  }

  it('renders without errors', async () => {
    const html = await renderHtml(<SecurityAlert {...baseProps} />)
    expect(html).toBeTruthy()
    expect(html).toContain('<!DOCTYPE html')
  })

  it('displays the recipient name', async () => {
    const html = await renderHtml(<SecurityAlert {...baseProps} />)
    expect(html).toContain('Admin User')
  })

  it('displays severity banner text', async () => {
    const html = await renderHtml(<SecurityAlert {...baseProps} />)
    // React renders adjacent text nodes with <!-- --> comments between them
    expect(html).toContain('HIGH')
    expect(html).toContain('SEVERITY SECURITY ALERT')
  })

  it('displays alert title based on alertType', async () => {
    const html = await renderHtml(<SecurityAlert {...baseProps} />)
    expect(html).toContain('Suspicious Login Attempt')
  })

  it('displays summary text', async () => {
    const html = await renderHtml(<SecurityAlert {...baseProps} />)
    expect(html).toContain('Multiple failed login attempts')
  })

  it('displays detail labels and values', async () => {
    const html = await renderHtml(<SecurityAlert {...baseProps} />)
    expect(html).toContain('IP Address')
    expect(html).toContain('192.168.1.100')
  })

  it('displays timestamp', async () => {
    const html = await renderHtml(<SecurityAlert {...baseProps} />)
    expect(html).toContain('2026-05-04T12:00:00Z')
  })

  it('contains dashboard URL link', async () => {
    const html = await renderHtml(<SecurityAlert {...baseProps} />)
    expect(html).toContain('https://app.example.com/security')
    expect(html).toContain('View Security Dashboard')
  })

  it('renders CSP_VIOLATION alert type', async () => {
    const html = await renderHtml(
      <SecurityAlert {...baseProps} alertType="CSP_VIOLATION" />
    )
    expect(html).toContain('Content Security Policy Violation')
  })

  it('renders BRUTE_FORCE alert type', async () => {
    const html = await renderHtml(
      <SecurityAlert {...baseProps} alertType="BRUTE_FORCE" />
    )
    expect(html).toContain('Brute Force Attack Detected')
  })

  it('renders CRITICAL severity', async () => {
    const html = await renderHtml(
      <SecurityAlert {...baseProps} severity="CRITICAL" />
    )
    expect(html).toContain('CRITICAL')
    expect(html).toContain('SEVERITY SECURITY ALERT')
  })

  it('renders with empty details array', async () => {
    const html = await renderHtml(
      <SecurityAlert {...baseProps} details={[]} />
    )
    expect(html).toContain('Alert Details')
  })
})

describe('MasterInstrumentChange template', () => {
  const baseProps = {
    recipientName: 'Jane Admin',
    actorName: 'John Doe',
    action: 'modified' as const,
    assetNumber: 'AST-12345',
    description: 'Fluke 8846A Digital Multimeter',
    timestamp: '2026-05-04T10:30:00Z',
    dashboardUrl: 'https://app.example.com/instruments',
  }

  it('renders without errors', async () => {
    const html = await renderHtml(<MasterInstrumentChange {...baseProps} />)
    expect(html).toBeTruthy()
  })

  it('displays recipient name', async () => {
    const html = await renderHtml(<MasterInstrumentChange {...baseProps} />)
    expect(html).toContain('Jane Admin')
  })

  it('displays actor name', async () => {
    const html = await renderHtml(<MasterInstrumentChange {...baseProps} />)
    expect(html).toContain('John Doe')
  })

  it('displays asset number', async () => {
    const html = await renderHtml(<MasterInstrumentChange {...baseProps} />)
    expect(html).toContain('AST-12345')
  })

  it('displays description', async () => {
    const html = await renderHtml(<MasterInstrumentChange {...baseProps} />)
    expect(html).toContain('Fluke 8846A Digital Multimeter')
  })

  it('displays dashboard URL', async () => {
    const html = await renderHtml(<MasterInstrumentChange {...baseProps} />)
    expect(html).toContain('https://app.example.com/instruments')
  })

  it('renders created action', async () => {
    const html = await renderHtml(
      <MasterInstrumentChange {...baseProps} action="created" />
    )
    expect(html).toContain('Created')
  })

  it('renders deleted action with special styling text', async () => {
    const html = await renderHtml(
      <MasterInstrumentChange {...baseProps} action="deleted" />
    )
    expect(html).toContain('Deleted')
  })

  it('renders optional changeDetails when provided', async () => {
    const html = await renderHtml(
      <MasterInstrumentChange {...baseProps} changeDetails="Description, Serial Number" />
    )
    expect(html).toContain('Changed Fields')
    expect(html).toContain('Description, Serial Number')
  })

  it('omits changeDetails section when not provided', async () => {
    const html = await renderHtml(<MasterInstrumentChange {...baseProps} />)
    expect(html).not.toContain('Changed Fields')
  })
})

describe('CustomerApproval template', () => {
  const approvedProps = {
    recipientName: 'Staff User',
    certificateNumber: 'CERT-2026-001',
    customerName: 'Acme Corp',
    approverName: 'Bob Manager',
    status: 'approved' as const,
    dashboardUrl: 'https://app.example.com/cert/001',
  }

  it('renders approved state without errors', async () => {
    const html = await renderHtml(<CustomerApproval {...approvedProps} />)
    expect(html).toBeTruthy()
  })

  it('displays cert number in approved state', async () => {
    const html = await renderHtml(<CustomerApproval {...approvedProps} />)
    expect(html).toContain('CERT-2026-001')
  })

  it('displays customer name in approved state', async () => {
    const html = await renderHtml(<CustomerApproval {...approvedProps} />)
    expect(html).toContain('Acme Corp')
  })

  it('shows approved heading text', async () => {
    const html = await renderHtml(<CustomerApproval {...approvedProps} />)
    expect(html).toContain('Approved Certificate')
  })

  it('shows View Certificate button in approved state', async () => {
    const html = await renderHtml(<CustomerApproval {...approvedProps} />)
    expect(html).toContain('View Certificate')
  })

  it('renders rejected state', async () => {
    const html = await renderHtml(
      <CustomerApproval {...approvedProps} status="rejected" />
    )
    expect(html).toContain('Requested Changes')
    expect(html).toContain('Review Feedback')
  })

  it('displays rejection note when status is rejected', async () => {
    const html = await renderHtml(
      <CustomerApproval
        {...approvedProps}
        status="rejected"
        rejectionNote="Calibration values seem off for the 10V range."
      />
    )
    expect(html).toContain('Customer Feedback')
    expect(html).toContain('Calibration values seem off for the 10V range.')
  })

  it('does not display rejection note in approved state', async () => {
    const html = await renderHtml(
      <CustomerApproval {...approvedProps} rejectionNote="Some note" />
    )
    expect(html).not.toContain('Customer Feedback')
  })

  it('displays approver name', async () => {
    const html = await renderHtml(<CustomerApproval {...approvedProps} />)
    expect(html).toContain('Bob Manager')
  })

  it('contains dashboard URL', async () => {
    const html = await renderHtml(<CustomerApproval {...approvedProps} />)
    expect(html).toContain('https://app.example.com/cert/001')
  })
})

describe('CertificateReviewed template', () => {
  const approvedProps = {
    assigneeName: 'Engineer Alice',
    certificateNumber: 'CERT-2026-010',
    reviewerName: 'Reviewer Bob',
    status: 'approved' as const,
    dashboardUrl: 'https://app.example.com/cert/010',
  }

  it('renders approved state', async () => {
    const html = await renderHtml(<CertificateReviewed {...approvedProps} />)
    expect(html).toBeTruthy()
    expect(html).toContain('Approved')
  })

  it('displays cert number', async () => {
    const html = await renderHtml(<CertificateReviewed {...approvedProps} />)
    expect(html).toContain('CERT-2026-010')
  })

  it('displays assignee and reviewer names', async () => {
    const html = await renderHtml(<CertificateReviewed {...approvedProps} />)
    expect(html).toContain('Engineer Alice')
    expect(html).toContain('Reviewer Bob')
  })

  it('shows View Certificate button in approved state', async () => {
    const html = await renderHtml(<CertificateReviewed {...approvedProps} />)
    expect(html).toContain('View Certificate')
  })

  it('renders revision state', async () => {
    const html = await renderHtml(
      <CertificateReviewed {...approvedProps} status="revision" />
    )
    expect(html).toContain('Requires Revision')
    expect(html).toContain('Make Revisions')
  })

  it('displays revision note when in revision state', async () => {
    const html = await renderHtml(
      <CertificateReviewed
        {...approvedProps}
        status="revision"
        revisionNote="Please recalibrate at the 100mA point."
      />
    )
    expect(html).toContain('Revision Notes')
    expect(html).toContain('Please recalibrate at the 100mA point.')
  })

  it('does not display revision note in approved state', async () => {
    const html = await renderHtml(
      <CertificateReviewed {...approvedProps} revisionNote="Some note" />
    )
    expect(html).not.toContain('Revision Notes')
  })

  it('contains dashboard URL', async () => {
    const html = await renderHtml(<CertificateReviewed {...approvedProps} />)
    expect(html).toContain('https://app.example.com/cert/010')
  })
})

describe('CertificateSubmitted template', () => {
  const baseProps = {
    reviewerName: 'Reviewer Carol',
    certificateNumber: 'CERT-2026-020',
    assigneeName: 'Engineer Dave',
    dashboardUrl: 'https://app.example.com/cert/020',
  }

  it('renders without errors', async () => {
    const html = await renderHtml(<CertificateSubmitted {...baseProps} />)
    expect(html).toBeTruthy()
  })

  it('displays cert number', async () => {
    const html = await renderHtml(<CertificateSubmitted {...baseProps} />)
    expect(html).toContain('CERT-2026-020')
  })

  it('displays reviewer name (recipient)', async () => {
    const html = await renderHtml(<CertificateSubmitted {...baseProps} />)
    expect(html).toContain('Reviewer Carol')
  })

  it('displays assignee (submitter) name', async () => {
    const html = await renderHtml(<CertificateSubmitted {...baseProps} />)
    expect(html).toContain('Engineer Dave')
  })

  it('contains dashboard URL', async () => {
    const html = await renderHtml(<CertificateSubmitted {...baseProps} />)
    expect(html).toContain('https://app.example.com/cert/020')
    expect(html).toContain('Review Certificate')
  })

  it('displays customer name when provided', async () => {
    const html = await renderHtml(
      <CertificateSubmitted {...baseProps} customerName="Widgets Inc" />
    )
    expect(html).toContain('Widgets Inc')
  })

  it('omits customer row when customerName not provided', async () => {
    const html = await renderHtml(<CertificateSubmitted {...baseProps} />)
    // The "Customer:" label should not appear when customerName is absent
    expect(html).not.toContain('Customer:')
  })
})

describe('PasswordReset template', () => {
  const baseProps = {
    userName: 'Test User',
    resetUrl: 'https://app.example.com/reset?token=abc123',
  }

  it('renders without errors', async () => {
    const html = await renderHtml(<PasswordReset {...baseProps} />)
    expect(html).toBeTruthy()
  })

  it('displays user name', async () => {
    const html = await renderHtml(<PasswordReset {...baseProps} />)
    expect(html).toContain('Test User')
  })

  it('contains reset URL link', async () => {
    const html = await renderHtml(<PasswordReset {...baseProps} />)
    expect(html).toContain('https://app.example.com/reset?token=abc123')
    expect(html).toContain('Reset Password')
  })

  it('shows default 60 minute expiry', async () => {
    const html = await renderHtml(<PasswordReset {...baseProps} />)
    // React renders interpolated values with <!-- --> comments between adjacent text nodes
    expect(html).toContain('60')
    expect(html).toContain('minutes')
  })

  it('shows custom expiry minutes', async () => {
    const html = await renderHtml(
      <PasswordReset {...baseProps} expiryMinutes={30} />
    )
    expect(html).toContain('30')
    expect(html).toContain('minutes')
  })

  it('passes tenant name to layout when provided', async () => {
    const html = await renderHtml(
      <PasswordReset {...baseProps} tenantName="Custom Lab" />
    )
    expect(html).toContain('Custom Lab')
  })

  it('renders without tenantName (uses default branding)', async () => {
    const html = await renderHtml(<PasswordReset {...baseProps} />)
    expect(html).toContain('HTA Instrumentation')
  })
})

describe('StaffActivation template', () => {
  const baseProps = {
    userName: 'New Staff',
    activationUrl: 'https://app.example.com/activate?token=xyz789',
  }

  it('renders without errors', async () => {
    const html = await renderHtml(<StaffActivation {...baseProps} />)
    expect(html).toBeTruthy()
  })

  it('displays user name', async () => {
    const html = await renderHtml(<StaffActivation {...baseProps} />)
    expect(html).toContain('New Staff')
  })

  it('contains activation URL link', async () => {
    const html = await renderHtml(<StaffActivation {...baseProps} />)
    expect(html).toContain('https://app.example.com/activate?token=xyz789')
    expect(html).toContain('Activate Your Account')
  })

  it('shows 24-hour expiry note', async () => {
    const html = await renderHtml(<StaffActivation {...baseProps} />)
    expect(html).toContain('24 hours')
  })

  it('lists feature items', async () => {
    const html = await renderHtml(<StaffActivation {...baseProps} />)
    expect(html).toContain('calibration certificates')
  })

  it('passes tenant name to layout when provided', async () => {
    const html = await renderHtml(
      <StaffActivation {...baseProps} tenantName="Custom Lab" />
    )
    expect(html).toContain('Custom Lab')
  })

  it('uses default branding without tenantName', async () => {
    const html = await renderHtml(<StaffActivation {...baseProps} />)
    expect(html).toContain('HTA Instrumentation')
  })
})

describe('CustomerReview template', () => {
  const baseProps = {
    customerName: 'Client Smith',
    certificateNumber: 'CERT-2026-030',
    instrumentDescription: 'Keysight 34461A Multimeter',
    reviewUrl: 'https://app.example.com/review?token=tok123',
  }

  it('renders without errors', async () => {
    const html = await renderHtml(<CustomerReview {...baseProps} />)
    expect(html).toBeTruthy()
  })

  it('displays customer name', async () => {
    const html = await renderHtml(<CustomerReview {...baseProps} />)
    expect(html).toContain('Client Smith')
  })

  it('displays cert number', async () => {
    const html = await renderHtml(<CustomerReview {...baseProps} />)
    expect(html).toContain('CERT-2026-030')
  })

  it('displays instrument description', async () => {
    const html = await renderHtml(<CustomerReview {...baseProps} />)
    expect(html).toContain('Keysight 34461A Multimeter')
  })

  it('contains review URL', async () => {
    const html = await renderHtml(<CustomerReview {...baseProps} />)
    expect(html).toContain('https://app.example.com/review?token=tok123')
    expect(html).toContain('Review Certificate')
  })

  it('shows 48-hour expiry notice', async () => {
    const html = await renderHtml(<CustomerReview {...baseProps} />)
    expect(html).toContain('48 hours')
  })
})

describe('CustomerReviewRegistered template', () => {
  const baseProps = {
    customerName: 'Registered Client',
    certificateNumber: 'CERT-2026-031',
    instrumentDescription: 'Fluke 87V Multimeter',
    loginUrl: 'https://app.example.com/login',
  }

  it('renders without errors', async () => {
    const html = await renderHtml(<CustomerReviewRegistered {...baseProps} />)
    expect(html).toBeTruthy()
  })

  it('displays customer name', async () => {
    const html = await renderHtml(<CustomerReviewRegistered {...baseProps} />)
    expect(html).toContain('Registered Client')
  })

  it('displays cert number', async () => {
    const html = await renderHtml(<CustomerReviewRegistered {...baseProps} />)
    expect(html).toContain('CERT-2026-031')
  })

  it('displays instrument description', async () => {
    const html = await renderHtml(<CustomerReviewRegistered {...baseProps} />)
    expect(html).toContain('Fluke 87V Multimeter')
  })

  it('contains login URL with Log In text', async () => {
    const html = await renderHtml(<CustomerReviewRegistered {...baseProps} />)
    expect(html).toContain('https://app.example.com/login')
    expect(html).toContain('Log In to Review')
  })

  it('mentions dashboard access', async () => {
    const html = await renderHtml(<CustomerReviewRegistered {...baseProps} />)
    expect(html).toContain('dashboard')
  })
})

describe('CustomerAuthorizedToken template', () => {
  const baseProps = {
    customerName: 'Token Customer',
    certificateNumber: 'CERT-2026-040',
    instrumentDescription: 'Pressure Gauge PG-100',
    downloadUrl: 'https://app.example.com/download?token=dl123',
  }

  it('renders without errors', async () => {
    const html = await renderHtml(<CustomerAuthorizedToken {...baseProps} />)
    expect(html).toBeTruthy()
  })

  it('displays customer name', async () => {
    const html = await renderHtml(<CustomerAuthorizedToken {...baseProps} />)
    expect(html).toContain('Token Customer')
  })

  it('displays cert number', async () => {
    const html = await renderHtml(<CustomerAuthorizedToken {...baseProps} />)
    expect(html).toContain('CERT-2026-040')
  })

  it('displays instrument description', async () => {
    const html = await renderHtml(<CustomerAuthorizedToken {...baseProps} />)
    expect(html).toContain('Pressure Gauge PG-100')
  })

  it('contains download URL', async () => {
    const html = await renderHtml(<CustomerAuthorizedToken {...baseProps} />)
    expect(html).toContain('https://app.example.com/download?token=dl123')
    expect(html).toContain('Download Certificate')
  })

  it('shows authorized heading', async () => {
    const html = await renderHtml(<CustomerAuthorizedToken {...baseProps} />)
    expect(html).toContain('Has Been Authorized')
  })

  it('shows 30-day expiry notice', async () => {
    const html = await renderHtml(<CustomerAuthorizedToken {...baseProps} />)
    expect(html).toContain('30 days')
  })
})

describe('CustomerAuthorizedRegistered template', () => {
  const baseProps = {
    customerName: 'Registered Cust',
    certificateNumber: 'CERT-2026-041',
    instrumentDescription: 'Torque Wrench TW-50',
    loginUrl: 'https://app.example.com/login',
  }

  it('renders without errors', async () => {
    const html = await renderHtml(<CustomerAuthorizedRegistered {...baseProps} />)
    expect(html).toBeTruthy()
  })

  it('displays customer name', async () => {
    const html = await renderHtml(<CustomerAuthorizedRegistered {...baseProps} />)
    expect(html).toContain('Registered Cust')
  })

  it('displays cert number', async () => {
    const html = await renderHtml(<CustomerAuthorizedRegistered {...baseProps} />)
    expect(html).toContain('CERT-2026-041')
  })

  it('displays instrument description', async () => {
    const html = await renderHtml(<CustomerAuthorizedRegistered {...baseProps} />)
    expect(html).toContain('Torque Wrench TW-50')
  })

  it('contains login URL', async () => {
    const html = await renderHtml(<CustomerAuthorizedRegistered {...baseProps} />)
    expect(html).toContain('https://app.example.com/login')
    expect(html).toContain('Log In to Download')
  })

  it('shows authorized heading', async () => {
    const html = await renderHtml(<CustomerAuthorizedRegistered {...baseProps} />)
    expect(html).toContain('Has Been Authorized')
  })

  it('mentions dashboard access', async () => {
    const html = await renderHtml(<CustomerAuthorizedRegistered {...baseProps} />)
    expect(html).toContain('dashboard')
  })
})

describe('ReviewerCustomerExpired template', () => {
  const baseProps = {
    reviewerName: 'Reviewer Raj',
    certificateNumber: 'CERT-2026-050',
    customerName: 'Expired Corp',
    instrumentDescription: 'Calibrator CAL-200',
    dashboardUrl: 'https://app.example.com/cert/050',
  }

  it('renders without errors', async () => {
    const html = await renderHtml(<ReviewerCustomerExpired {...baseProps} />)
    expect(html).toBeTruthy()
  })

  it('displays reviewer name', async () => {
    const html = await renderHtml(<ReviewerCustomerExpired {...baseProps} />)
    expect(html).toContain('Reviewer Raj')
  })

  it('displays cert number', async () => {
    const html = await renderHtml(<ReviewerCustomerExpired {...baseProps} />)
    expect(html).toContain('CERT-2026-050')
  })

  it('displays customer name', async () => {
    const html = await renderHtml(<ReviewerCustomerExpired {...baseProps} />)
    expect(html).toContain('Expired Corp')
  })

  it('displays instrument description', async () => {
    const html = await renderHtml(<ReviewerCustomerExpired {...baseProps} />)
    expect(html).toContain('Calibrator CAL-200')
  })

  it('shows expired status', async () => {
    const html = await renderHtml(<ReviewerCustomerExpired {...baseProps} />)
    expect(html).toContain('Review Expired')
  })

  it('mentions 48-hour window', async () => {
    const html = await renderHtml(<ReviewerCustomerExpired {...baseProps} />)
    expect(html).toContain('48-hour')
  })

  it('contains dashboard URL', async () => {
    const html = await renderHtml(<ReviewerCustomerExpired {...baseProps} />)
    expect(html).toContain('https://app.example.com/cert/050')
    expect(html).toContain('View Certificate')
  })
})

describe('OfflineCodesExpiry template', () => {
  const baseProps = {
    engineerName: 'Field Engineer',
    loginUrl: 'https://app.example.com/codes',
  }

  it('renders without errors', async () => {
    const html = await renderHtml(<OfflineCodesExpiry {...baseProps} />)
    expect(html).toBeTruthy()
  })

  it('displays engineer name', async () => {
    const html = await renderHtml(<OfflineCodesExpiry {...baseProps} />)
    expect(html).toContain('Field Engineer')
  })

  it('contains login URL', async () => {
    const html = await renderHtml(<OfflineCodesExpiry {...baseProps} />)
    expect(html).toContain('https://app.example.com/codes')
    expect(html).toContain('View New Codes')
  })

  it('mentions codes expired', async () => {
    const html = await renderHtml(<OfflineCodesExpiry {...baseProps} />)
    expect(html).toContain('expired')
  })

  it('mentions codes are shown only once', async () => {
    const html = await renderHtml(<OfflineCodesExpiry {...baseProps} />)
    expect(html).toContain('shown only once')
  })

  it('passes tenant name to layout when provided', async () => {
    const html = await renderHtml(
      <OfflineCodesExpiry {...baseProps} tenantName="Custom Lab" />
    )
    expect(html).toContain('Custom Lab')
  })

  it('uses default branding without tenantName', async () => {
    const html = await renderHtml(<OfflineCodesExpiry {...baseProps} />)
    expect(html).toContain('HTA Instrumentation')
  })
})
