import { Text, Section } from '@react-email/components'
import * as React from 'react'
import { Layout, Button } from '../components/index.js'

interface StaffActivationProps {
  userName: string
  activationUrl: string
  tenantName?: string
}

export function StaffActivation({ userName, activationUrl, tenantName }: StaffActivationProps) {
  return (
    <Layout
      preview="Set up your account"
      tenant={tenantName ? { name: tenantName } : undefined}
    >
      <Text style={heading}>Welcome to the Calibration Portal</Text>

      <Text style={paragraph}>Hello {userName},</Text>

      <Text style={paragraph}>
        Your account has been created. Please click the button below to set your password and activate your account.
      </Text>

      <Section style={buttonContainer}>
        <Button href={activationUrl}>Activate Your Account</Button>
      </Section>

      <Section style={noteBox}>
        <Text style={noteText}>
          <strong>Important:</strong> This activation link will expire in 24 hours.
        </Text>
      </Section>

      <Text style={paragraph}>Once activated, you&apos;ll be able to:</Text>

      <ul style={featureList}>
        <li style={featureItem}>Create and manage calibration certificates</li>
        <li style={featureItem}>Track certificate status and workflow</li>
        <li style={featureItem}>Collaborate with team members</li>
        <li style={featureItem}>Access customer communications</li>
      </ul>
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

const featureList: React.CSSProperties = {
  margin: '0 0 16px',
  paddingLeft: '20px',
}

const featureItem: React.CSSProperties = {
  fontSize: '14px',
  lineHeight: '24px',
  color: '#374151',
  margin: '0 0 8px',
}

export default StaffActivation
