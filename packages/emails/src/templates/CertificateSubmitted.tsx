import { Text, Section } from '@react-email/components'
import * as React from 'react'
import { Layout, Button } from '../components/index.js'

interface CertificateSubmittedProps {
  reviewerName: string
  certificateNumber: string
  assigneeName: string
  customerName?: string
  dashboardUrl: string
}

export function CertificateSubmitted({
  reviewerName,
  certificateNumber,
  assigneeName,
  customerName,
  dashboardUrl,
}: CertificateSubmittedProps) {
  return (
    <Layout preview={`Certificate ${certificateNumber} submitted for review`}>
      <Text style={heading}>New Certificate Ready for Review</Text>

      <Text style={paragraph}>
        Hello {reviewerName},
      </Text>

      <Text style={paragraph}>
        A new calibration certificate has been submitted for your review.
      </Text>

      <Section style={detailsBox}>
        <Text style={detailRow}>
          <span style={detailLabel}>Certificate Number:</span>
          <span style={detailValue}>{certificateNumber}</span>
        </Text>
        <Text style={detailRow}>
          <span style={detailLabel}>Submitted By:</span>
          <span style={detailValue}>{assigneeName}</span>
        </Text>
        {customerName && (
          <Text style={detailRow}>
            <span style={detailLabel}>Customer:</span>
            <span style={detailValue}>{customerName}</span>
          </Text>
        )}
      </Section>

      <Text style={paragraph}>
        Please review the certificate details and approve or request revisions as needed.
      </Text>

      <Section style={buttonContainer}>
        <Button href={dashboardUrl}>
          Review Certificate
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

const buttonContainer: React.CSSProperties = {
  textAlign: 'center' as const,
  margin: '24px 0',
}

export default CertificateSubmitted
