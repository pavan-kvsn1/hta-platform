import { Text, Section } from '@react-email/components'
import * as React from 'react'
import { Layout, Button } from '../components/index.js'

interface ReviewerCustomerExpiredProps {
  reviewerName: string
  certificateNumber: string
  customerName: string
  instrumentDescription: string
  dashboardUrl: string
}

export function ReviewerCustomerExpired({
  reviewerName,
  certificateNumber,
  customerName,
  instrumentDescription,
  dashboardUrl,
}: ReviewerCustomerExpiredProps) {
  return (
    <Layout
      preview={`Customer review expired for certificate ${certificateNumber}`}
    >
      <Text style={heading}>
        Customer Review Expired
      </Text>

      <Text style={paragraph}>
        Hello {reviewerName},
      </Text>

      <Text style={paragraph}>
        The customer has not responded to the review request for the following certificate
        within the 48-hour window. You can resend the review request from the dashboard.
      </Text>

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
          <span style={detailLabel}>Instrument:</span>
          <span style={detailValue}>{instrumentDescription}</span>
        </Text>
        <Text style={detailRow}>
          <span style={detailLabel}>Status:</span>
          <span style={statusExpired}>Review Expired</span>
        </Text>
      </Section>

      <Text style={paragraph}>
        Please resend the review request to the customer, or contact them directly.
      </Text>

      <Section style={buttonContainer}>
        <Button href={dashboardUrl}>
          View Certificate
        </Button>
      </Section>
    </Layout>
  )
}

const heading: React.CSSProperties = {
  fontSize: '24px',
  fontWeight: '600',
  color: '#dc2626',
  margin: '0 0 24px',
}

const paragraph: React.CSSProperties = {
  fontSize: '14px',
  lineHeight: '24px',
  color: '#374151',
  margin: '0 0 16px',
}

const detailsBox: React.CSSProperties = {
  backgroundColor: '#fef2f2',
  border: '1px solid #fecaca',
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

const statusExpired: React.CSSProperties = {
  color: '#dc2626',
  fontWeight: '600',
}

const buttonContainer: React.CSSProperties = {
  textAlign: 'center' as const,
  margin: '24px 0',
}

export default ReviewerCustomerExpired
