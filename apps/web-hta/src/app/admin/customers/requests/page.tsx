'use client'

import { apiFetch } from '@/lib/api-client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  UserPlus,
  Crown,
  Eye,
  Inbox,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDistanceToNow } from 'date-fns'

interface CustomerRequest {
  id: string
  type: 'USER_ADDITION' | 'POC_CHANGE'
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  data: { name?: string; email?: string; newPocUserId?: string; reason?: string }
  customerAccount: { id: string; companyName: string }
  requestedBy: { id: string; name: string; email: string } | null
  reviewedBy: { id: string; name: string } | null
  reviewedAt: string | null
  rejectionReason: string | null
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

export default function CustomerRequestsPage() {
  const router = useRouter()
  const [requests, setRequests] = useState<CustomerRequest[]>([])
  const [pagination, setPagination] = useState<Pagination | null>(null)
  const [counts, setCounts] = useState<Counts>({ pending: 0, approved: 0, rejected: 0 })
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('PENDING')
  const [typeFilter, setTypeFilter] = useState('ALL')
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

      const res = await apiFetch(`/api/admin/customers/requests?${params}`)
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

  return (
    <div className="h-full overflow-auto bg-[#f1f5f9]">
      <div className="px-6 sm:px-9 py-8">
        {/* Back Link */}
        <Link
          href="/admin/customers"
          className="inline-flex items-center gap-1 text-[13px] text-[#64748b] hover:text-[#0f172a] mb-6 transition-colors"
        >
          <ChevronLeft className="size-4" />
          Back to Customers
        </Link>

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-[22px] font-bold text-[#0f172a] flex items-center gap-2.5">
            <Inbox className="size-[22px] text-[#94a3b8]" />
            Customer Requests
          </h1>
          <p className="text-[13px] text-[#94a3b8] mt-1">
            Review and manage user addition and POC change requests
          </p>
        </div>

        {/* Status Tabs */}
        <div className="flex gap-1 mb-5 border-b border-[#e2e8f0]">
          {([
            { key: 'PENDING', label: 'Pending', count: counts.pending, activeColor: 'border-[#d97706] text-[#d97706]' },
            { key: 'APPROVED', label: 'Approved', count: counts.approved, activeColor: 'border-[#16a34a] text-[#16a34a]' },
            { key: 'REJECTED', label: 'Rejected', count: counts.rejected, activeColor: 'border-[#dc2626] text-[#dc2626]' },
          ] as const).map((tab) => (
            <button
              key={tab.key}
              onClick={() => { setStatusFilter(tab.key); setPage(1) }}
              className={cn(
                'px-4 py-2.5 text-[13px] font-semibold border-b-2 -mb-px transition-colors',
                statusFilter === tab.key
                  ? tab.activeColor
                  : 'border-transparent text-[#94a3b8] hover:text-[#64748b]'
              )}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>

        {/* Type Filter */}
        <div className="mb-5">
          <select
            value={typeFilter}
            onChange={(e) => { setTypeFilter(e.target.value); setPage(1) }}
            className="px-3 py-2 text-[13px] text-[#0f172a] border border-[#e2e8f0] rounded-[9px] bg-white focus:ring-2 focus:ring-[#7c3aed]/20 focus:border-[#7c3aed] outline-none"
          >
            <option value="ALL">All Types</option>
            <option value="USER_ADDITION">User Addition</option>
            <option value="POC_CHANGE">POC Change</option>
          </select>
        </div>

        {/* Table */}
        <div className="bg-white rounded-[14px] border border-[#e2e8f0] overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="size-6 animate-spin text-[#94a3b8]" />
            </div>
          ) : requests.length === 0 ? (
            <div className="text-center py-16">
              <Inbox className="size-10 mx-auto mb-3 text-[#e2e8f0]" />
              <p className="text-[13px] text-[#94a3b8]">No {statusFilter.toLowerCase()} requests found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-[#e2e8f0] bg-[#f8fafc]">
                    <th className="text-left py-2.5 px-4 text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Company</th>
                    <th className="text-left py-2.5 px-4 text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Type</th>
                    <th className="text-left py-2.5 px-4 text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Details</th>
                    <th className="text-left py-2.5 px-4 text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Requested</th>
                    {statusFilter !== 'PENDING' && (
                      <th className="text-left py-2.5 px-4 text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Status</th>
                    )}
                    <th className="text-center py-2.5 px-4 text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8] w-[60px]">View</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((request) => (
                    <tr
                      key={request.id}
                      className="border-b border-[#f1f5f9] hover:bg-[#f8fafc] transition-colors"
                    >
                      <td className="py-2.5 px-4 font-medium text-[#0f172a]">
                        {request.customerAccount.companyName}
                      </td>
                      <td className="py-2.5 px-4">
                        {request.type === 'USER_ADDITION' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-[#eff6ff] text-[#1d4ed8]">
                            <UserPlus className="size-3" />
                            User Addition
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-[#faf5ff] text-[#7c3aed]">
                            <Crown className="size-3" />
                            POC Change
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-[#64748b]">
                        {request.type === 'USER_ADDITION'
                          ? `${request.data.name} (${request.data.email})`
                          : 'POC change requested'}
                      </td>
                      <td className="py-2.5 px-4 text-[#94a3b8]">
                        {formatDistanceToNow(new Date(request.createdAt), { addSuffix: true })}
                      </td>
                      {statusFilter !== 'PENDING' && (
                        <td className="py-2.5 px-4">
                          <span
                            className={cn(
                              'inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold',
                              request.status === 'APPROVED' && 'bg-[#f0fdf4] text-[#16a34a]',
                              request.status === 'REJECTED' && 'bg-[#fef2f2] text-[#dc2626]',
                              request.status === 'PENDING' && 'bg-[#fffbeb] text-[#d97706]'
                            )}
                          >
                            {request.status === 'APPROVED' ? 'Approved' : request.status === 'REJECTED' ? 'Rejected' : 'Pending'}
                          </span>
                        </td>
                      )}
                      <td className="py-2.5 px-4 text-center">
                        <button
                          onClick={() => router.push(`/admin/customers/requests/${request.id}`)}
                          className="p-1.5 text-[#94a3b8] hover:text-[#0f172a] hover:bg-[#f1f5f9] rounded-md transition-colors"
                        >
                          <Eye className="size-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
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
