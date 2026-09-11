'use client'

/**
 * The eight facts that identify an instrument, in the same four rows and two columns on
 * every tab.
 *
 * It does not change when the tab does. That is the whole point of it: whatever you are
 * looking at - ranges, certificates, a PDF - you can still see which instrument you are
 * looking at without scrolling back.
 */

import { CheckCircle, Clock, AlertTriangle, Wrench } from 'lucide-react'

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

// The wireframe writes the status in capitals with the days in brackets:
//   Status: ✓ VALID (365 days)
const STATUS = {
  VALID: { label: 'VALID', icon: CheckCircle, text: 'text-[#15803d]', bg: 'bg-[#dcfce7]' },
  EXPIRING_SOON: { label: 'EXPIRING SOON', icon: Clock, text: 'text-[#92400e]', bg: 'bg-[#fef3c7]' },
  EXPIRED: { label: 'EXPIRED', icon: AlertTriangle, text: 'text-[#b91c1c]', bg: 'bg-[#fee2e2]' },
  UNDER_RECAL: { label: 'UNDER RECALIBRATION', icon: Wrench, text: 'text-[#1d4ed8]', bg: 'bg-[#dbeafe]' },
} as const

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <span className="text-[11px] text-[#94a3b8]">{label}</span>
      <div className="text-[13px] text-[#0f172a] truncate">{children}</div>
    </div>
  )
}

/** An em dash, not a blank, so a missing value is visibly missing rather than ambiguous. */
function orDash(v: string | null | undefined) {
  return v && v.trim() !== '' ? v : '—'
}

export default function InstrumentBanner({
  instrument,
  formatDate,
}: {
  instrument: BannerInstrument
  /** The lab's chosen date format, so the banner agrees with the rest of the app. */
  formatDate: (iso: string | null) => string
}) {
  const s = STATUS[instrument.status as keyof typeof STATUS] ?? STATUS.VALID
  const Icon = s.icon

  // Days only mean something while the calibration is still running. Saying "expired
  // (-12 days)" reads as a countdown that has gone negative rather than a date passed.
  const days =
    instrument.status === 'EXPIRED'
      ? null
      : instrument.daysUntilExpiry > 0
        ? `${instrument.daysUntilExpiry} day${instrument.daysUntilExpiry === 1 ? '' : 's'}`
        : null

  const updatedBy = instrument.createdBy?.name || instrument.createdBy?.email || null

  return (
    <div className="bg-white rounded-xl border border-[#e2e8f0] px-5 py-4 mb-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
        <Field label="Asset #">{orDash(instrument.assetNumber)}</Field>

        <Field label="Status">
          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md ${s.bg} ${s.text} text-[12px]`}>
            <Icon className="size-3.5" />
            {s.label}
            {days && <span className="opacity-70">({days})</span>}
          </span>
        </Field>

        <Field label="Category">{orDash(instrument.category)}</Field>
        <Field label="Calibrated At">{orDash(instrument.calibratedAtLocation)}</Field>

        <Field label="Next Due">{formatDate(instrument.calibrationDueDate)}</Field>
        <Field label="Last Updated">
          {formatDate(instrument.createdAt)}
          {updatedBy && <span className="text-[#64748b]"> by {updatedBy}</span>}
        </Field>

        <Field label="Model">{orDash([instrument.make, instrument.model].filter(Boolean).join(' ') || null)}</Field>
        <Field label="Serial">{orDash(instrument.serialNumber)}</Field>
      </div>
    </div>
  )
}
