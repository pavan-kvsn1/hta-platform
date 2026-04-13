import { Text, Section } from '@react-email/components'
import * as React from 'react'
import { Layout, Button } from './components'

interface CertificateReviewedProps {
  assigneeName: string
  certificateNumber: string
  reviewerName: string
  status: 'approved' | 'revision'
  revisionNote?: string
  dashboardUrl: string
}

export function CertificateReviewed({
  assigneeName,
  certificateNumber,
  reviewerName,
  status,
  revisionNote,
  dashboardUrl,
}: CertificateReviewedProps) {
  const isApproved = status === 'approved'

  return (
    <Layout
      preview={`Certificate ${certificateNumber} has been ${isApproved ? 'approved' : 'returned for revision'}`}
    >
      <Text style={heading}>
        Certificate {isApproved ? 'Approved' : 'Requires Revision'}
      </Text>

      <Text style={paragraph}>
        Hello {assigneeName},
      </Text>

      <Text style={paragraph}>
        {isApproved
          ? `Your calibration certificate has been approved by ${reviewerName}.`
          : `Your calibration certificate has been returned for revision by ${reviewerName}.`}
      </Text>

      <Section style={detailsBox}>
        <Text style={detailRow}>
          <span style={detailLabel}>Certificate Number:</span>
          <span style={detailValue}>{certificateNumber}</span>
        </Text>
        <Text style={detailRow}>
          <span style={detailLabel}>Reviewed By:</span>
          <span style={detailValue}>{reviewerName}</span>
        </Text>
        <Text style={detailRow}>
          <span style={detailLabel}>Status:</span>
          <span style={isApproved ? statusApproved : statusRevision}>
            {isApproved ? 'Approved' : 'Revision Required'}
          </span>
        </Text>
      </Section>

      {!isApproved && revisionNote && (
        <Section style={revisionBox}>
          <Text style={revisionLabel}>Revision Notes:</Text>
          <Text style={revisionText}>{revisionNote}</Text>
        </Section>
      )}

      <Text style={paragraph}>
        {isApproved
          ? 'The certificate is now ready to be sent to the customer for their approval.'
          : 'Please review the feedback and make the necessary changes.'}
      </Text>

      <Section style={buttonContainer}>
        <Button href={dashboardUrl}>
          {isApproved ? 'View Certificate' : 'Make Revisions'}
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

const statusApproved: React.CSSProperties = {
  color: '#059669',
  fontWeight: '600',
}

const statusRevision: React.CSSProperties = {
  color: '#d97706',
  fontWeight: '600',
}

const revisionBox: React.CSSProperties = {
  backgroundColor: '#fef3c7',
  border: '1px solid #f59e0b',
  borderRadius: '6px',
  padding: '16px',
  margin: '24px 0',
}

const revisionLabel: React.CSSProperties = {
  fontSize: '14px',
  fontWeight: '600',
  color: '#92400e',
  margin: '0 0 8px',
}

const revisionText: React.CSSProperties = {
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

export default CertificateReviewed
