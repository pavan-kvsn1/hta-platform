'use client'

/**
 * The eight facts that identify an instrument, on every section.
 *
 * It does not change when the section does. That is the whole point of it:
 * whatever you are looking at - ranges, certificates, a PDF - you can still see
 * which instrument you are looking at without scrolling back.
 *
 * Four across rather than two, because the section rail took the vertical space
 * the old two-column banner was spending.
 */

import { Icon } from './Icons'

export interface BannerInstrument {
  assetNumber: string
  category: string | null
  make: string | null
  model: string | null
  serialNumber: string | null
  calibratedAtLocation: string | null
  calibrationDueDate: string | null
  status: string
  daysUntilExpiry: number
  createdAt: string | null
  createdBy?: { name?: string | null; email?: string | null } | null
}

const STATUS: Record<string, { label: string; tone: 'good' | 'warn' | 'crit' | 'flat' }> = {
  VALID: { label: 'VALID', tone: 'good' },
  EXPIRING_SOON: { label: 'EXPIRING SOON', tone: 'warn' },
  EXPIRED: { label: 'EXPIRED', tone: 'crit' },
  UNDER_RECAL: { label: 'UNDER RECALIBRATION', tone: 'flat' },
}

/** An em dash, not a blank, so a missing value is visibly missing rather than ambiguous. */
const orDash = (v: string | null | undefined) => (v && v.trim() !== '' ? v : '—')

export function StatusPill({
  status,
  daysUntilExpiry,
  withDays,
}: {
  status: string
  daysUntilExpiry?: number
  withDays?: boolean
}) {
  const s = STATUS[status] ?? STATUS.VALID
  // Days only mean something while the calibration is still running. "expired
  // (-12 days)" reads as a countdown gone negative rather than a date passed.
  const days =
    withDays && status !== 'EXPIRED' && (daysUntilExpiry ?? 0) > 0
      ? ` (${daysUntilExpiry} day${daysUntilExpiry === 1 ? '' : 's'})`
      : ''
  return (
    <span className={`pill ${s.tone}`}>
      {s.tone === 'good' ? <Icon.check s={12} /> : null}
      {s.label}
      {days}
    </span>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bf">
      <span className="k lbl">{label}</span>
      <span className="v">{children}</span>
    </div>
  )
}

export default function InstrumentBanner({
  instrument,
  formatDate,
}: {
  instrument: BannerInstrument
  /** The lab's chosen date format, so the banner agrees with the rest of the app. */
  formatDate: (iso: string | null) => string
}) {
  const updatedBy = instrument.createdBy?.name || instrument.createdBy?.email || null

  return (
    <div className="card banner">
      <Field label="Asset #">
        <span className="mono" style={{ color: 'var(--primary)', fontWeight: 500 }}>
          {orDash(instrument.assetNumber)}
        </span>
      </Field>

      <Field label="Status">
        <StatusPill status={instrument.status} daysUntilExpiry={instrument.daysUntilExpiry} withDays />
      </Field>

      <Field label="Category">{orDash(instrument.category)}</Field>
      <Field label="Calibrated At">{orDash(instrument.calibratedAtLocation)}</Field>

      <Field label="Next Due">
        <span className="mono">{formatDate(instrument.calibrationDueDate)}</span>
      </Field>
      <Field label="Last Updated">
        <span className="mono">{formatDate(instrument.createdAt)}</span>
        {updatedBy && <span style={{ color: 'var(--muted)' }}> by {updatedBy}</span>}
      </Field>

      <Field label="Model">
        {orDash([instrument.make, instrument.model].filter(Boolean).join(' ') || null)}
      </Field>
      <Field label="Serial">
        <span className="mono">{orDash(instrument.serialNumber)}</span>
      </Field>
    </div>
  )
}
