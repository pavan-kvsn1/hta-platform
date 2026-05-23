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
  Trash2,
  Download,
  ChevronRight,
  ChevronLeft,
  Inbox,
  Search,
  Eye,
  PenLine,
  KeyRound,
  Monitor,
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
    fieldChange: number
    offlineCodeRequest: number
    desktopVpnRequest: number
    userAddition: number
    pocChange: number
    accountDeletion: number
    dataExport: number
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
  FIELD_CHANGE: {
    icon: PenLine,
    shortLabel: 'Field Edit',
    badgeBg: 'bg-[#fefce8]',
    badgeText: 'text-[#a16207]',
    borderColor: 'border-l-[#eab308]',
  },
  OFFLINE_CODE_REQUEST: {
    icon: KeyRound,
    shortLabel: 'Offline Code',
    badgeBg: 'bg-[#ede9fe]',
    badgeText: 'text-[#6d28d9]',
    borderColor: 'border-l-[#a78bfa]',
  },
  DESKTOP_VPN_REQUEST: {
    icon: Monitor,
    shortLabel: 'Desktop VPN',
    badgeBg: 'bg-[#ecfdf5]',
    badgeText: 'text-[#065f46]',
    borderColor: 'border-l-[#10b981]',
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
  ACCOUNT_DELETION: {
    icon: Trash2,
    shortLabel: 'Delete',
    badgeBg: 'bg-[#fef2f2]',
    badgeText: 'text-[#dc2626]',
    borderColor: 'border-l-[#ef4444]',
  },
  DATA_EXPORT: {
    icon: Download,
    shortLabel: 'Export',
    badgeBg: 'bg-[#fff7ed]',
    badgeText: 'text-[#c2410c]',
    borderColor: 'border-l-[#f97316]',
  },
}

