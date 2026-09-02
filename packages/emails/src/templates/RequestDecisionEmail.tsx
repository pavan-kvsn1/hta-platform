import { Section, Text } from '@react-email/components'
import * as React from 'react'
import { Button, Layout } from '../components/index.js'

export type RequestDecision = 'APPROVED' | 'REJECTED'

export interface DecisionDetail {
  label: string
  value: string
}

export interface RequestDecisionEmailProps {
  preview: string
  heading: string
  decision: RequestDecision
  recipientName: string
  summary: React.ReactNode
  details: DecisionDetail[]
  cta?: { label: string; href: string }
}

export function RequestDecisionEmail({
  preview,
  heading,
  decision,
  recipientName,
  summary,
  details,
  cta,
}: RequestDecisionEmailProps) {
  const approved = decision === 'APPROVED'

  return (
    <Layout preview={preview}>
      <Text style={headingStyle}>{heading}</Text>
      <Text style={paragraph}>Hello {recipientName},</Text>
      <Section style={approved ? approvedBadge : rejectedBadge}>
        <Text style={approved ? approvedBadgeText : rejectedBadgeText}>
          {approved ? 'Approved' : 'Rejected'}
        </Text>
      </Section>
      <Text style={paragraph}>{summary}</Text>
      {details.length > 0 && (
        <Section style={detailsBox}>
          {details.map(({ label, value }) => (
            <Text key={label} style={detailRow}>
              <span style={detailLabel}>{label}:</span>{' '}
              <span>{value}</span>
            </Text>
          ))}
        </Section>
      )}
      {cta && (
        <Section style={buttonContainer}>
          <Button href={cta.href}>{cta.label}</Button>
        </Section>
      )}
    </Layout>
  )
}

const headingStyle: React.CSSProperties = {
  color: '#1e40af',
  fontSize: '24px',
  fontWeight: '600',
  margin: '0 0 24px',
}

const paragraph: React.CSSProperties = {
  color: '#374151',
  fontSize: '14px',
  lineHeight: '24px',
  margin: '0 0 16px',
}

const badge: React.CSSProperties = {
  borderRadius: '6px',
  margin: '0 0 24px',
  padding: '12px 16px',
  textAlign: 'center',
}

const approvedBadge: React.CSSProperties = {
  ...badge,
  backgroundColor: '#d1fae5',
  border: '1px solid #10b981',
}

const rejectedBadge: React.CSSProperties = {
  ...badge,
  backgroundColor: '#fee2e2',
  border: '1px solid #ef4444',
}

const badgeText: React.CSSProperties = {
  fontSize: '16px',
  fontWeight: '700',
  margin: '0',
}

const approvedBadgeText: React.CSSProperties = { ...badgeText, color: '#047857' }
const rejectedBadgeText: React.CSSProperties = { ...badgeText, color: '#b91c1c' }

const detailsBox: React.CSSProperties = {
  backgroundColor: '#f9fafb',
  border: '1px solid #e5e7eb',
  borderRadius: '6px',
  margin: '24px 0',
  padding: '16px',
}

const detailRow: React.CSSProperties = {
  color: '#374151',
  fontSize: '14px',
  lineHeight: '22px',
  margin: '0 0 8px',
}

const detailLabel: React.CSSProperties = { fontWeight: '600' }

const buttonContainer: React.CSSProperties = {
  margin: '24px 0',
  textAlign: 'center',
}

export default RequestDecisionEmail
