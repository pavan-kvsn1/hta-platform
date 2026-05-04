import { Text, Section } from '@react-email/components'
import * as React from 'react'
import { Layout, Button } from '../components/index.js'

interface OfflineCodesExpiryProps {
  engineerName: string
  loginUrl: string
  tenantName?: string
}

export function OfflineCodesExpiry({ engineerName, loginUrl, tenantName }: OfflineCodesExpiryProps) {
  return (
    <Layout
      preview="Your offline access codes have expired"
      tenant={tenantName ? { name: tenantName } : undefined}
    >
      <Text style={heading}>Offline Codes Expired</Text>

      <Text style={paragraph}>Hello {engineerName},</Text>

      <Text style={paragraph}>
        Your offline access codes for the HTA Calibr8s desktop app have expired.
        A new batch of codes has been generated automatically.
      </Text>

      <Text style={paragraph}>
        Please log in to view and print your new codes before your next onsite visit.
      </Text>

      <Section style={buttonContainer}>
        <Button href={loginUrl}>View New Codes</Button>
      </Section>

      <Section style={noteBox}>
        <Text style={noteText}>
          <strong>Important:</strong> Codes are shown only once when you view them.
          Print or save them before leaving the page. Each code can only be used once.
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

export default OfflineCodesExpiry
