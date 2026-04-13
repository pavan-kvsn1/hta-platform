import { Text, Section } from '@react-email/components'
import * as React from 'react'
import { Layout, Button } from './components'

interface PasswordResetProps {
  userName: string
  resetUrl: string
  expiryMinutes?: number
}

export function PasswordReset({
  userName,
  resetUrl,
  expiryMinutes = 60
}: PasswordResetProps) {
  return (
    <Layout preview="Reset your password">
      <Text style={heading}>Reset Your Password</Text>

      <Text style={paragraph}>
        Hello {userName},
      </Text>

      <Text style={paragraph}>
        We received a request to reset your password for your HTA Calibration Portal account.
        Click the button below to create a new password.
      </Text>

      <Section style={buttonContainer}>
        <Button href={resetUrl}>
          Reset Password
        </Button>
      </Section>

      <Section style={noteBox}>
        <Text style={noteText}>
          This link will expire in <strong>{expiryMinutes} minutes</strong>.
          If you need a new link, you can request another password reset.
        </Text>
      </Section>

      <Section style={warningBox}>
        <Text style={warningText}>
          <strong>Didn&apos;t request this?</strong>
          <br />
          If you didn&apos;t request a password reset, you can safely ignore this email.
          Your password will remain unchanged.
        </Text>
      </Section>

      <Text style={paragraph}>
        For security, this request was received from a web browser.
        If you have any concerns about your account security, please contact support.
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

const buttonContainer: React.CSSProperties = {
  textAlign: 'center' as const,
  margin: '32px 0',
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

const warningBox: React.CSSProperties = {
  backgroundColor: '#f9fafb',
  border: '1px solid #e5e7eb',
  borderRadius: '6px',
  padding: '12px 16px',
  margin: '24px 0',
}

const warningText: React.CSSProperties = {
  fontSize: '13px',
  lineHeight: '20px',
  color: '#6b7280',
  margin: '0',
}

export default PasswordReset
