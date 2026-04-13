import { Text, Section } from '@react-email/components'
import * as React from 'react'
import { Layout, Button } from './components'

interface CustomerApprovalProps {
  recipientName: string
  certificateNumber: string
  customerName: string
  approverName: string
  status: 'approved' | 'rejected'
  rejectionNote?: string
  dashboardUrl: string
}

export function CustomerApproval({
  recipientName,
  certificateNumber,
  customerName,
  approverName,
  status,
  rejectionNote,
  dashboardUrl,
}: CustomerApprovalProps) {
  const isApproved = status === 'approved'

  return (
    <Layout
      preview={`Customer ${isApproved ? 'approved' : 'requested changes to'} certificate ${certificateNumber}`}
    >
      <Text style={heading}>
        Customer {isApproved ? 'Approved Certificate' : 'Requested Changes'}
      </Text>

      <Text style={paragraph}>
        Hello {recipientName},
      </Text>

      <Text style={paragraph}>
        {isApproved
          ? `Great news! ${approverName} from ${customerName} has approved calibration certificate ${certificateNumber}.`
          : `${approverName} from ${customerName} has requested changes to calibration certificate ${certificateNumber}.`}
      </Text>

      <Section style={isApproved ? approvedBox : rejectedBox}>
        <Text style={statusRow}>
          <span style={statusIcon}>{isApproved ? '✓' : '!'}</span>
          <span style={isApproved ? statusApprovedText : statusRejectedText}>
            {isApproved ? 'Certificate Approved' : 'Revision Requested'}
          </span>
        </Text>
      </Section>

      <Section style={detailsBox}>
        <Text style={detailRow}>
          <span style={detailLabel}>Certificate Number:</span>
          <span style={detailValue}>{certificateNumber}</span>
        </Text>
        <Text style={detailRow}>
          <span style={detailLabel}>Customer:</span>
          <span style={detailValue}>{customerName}</span>
        </Text>
        <Text style={detailRow}>
          <span style={detailLabel}>{isApproved ? 'Approved' : 'Reviewed'} By:</span>
          <span style={detailValue}>{approverName}</span>
        </Text>
      </Section>

      {!isApproved && rejectionNote && (
        <Section style={noteBox}>
          <Text style={noteLabel}>Customer Feedback:</Text>
          <Text style={noteText}>{rejectionNote}</Text>
        </Section>
      )}

      <Text style={paragraph}>
        {isApproved
          ? 'The certificate is now awaiting admin authorization for final signing.'
          : 'Please review the customer feedback and make the necessary revisions.'}
      </Text>

      <Section style={buttonContainer}>
        <Button href={dashboardUrl}>
          {isApproved ? 'View Certificate' : 'Review Feedback'}
        </Button>
      </Section>
    </Layout>
  )
}

const heading: React.CSSProperties = {
  fontSize: '24px',
  fontWeight: '600',
  color: '#1e40af',
  margin: '0 0 24px',
}

const paragraph: React.CSSProperties = {
  fontSize: '14px',
  lineHeight: '24px',
  color: '#374151',
  margin: '0 0 16px',
}

const approvedBox: React.CSSProperties = {
  backgroundColor: '#d1fae5',
  border: '1px solid #10b981',
  borderRadius: '6px',
  padding: '16px',
  margin: '24px 0',
  textAlign: 'center' as const,
}

const rejectedBox: React.CSSProperties = {
  backgroundColor: '#fee2e2',
  border: '1px solid #ef4444',
  borderRadius: '6px',
  padding: '16px',
  margin: '24px 0',
  textAlign: 'center' as const,
}

const statusRow: React.CSSProperties = {
  margin: '0',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px',
}

const statusIcon: React.CSSProperties = {
  fontSize: '20px',
}

const statusApprovedText: React.CSSProperties = {
  fontSize: '16px',
  fontWeight: '600',
  color: '#059669',
}

const statusRejectedText: React.CSSProperties = {
  fontSize: '16px',
  fontWeight: '600',
  color: '#dc2626',
}

const detailsBox: React.CSSProperties = {
  backgroundColor: '#f9fafb',
  border: '1px solid #e5e7eb',
  borderRadius: '6px',
  padding: '16px',
  margin: '24px 0',
}

const detailRow: React.CSSProperties = {
  fontSize: '14px',
  lineHeight: '24px',
  color: '#374151',
  margin: '0 0 8px',
}

const detailLabel: React.CSSProperties = {
  fontWeight: '600',
  marginRight: '8px',
}

const detailValue: React.CSSProperties = {
  color: '#1f2937',
}

const noteBox: React.CSSProperties = {
  backgroundColor: '#fef3c7',
  border: '1px solid #f59e0b',
  borderRadius: '6px',
  padding: '16px',
  margin: '24px 0',
}

const noteLabel: React.CSSProperties = {
  fontSize: '14px',
  fontWeight: '600',
  color: '#92400e',
  margin: '0 0 8px',
}

const noteText: React.CSSProperties = {
  fontSize: '14px',
  lineHeight: '20px',
  color: '#78350f',
  margin: '0',
  whiteSpace: 'pre-wrap' as const,
}

const buttonContainer: React.CSSProperties = {
  textAlign: 'center' as const,
  margin: '24px 0',
}

export default CustomerApproval
