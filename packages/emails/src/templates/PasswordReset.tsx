import { Text, Section } from '@react-email/components'
import * as React from 'react'
import { Layout, Button } from '../components/index.js'

interface PasswordResetProps {
  userName: string
  resetUrl: string
  expiryMinutes?: number
  tenantName?: string
}

export function PasswordReset({
  userName,
  resetUrl,
  expiryMinutes = 60,
  tenantName,
}: PasswordResetProps) {
  return (
    <Layout
      preview="Reset your password"
      tenant={tenantName ? { name: tenantName } : undefined}
    >
      <Text style={heading}>Reset Your Password</Text>

      <Text style={paragraph}>Hello {userName},</Text>

      <Text style={paragraph}>
        We received a request to reset your password. Click the button below to create a new password.
      </Text>

      <Section style={buttonContainer}>
        <Button href={resetUrl}>Reset Password</Button>
      </Section>

      <Section style={noteBox}>
        <Text style={noteText}>
          This link will expire in <strong>{expiryMinutes} minutes</strong>.
        </Text>
      </Section>

      <Section style={warningBox}>
        <Text style={warningText}>
          <strong>Didn&apos;t request this?</strong>
          <br />
          If you didn&apos;t request a password reset, you can safely ignore this email.
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
