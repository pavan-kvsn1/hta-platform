'use client'

import { apiFetch } from '@/lib/api-client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Plus,
  Search,
  Building2,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Bell,
  Eye,
  Crown,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface CustomerAccount {
  id: string
  companyName: string
  contactEmail: string | null
  isActive: boolean
  assignedAdmin: { id: string; name: string } | null
  primaryPoc: { id: string; name: string; email: string; isActive: boolean } | null
  userCount: number
  pendingRequests: number
  certificateCount: number
  createdAt: string
}

interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

export default function CustomersPage() {
  const router = useRouter()
  const [accounts, setAccounts] = useState<CustomerAccount[]>([])
  const [pagination, setPagination] = useState<Pagination | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState('true')
  const [accessFilter, setAccessFilter] = useState<'ALL' | 'PORTAL' | 'TOKEN'>('ALL')
  const [page, setPage] = useState(1)
  const [rowsPerPage, setRowsPerPage] = useState(10)
  const [totalPendingRequests, setTotalPendingRequests] = useState(0)

  const fetchAccounts = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      params.set('isActive', activeFilter)
      params.set('page', page.toString())
      params.set('limit', rowsPerPage.toString())

      const res = await apiFetch(`/api/admin/customers?${params}`)
      if (res.ok) {
        const data = await res.json()
        setAccounts(data.accounts)
        setPagination(data.pagination)
        const totalPending = data.accounts.reduce(
          (sum: number, acc: CustomerAccount) => sum + (acc.pendingRequests || 0),
          0
        )
        setTotalPendingRequests(totalPending)
      }
    } catch (error) {
      console.error('Failed to fetch accounts:', error)
    } finally {
      setLoading(false)
    }
  }, [search, activeFilter, page, rowsPerPage])

  useEffect(() => {
    fetchAccounts()
  }, [activeFilter, page, rowsPerPage, fetchAccounts])

  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1)
      fetchAccounts()
    }, 300)
    return () => clearTimeout(timer)
  }, [search, fetchAccounts])

  return (
    <div className="h-full overflow-auto bg-[#f1f5f9]">
      <div className="px-6 sm:px-9 py-8">
        {/* Pending Requests Banner */}
        {totalPendingRequests > 0 && (
          <div className="mb-5 flex items-center justify-between p-3.5 bg-[#fffbeb] border border-[#fde68a] rounded-[14px]">
            <div className="flex items-center gap-2">
              <Bell className="size-4 text-[#d97706]" />
              <span className="text-[13px] font-semibold text-[#92400e]">
                {totalPendingRequests} Pending Request{totalPendingRequests !== 1 ? 's' : ''}
              </span>
            </div>
            <Link
              href="/admin/customers/requests"
              className="px-3 py-1.5 text-[12px] font-semibold text-[#92400e] border border-[#fde68a] bg-white hover:bg-[#fffbeb] rounded-[9px] transition-colors"
            >
              View All
            </Link>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-[22px] font-bold text-[#0f172a] flex items-center gap-2.5">
              <Building2 className="size-[22px] text-[#94a3b8]" />
              Customer Accounts
            </h1>
            <p className="text-[13px] text-[#94a3b8] mt-1">
              Manage customer companies and their users
            </p>
          </div>
          <Link
            href="/admin/customers/new"
            className="inline-flex items-center gap-1.5 px-4 py-2 text-[12.5px] font-semibold text-white bg-[#16a34a] hover:bg-[#15803d] rounded-[9px] transition-colors"
          >
            <Plus className="size-3.5" />
            Create Account
          </Link>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-[14px] border border-[#e2e8f0] p-4 mb-5">
          <div className="flex flex-wrap items-end gap-4">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-[#94a3b8]" />
              <input
                type="text"
                placeholder="Search by company name or email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-[13px] text-[#0f172a] border border-[#e2e8f0] rounded-[9px] placeholder:text-[#94a3b8] focus:ring-2 focus:ring-[#7c3aed]/20 focus:border-[#7c3aed] outline-none"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Access</label>
              <div className="flex gap-1">
                {(['ALL', 'PORTAL', 'TOKEN'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => { setAccessFilter(t); setPage(1) }}
                    className={cn(
                      'px-3 py-2 text-[12px] font-semibold rounded-[9px] border transition-colors',
                      accessFilter === t
                        ? 'bg-[#0f172a] text-white border-[#0f172a]'
                        : 'bg-white text-[#64748b] border-[#e2e8f0] hover:bg-[#f8fafc]'
                    )}
                  >
                    {t === 'ALL' ? 'All' : t === 'PORTAL' ? 'Portal' : 'Token-only'}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Status</label>
              <select
                value={activeFilter}
                onChange={(e) => setActiveFilter(e.target.value)}
                className="block px-3 py-2 text-[13px] text-[#0f172a] border border-[#e2e8f0] rounded-[9px] bg-white focus:ring-2 focus:ring-[#7c3aed]/20 focus:border-[#7c3aed] outline-none"
              >
                <option value="true">Active</option>
                <option value="false">Inactive</option>
                <option value="ALL">All</option>
              </select>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-[14px] border border-[#e2e8f0] overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="size-6 animate-spin text-[#94a3b8]" />
            </div>
          ) : accounts.filter(a =>
              accessFilter === 'ALL' ? true :
              accessFilter === 'PORTAL' ? a.userCount > 0 :
              a.userCount === 0
            ).length === 0 ? (
            <div className="text-center py-16">
              <Building2 className="size-10 mx-auto mb-3 text-[#e2e8f0]" />
              <p className="text-[13px] text-[#94a3b8]">No customer accounts found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-[#e2e8f0] bg-[#f8fafc]">
                    <th className="text-left py-2.5 px-4 text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Company</th>
                    <th className="text-left py-2.5 px-4 text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8] w-[90px]">Access</th>
                    <th className="text-left py-2.5 px-4 text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Primary POC</th>
                    <th className="text-left py-2.5 px-4 text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Users</th>
                    <th className="text-left py-2.5 px-4 text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Certs</th>
                    <th className="text-left py-2.5 px-4 text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Requests</th>
                    <th className="text-left py-2.5 px-4 text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Status</th>
                    <th className="text-center py-2.5 px-4 text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8] w-[60px]">View</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.filter(a =>
                    accessFilter === 'ALL' ? true :
                    accessFilter === 'PORTAL' ? a.userCount > 0 :
                    a.userCount === 0
                  ).map((account) => (
                    <tr
                      key={account.id}
                      className="border-b border-[#f1f5f9] cursor-pointer hover:bg-[#f8fafc] transition-colors"
                      onClick={() => router.push(`/admin/customers/${account.id}`)}
                    >
                      <td className="py-2.5 px-4">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-[#0f172a]">{account.companyName}</span>
                          {!account.contactEmail && (
                            <span className="px-1 py-0.5 rounded text-[9px] font-bold bg-[#fffbeb] text-[#d97706]">incomplete</span>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-4">
                        <span className={cn(
                          'inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold',
                          account.userCount > 0
                            ? 'bg-[#eff6ff] text-[#1d4ed8]'
                            : 'bg-[#f1f5f9] text-[#64748b]'
                        )}>
                          {account.userCount > 0 ? 'Portal' : 'Token-only'}
                        </span>
                      </td>
                      <td className="py-2.5 px-4">
                        {account.primaryPoc ? (
                          <div>
                            <div className="flex items-center gap-1.5">
                              <Crown className="size-3 text-[#d97706]" />
                              <span className="font-medium text-[#0f172a]">{account.primaryPoc.name}</span>
                              {!account.primaryPoc.isActive && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#fffbeb] text-[#d97706]">
                                  Pending
                                </span>
                              )}
                            </div>
                            <span className="text-[12px] text-[#94a3b8]">{account.primaryPoc.email}</span>
                          </div>
                        ) : (
                          <span className="text-[#cbd5e1]">&mdash;</span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-[#64748b]">{account.userCount}</td>
                      <td className="py-2.5 px-4 text-[#64748b]">{account.certificateCount}</td>
                      <td className="py-2.5 px-4">
                        {account.pendingRequests > 0 ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-[#fef2f2] text-[#dc2626]">
                            {account.pendingRequests}
                          </span>
                        ) : (
                          <span className="text-[#cbd5e1]">&mdash;</span>
                        )}
                      </td>
                      <td className="py-2.5 px-4">
                        <span
                          className={cn(
                            'inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold',
                            account.isActive
                              ? 'bg-[#f0fdf4] text-[#16a34a]'
                              : 'bg-[#f1f5f9] text-[#94a3b8]'
                          )}
                        >
                          {account.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            router.push(`/admin/customers/${account.id}`)
                          }}
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
          {pagination && (
            <div className="flex items-center justify-between px-5 py-3.5 border-t border-[#f1f5f9]">
              <p className="text-[12.5px] text-[#94a3b8]">
                Showing {(pagination.page - 1) * pagination.limit + 1}&ndash;
                {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
                {pagination.total} accounts
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
          <span><span className="inline-flex items-center px-1.5 py-0.5 rounded bg-[#eff6ff] text-[#1d4ed8] font-bold text-[10px] mr-1">Portal</span>= has login users</span>
          <span><span className="inline-flex items-center px-1.5 py-0.5 rounded bg-[#f1f5f9] text-[#64748b] font-bold text-[10px] mr-1">Token-only</span>= review via links</span>
          <span className="flex items-center gap-1"><Crown className="size-3 text-[#d97706]" /> = Primary POC</span>
          <span><span className="inline-flex items-center px-1.5 py-0.5 rounded bg-[#fffbeb] text-[#d97706] font-bold text-[10px] mr-1">incomplete</span>= missing contact info</span>
          <span className="ml-auto">Click row to view</span>
        </div>
      </div>
    </div>
  )
}
