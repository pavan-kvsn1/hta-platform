import { Text, Section } from '@react-email/components'
import * as React from 'react'
import { Layout } from './components'

interface AccountDeletedProps {
  userName: string
}

export function AccountDeleted({ userName }: AccountDeletedProps) {
  return (
    <Layout preview="Your account has been deleted">
      <Text style={heading}>Account Deleted</Text>

      <Text style={paragraph}>
        Hello {userName},
      </Text>

      <Text style={paragraph}>
        Your HTA Calibration account has been successfully deleted as requested.
      </Text>

      <Section style={infoBox}>
        <Text style={infoText}>
          <strong>What happens now:</strong>
        </Text>
        <ul style={list}>
          <li style={listItem}>Your personal information has been removed from our systems</li>
          <li style={listItem}>You will no longer receive emails from us</li>
          <li style={listItem}>Calibration certificates are retained for 7 years per regulatory requirements</li>
        </ul>
      </Section>

      <Text style={paragraph}>
        If you did not request this deletion or believe this was done in error,
        please contact us immediately at{' '}
        <a href="mailto:services@htaipl.com" style={link}>
          services@htaipl.com
        </a>.
      </Text>

      <Text style={paragraph}>
        Thank you for using HTA Calibration.
      </Text>

      <Text style={signature}>
        Best regards,<br />
        HTA Instrumentation (P) Ltd.
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

const infoBox: React.CSSProperties = {
  backgroundColor: '#f3f4f6',
  border: '1px solid #e5e7eb',
  borderRadius: '6px',
  padding: '16px',
  margin: '24px 0',
}

const infoText: React.CSSProperties = {
  fontSize: '14px',
  lineHeight: '20px',
  color: '#374151',
  margin: '0 0 12px',
}

const list: React.CSSProperties = {
  margin: '0',
  paddingLeft: '20px',
}

const listItem: React.CSSProperties = {
  fontSize: '14px',
  lineHeight: '24px',
  color: '#6b7280',
  margin: '4px 0',
}

const link: React.CSSProperties = {
  color: '#2563eb',
  textDecoration: 'underline',
}

const signature: React.CSSProperties = {
  fontSize: '14px',
  lineHeight: '24px',
  color: '#6b7280',
  marginTop: '24px',
}

export default AccountDeleted
