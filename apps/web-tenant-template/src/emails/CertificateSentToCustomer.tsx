import { Text, Section } from '@react-email/components'
import * as React from 'react'
import { Layout, Button } from './components'

interface CertificateSentToCustomerProps {
  customerName: string
  certificateNumber: string
  instrumentDescription?: string
  reviewUrl: string
}

export function CertificateSentToCustomer({
  customerName,
  certificateNumber,
  instrumentDescription,
  reviewUrl,
}: CertificateSentToCustomerProps) {
  return (
    <Layout preview={`Calibration Certificate ${certificateNumber} ready for your review`}>
      <Text style={heading}>Calibration Certificate Ready for Review</Text>

      <Text style={paragraph}>
        Dear {customerName},
      </Text>

      <Text style={paragraph}>
        Your calibration certificate is ready for your review and approval.
      </Text>

      <Section style={detailsBox}>
        <Text style={detailRow}>
          <span style={detailLabel}>Certificate Number:</span>
          <span style={detailValue}>{certificateNumber}</span>
        </Text>
        {instrumentDescription && (
          <Text style={detailRow}>
            <span style={detailLabel}>Instrument:</span>
            <span style={detailValue}>{instrumentDescription}</span>
          </Text>
        )}
      </Section>

      <Text style={paragraph}>
        Please review the certificate details carefully. You can approve the certificate
        or request changes if needed.
      </Text>

      <Section style={buttonContainer}>
        <Button href={reviewUrl}>
          Review Certificate
        </Button>
      </Section>

      <Section style={noteBox}>
        <Text style={noteText}>
          <strong>Note:</strong> This link is unique to you and will expire in 7 days.
          Please do not share it with others.
        </Text>
      </Section>

      <Text style={paragraph}>
        If you have any questions about the calibration results, please don&apos;t hesitate
        to contact us.
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

const noteBox: React.CSSProperties = {
  backgroundColor: '#eff6ff',
  border: '1px solid #bfdbfe',
  borderRadius: '6px',
  padding: '12px 16px',
  margin: '24px 0',
}

const noteText: React.CSSProperties = {
  fontSize: '13px',
  lineHeight: '20px',
  color: '#1e40af',
  margin: '0',
}

export default CertificateSentToCustomer
