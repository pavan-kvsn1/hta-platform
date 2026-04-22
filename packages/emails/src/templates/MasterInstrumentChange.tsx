import { Text, Section } from '@react-email/components'
import * as React from 'react'
import { Layout, Button } from '../components/index.js'

interface MasterInstrumentChangeProps {
  recipientName: string
  actorName: string
  action: 'created' | 'modified' | 'deleted'
  assetNumber: string
  description: string
  changeDetails?: string
  timestamp: string
  dashboardUrl: string
}

export function MasterInstrumentChange({
  recipientName,
  actorName,
  action,
  assetNumber,
  description,
  changeDetails,
  timestamp,
  dashboardUrl,
}: MasterInstrumentChangeProps) {
  const actionPast = action === 'created' ? 'created' : action === 'modified' ? 'modified' : 'deleted'
  const isDelete = action === 'deleted'

  return (
    <Layout preview={`Master Instrument ${actionPast}: ${assetNumber}`}>
      <Text style={heading}>
        Master Instrument {action.charAt(0).toUpperCase() + action.slice(1)}
      </Text>

      <Text style={paragraph}>
        Hello {recipientName},
      </Text>

      <Text style={paragraph}>
        A master instrument has been {actionPast} by another admin. This notification is sent
        as a security control to ensure all admins are aware of changes to critical calibration data.
      </Text>

      <Section style={detailsBox}>
        <Text style={detailRow}>
          <span style={detailLabel}>Action:</span>
          <span style={isDelete ? deleteValue : detailValue}>
            {action.charAt(0).toUpperCase() + action.slice(1)}
          </span>
        </Text>
        <Text style={detailRow}>
          <span style={detailLabel}>Asset Number:</span>
          <span style={detailValue}>{assetNumber}</span>
        </Text>
        <Text style={detailRow}>
          <span style={detailLabel}>Description:</span>
          <span style={detailValue}>{description}</span>
        </Text>
        <Text style={detailRow}>
          <span style={detailLabel}>Changed By:</span>
          <span style={detailValue}>{actorName}</span>
        </Text>
        <Text style={detailRow}>
          <span style={detailLabel}>Timestamp:</span>
          <span style={detailValue}>{timestamp}</span>
        </Text>
        {changeDetails && (
          <Text style={detailRow}>
            <span style={detailLabel}>Changed Fields:</span>
            <span style={detailValue}>{changeDetails}</span>
          </Text>
        )}
      </Section>

      <Text style={paragraph}>
        If you did not expect this change, please review the instrument settings immediately
        and contact the actor if needed.
      </Text>

      <Section style={buttonContainer}>
        <Button href={dashboardUrl}>
          View Instruments
        </Button>
      </Section>

      <Text style={footer}>
        This is a security notification. All master instrument changes are logged
        for audit and compliance purposes.
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

const detailsBox: React.CSSProperties = {
  backgroundColor: '#fef3c7',
  border: '1px solid #f59e0b',
  borderRadius: '6px',
  padding: '16px',
  margin: '24px 0',
}

const detailRow: React.CSSProperties = {
  fontSize: '14px',
  lineHeight: '24px',
  color: '#374151',
  margin: '0 0 8px',
}

const detailLabel: React.CSSProperties = {
  fontWeight: '600',
  marginRight: '8px',
}

const detailValue: React.CSSProperties = {
  color: '#1f2937',
}

const deleteValue: React.CSSProperties = {
  color: '#dc2626',
  fontWeight: '600',
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

export default MasterInstrumentChange
