'use client'

import { apiFetch } from '@/lib/api-client'
import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Loader2,
  Unlock,
  PenLine,
  KeyRound,
  Monitor,
  ChevronRight,
  ChevronLeft,
  Inbox,
  Search,
  Clock,
  CheckCircle2,
  XCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDistanceToNow } from 'date-fns'

interface UserRequest {
  id: string
  type: string
  status: string
  title: string
  details: string
  adminNote: string | null
  reviewedBy: string | null
  reviewedAt: string | null
  createdAt: string
}

interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

interface Counts {
  pending: number
  approved: number
  rejected: number
}

const TYPE_CONFIG = {
  SECTION_UNLOCK: {
    icon: Unlock,
    label: 'Section Unlock',
    badgeBg: 'bg-[#eff6ff]',
    badgeText: 'text-[#1d4ed8]',
    borderColor: 'border-l-[#3b82f6]',
  },
  FIELD_CHANGE: {
    icon: PenLine,
    label: 'Field Change',
    badgeBg: 'bg-[#fefce8]',
    badgeText: 'text-[#a16207]',
    borderColor: 'border-l-[#eab308]',
  },
  OFFLINE_CODE_REQUEST: {
    icon: KeyRound,
    label: 'Offline Code',
    badgeBg: 'bg-[#ede9fe]',
    badgeText: 'text-[#6d28d9]',
    borderColor: 'border-l-[#a78bfa]',
  },
  DESKTOP_VPN_REQUEST: {
    icon: Monitor,
    label: 'Desktop VPN',
    badgeBg: 'bg-[#ecfdf5]',
    badgeText: 'text-[#065f46]',
    borderColor: 'border-l-[#10b981]',
  },
}

const STATUS_CONFIG = {
  PENDING: { icon: Clock, label: 'Pending', bg: 'bg-[#fffbeb]', text: 'text-[#d97706]' },
  APPROVED: { icon: CheckCircle2, label: 'Approved', bg: 'bg-[#f0fdf4]', text: 'text-[#16a34a]' },
  REJECTED: { icon: XCircle, label: 'Rejected', bg: 'bg-[#fef2f2]', text: 'text-[#dc2626]' },
}

