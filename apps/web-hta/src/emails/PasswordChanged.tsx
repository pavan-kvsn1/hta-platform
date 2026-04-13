import { Text, Section } from '@react-email/components'
import * as React from 'react'
import { Layout, Button } from './components'

interface PasswordChangedProps {
  userName: string
  changedAt: string
}

export function PasswordChanged({ userName, changedAt }: PasswordChangedProps) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://hta-calibration.com'

  return (
    <Layout preview="Your password has been changed">
      <Text style={heading}>Password Changed</Text>

      <Text style={paragraph}>
        Hello {userName},
      </Text>

      <Text style={paragraph}>
        Your password was successfully changed on <strong>{changedAt}</strong>.
      </Text>

      <Text style={paragraph}>
        If you made this change, no further action is required.
      </Text>

      <Section style={warningBox}>
        <Text style={warningText}>
          If you did not make this change, please contact our support team immediately
          to secure your account.
        </Text>
      </Section>

      <Section style={buttonContainer}>
        <Button href={`${baseUrl}/login`}>
          Sign In to Your Account
        </Button>
      </Section>

      <Text style={paragraph}>
        For security reasons, we recommend using a strong, unique password and
        enabling any additional security features available to you.
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

const warningBox: React.CSSProperties = {
  backgroundColor: '#fef3c7',
  border: '1px solid #f59e0b',
  borderRadius: '6px',
  padding: '16px',
  margin: '24px 0',
}

const warningText: React.CSSProperties = {
  fontSize: '14px',
  lineHeight: '20px',
  color: '#92400e',
  margin: '0',
}

const buttonContainer: React.CSSProperties = {
  textAlign: 'center' as const,
  margin: '24px 0',
}

export default PasswordChanged
