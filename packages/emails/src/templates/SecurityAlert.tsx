import { Text, Section } from '@react-email/components'
import * as React from 'react'
import { Layout, Button } from '../components/index.js'

interface SecurityAlertProps {
  recipientName: string
  alertType: 'CSP_VIOLATION' | 'SUSPICIOUS_LOGIN' | 'BRUTE_FORCE'
  severity: 'HIGH' | 'CRITICAL'
  summary: string
  details: {
    label: string
    value: string
  }[]
  timestamp: string
  dashboardUrl: string
}

export function SecurityAlert({
  recipientName,
  alertType,
  severity,
  summary,
  details,
  timestamp,
  dashboardUrl,
}: SecurityAlertProps) {
  const alertTitle = {
    CSP_VIOLATION: 'Content Security Policy Violation',
    SUSPICIOUS_LOGIN: 'Suspicious Login Attempt',
    BRUTE_FORCE: 'Brute Force Attack Detected',
  }[alertType]

  return (
    <Layout preview={`Security Alert: ${alertTitle}`}>
      <Section style={alertBanner}>
        <Text style={alertBannerText}>
          {severity} SEVERITY SECURITY ALERT
        </Text>
      </Section>

      <Text style={heading}>{alertTitle}</Text>

      <Text style={paragraph}>
        Hello {recipientName},
      </Text>

      <Text style={paragraph}>
        {summary}
      </Text>

      <Section style={detailsBox}>
        <Text style={detailsHeader}>Alert Details</Text>
        {details.map((detail, index) => (
          <Text key={index} style={detailRow}>
            <span style={detailLabel}>{detail.label}:</span>
            <span style={detailValue}>{detail.value}</span>
          </Text>
        ))}
        <Text style={detailRow}>
          <span style={detailLabel}>Detected At:</span>
          <span style={detailValue}>{timestamp}</span>
        </Text>
      </Section>

      <Text style={paragraph}>
        <strong>Recommended Actions:</strong>
      </Text>
      <Text style={actionItem}>
        1. Review the security dashboard for more details
      </Text>
      <Text style={actionItem}>
        2. Check application logs for related events
      </Text>
      <Text style={actionItem}>
        3. If this is a real attack, consider blocking the source
      </Text>

      <Section style={buttonContainer}>
        <Button href={dashboardUrl}>
          View Security Dashboard
        </Button>
      </Section>

      <Text style={footer}>
        This is an automated security alert from HTA Platform.
        You are receiving this because you are a Master Admin.
      </Text>
    </Layout>
  )
}

const alertBanner: React.CSSProperties = {
  backgroundColor: '#dc2626',
  padding: '12px 16px',
  borderRadius: '6px',
  marginBottom: '24px',
}

const alertBannerText: React.CSSProperties = {
  color: '#ffffff',
  fontSize: '14px',
  fontWeight: '700',
  textAlign: 'center' as const,
  margin: 0,
  letterSpacing: '0.5px',
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
  backgroundColor: '#fef2f2',
  border: '1px solid #fecaca',
  borderRadius: '6px',
  padding: '16px',
  margin: '24px 0',
}

const detailsHeader: React.CSSProperties = {
  fontSize: '14px',
  fontWeight: '600',
  color: '#991b1b',
  margin: '0 0 12px',
}

const detailRow: React.CSSProperties = {
  fontSize: '13px',
  lineHeight: '22px',
  color: '#374151',
  margin: '0 0 6px',
}

const detailLabel: React.CSSProperties = {
  fontWeight: '600',
  marginRight: '8px',
}

const detailValue: React.CSSProperties = {
  color: '#1f2937',
  fontFamily: 'monospace',
}

const actionItem: React.CSSProperties = {
  fontSize: '14px',
  lineHeight: '24px',
  color: '#374151',
  margin: '0 0 8px',
  paddingLeft: '8px',
}

const buttonContainer: React.CSSProperties = {
  textAlign: 'center' as const,
  margin: '24px 0',
}

const footer: React.CSSProperties = {
  fontSize: '12px',
  lineHeight: '20px',
  color: '#6b7280',
  marginTop: '24px',
  paddingTop: '16px',
  borderTop: '1px solid #e5e7eb',
}

export default SecurityAlert
