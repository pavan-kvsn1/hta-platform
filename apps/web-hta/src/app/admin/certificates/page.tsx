'use client'

import { apiFetch } from '@/lib/api-client'

import { useState, useEffect, Suspense, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { StatusBadge } from '@/components/dashboard/StatusBadge'
import {
  Loader2,
  Search,
  FileText,
  ChevronLeft,
  ChevronRight,
  Eye,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface Certificate {
  id: string
  certificateNumber: string
  status: string
  customerName: string
  uucDescription: string
  uucMake: string
  uucModel: string
  dateOfCalibration: string | null
  calibrationDueDate: string | null
  currentRevision: number
  createdAt: string
  updatedAt: string
  createdBy: {
    id: string
    name: string
    email: string
  }
  assignedAdmin: {
    id: string
    name: string
    email: string
  } | null
  reviewer: {
    id: string
    name: string
  } | null
  lastModifiedBy: {
    id: string
    name: string
  }
}

interface TatInfo {
  overdue: number
  approaching: number
}

interface Stats {
  total: number
  draft: number
  pendingReview: number
  revisionRequired: number
  pendingCustomerApproval: number
  customerRevisionRequired: number
  pendingAdminAuthorization: number
  authorized: number
  rejected: number
  customerReviewExpired: number
  tat?: {
    draft: TatInfo
    pendingReview: TatInfo
    revisionRequired: TatInfo
    pendingCustomerApproval: TatInfo
    customerRevisionRequired: TatInfo
    pendingAdminAuthorization: TatInfo
  }
}

interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

const STATUS_OPTIONS = [
  { value: 'ALL', label: 'All Status' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'PENDING_REVIEW', label: 'Pending Review' },
  { value: 'REVISION_REQUIRED', label: 'Revision Required' },
  { value: 'PENDING_CUSTOMER_APPROVAL', label: 'Pending Customer' },
  { value: 'CUSTOMER_REVISION_REQUIRED', label: 'Customer Revision' },
  { value: 'PENDING_ADMIN_AUTHORIZATION', label: 'Pending Authorization' },
  { value: 'AUTHORIZED', label: 'Authorized' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'CUSTOMER_REVIEW_EXPIRED', label: 'Review Expired' },
]

const STAT_CARDS = [
  { key: 'total', field: 'total' as const, label: 'Total', borderColor: 'border-l-[#94a3b8]', countColor: 'text-[#0f172a]', filter: 'ALL', tatKey: null },
  { key: 'draft', field: 'draft' as const, label: 'Draft', borderColor: 'border-l-[#94a3b8]', countColor: 'text-[#475569]', filter: 'DRAFT', tatKey: 'draft' as const },
  { key: 'pendingReview', field: 'pendingReview' as const, label: 'Pending Review', borderColor: 'border-l-[#eab308]', countColor: 'text-[#a16207]', filter: 'PENDING_REVIEW', tatKey: 'pendingReview' as const },
  { key: 'revision', field: 'revisionRequired' as const, label: 'Revision Req.', borderColor: 'border-l-[#f97316]', countColor: 'text-[#c2410c]', filter: 'REVISION_REQUIRED', tatKey: 'revisionRequired' as const },
  { key: 'customer', field: 'pendingCustomerApproval' as const, label: 'With Customer', borderColor: 'border-l-[#3b82f6]', countColor: 'text-[#1d4ed8]', filter: 'PENDING_CUSTOMER_APPROVAL', tatKey: 'pendingCustomerApproval' as const },
  { key: 'custRevision', field: 'customerRevisionRequired' as const, label: 'Cust. Revision', borderColor: 'border-l-[#a855f7]', countColor: 'text-[#7c3aed]', filter: 'CUSTOMER_REVISION_REQUIRED', tatKey: 'customerRevisionRequired' as const },
  { key: 'pendingAuth', field: 'pendingAdminAuthorization' as const, label: 'Pending Auth', borderColor: 'border-l-[#6366f1]', countColor: 'text-[#4f46e5]', filter: 'PENDING_ADMIN_AUTHORIZATION', tatKey: 'pendingAdminAuthorization' as const },
  { key: 'authorized', field: 'authorized' as const, label: 'Authorized', borderColor: 'border-l-[#22c55e]', countColor: 'text-[#15803d]', filter: 'AUTHORIZED', tatKey: null },
  { key: 'rejected', field: 'rejected' as const, label: 'Rejected', borderColor: 'border-l-[#ef4444]', countColor: 'text-[#dc2626]', filter: 'REJECTED', tatKey: null },
  { key: 'reviewExpired', field: 'customerReviewExpired' as const, label: 'Review Expired', borderColor: 'border-l-[#dc2626]', countColor: 'text-[#dc2626]', filter: 'CUSTOMER_REVIEW_EXPIRED', tatKey: null },
]

function AdminCertificatesContent() {
  const searchParams = useSearchParams()
  const initialStatus = searchParams.get('status') || 'ALL'

  const [certificates, setCertificates] = useState<Certificate[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
  })

  const [statusFilter, setStatusFilter] = useState(initialStatus)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [rowsPerPage, setRowsPerPage] = useState(10)

  const fetchCertificates = useCallback(async (page = 1) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: rowsPerPage.toString(),
      })

      if (statusFilter !== 'ALL') {
        params.set('status', statusFilter)
      }
      if (searchQuery) {
        params.set('search', searchQuery)
      }

      const res = await apiFetch(`/api/admin/certificates?${params}`)
      if (res.ok) {
        const data = await res.json()
        setCertificates(data.certificates)
        setPagination(data.pagination)
        setStats(data.stats)
      }
    } catch (error) {
      console.error('Failed to fetch certificates:', error)
    } finally {
      setLoading(false)
    }
  }, [statusFilter, searchQuery, rowsPerPage])

  useEffect(() => {
    fetchCertificates()
  }, [statusFilter, searchQuery, fetchCertificates])

  const handleSearch = () => {
    setSearchQuery(searchInput)
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleDateString()
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
        <div className="mb-6">
          <h1 className="text-[22px] font-bold text-[#0f172a] flex items-center gap-2.5">
            <FileText className="size-[22px] text-[#94a3b8]" />
            All Certificates
          </h1>
          <p className="text-[13px] text-[#94a3b8] mt-1">
            View and manage all certificates in the system
          </p>
        </div>

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-3 mb-6">
            {STAT_CARDS.map((card) => {
              const total = stats[card.field]
              const tat = card.tatKey && stats.tat ? stats.tat[card.tatKey] : null
              const overdue = tat?.overdue || 0
              const approaching = tat?.approaching || 0
              const onTime = total - overdue - approaching
              const pO = total > 0 ? Math.round((overdue / total) * 100) : 0
              const pA = total > 0 ? Math.round((approaching / total) * 100) : 0
              const pG = total > 0 ? 100 - pO - pA : 0

              return (
                <button
                  key={card.key}
                  onClick={() => setStatusFilter(card.filter)}
                  className={cn(
                    'border border-[#e2e8f0] rounded-xl px-4 py-4 border-l-[3px] text-left transition-all',
                    card.borderColor,
                    statusFilter === card.filter
                      ? 'bg-[#f8fafc] ring-1 ring-[#e2e8f0]'
                      : 'bg-white hover:bg-[#f8fafc]'
                  )}
                >
                  <div className={cn('text-2xl font-extrabold leading-none tracking-tight', card.countColor)}>
                    {total}
                  </div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.07em] text-[#94a3b8] mt-2">{card.label}</div>
                  {tat && total > 0 && (
                    <>
                      <div className="mt-2 h-[6px] rounded-full bg-[#f1f5f9] overflow-hidden">
                        <div className="h-full flex">
                          {overdue > 0 && <div className="bg-[#ef4444] h-full" style={{ width: `${pO}%` }} />}
                          {approaching > 0 && <div className="bg-[#f59e0b] h-full" style={{ width: `${pA}%` }} />}
                          {onTime > 0 && <div className="bg-[#22c55e] h-full" style={{ width: `${pG}%` }} />}
                        </div>
                      </div>
                      {(overdue > 0 || approaching > 0) && (
                        <div className="flex items-center gap-2 mt-1.5">
                          {overdue > 0 && <span className="text-[9px] font-semibold text-[#dc2626]">{overdue} overdue</span>}
                          {approaching > 0 && <span className="text-[9px] font-semibold text-[#d97706]">{approaching} soon</span>}
                        </div>
                      )}
                    </>
                  )}
                </button>
              )
            })}
          </div>
        )}

        {/* Filters */}
        <div className="bg-white rounded-[14px] border border-[#e2e8f0] p-4 mb-5">
          <div className="flex flex-wrap items-end gap-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-[#94a3b8]" />
              <input
                type="text"
                placeholder="Search by certificate number, customer, description..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="w-full pl-9 pr-4 py-2 text-[13px] text-[#0f172a] border border-[#e2e8f0] rounded-[9px] placeholder:text-[#94a3b8] focus:ring-2 focus:ring-[#7c3aed]/20 focus:border-[#7c3aed] outline-none"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[200px] px-3 py-2 text-[13px] text-[#0f172a] border border-[#e2e8f0] rounded-[9px] bg-white focus:ring-2 focus:ring-[#7c3aed]/20 focus:border-[#7c3aed]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <button
              onClick={handleSearch}
              className="px-4 py-2 text-[12.5px] font-semibold text-white bg-[#0f172a] hover:bg-[#1e293b] rounded-[9px] transition-colors"
            >
              Search
            </button>
          </div>
        </div>

        {/* Certificates Table */}
        <div className="bg-white rounded-[14px] border border-[#e2e8f0] overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="size-6 animate-spin text-[#94a3b8]" />
            </div>
          ) : certificates.length === 0 ? (
            <div className="text-center py-16">
              <FileText className="size-10 mx-auto mb-3 text-[#e2e8f0]" />
              <p className="text-[13px] text-[#94a3b8]">No certificates found</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-[#e2e8f0] bg-[#f8fafc]">
                      <th className="text-left py-2.5 px-4 text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Cert No.</th>
                      <th className="text-left py-2.5 px-4 text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Customer</th>
                      <th className="text-left py-2.5 px-4 text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">UUC Description</th>
                      <th className="text-left py-2.5 px-4 text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Cal Date</th>
                      <th className="text-left py-2.5 px-4 text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Engineer</th>
                      <th className="text-left py-2.5 px-4 text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Reviewer</th>
                      <th className="text-left py-2.5 px-4 text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Admin</th>
                      <th className="text-left py-2.5 px-4 text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Status</th>
                      <th className="text-center py-2.5 px-4 text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8] w-[60px]">View</th>
                    </tr>
                  </thead>
                  <tbody>
                    {certificates.map((cert) => (
                      <tr
                        key={cert.id}
                        className="border-b border-[#f1f5f9] hover:bg-[#f8fafc] transition-colors"
                      >
                        <td className="py-2.5 px-4 font-medium text-[#0f172a]">
                          {cert.certificateNumber}
                        </td>
                        <td className="py-2.5 px-4 text-[#0f172a]">
                          {cert.customerName}
                        </td>
                        <td className="py-2.5 px-4 text-[#64748b]">
                          {cert.uucDescription}
                          {cert.uucMake && ` - ${cert.uucMake}`}
                          {cert.uucModel && ` ${cert.uucModel}`}
                        </td>
                        <td className="py-2.5 px-4 text-[#64748b]">
                          {formatDate(cert.dateOfCalibration)}
                        </td>
                        <td className="py-2.5 px-4 text-[#64748b]">
                          {cert.createdBy.name}
                        </td>
                        <td className="py-2.5 px-4 text-[#64748b]">
                          {cert.reviewer?.name || <span className="text-[#cbd5e1]">&mdash;</span>}
                        </td>
                        <td className="py-2.5 px-4 text-[#64748b]">
                          {cert.assignedAdmin?.name || <span className="text-[#cbd5e1]">&mdash;</span>}
                        </td>
                        <td className="py-2.5 px-4">
                          <StatusBadge status={cert.status} />
                        </td>
                        <td className="py-2.5 px-4 text-center">
                          <Link href={`/admin/certificates/${cert.id}`}>
                            <button className="p-1.5 text-[#94a3b8] hover:text-[#0f172a] hover:bg-[#f1f5f9] rounded-md transition-colors">
                              <Eye className="size-3.5" />
                            </button>
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {pagination.totalPages > 1 && (
                <div className="flex items-center justify-between px-5 py-3.5 border-t border-[#f1f5f9]">
                  <p className="text-[12.5px] text-[#94a3b8]">
                    Showing {(pagination.page - 1) * pagination.limit + 1}&ndash;
                    {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
                    {pagination.total} certificates
                  </p>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[12px] text-[#94a3b8]">Rows</span>
                      <select
                        value={rowsPerPage}
                        onChange={(e) => setRowsPerPage(Number(e.target.value))}
                        className="h-7 px-1.5 border border-[#e2e8f0] rounded-[7px] text-[12.5px] text-[#0f172a] bg-white outline-none"
                      >
                        {[10, 15, 25].map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        disabled={pagination.page === 1}
                        onClick={() => fetchCertificates(pagination.page - 1)}
                        className="px-2.5 py-1.5 text-[12px] border border-[#e2e8f0] rounded-[7px] hover:bg-[#f8fafc] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        <ChevronLeft className="size-3.5" />
                      </button>
                      <button
                        disabled={pagination.page === pagination.totalPages}
                        onClick={() => fetchCertificates(pagination.page + 1)}
                        className="px-2.5 py-1.5 text-[12px] border border-[#e2e8f0] rounded-[7px] hover:bg-[#f8fafc] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        <ChevronRight className="size-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default function AdminCertificatesPage() {
  return (
    <Suspense fallback={
      <div className="h-full overflow-auto bg-[#f1f5f9]">
        <div className="px-6 sm:px-9 py-8 flex items-center justify-center h-full">
          <Loader2 className="size-6 animate-spin text-[#94a3b8]" />
        </div>
      </div>
    }>
      <AdminCertificatesContent />
    </Suspense>
  )
}
