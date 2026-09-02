'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, Mail } from 'lucide-react'
import {
  getCertificateEmailDeliveries,
  type CertificateEmailType,
  type EmailDeliverySummary,
} from '@/lib/email-deliveries'
import { EmailDeliveryStatus } from './EmailDeliveryStatus'

const PURPOSE: Record<CertificateEmailType, string> = {
  CERTIFICATE_SUBMITTED: 'Reviewer approval request',
  CERTIFICATE_REVIEWED: 'Review decision',
  CUSTOMER_REVIEW: 'Customer review request',
  CUSTOMER_REVIEW_REGISTERED: 'Registered customer review request',
  CUSTOMER_AUTHORIZED_REGISTERED: 'Customer certificate authorization',
  CUSTOMER_AUTHORIZED_TOKEN: 'Customer certificate download',
  CUSTOMER_APPROVAL: 'Customer approval decision',
  CUSTOMER_REVIEW_EXPIRED: 'Expired customer review notice',
}

function formatTime(value: string | null): string {
  return value ? new Date(value).toLocaleString() : '—'
}

export function EmailDeliveryPanel({
  certificateId,
  purpose,
  recipientEmail,
  title = 'Email delivery',
}: {
  certificateId: string
  purpose?: CertificateEmailType | CertificateEmailType[]
  recipientEmail?: string
  title?: string
}) {
  const [deliveries, setDeliveries] = useState<EmailDeliverySummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      setDeliveries(await getCertificateEmailDeliveries(certificateId))
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [certificateId])

  useEffect(() => { void load() }, [load])

  const filtered = useMemo(() => {
    const purposes = purpose ? (Array.isArray(purpose) ? purpose : [purpose]) : null
    return deliveries.filter((delivery) =>
      (!purposes || purposes.includes(delivery.emailType))
      && (!recipientEmail || delivery.recipientEmail.toLowerCase() === recipientEmail.toLowerCase()),
    )
  }, [deliveries, purpose, recipientEmail])

  if (loading) return <div className="text-sm text-muted-foreground">Loading delivery status…</div>
  if (error) return (
    <div className="text-sm text-red-700">
      Delivery status unavailable.{' '}
      <button type="button" className="font-semibold underline" onClick={() => void load()}>Retry</button>
    </div>
  )
  if (filtered.length === 0) return <div className="text-sm text-muted-foreground">Delivery tracking unavailable.</div>

  const visible = expanded ? filtered : filtered.slice(0, 1)
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-3" aria-label={title}>
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
        <Mail className="size-4" /> {title}
      </div>
      <div className="space-y-3">
        {visible.map((delivery) => (
          <div key={delivery.id} className="rounded-md bg-slate-50 p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">{PURPOSE[delivery.emailType]}</span>
              <EmailDeliveryStatus status={delivery.status} />
            </div>
            <div className="mt-2 grid gap-1 text-xs text-slate-600 sm:grid-cols-2">
              <span>Recipient: {delivery.recipientName || delivery.recipientEmail}</span>
              <span>Email: {delivery.recipientEmail}</span>
              <span>Queued: {formatTime(delivery.queuedAt)}</span>
              <span>Sent: {formatTime(delivery.sentAt)}</span>
              <span>Delivered: {formatTime(delivery.deliveredAt)}</span>
            </div>
            {delivery.status === 'DELIVERED' && (
              <p className="mt-2 text-xs text-green-700">The recipient’s mail server accepted this message.</p>
            )}
            {delivery.failureReason && (
              <p className="mt-2 text-xs font-medium text-red-700">{delivery.failureReason}</p>
            )}
          </div>
        ))}
      </div>
      {filtered.length > 1 && (
        <button
          type="button"
          className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-blue-700"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
          {expanded ? 'Hide prior attempts' : `Show ${filtered.length - 1} prior attempt${filtered.length === 2 ? '' : 's'}`}
        </button>
      )}
    </section>
  )
}
