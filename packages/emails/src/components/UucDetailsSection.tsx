import { Section, Text } from '@react-email/components'
import * as React from 'react'

export interface UucDetails {
  description?: string | null
  make?: string | null
  model?: string | null
  serialNumber?: string | null
  instrumentId?: string | null
  location?: string | null
  machineName?: string | null
}

interface UucDetailsSectionProps {
  details?: UucDetails
}

const fields: Array<[keyof UucDetails, string]> = [
  ['description', 'Description'],
  ['make', 'Make'],
  ['model', 'Model'],
  ['serialNumber', 'Serial Number'],
  ['instrumentId', 'Instrument ID'],
  ['location', 'Location'],
  ['machineName', 'Machine Name'],
]

export function UucDetailsSection({ details }: UucDetailsSectionProps) {
  const populatedFields = fields.flatMap(([key, label]) => {
    const value = details?.[key]?.trim()
    return value ? [{ key, label, value }] : []
  })

  if (populatedFields.length === 0) return null

  return (
    <Section style={detailsBox}>
      <Text style={heading}>UUC Details</Text>
      {populatedFields.map(({ key, label, value }) => (
        <Text key={key} style={detailRow}>
          <span style={detailLabel}>{label}:</span>
          <span style={detailValue}>{value}</span>
        </Text>
      ))}
    </Section>
  )
}

const detailsBox: React.CSSProperties = {
  backgroundColor: '#f9fafb',
  border: '1px solid #e5e7eb',
  borderRadius: '6px',
  padding: '16px',
  margin: '24px 0',
}

const heading: React.CSSProperties = {
  fontSize: '14px',
  fontWeight: '700',
  color: '#1e40af',
  margin: '0 0 12px',
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
