'use client'

import { Clock, CheckCircle, AlertTriangle, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface TATBadgeProps {
  createdAt: Date | string
  /** Date when the certificate was completed/authorized - TAT stops counting at this point */
  completedAt?: Date | string | null
  targetHours?: number
  variant?: 'default' | 'compact' | 'detailed'
  className?: string
}

type TATStatus = 'on_track' | 'warning' | 'overdue' | 'completed'

interface TATInfo {
  status: TATStatus
  elapsedHours: number
  remainingHours: number
  label: string
  color: string
  bgColor: string
  borderColor: string
  icon: typeof Clock
}

function calculateTAT(
  createdAt: Date | string,
  completedAt: Date | string | null | undefined,
  targetHours: number
): TATInfo {
  const startTime = new Date(createdAt).getTime()
  const endTime = completedAt
    ? new Date(completedAt).getTime()
    : Date.now()

  const elapsedMs = endTime - startTime
  const elapsedHours = elapsedMs / (1000 * 60 * 60)
  const remainingHours = targetHours - elapsedHours

  // If completed (authorized)
  if (completedAt) {
    const wasOnTime = elapsedHours <= targetHours
    return {
      status: 'completed',
      elapsedHours,
      remainingHours: 0,
      label: wasOnTime ? 'Completed On Time' : 'Completed Late',
      color: wasOnTime ? 'text-green-700' : 'text-orange-700',
      bgColor: wasOnTime ? 'bg-green-50' : 'bg-orange-50',
      borderColor: wasOnTime ? 'border-green-200' : 'border-orange-200',
      icon: CheckCircle,
    }
  }

  // Warning threshold at 75% of target time
  const warningThreshold = targetHours * 0.75

  if (elapsedHours < warningThreshold) {
    return {
      status: 'on_track',
      elapsedHours,
      remainingHours,
      label: 'On Track',
      color: 'text-green-700',
      bgColor: 'bg-green-50',
      borderColor: 'border-green-200',
      icon: Clock,
    }
  }

  if (elapsedHours < targetHours) {
    return {
      status: 'warning',
      elapsedHours,
      remainingHours,
      label: 'Warning',
      color: 'text-amber-700',
      bgColor: 'bg-amber-50',
      borderColor: 'border-amber-200',
      icon: AlertTriangle,
    }
  }

  return {
    status: 'overdue',
    elapsedHours,
    remainingHours,
    label: 'Overdue',
    color: 'text-red-700',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
    icon: AlertCircle,
  }
}

function formatHours(hours: number): string {
  if (hours < 0) hours = Math.abs(hours)

  if (hours < 1) {
    const minutes = Math.round(hours * 60)
    return `${minutes}m`
  }

  if (hours < 24) {
    const h = Math.floor(hours)
    const m = Math.round((hours - h) * 60)
    return m > 0 ? `${h}h ${m}m` : `${h}h`
  }

  const days = Math.floor(hours / 24)
  const remainingHours = Math.round(hours % 24)
  return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`
}

export function TATBadge({
  createdAt,
  completedAt,
  targetHours = 48,
  variant = 'default',
  className,
}: TATBadgeProps) {
  const tat = calculateTAT(createdAt, completedAt, targetHours)
  const Icon = tat.icon

  if (variant === 'compact') {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border',
          tat.bgColor,
          tat.borderColor,
          tat.color,
          className
        )}
        title={`TAT: ${formatHours(tat.elapsedHours)} / ${targetHours}h target`}
      >
        <Icon className="h-3 w-3" />
        {tat.label}
      </span>
    )
  }

  if (variant === 'detailed') {
    return (
      <div
        className={cn(
          'flex items-center gap-3 px-3 py-2 rounded-lg border',
          tat.bgColor,
          tat.borderColor,
          className
        )}
      >
        <Icon className={cn('h-5 w-5', tat.color)} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <span className={cn('text-sm font-medium', tat.color)}>
              {tat.label}
            </span>
            <span className="text-xs text-gray-500">
              Target: {targetHours}h
            </span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all',
                  tat.status === 'on_track' && 'bg-green-500',
                  tat.status === 'warning' && 'bg-amber-500',
                  tat.status === 'overdue' && 'bg-red-500',
                  tat.status === 'completed' && (tat.elapsedHours <= targetHours ? 'bg-green-500' : 'bg-orange-500')
                )}
                style={{
                  width: `${Math.min((tat.elapsedHours / targetHours) * 100, 100)}%`,
                }}
              />
            </div>
            <span className="text-xs text-gray-600 whitespace-nowrap">
              {formatHours(tat.elapsedHours)}
            </span>
          </div>
        </div>
      </div>
    )
  }

  // Default variant
  return (
    <div
      className={cn(
        'inline-flex items-center gap-2 px-2.5 py-1 rounded-md border text-xs',
        tat.bgColor,
        tat.borderColor,
        className
      )}
    >
      <Icon className={cn('h-3.5 w-3.5', tat.color)} />
      <span className={cn('font-medium', tat.color)}>{tat.label}</span>
      <span className="text-gray-500">|</span>
      <span className="text-gray-600">{formatHours(tat.elapsedHours)}</span>
      {tat.status !== 'completed' && tat.status !== 'overdue' && (
        <>
          <span className="text-gray-400">/</span>
          <span className="text-gray-500">{targetHours}h</span>
        </>
      )}
    </div>
  )
}

// Export the calculation function for use in tables/lists
export { calculateTAT, formatHours }
export type { TATStatus, TATInfo }
