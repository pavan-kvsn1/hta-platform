import { Text, Section } from '@react-email/components'
import * as React from 'react'
import { Layout, Button } from '../components'

interface CustomerReviewProps {
  customerName: string
  certificateNumber: string
  instrumentDescription: string
  reviewUrl: string
}

export function CustomerReview({
  customerName,
  certificateNumber,
  instrumentDescription,
  reviewUrl,
}: CustomerReviewProps) {
  return (
    <Layout preview={`Certificate ${certificateNumber} is ready for your review`}>
      <Text style={heading}>Calibration Certificate Ready for Review</Text>

      <Text style={paragraph}>
        Hello {customerName},
      </Text>

      <Text style={paragraph}>
        A calibration certificate is ready for your review and approval.
      </Text>

      <Section style={detailsBox}>
        <Text style={detailRow}>
          <span style={detailLabel}>Certificate Number:</span>
          <span style={detailValue}>{certificateNumber}</span>
        </Text>
        <Text style={detailRow}>
          <span style={detailLabel}>Instrument:</span>
          <span style={detailValue}>{instrumentDescription}</span>
        </Text>
      </Section>

      <Text style={paragraph}>
        Please review the certificate details and provide your approval or feedback.
      </Text>

      <Section style={buttonContainer}>
        <Button href={reviewUrl}>
          Review Certificate
        </Button>
      </Section>

      <Text style={smallText}>
        This link will expire in 30 days. If you have any questions, please contact us.
      </Text>
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

const buttonContainer: React.CSSProperties = {
  textAlign: 'center' as const,
  margin: '24px 0',
}

const smallText: React.CSSProperties = {
  fontSize: '12px',
  color: '#6b7280',
  margin: '24px 0 0',
}

export default CustomerReview
