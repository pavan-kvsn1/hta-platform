'use client'

import { apiFetch } from '@/lib/api-client'

import { useState, useEffect, useCallback } from 'react'
import {
  PendingReviewTable,
  AwaitingResponseTable,
  CompletedTable,
  AuthorizedTable,
} from './index'
import { Crown, Loader2, Users, RefreshCw } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

type ViewType = 'pending' | 'awaiting' | 'completed' | 'authorized'

interface CountsData {
  counts: {
    pending: number
    awaiting: number
    completed: number
    authorized: number
  }
  isPrimaryPoc: boolean
  companyName: string
  userCount: number
}

const VIEW_CONFIG: Record<ViewType, { title: string; description: string }> = {
  pending: {
    title: 'Pending Review',
    description: 'Certificates awaiting your review and signature',
  },
  awaiting: {
    title: 'In Discussion',
    description: 'Certificates where discussion is ongoing with HTA',
  },
  completed: {
    title: 'Completed',
    description: 'Certificates you have signed, awaiting Admin authorization',
  },
  authorized: {
    title: 'Authorized Certificates',
    description: 'Fully authorized and completed certificates',
  },
}

const STAT_CARDS: { key: ViewType; label: string; borderColor: string; countColor: string }[] = [
  { key: 'pending', label: 'Pending Review', borderColor: 'border-l-[#2563eb]', countColor: 'text-[#1e40af]' },
  { key: 'awaiting', label: 'In Discussion', borderColor: 'border-l-[#d97706]', countColor: 'text-[#b45309]' },
  { key: 'completed', label: 'Completed', borderColor: 'border-l-[#16a34a]', countColor: 'text-[#15803d]' },
  { key: 'authorized', label: 'Authorized', borderColor: 'border-l-[#7c3aed]', countColor: 'text-[#6d28d9]' },
]

export function DashboardClient() {
  const [activeView, setActiveView] = useState<ViewType>('pending')
  const [countsData, setCountsData] = useState<CountsData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchCounts = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)
      const response = await apiFetch('/api/customer/dashboard/counts')
      if (!response.ok) {
        throw new Error('Failed to fetch dashboard data')
      }
      const result = await response.json()
      setCountsData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchCounts()
  }, [fetchCounts])

  const counts = countsData?.counts || {
    pending: 0,
    awaiting: 0,
    completed: 0,
    authorized: 0,
  }

  if (isLoading && !countsData) {
    return (
      <div className="h-full overflow-auto bg-[#f1f5f9] flex items-center justify-center">
        <Loader2 className="size-6 animate-spin text-[#94a3b8]" />
      </div>
    )
  }

  const viewConfig = VIEW_CONFIG[activeView]

  return (
    <div className="h-full overflow-auto bg-[#f1f5f9]">
      <div className="px-6 sm:px-9 py-8">
        {/* Page Header */}
        <div className="mb-7">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-3">
              {countsData?.companyName && (
                <span className="text-[13px] text-[#94a3b8]">{countsData.companyName}</span>
              )}
              {countsData?.isPrimaryPoc && (
                <Link
                  href="/customer/users"
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-[0.05em] bg-[#fef3c7] text-[#92400e] hover:bg-[#fde68a] transition-colors"
                >
                  <Crown className="size-3" />
                  Primary POC
                </Link>
              )}
            </div>
            {countsData && (
              <Link
                href="/customer/users"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[9px] text-[12.5px] font-semibold text-[#475569] bg-white border border-[#e2e8f0] hover:bg-[#f8fafc] transition-colors"
              >
                <Users className="size-3.5" />
                Team ({countsData.userCount})
              </Link>
            )}
          </div>
          <h1 className="text-[26px] font-extrabold tracking-tight text-[#0f172a]">{viewConfig.title}</h1>
          <p className="text-sm text-[#94a3b8] mt-1">{viewConfig.description}</p>
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-7">
          {STAT_CARDS.map((card) => {
            const isActive = activeView === card.key
            return (
              <button
                key={card.key}
                onClick={() => setActiveView(card.key)}
                className={cn(
                  'bg-white rounded-xl px-5 py-5 border-l-[3px] text-left transition-all cursor-pointer',
                  card.borderColor,
                  isActive
                    ? 'border-2 border-[#0f172a]/15 shadow-sm'
                    : 'border border-[#e2e8f0]'
                )}
              >
                <div className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8] mb-2.5">
                  {card.label}
                </div>
                <div className={cn('text-[38px] font-extrabold leading-none tracking-tight', card.countColor)}>
                  {counts[card.key]}
                </div>
              </button>
            )
          })}
        </div>

        {/* Error State */}
        {error && (
          <div className="rounded-xl bg-[#fef2f2] border border-[#fecaca] px-4 py-3 mb-7 flex items-center justify-between">
            <p className="text-[13px] text-[#dc2626]">{error}</p>
            <button
              onClick={fetchCounts}
              className="flex items-center gap-1.5 text-[12.5px] font-semibold text-[#dc2626] hover:text-[#b91c1c]"
            >
              <RefreshCw className="size-3.5" />
              Retry
            </button>
          </div>
        )}

        {/* Table Content — each table fetches its own data */}
        {activeView === 'pending' && <PendingReviewTable />}
        {activeView === 'awaiting' && <AwaitingResponseTable />}
        {activeView === 'completed' && <CompletedTable />}
        {activeView === 'authorized' && <AuthorizedTable />}
      </div>
    </div>
  )
}