export default function MyRequestsPage() {
  const [requests, setRequests] = useState<UserRequest[]>([])
  const [pagination, setPagination] = useState<Pagination | null>(null)
  const [counts, setCounts] = useState<Counts | null>(null)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [searchQuery, setSearchQuery] = useState('')
  const [page, setPage] = useState(1)

  const fetchRequests = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter !== 'ALL') params.set('status', statusFilter)
      params.set('page', page.toString())
      params.set('limit', '15')

      const res = await apiFetch(`/api/internal-requests?${params}`)
      if (res.ok) {
        const data = await res.json()
        setRequests(data.requests)
        setPagination(data.pagination)
        setCounts(data.counts)
      }
    } catch (error) {
      console.error('Failed to fetch requests:', error)
    } finally {
      setLoading(false)
    }
  }, [statusFilter, page])

  useEffect(() => {
    fetchRequests()
  }, [fetchRequests])

  const filteredRequests = useMemo(() => {
    if (!searchQuery.trim()) return requests
    const query = searchQuery.toLowerCase()
    return requests.filter(
      (r) =>
        r.title.toLowerCase().includes(query) ||
        r.details.toLowerCase().includes(query)
    )
  }, [requests, searchQuery])

  const getTypeConfig = (type: string) =>
    TYPE_CONFIG[type as keyof typeof TYPE_CONFIG] || TYPE_CONFIG.SECTION_UNLOCK

  const getStatusConfig = (status: string) =>
    STATUS_CONFIG[status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.PENDING

  return (
    <div className="h-full overflow-auto bg-[#f1f5f9]">
      <div className="px-6 sm:px-9 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-[22px] font-bold text-[#0f172a] flex items-center gap-2.5">
              <Inbox className="size-[22px] text-[#94a3b8]" />
              My Requests
            </h1>
            <p className="text-[13px] text-[#94a3b8] mt-1">
              Track the status of your section unlock, field change, and offline code requests
            </p>
          </div>
        </div>

        {/* Summary Cards */}
        {counts && (
          <div className="grid grid-cols-3 gap-3 mb-5">
            {([
              { key: 'PENDING', count: counts.pending, label: 'Pending', icon: Clock, color: 'text-[#d97706]', borderColor: 'border-l-[#f59e0b]', activeBg: 'bg-[#fffbeb]' },
              { key: 'APPROVED', count: counts.approved, label: 'Approved', icon: CheckCircle2, color: 'text-[#16a34a]', borderColor: 'border-l-[#22c55e]', activeBg: 'bg-[#f0fdf4]' },
              { key: 'REJECTED', count: counts.rejected, label: 'Rejected', icon: XCircle, color: 'text-[#dc2626]', borderColor: 'border-l-[#ef4444]', activeBg: 'bg-[#fef2f2]' },
            ] as const).map((card) => {
              const isActive = statusFilter === card.key
              const Icon = card.icon
              return (
                <button
                  key={card.key}
                  onClick={() => { setStatusFilter(isActive ? 'ALL' : card.key); setPage(1) }}
                  className={cn(
                    'border border-[#e2e8f0] rounded-xl px-5 py-5 border-l-[3px] text-left transition-all',
                    card.borderColor,
                    isActive ? card.activeBg : 'bg-white hover:bg-[#f8fafc]'
                  )}
                >
                  <div className="flex items-center gap-2 mb-2.5">
                    <Icon className={cn('size-4', card.color)} />
                    <span className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">{card.label}</span>
                  </div>
                  <div className={cn('text-[38px] font-extrabold leading-none tracking-tight', card.color)}>{card.count}</div>
                </button>
              )
            })}
          </div>
        )}

        {/* Search */}
        <div className="bg-white rounded-[14px] border border-[#e2e8f0] p-4 mb-5">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-[#94a3b8]" />
            <input
              type="text"
              placeholder="Search requests..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-[13px] text-[#0f172a] border border-[#e2e8f0] rounded-[9px] placeholder:text-[#94a3b8] focus:ring-2 focus:ring-[#7c3aed]/20 focus:border-[#7c3aed] outline-none"
            />
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-[14px] border border-[#e2e8f0] overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="size-6 animate-spin text-[#94a3b8]" />
            </div>
          ) : filteredRequests.length === 0 ? (
            <div className="text-center py-16">
              <Inbox className="size-10 mx-auto mb-3 text-[#e2e8f0]" />
              <p className="text-[13px] font-medium text-[#64748b]">
                {searchQuery ? 'No matching requests' : 'No requests yet'}
              </p>
              <p className="text-[12px] text-[#94a3b8] mt-1">
                {searchQuery
                  ? 'Try a different search term.'
                  : 'Requests you raise for section unlocks, field changes, or offline codes will appear here.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-[#e2e8f0] bg-[#f8fafc]">
                    <th className="text-left py-2.5 px-4 text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8] w-[130px]">Type</th>
                    <th className="text-left py-2.5 px-4 text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Request</th>
                    <th className="text-left py-2.5 px-4 text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8] w-[100px]">Status</th>
                    <th className="text-left py-2.5 px-4 text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8] w-[110px]">Submitted</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRequests.map((request) => {
                    const typeConfig = getTypeConfig(request.type)
                    const statusConfig = getStatusConfig(request.status)
                    const TypeIcon = typeConfig.icon

                    return (
                      <tr
                        key={request.id}
                        className={cn(
                          'border-b border-[#f1f5f9] border-l-4 transition-colors',
                          typeConfig.borderColor,
                          request.adminNote ? 'hover:bg-[#f8fafc] cursor-default' : ''
                        )}
                      >
                        <td className="py-2.5 px-4">
                          <span className={cn(
                            'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold',
                            typeConfig.badgeBg,
                            typeConfig.badgeText
                          )}>
                            <TypeIcon className="size-3" />
                            {typeConfig.label}
                          </span>
                        </td>
                        <td className="py-2.5 px-4">
                          <p className="font-medium text-[#0f172a] truncate">{request.title}</p>
                          <p className="text-[12px] text-[#64748b] truncate">{request.details}</p>
                          {request.adminNote && (
                            <p className="text-[11px] text-[#94a3b8] mt-1 italic">
                              Admin: {request.adminNote}
                            </p>
                          )}
                        </td>
                        <td className="py-2.5 px-4">
                          <span className={cn(
                            'inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold',
                            statusConfig.bg,
                            statusConfig.text
                          )}>
                            {statusConfig.label}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-[#94a3b8]">
                          {formatDistanceToNow(new Date(request.createdAt), { addSuffix: true })}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-3.5 border-t border-[#f1f5f9]">
              <p className="text-[12.5px] text-[#94a3b8]">
                Showing {(pagination.page - 1) * pagination.limit + 1}&ndash;
                {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
                {pagination.total} requests
              </p>
              <div className="flex items-center gap-1">
                <button
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="px-2.5 py-1.5 text-[12px] border border-[#e2e8f0] rounded-[7px] hover:bg-[#f8fafc] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="size-3.5" />
                </button>
                <button
                  disabled={page >= pagination.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="px-2.5 py-1.5 text-[12px] border border-[#e2e8f0] rounded-[7px] hover:bg-[#f8fafc] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="size-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
