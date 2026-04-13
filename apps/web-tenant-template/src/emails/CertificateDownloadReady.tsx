import { Text, Section } from '@react-email/components'
import * as React from 'react'
import { Layout, Button } from './components'

interface CertificateDownloadReadyProps {
  customerName: string
  certificateNumber: string
  instrumentDescription?: string
  serialNumber?: string
  calibrationDate?: string
  downloadUrl: string
}

export function CertificateDownloadReady({
  customerName,
  certificateNumber,
  instrumentDescription,
  serialNumber,
  calibrationDate,
  downloadUrl,
}: CertificateDownloadReadyProps) {
  return (
    <Layout preview={`Your Calibration Certificate ${certificateNumber} is ready for download`}>
      <Text style={heading}>Your Calibration Certificate is Ready</Text>

      <Text style={paragraph}>
        Dear {customerName},
      </Text>

      <Text style={paragraph}>
        Great news! Your calibration certificate has been completed and is ready for download.
      </Text>

      <Section style={detailsBox}>
        <Text style={detailsTitle}>Certificate Details</Text>
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
        {serialNumber && (
          <Text style={detailRow}>
            <span style={detailLabel}>Serial Number:</span>
            <span style={detailValue}>{serialNumber}</span>
          </Text>
        )}
        {calibrationDate && (
          <Text style={detailRow}>
            <span style={detailLabel}>Calibration Date:</span>
            <span style={detailValue}>{calibrationDate}</span>
          </Text>
        )}
      </Section>

      <Section style={buttonContainer}>
        <Button href={downloadUrl}>
          Download Certificate
        </Button>
      </Section>

      <Section style={importantBox}>
        <Text style={importantTitle}>Important Information</Text>
        <ul style={importantList}>
          <li style={importantItem}>This link will expire in 7 days</li>
          <li style={importantItem}>Maximum 5 downloads allowed</li>
          <li style={importantItem}>Save a copy for your records</li>
        </ul>
      </Section>

      <Section style={upsellBox}>
        <Text style={upsellTitle}>Want More?</Text>
        <Text style={upsellText}>
          Upgrade to our Customer Portal for:
        </Text>
        <ul style={upsellList}>
          <li style={upsellItem}>Complete certificate history</li>
          <li style={upsellItem}>Calibration reminders</li>
          <li style={upsellItem}>Team access management</li>
          <li style={upsellItem}>Instrument tracking</li>
        </ul>
        <Text style={upsellContact}>
          Contact us at <a href="mailto:portal@htainstrumentation.com" style={link}>portal@htainstrumentation.com</a> to learn more.
        </Text>
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

const detailsTitle: React.CSSProperties = {
  fontSize: '14px',
  fontWeight: '600',
  color: '#374151',
  margin: '0 0 12px',
  borderBottom: '1px solid #e5e7eb',
  paddingBottom: '8px',
}

const detailRow: React.CSSProperties = {
  fontSize: '14px',
  lineHeight: '24px',
  color: '#374151',
  margin: '0 0 4px',
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
  margin: '32px 0',
}

const importantBox: React.CSSProperties = {
  backgroundColor: '#fef3c7',
  border: '1px solid #f59e0b',
  borderRadius: '6px',
  padding: '16px',
  margin: '24px 0',
}

const importantTitle: React.CSSProperties = {
  fontSize: '14px',
  fontWeight: '600',
  color: '#92400e',
  margin: '0 0 8px',
}

const importantList: React.CSSProperties = {
  margin: '0',
  paddingLeft: '20px',
}

const importantItem: React.CSSProperties = {
  fontSize: '13px',
  lineHeight: '20px',
  color: '#78350f',
  margin: '0 0 4px',
}

const upsellBox: React.CSSProperties = {
  backgroundColor: '#eff6ff',
  border: '1px solid #bfdbfe',
  borderRadius: '6px',
  padding: '16px',
  margin: '24px 0',
}

const upsellTitle: React.CSSProperties = {
  fontSize: '14px',
  fontWeight: '600',
  color: '#1e40af',
  margin: '0 0 8px',
}

const upsellText: React.CSSProperties = {
  fontSize: '13px',
  lineHeight: '20px',
  color: '#1e3a8a',
  margin: '0 0 8px',
}

const upsellList: React.CSSProperties = {
  margin: '0 0 12px',
  paddingLeft: '20px',
}

const upsellItem: React.CSSProperties = {
  fontSize: '13px',
  lineHeight: '20px',
  color: '#1e3a8a',
  margin: '0 0 4px',
}

const upsellContact: React.CSSProperties = {
  fontSize: '13px',
  lineHeight: '20px',
  color: '#1e3a8a',
  margin: '0',
}

const link: React.CSSProperties = {
  color: '#1e40af',
  textDecoration: 'underline',
}

export default CertificateDownloadReady
