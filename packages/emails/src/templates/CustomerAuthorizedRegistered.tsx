import { Text, Section } from '@react-email/components'
import * as React from 'react'
import { Layout, Button } from '../components/index.js'

interface CustomerAuthorizedRegisteredProps {
  customerName: string
  certificateNumber: string
  instrumentDescription: string
  loginUrl: string
}

export function CustomerAuthorizedRegistered({
  customerName,
  certificateNumber,
  instrumentDescription,
  loginUrl,
}: CustomerAuthorizedRegisteredProps) {
  return (
    <Layout preview={`Certificate ${certificateNumber} has been authorized`}>
      <Text style={heading}>Your Certificate Has Been Authorized</Text>

      <Text style={paragraph}>
        Hello {customerName},
      </Text>

      <Text style={paragraph}>
        Your calibration certificate for instrument <strong>{instrumentDescription}</strong> has been authorized and is now available for download.
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
        Log in to your dashboard to view and download the certificate PDF.
      </Text>

      <Section style={buttonContainer}>
        <Button href={loginUrl}>
          Log In to Download
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
  color: '#16a34a',
  margin: '0 0 24px',
}

const paragraph: React.CSSProperties = {
  fontSize: '14px',
  lineHeight: '24px',
  color: '#374151',
  margin: '0 0 16px',
}

const detailsBox: React.CSSProperties = {
  backgroundColor: '#f0fdf4',
  border: '1px solid #bbf7d0',
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

export default CustomerAuthorizedRegistered
