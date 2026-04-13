'use client'

import { Clock } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface TATStatus {
  hours: number
  status: 'ok' | 'warning' | 'overdue'
}

export interface TATBadgeProps {
  tat: TATStatus
}

/**
 * Format TAT hours into a human-readable string.
 */
export function formatTAT(hours: number): string {
  if (hours < 24) {
    return `${hours}h`
  }
  const days = Math.floor(hours / 24)
  const remainingHours = hours % 24
  if (remainingHours === 0) {
    return `${days}d`
  }
  return `${days}d ${remainingHours}h`
}

/**
 * Turn Around Time (TAT) badge for certificate headers.
 * Shows time elapsed with status-based coloring.
 */
export function TATBadge({ tat }: TATBadgeProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold',
        tat.status === 'ok' && 'bg-green-50 text-green-700 border border-green-200',
        tat.status === 'warning' && 'bg-amber-50 text-amber-700 border border-amber-200',
        tat.status === 'overdue' && 'bg-red-50 text-red-700 border border-red-200'
      )}
    >
      <Clock className="size-4" />
      <span>TAT: {formatTAT(tat.hours)}</span>
      {tat.status === 'overdue' && <span className="text-[10px] uppercase">Overdue</span>}
    </div>
  )
}
