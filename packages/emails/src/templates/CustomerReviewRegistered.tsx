import { Text, Section } from '@react-email/components'
import * as React from 'react'
import { Layout, Button } from '../components/index.js'

interface CustomerReviewRegisteredProps {
  customerName: string
  certificateNumber: string
  instrumentDescription: string
  loginUrl: string
}

export function CustomerReviewRegistered({
  customerName,
  certificateNumber,
  instrumentDescription,
  loginUrl,
}: CustomerReviewRegisteredProps) {
  return (
    <Layout preview={`Certificate ${certificateNumber} is ready for your review`}>
      <Text style={heading}>Calibration Certificate Ready for Review</Text>

      <Text style={paragraph}>
        Hello {customerName},
      </Text>

      <Text style={paragraph}>
        Please log in to review the calibration data sheet for your instrument <strong>{instrumentDescription}</strong>.
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
        <Button href={loginUrl}>
          Log In to Review
        </Button>
      </Section>

      <Text style={smallText}>
        You can access this certificate anytime from your dashboard. If you have any questions, please contact us.
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

export default CustomerReviewRegistered
