'use client'

import { apiFetch } from '@/lib/api-client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  ArrowLeft,
  Loader2,
  Unlock,
  UserPlus,
  Crown,
  ChevronRight,
  ChevronLeft,
  Inbox,
  Search,
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
    label: 'Section Unlock',
    shortLabel: 'Unlock',
    color: 'bg-blue-500',
    lightColor: 'bg-blue-50',
    textColor: 'text-blue-700',
    borderColor: 'border-l-blue-500',
  },
  USER_ADDITION: {
    icon: UserPlus,
    label: 'User Addition',
    shortLabel: 'User Add',
    color: 'bg-green-500',
    lightColor: 'bg-green-50',
    textColor: 'text-green-700',
    borderColor: 'border-l-green-500',
  },
  POC_CHANGE: {
    icon: Crown,
    label: 'POC Change',
    shortLabel: 'POC',
    color: 'bg-purple-500',
    lightColor: 'bg-purple-50',
    textColor: 'text-purple-700',
    borderColor: 'border-l-purple-500',
  },
}

const STATUS_CONFIG = {
  PENDING: {
    label: 'Pending',
    color: 'bg-amber-100 text-amber-700',
  },
  APPROVED: {
    label: 'Approved',
    color: 'bg-green-100 text-green-700',
  },
  REJECTED: {
    label: 'Rejected',
    color: 'bg-red-100 text-red-700',
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

  const getStatusConfig = (status: string) => {
    return STATUS_CONFIG[status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.PENDING
  }

  return (
    <table className="w-full border border border-slate-300 rounded-xl">
      <thead className="bg-slate-50 sticky top-0 rounded-xl">
        <tr>
          <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-6 py-3 w-[140px]">
            Type
          </th>
          <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-6 py-3">  
            Request
          </th>
          <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-6 py-3 w-[100px]">
            Status
          </th>
          <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-6 py-3 w-[120px]">
            Requested
          </th>
          <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-6 py-3 w-[80px]">
            Actions
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {requests.map((request) => {
          const typeConfig = getTypeConfig(request.type)
          const statusConfig = getStatusConfig(request.status)
          const Icon = typeConfig.icon

          return (
            <tr
              key={`${request.category}-${request.id}`}
              onClick={() => onRowClick(request)}
              className={cn(
                'cursor-pointer transition-colors hover:bg-slate-50 border border-slate-300',
                'border-l-4',
                typeConfig.borderColor
              )}
            >
              {/* Type Column */}
              <td className="px-6 py-4">
                <div className="flex items-center gap-2 border">
                  <div className={cn('p-1.5 rounded-lg', typeConfig.lightColor)}>
                    <Icon className={cn('h-4 w-4', typeConfig.textColor)} />
                  </div>
                  <span className={cn('text-xs font-semibold', typeConfig.textColor)}>
                    {typeConfig.shortLabel}
                  </span>
                </div>
              </td>

              {/* Request Column */}
              <td className="px-6 py-4">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900 truncate">
                    {request.title}
                  </p>
                  <p className="text-sm text-slate-600 truncate">
                    {request.details}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {request.subtitle}
                  </p>
                </div>
              </td>

              {/* Status Column */}
              <td className="px-6 py-4">
                <span className={cn(
                  'inline-flex px-2 py-1 text-xs font-bold rounded',
                  statusConfig.color
                )}>
                  {statusConfig.label}
                </span>
              </td>

              {/* Requested Column */}
              <td className="px-6 py-4">
                <span className="text-sm text-slate-500">
                  {formatDistanceToNow(new Date(request.createdAt), { addSuffix: true })}
                </span>
              </td>

              {/* Actions Column */}
              <td className="px-6 py-4">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-slate-400 hover:text-slate-600"
                >
                  Review
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
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

  const fetchRequests = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('status', statusFilter)
      if (typeFilter !== 'ALL') params.set('type', typeFilter)
      params.set('page', page.toString())
      params.set('limit', '15')

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
  }, [statusFilter, typeFilter, page])

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
    <div className="p-3 h-full">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden h-full flex flex-col">
        {/* Header Section */}
        <div className="bg-white border-b border-slate-200 px-6 py-4">
          <Link
            href="/admin"
            className="inline-flex items-center text-sm text-slate-500 hover:text-slate-900 mb-3 transition-colors"
          >
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Back to Admin
          </Link>

          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Pending Requests</h1>
              <p className="text-slate-500 text-sm mt-0.5">
                Review and approve internal and customer requests
              </p>
            </div>

            {/* Status Toggle */}
            <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
              <button
                onClick={() => { setStatusFilter('PENDING'); setTypeFilter('ALL'); setPage(1) }}
                className={cn(
                  'px-4 py-1.5 text-sm font-medium rounded-md transition-colors',
                  statusFilter === 'PENDING'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                )}
              >
                Pending
                {counts && (
                  <span className="ml-1.5 px-1.5 py-0.5 text-xs font-bold bg-amber-100 text-amber-700 rounded">
                    {counts.pending.total}
                  </span>
                )}
              </button>
              <button
                onClick={() => { setStatusFilter('APPROVED'); setTypeFilter('ALL'); setPage(1) }}
                className={cn(
                  'px-4 py-1.5 text-sm font-medium rounded-md transition-colors',
                  statusFilter !== 'PENDING'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                )}
              >
                Resolved
                {counts && (
                  <span className="ml-1.5 px-1.5 py-0.5 text-xs font-bold bg-slate-200 text-slate-600 rounded">
                    {counts.approved + counts.rejected}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Summary Cards - Only for Pending */}
        {statusFilter === 'PENDING' && counts && (
          <div className="px-6 py-4 bg-slate-50/50 border-b border-slate-200">
            <div className="grid grid-cols-3 gap-4">
              {/* Section Unlock */}
              <button
                onClick={() => { setTypeFilter(typeFilter === 'SECTION_UNLOCK' ? 'ALL' : 'SECTION_UNLOCK'); setPage(1) }}
                className={cn(
                  'flex items-center gap-3 p-4 rounded-xl border-2 transition-all',
                  typeFilter === 'SECTION_UNLOCK'
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-slate-300 bg-white hover:border-slate-300'
                )}
              >
                <div className="p-2.5 bg-blue-100 rounded-lg">
                  <Unlock className="h-5 w-5 text-blue-600" />
                </div>
                <div className="text-left">
                  <p className="text-2xl font-bold text-slate-900">{counts.pending.sectionUnlock}</p>
                  <p className="text-xs text-slate-500">Section Unlock</p>
                </div>
              </button>

              {/* User Addition */}
              <button
                onClick={() => { setTypeFilter(typeFilter === 'USER_ADDITION' ? 'ALL' : 'USER_ADDITION'); setPage(1) }}
                className={cn(
                  'flex items-center gap-3 p-4 rounded-xl border-2 transition-all',
                  typeFilter === 'USER_ADDITION'
                    ? 'border-green-500 bg-green-50'
                    : 'border-slate-300 bg-white hover:border-slate-300'
                )}
              >
                <div className="p-2.5 bg-green-100 rounded-lg">
                  <UserPlus className="h-5 w-5 text-green-600" />
                </div>
                <div className="text-left">
                  <p className="text-2xl font-bold text-slate-900">{counts.pending.userAddition}</p>
                  <p className="text-xs text-slate-500">User Addition</p>
                </div>
              </button>

              {/* POC Change */}
              <button
                onClick={() => { setTypeFilter(typeFilter === 'POC_CHANGE' ? 'ALL' : 'POC_CHANGE'); setPage(1) }}
                className={cn(
                  'flex items-center gap-3 p-4 rounded-xl border-2 transition-all',
                  typeFilter === 'POC_CHANGE'
                    ? 'border-purple-500 bg-purple-50'
                    : 'border-slate-300 bg-white hover:border-slate-300'
                )}
              >
                <div className="p-2.5 bg-purple-100 rounded-lg">
                  <Crown className="h-5 w-5 text-purple-600" />
                </div>
                <div className="text-left">
                  <p className="text-2xl font-bold text-slate-900">{counts.pending.pocChange}</p>
                  <p className="text-xs text-slate-500">POC Change</p>
                </div>
              </button>
            </div>
          </div>
        )}

        {/* Filters Row */}
        <div className="px-6 py-3 flex items-center gap-4 bg-white">
          <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(1) }}>
            <SelectTrigger className="w-[180px] border border-slate-300 rounded-sm">
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
              <SelectTrigger className="w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="APPROVED">Approved</SelectItem>
                <SelectItem value="REJECTED">Rejected</SelectItem>
              </SelectContent>
            </Select>
          )}

          <div className="relative flex-1 max-w-xs border border-slate-300 rounded-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search requests..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {/* Table Content */}
        <div className="flex-1 overflow-auto p-5">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
            </div>
          ) : filteredRequests.length === 0 ? (
            <div className="text-center py-16 text-slate-500">
              <Inbox className="h-12 w-12 mx-auto mb-3 text-slate-300" />
              <p className="font-medium">
                {searchQuery ? 'No matching requests' : `No ${statusFilter.toLowerCase()} requests`}
              </p>
              <p className="text-sm text-slate-400 mt-1">
                {searchQuery
                  ? 'Try a different search term.'
                  : statusFilter === 'PENDING'
                    ? 'All caught up! Check back later.'
                    : 'No requests match your filters.'}
              </p>
            </div>
          ) : (
            <RequestsTable requests={filteredRequests} onRowClick={handleRowClick}/>
          )}
        </div>

        {/* Pagination */}
        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-3 border-t border-slate-200 bg-slate-50/50">
            <p className="text-sm text-slate-500">
              Showing {(pagination.page - 1) * pagination.limit + 1} to{' '}
              {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
              {pagination.total} requests
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= pagination.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
