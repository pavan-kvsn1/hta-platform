import { Section, Text } from '@react-email/components'
import * as React from 'react'
import { Button, Layout } from '../components/index.js'

interface CustomerActivationProps {
  userName: string
  companyName: string
  activationUrl: string
  tenantName?: string
}

export function CustomerActivation({
  userName,
  companyName,
  activationUrl,
  tenantName,
}: CustomerActivationProps) {
  return (
    <Layout
      preview="Activate your HTA Calibration Portal account"
      tenant={tenantName ? { name: tenantName } : undefined}
    >
      <Text style={heading}>Welcome to the HTA Calibration Portal</Text>

      <Text style={paragraph}>Hello {userName},</Text>

      <Text style={paragraph}>
        Your account has been created for <strong>{companyName}</strong> on the HTA Calibration Portal.
        Use the button below to set your password and activate your account.
      </Text>

      <Section style={buttonContainer}>
        <Button href={activationUrl}>Activate Your Account</Button>
      </Section>

      <Section style={noteBox}>
        <Text style={noteText}>
          <strong>Important:</strong> This activation link will expire in 7 days.
        </Text>
      </Section>

      <Text style={paragraph}>
        If you did not expect this invitation, please contact HTA support.
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
  textAlign: 'center',
  margin: '32px 0',
}

const noteBox: React.CSSProperties = {
  backgroundColor: '#fef3c7',
  border: '1px solid #f59e0b',
  borderRadius: '6px',
  padding: '12px 16px',
  margin: '24px 0',
}

const noteText: React.CSSProperties = {
  fontSize: '13px',
  lineHeight: '20px',
  color: '#92400e',
  margin: '0',
}

export default CustomerActivation
