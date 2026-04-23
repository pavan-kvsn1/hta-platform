'use client'

import { apiFetch } from '@/lib/api-client'

import { useState, useEffect, useCallback } from 'react'
import {
  PendingReviewTable,
  PendingCertificate,
  AwaitingResponseTable,
  AwaitingCertificate,
  CompletedTable,
  CompletedCertificate,
  AuthorizedTable,
  AuthorizedCertificate,
} from './index'
import { Bell, MessageSquare, CheckCircle, FileText, Crown, Loader2, Users } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

type ViewType = 'pending' | 'awaiting' | 'completed' | 'authorized'

interface DashboardData {
  counts: {
    pending: number
    awaiting: number
    completed: number
    authorized: number
  }
  pending: PendingCertificate[]
  awaiting: AwaitingCertificate[]
  completed: CompletedCertificate[]
  authorized: AuthorizedCertificate[]
  isPrimaryPoc: boolean
  companyName: string
  userCount: number
}

const viewTitles: Record<ViewType, string> = {
  pending: 'Pending Review',
  awaiting: 'In Discussion',
  completed: 'Completed',
  authorized: 'Authorized Certificates',
}

const viewDescriptions: Record<ViewType, string> = {
  pending: 'Certificates awaiting your review and signature',
  awaiting: 'Certificates where discussion is ongoing with HTA',
  completed: 'Certificates you have signed, awaiting Admin authorization',
  authorized: 'Fully authorized and completed certificates',
}

interface StatCardProps {
  label: string
  count: number
  icon: React.ReactNode
  color: 'blue' | 'orange' | 'green' | 'purple'
  isActive: boolean
  onClick: () => void
}

function StatCard({ label, count, icon, color, isActive, onClick }: StatCardProps) {
  const colorStyles = {
    blue: {
      bg: isActive ? 'bg-blue-50 border-blue-300' : 'bg-white border-slate-200 hover:border-blue-200',
      icon: 'text-blue-600',
      count: 'text-blue-700',
      label: isActive ? 'text-blue-700' : 'text-slate-500',
    },
    orange: {
      bg: isActive ? 'bg-orange-50 border-orange-300' : 'bg-white border-slate-200 hover:border-orange-200',
      icon: 'text-orange-600',
      count: 'text-orange-700',
      label: isActive ? 'text-orange-700' : 'text-slate-500',
    },
    green: {
      bg: isActive ? 'bg-green-50 border-green-300' : 'bg-white border-slate-200 hover:border-green-200',
      icon: 'text-green-600',
      count: 'text-green-700',
      label: isActive ? 'text-green-700' : 'text-slate-500',
    },
    purple: {
      bg: isActive ? 'bg-purple-50 border-purple-300' : 'bg-white border-slate-200 hover:border-purple-200',
      icon: 'text-purple-600',
      count: 'text-purple-700',
      label: isActive ? 'text-purple-700' : 'text-slate-500',
    },
  }

  const styles = colorStyles[color]

  return (
    <button
      onClick={onClick}
      className={cn(
        'flex-1 p-4 rounded-lg border-2 transition-all cursor-pointer shadow-sm',
        styles.bg
      )}
    >
      <div className="flex items-center justify-between mb-2">
        <span className={cn('text-xs font-medium uppercase tracking-wide', styles.label)}>
          {label}
        </span>
        <span className={styles.icon}>{icon}</span>
      </div>
      <p className={cn('text-3xl font-bold', styles.count)}>{count}</p>
    </button>
  )
}

export function DashboardClient() {
  const [activeView, setActiveView] = useState<ViewType>('pending')
  const [data, setData] = useState<DashboardData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)
      const response = await apiFetch('/api/customer/dashboard')
      if (!response.ok) {
        throw new Error('Failed to fetch dashboard data')
      }
      const result = await response.json()
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const counts = data?.counts || {
    pending: 0,
    awaiting: 0,
    completed: 0,
    authorized: 0,
  }

  if (isLoading && !data) {
    return (
      <div className="p-3 h-full">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden h-full flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
        </div>
      </div>
    )
  }

  return (
    <div className="p-3 h-full">
      {/* Master Bounding Box */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden h-full">
        <div className="p-6 overflow-auto h-full">
          {/* Header with Company Name and POC Badge */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-3">
                {data?.companyName && (
                  <span className="text-sm text-slate-500">{data.companyName}</span>
                )}
                {data?.isPrimaryPoc && (
                  <Link
                    href="/customer/users"
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 hover:bg-amber-200 transition-colors"
                  >
                    <Crown className="h-3 w-3" />
                    Primary POC
                  </Link>
                )}
              </div>
              {data && (
                <Link
                  href="/customer/users"
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                >
                  <Users className="h-4 w-4" />
                  Team ({data.userCount})
                </Link>
              )}
            </div>
            <h1 className="text-2xl font-bold text-slate-900">{viewTitles[activeView]}</h1>
            <p className="text-slate-500 mt-1">{viewDescriptions[activeView]}</p>
          </div>

          {/* Stat Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatCard
              label="Pending Review"
              count={counts.pending}
              icon={<Bell className="h-5 w-5" />}
              color="blue"
              isActive={activeView === 'pending'}
              onClick={() => setActiveView('pending')}
            />
            <StatCard
              label="In Discussion"
              count={counts.awaiting}
              icon={<MessageSquare className="h-5 w-5" />}
              color="orange"
              isActive={activeView === 'awaiting'}
              onClick={() => setActiveView('awaiting')}
            />
            <StatCard
              label="Completed"
              count={counts.completed}
              icon={<CheckCircle className="h-5 w-5" />}
              color="green"
              isActive={activeView === 'completed'}
              onClick={() => setActiveView('completed')}
            />
            <StatCard
              label="Authorized"
              count={counts.authorized}
              icon={<FileText className="h-5 w-5" />}
              color="purple"
              isActive={activeView === 'authorized'}
              onClick={() => setActiveView('authorized')}
            />
          </div>

          {/* Error State */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <p className="text-red-600">{error}</p>
              <button
                onClick={fetchData}
                className="mt-2 text-sm text-red-700 underline hover:no-underline"
              >
                Try again
              </button>
            </div>
          )}

          {/* Content */}
          <div className="bg-white rounded-lg border shadow-sm">
            {activeView === 'pending' && (
              <PendingReviewTable
                certificates={data?.pending || []}
                isLoading={isLoading}
              />
            )}
            {activeView === 'awaiting' && (
              <AwaitingResponseTable
                certificates={data?.awaiting || []}
                isLoading={isLoading}
              />
            )}
            {activeView === 'completed' && (
              <CompletedTable
                certificates={data?.completed || []}
                isLoading={isLoading}
              />
            )}
            {activeView === 'authorized' && (
              <AuthorizedTable
                certificates={data?.authorized || []}
                isLoading={isLoading}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
