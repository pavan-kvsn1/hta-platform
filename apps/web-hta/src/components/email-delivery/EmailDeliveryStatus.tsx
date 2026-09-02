import type { EmailDeliveryStatusValue } from '@hta/shared'
import { cn } from '@/lib/utils'

const STATUS: Record<EmailDeliveryStatusValue, { label: string; className: string }> = {
  QUEUED: { label: 'Queued', className: 'border-slate-200 bg-slate-50 text-slate-700' },
  SENT: { label: 'Sent', className: 'border-blue-200 bg-blue-50 text-blue-700' },
  DELIVERED: { label: 'Delivered', className: 'border-green-200 bg-green-50 text-green-700' },
  DELAYED: { label: 'Delayed', className: 'border-amber-200 bg-amber-50 text-amber-700' },
  BOUNCED: { label: 'Bounced', className: 'border-red-200 bg-red-50 text-red-700' },
  FAILED: { label: 'Failed', className: 'border-red-200 bg-red-50 text-red-700' },
  SUPPRESSED: { label: 'Suppressed', className: 'border-red-200 bg-red-50 text-red-700' },
  COMPLAINED: { label: 'Complained', className: 'border-red-200 bg-red-50 text-red-700' },
}

export function EmailDeliveryStatus({
  status,
  className,
}: { status: EmailDeliveryStatusValue; className?: string }) {
  const config = STATUS[status]
  return (
    <span className={cn('inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold', config.className, className)}>
      {config.label}
    </span>
  )
}
