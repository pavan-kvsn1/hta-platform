'use client'

import { apiFetch } from '@/lib/api-client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Loader2,
  Unlock,
  UserPlus,
  Crown,
  ChevronRight,
  ChevronLeft,
  Inbox,
  Search,
  Eye,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDistanceToNow } from 'date-fns'

interface UnifiedRequest {
  id: string
  category: 'internal' | 'customer'
  type: string
  status: string
  title: string
  subtitle: string
  details: string
  requestedBy: string
  requestedByEmail: string
  createdAt: string
}

interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

interface Counts {
  pending: {
    sectionUnlock: number
    userAddition: number
    pocChange: number
    total: number
  }
  approved: number
  rejected: number
}

const TYPE_CONFIG = {
  SECTION_UNLOCK: {
    icon: Unlock,
    shortLabel: 'Unlock',
    badgeBg: 'bg-[#eff6ff]',
    badgeText: 'text-[#1d4ed8]',
    borderColor: 'border-l-[#3b82f6]',
  },
  USER_ADDITION: {
    icon: UserPlus,
    shortLabel: 'User Add',
    badgeBg: 'bg-[#f0fdf4]',
    badgeText: 'text-[#16a34a]',
    borderColor: 'border-l-[#22c55e]',
  },
  POC_CHANGE: {
    icon: Crown,
    shortLabel: 'POC',
    badgeBg: 'bg-[#faf5ff]',
    badgeText: 'text-[#7c3aed]',
    borderColor: 'border-l-[#8b5cf6]',
  },
}

// --- Nested Components ---