const INTERNAL_TYPES = ['SECTION_UNLOCK', 'FIELD_CHANGE', 'OFFLINE_CODE_REQUEST', 'DESKTOP_VPN_REQUEST']
const CUSTOMER_TYPES = ['USER_ADDITION', 'POC_CHANGE', 'ACCOUNT_DELETION', 'DATA_EXPORT']

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
    <table className="w-full min-w-[980px] text-[13px]">
      <thead>
        <tr className="border-b border-[#e2e8f0] bg-[#f8fafc]">
          <th className="text-left py-2.5 px-4 text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8] w-[110px]">Source</th>
          <th className="text-left py-2.5 px-4 text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8] w-[150px]">Type</th>
          <th className="text-left py-2.5 px-4 text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Request</th>
          <th className="text-left py-2.5 px-4 text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8] w-[190px]">Requested By</th>
          <th className="text-left py-2.5 px-4 text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8] w-[110px]">Status</th>
          <th className="text-left py-2.5 px-4 text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8] w-[140px]">Requested</th>
          <th className="text-center py-2.5 px-4 text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8] w-[64px]">View</th>
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
                  'inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold capitalize',
                  request.category === 'internal'
                    ? 'bg-[#eef2ff] text-[#3730a3]'
                    : 'bg-[#f0fdfa] text-[#0f766e]'
                )}>
                  {request.category}
                </span>
              </td>
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
              <td className="py-2.5 px-4 min-w-0">
                <p className="font-medium text-[#0f172a] truncate">{request.title}</p>
                <p className="text-[12px] text-[#64748b] truncate">{request.details}</p>
              </td>
              <td className="py-2.5 px-4">
                <p className="font-medium text-[#0f172a] truncate">{request.requestedBy}</p>
                {request.requestedByEmail && (
                  <p className="text-[11px] text-[#94a3b8] truncate">{request.requestedByEmail}</p>
                )}
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
  const [sourceFilter, setSourceFilter] = useState('ALL')
  const [typeFilter, setTypeFilter] = useState('ALL')
  const [searchQuery, setSearchQuery] = useState('')
  const [page, setPage] = useState(1)
  const [rowsPerPage, setRowsPerPage] = useState(10)

  const fetchRequests = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('status', statusFilter)
      if (sourceFilter !== 'ALL') params.set('source', sourceFilter)
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
  }, [statusFilter, sourceFilter, typeFilter, page, rowsPerPage])

  useEffect(() => {
    fetchRequests()
  }, [statusFilter, sourceFilter, typeFilter, page, fetchRequests])

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

  const pendingInternalCount = counts
    ? counts.pending.sectionUnlock + counts.pending.fieldChange + counts.pending.offlineCodeRequest + counts.pending.desktopVpnRequest
    : 0
  const pendingCustomerCount = counts
    ? counts.pending.userAddition + counts.pending.pocChange + counts.pending.accountDeletion + counts.pending.dataExport
    : 0
  const typeOptions = sourceFilter === 'internal'
    ? INTERNAL_TYPES
    : sourceFilter === 'customer'
    ? CUSTOMER_TYPES
    : [...INTERNAL_TYPES, ...CUSTOMER_TYPES]

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
              onClick={() => { setStatusFilter('PENDING'); setSourceFilter('ALL'); setTypeFilter('ALL'); setPage(1) }}
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
              onClick={() => { setStatusFilter('APPROVED'); setSourceFilter('ALL'); setTypeFilter('ALL'); setPage(1) }}
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
            {([
              {
                key: 'internal',
                count: pendingInternalCount,
                label: 'Internal',
                detail: `Unlock ${counts.pending.sectionUnlock} | Field ${counts.pending.fieldChange} | Offline ${counts.pending.offlineCodeRequest} | VPN ${counts.pending.desktopVpnRequest}`,
                borderColor: 'border-l-[#4f46e5]',
                countColor: 'text-[#3730a3]',
                activeBg: 'bg-[#eef2ff]',
              },
              {
                key: 'customer',
                count: pendingCustomerCount,
                label: 'Customer',
                detail: `User ${counts.pending.userAddition} | POC ${counts.pending.pocChange} | Delete ${counts.pending.accountDeletion} | Export ${counts.pending.dataExport}`,
                borderColor: 'border-l-[#0f766e]',
                countColor: 'text-[#0f766e]',
                activeBg: 'bg-[#f0fdfa]',
              },
            ] as const).map((card) => {
              const isActive = sourceFilter === card.key
              return (
                <button
                  key={card.key}
                  onClick={() => { setSourceFilter(isActive ? 'ALL' : card.key); setTypeFilter('ALL'); setPage(1) }}
                  className={cn(
                    'border border-[#e2e8f0] rounded-xl px-5 py-4 border-l-[3px] text-left transition-all',
                    card.borderColor,
                    isActive ? card.activeBg : 'bg-white hover:bg-[#f8fafc]'
                  )}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8] mb-2">{card.label}</div>
                      <div className="text-[12px] font-medium text-[#64748b]">{card.detail}</div>
                    </div>
                    <div className={cn('text-[34px] font-extrabold leading-none tracking-tight', card.countColor)}>{card.count}</div>
                  </div>
                </button>
              )
            })}
          </div>
        )}

        {/* Filters */}
        <div className="bg-white rounded-[14px] border border-[#e2e8f0] p-4 mb-5">
          <div className="flex flex-wrap items-end gap-4">
            <Select value={sourceFilter} onValueChange={(v) => { setSourceFilter(v); setTypeFilter('ALL'); setPage(1) }}>
              <SelectTrigger className="w-[150px] px-3 py-2 text-[13px] text-[#0f172a] border border-[#e2e8f0] rounded-[9px] bg-white focus:ring-2 focus:ring-[#7c3aed]/20 focus:border-[#7c3aed]">
                <SelectValue placeholder="All Sources" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Sources</SelectItem>
                <SelectItem value="internal">Internal</SelectItem>
                <SelectItem value="customer">Customer</SelectItem>
              </SelectContent>
            </Select>

            <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(1) }}>
              <SelectTrigger className="w-[180px] px-3 py-2 text-[13px] text-[#0f172a] border border-[#e2e8f0] rounded-[9px] bg-white focus:ring-2 focus:ring-[#7c3aed]/20 focus:border-[#7c3aed]">
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Types</SelectItem>
                {typeOptions.map((type) => (
                  <SelectItem key={type} value={type}>
                    {TYPE_CONFIG[type as keyof typeof TYPE_CONFIG].shortLabel}
                  </SelectItem>
                ))}
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
      </div>
    </div>
  )
}