function RequestsTable({
  requests,
  onRowClick,
}: {
  requests: UnifiedRequest[]
  onRowClick: (request: UnifiedRequest) => void
}) {
  const getTypeConfig = (type: string) => {
    return TYPE_CONFIG[type as keyof typeof TYPE_CONFIG] || TYPE_CONFIG.SECTION_UNLOCK
  }

  return (
    <table className="w-full text-[13px]">
      <thead>
        <tr className="border-b border-[#e2e8f0] bg-[#f8fafc]">
          <th className="text-left py-2.5 px-4 text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8] w-[120px]">Type</th>
          <th className="text-left py-2.5 px-4 text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Request</th>
          <th className="text-left py-2.5 px-4 text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8] w-[90px]">Status</th>
          <th className="text-left py-2.5 px-4 text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8] w-[110px]">Requested</th>
          <th className="text-center py-2.5 px-4 text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8] w-[60px]">View</th>
        </tr>
      </thead>
      <tbody>
        {requests.map((request) => {
          const typeConfig = getTypeConfig(request.type)
          const Icon = typeConfig.icon

          return (
            <tr
              key={`${request.category}-${request.id}`}
              onClick={() => onRowClick(request)}
              className={cn(
                'border-b border-[#f1f5f9] cursor-pointer hover:bg-[#f8fafc] transition-colors border-l-4',
                typeConfig.borderColor
              )}
            >
              <td className="py-2.5 px-4">
                <span className={cn(
                  'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold',
                  typeConfig.badgeBg,
                  typeConfig.badgeText
                )}>
                  <Icon className="size-3" />
                  {typeConfig.shortLabel}
                </span>
              </td>
              <td className="py-2.5 px-4">
                <p className="font-medium text-[#0f172a] truncate">{request.title}</p>
                <p className="text-[12px] text-[#64748b] truncate">{request.details}</p>
                <p className="text-[11px] text-[#94a3b8] mt-0.5">{request.subtitle}</p>
              </td>
              <td className="py-2.5 px-4">
                <span className={cn(
                  'inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold',
                  request.status === 'PENDING' && 'bg-[#fffbeb] text-[#d97706]',
                  request.status === 'APPROVED' && 'bg-[#f0fdf4] text-[#16a34a]',
                  request.status === 'REJECTED' && 'bg-[#fef2f2] text-[#dc2626]'
                )}>
                  {request.status === 'APPROVED' ? 'Approved' : request.status === 'REJECTED' ? 'Rejected' : 'Pending'}
                </span>
              </td>
              <td className="py-2.5 px-4 text-[#94a3b8]">
                {formatDistanceToNow(new Date(request.createdAt), { addSuffix: true })}
              </td>
              <td className="py-2.5 px-4 text-center">
                <button className="p-1.5 text-[#94a3b8] hover:text-[#0f172a] hover:bg-[#f1f5f9] rounded-md transition-colors">
                  <Eye className="size-3.5" />
                </button>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

// --- Main Page Component ---

export default function AdminRequestsPage() {
  const router = useRouter()
  const [requests, setRequests] = useState<UnifiedRequest[]>([])
  const [pagination, setPagination] = useState<Pagination | null>(null)
  const [counts, setCounts] = useState<Counts | null>(null)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('PENDING')
  const [typeFilter, setTypeFilter] = useState('ALL')
  const [searchQuery, setSearchQuery] = useState('')
  const [page, setPage] = useState(1)
  const [rowsPerPage, setRowsPerPage] = useState(10)

  const fetchRequests = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('status', statusFilter)
      if (typeFilter !== 'ALL') params.set('type', typeFilter)
      params.set('page', page.toString())
      params.set('limit', rowsPerPage.toString())

      const res = await apiFetch(`/api/admin/requests?${params}`)
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
  }, [statusFilter, typeFilter, page, rowsPerPage])

  useEffect(() => {
    fetchRequests()
  }, [statusFilter, typeFilter, page, fetchRequests])

  // Client-side search filtering
  const filteredRequests = useMemo(() => {
    if (!searchQuery.trim()) return requests
    const query = searchQuery.toLowerCase()
    return requests.filter(
      (r) =>
        r.title.toLowerCase().includes(query) ||
        r.details.toLowerCase().includes(query) ||
        r.requestedBy.toLowerCase().includes(query) ||
        r.requestedByEmail.toLowerCase().includes(query)
    )
  }, [requests, searchQuery])

  const handleRowClick = (request: UnifiedRequest) => {
    const queryType = request.category === 'internal' ? 'internal' : 'customer'
    router.push(`/admin/requests/${request.id}?type=${queryType}`)
  }

  return (
    <div className="h-full overflow-auto bg-[#f1f5f9]">
      <div className="px-6 sm:px-9 py-8">
        {/* Back Link */}
        <Link
          href="/admin"
          className="inline-flex items-center gap-1 text-[13px] text-[#64748b] hover:text-[#0f172a] mb-6 transition-colors"
        >
          <ChevronLeft className="size-4" />
          Back to Admin
        </Link>

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-[22px] font-bold text-[#0f172a] flex items-center gap-2.5">
              <Inbox className="size-[22px] text-[#94a3b8]" />
              All Requests
            </h1>
            <p className="text-[13px] text-[#94a3b8] mt-1">
              Review and approve internal and customer requests
            </p>
          </div>

          {/* Pending / Resolved Toggle */}
          <div className="flex items-center gap-1 bg-white border border-[#e2e8f0] rounded-[9px] p-1">
            <button
              onClick={() => { setStatusFilter('PENDING'); setTypeFilter('ALL'); setPage(1) }}
              className={cn(
                'px-4 py-1.5 text-[12.5px] font-semibold rounded-[7px] transition-colors',
                statusFilter === 'PENDING'
                  ? 'bg-[#0f172a] text-white'
                  : 'text-[#64748b] hover:text-[#0f172a]'
              )}
            >
              Pending
              {counts && (
                <span className={cn(
                  'ml-1.5 px-1.5 py-0.5 text-[10px] font-bold rounded',
                  statusFilter === 'PENDING'
                    ? 'bg-white/20 text-white'
                    : 'bg-[#fffbeb] text-[#d97706]'
                )}>
                  {counts.pending.total}
                </span>
              )}
            </button>
            <button
              onClick={() => { setStatusFilter('APPROVED'); setTypeFilter('ALL'); setPage(1) }}
              className={cn(
                'px-4 py-1.5 text-[12.5px] font-semibold rounded-[7px] transition-colors',
                statusFilter !== 'PENDING'
                  ? 'bg-[#0f172a] text-white'
                  : 'text-[#64748b] hover:text-[#0f172a]'
              )}
            >
              Resolved
              {counts && (
                <span className={cn(
                  'ml-1.5 px-1.5 py-0.5 text-[10px] font-bold rounded',
                  statusFilter !== 'PENDING'
                    ? 'bg-white/20 text-white'
                    : 'bg-[#f1f5f9] text-[#64748b]'
                )}>
                  {counts.approved + counts.rejected}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Summary Cards - Only for Pending */}
        {statusFilter === 'PENDING' && counts && (
          <div className="grid grid-cols-3 gap-4 mb-5">
            {([
              { key: 'SECTION_UNLOCK', count: counts.pending.sectionUnlock, label: 'Section Unlock', borderColor: 'border-l-[#3b82f6]', countColor: 'text-[#1d4ed8]', activeBg: 'bg-[#eff6ff]' },
              { key: 'USER_ADDITION', count: counts.pending.userAddition, label: 'User Addition', borderColor: 'border-l-[#22c55e]', countColor: 'text-[#15803d]', activeBg: 'bg-[#f0fdf4]' },
              { key: 'POC_CHANGE', count: counts.pending.pocChange, label: 'POC Change', borderColor: 'border-l-[#8b5cf6]', countColor: 'text-[#7c3aed]', activeBg: 'bg-[#faf5ff]' },
            ] as const).map((card) => {
              const isActive = typeFilter === card.key
              return (
                <button
                  key={card.key}
                  onClick={() => { setTypeFilter(isActive ? 'ALL' : card.key); setPage(1) }}
                  className={cn(
                    'border border-[#e2e8f0] rounded-xl px-5 py-5 border-l-[3px] text-left transition-all',
                    card.borderColor,
                    isActive ? card.activeBg : 'bg-white hover:bg-[#f8fafc]'
                  )}
                >
                  <div className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8] mb-2.5">{card.label}</div>
                  <div className={cn('text-[38px] font-extrabold leading-none tracking-tight', card.countColor)}>{card.count}</div>
                </button>
              )
            })}
          </div>
        )}

        {/* Filters */}
        <div className="bg-white rounded-[14px] border border-[#e2e8f0] p-4 mb-5">
          <div className="flex flex-wrap items-end gap-4">
            <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(1) }}>
              <SelectTrigger className="w-[180px] px-3 py-2 text-[13px] text-[#0f172a] border border-[#e2e8f0] rounded-[9px] bg-white focus:ring-2 focus:ring-[#7c3aed]/20 focus:border-[#7c3aed]">
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Types</SelectItem>
                <SelectItem value="SECTION_UNLOCK">Section Unlock</SelectItem>
                <SelectItem value="USER_ADDITION">User Addition</SelectItem>
                <SelectItem value="POC_CHANGE">POC Change</SelectItem>
              </SelectContent>
            </Select>

            {statusFilter !== 'PENDING' && (
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1) }}>
                <SelectTrigger className="w-[150px] px-3 py-2 text-[13px] text-[#0f172a] border border-[#e2e8f0] rounded-[9px] bg-white focus:ring-2 focus:ring-[#7c3aed]/20 focus:border-[#7c3aed]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="APPROVED">Approved</SelectItem>
                  <SelectItem value="REJECTED">Rejected</SelectItem>
                </SelectContent>
              </Select>
            )}

            <div className="relative flex-1 min-w-[200px] max-w-sm">
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
                {searchQuery ? 'No matching requests' : `No ${statusFilter.toLowerCase()} requests`}
              </p>
              <p className="text-[12px] text-[#94a3b8] mt-1">
                {searchQuery
                  ? 'Try a different search term.'
                  : statusFilter === 'PENDING'
                    ? 'All caught up! Check back later.'
                    : 'No requests match your filters.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <RequestsTable requests={filteredRequests} onRowClick={handleRowClick} />
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
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <span className="text-[12px] text-[#94a3b8]">Rows</span>
                  <select
                    value={rowsPerPage}
                    onChange={(e) => { setRowsPerPage(Number(e.target.value)); setPage(1) }}
                    className="h-7 px-1.5 border border-[#e2e8f0] rounded-[7px] text-[12.5px] text-[#0f172a] bg-white outline-none"
                  >
                    {[10, 15, 25].map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>
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
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="mt-3 flex flex-wrap gap-4 text-[11px] text-[#94a3b8]">
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-[#3b82f6]" /> = Unlock
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-[#22c55e]" /> = User Add
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-[#8b5cf6]" /> = POC
          </span>
          <span className="ml-auto">Click row to review</span>
        </div>
      </div>
    </div>
  )
}
