'use client'

import { apiFetch } from '@/lib/api-client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { StatusBadge } from './StatusBadge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Edit, Search, Filter, X, Eye, Download, Plus, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { useDebounce } from '@/hooks/useDebounce'

export interface CertificateListItem {
  id: string
  certificateNumber: string
  status: string
  customerName: string
  uucDescription: string
  dateOfCalibration: string
  currentVersion: number
  createdAt: string
  createdBy?: string // Engineer name (for Admin view)
  reviewerName?: string // Reviewer name (for new workflow)
}

interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

interface CertificateTableProps {
  userRole: 'ENGINEER' | 'ADMIN'
  showActions?: boolean
}

const statusFilters = [
  { value: 'all', label: 'All Status' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'PENDING_REVIEW', label: 'Pending Review' },
  { value: 'REVISION_REQUIRED', label: 'Revision Required' },
  { value: 'PENDING_CUSTOMER_APPROVAL', label: 'Pending Customer' },
  { value: 'CUSTOMER_REVISION_REQUIRED', label: 'Customer Revision' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
]

const ROWS_PER_PAGE_OPTIONS = [10, 15, 25]

function getPageNumbers(currentPage: number, totalPages: number): (number | 'ellipsis')[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1)
  }

  const pages: (number | 'ellipsis')[] = [1]

  if (currentPage > 3) {
    pages.push('ellipsis')
  }

  const start = Math.max(2, currentPage - 1)
  const end = Math.min(totalPages - 1, currentPage + 1)

  for (let i = start; i <= end; i++) {
    pages.push(i)
  }

  if (currentPage < totalPages - 2) {
    pages.push('ellipsis')
  }

  if (totalPages > 1) {
    pages.push(totalPages)
  }

  return pages
}

export function CertificateTable({
  userRole,
  showActions = true,
}: CertificateTableProps) {
  const [certificates, setCertificates] = useState<CertificateListItem[]>([])
  const [pagination, setPagination] = useState<Pagination | null>(null)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [showDateFilter, setShowDateFilter] = useState(false)
  const [page, setPage] = useState(1)
  const [rowsPerPage, setRowsPerPage] = useState(10)

  const debouncedSearch = useDebounce(searchQuery)
  const hasDateFilter = dateFrom || dateTo

  const fetchCertificates = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('page', page.toString())
      params.set('limit', rowsPerPage.toString())
      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (debouncedSearch) params.set('search', debouncedSearch)
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo) params.set('dateTo', dateTo)

      const res = await apiFetch(`/api/certificates/engineer?${params}`)
      if (res.ok) {
        const data = await res.json()
        setCertificates(data.certificates)
        setPagination(data.pagination)
      }
    } catch (error) {
      console.error('Failed to fetch certificates:', error)
    } finally {
      setLoading(false)
    }
  }, [page, rowsPerPage, statusFilter, debouncedSearch, dateFrom, dateTo])

  useEffect(() => {
    fetchCertificates()
  }, [fetchCertificates])

  // Reset to page 1 when filters change
  const handleStatusFilter = (value: string) => {
    setStatusFilter(value)
    setPage(1)
  }
  const handleDateFrom = (value: string) => {
    setDateFrom(value)
    setPage(1)
  }
  const handleDateTo = (value: string) => {
    setDateTo(value)
    setPage(1)
  }
  const handleRowsPerPage = (value: number) => {
    setRowsPerPage(value)
    setPage(1)
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  }

  const clearDateFilters = () => {
    setDateFrom('')
    setDateTo('')
    setShowDateFilter(false)
    setPage(1)
  }

  const totalPages = pagination?.totalPages ?? 1
  const total = pagination?.total ?? 0
  const startIndex = total === 0 ? 0 : (page - 1) * rowsPerPage + 1
  const endIndex = Math.min(page * rowsPerPage, total)
  const pageNumbers = getPageNumbers(page, totalPages)

  return (
    <div>
      {/* Toolbar: search + filters + new cert button */}
      <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center mb-[18px]">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-[15px] w-[15px] text-[#94a3b8] pointer-events-none" />
          <Input
            placeholder="Search by certificate no., customer, or instrument…"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setPage(1) }}
            className="h-10 rounded-[9px] border-border pl-10 pr-3.5 text-sm bg-white"
          />
        </div>
        {/* Status filter */}
        <Select value={statusFilter} onValueChange={handleStatusFilter}>
          <SelectTrigger className="h-10 w-full sm:w-[160px] rounded-[9px] border-border bg-white text-sm text-[#64748b]" aria-label="Filter by status">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            {statusFilters.map((filter) => (
              <SelectItem key={filter.value} value={filter.value}>
                {filter.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {/* Date filter toggle */}
        <Button
          variant={hasDateFilter ? "default" : "outline"}
          size="default"
          onClick={() => setShowDateFilter(!showDateFilter)}
          className={`h-10 rounded-[9px] text-[13px] font-medium ${hasDateFilter ? '' : 'bg-white text-[#64748b] border-border'}`}
        >
          <Filter className="h-[13px] w-[13px] mr-1.5" />
          Date Filter
          {hasDateFilter && (
            <span className="ml-1.5 bg-white/20 text-xs px-1.5 py-0.5 rounded">1</span>
          )}
        </Button>
        {/* New certificate */}
        <Link href="/dashboard/certificates/new">
          <Button className="h-10 px-[18px] rounded-[9px] bg-primary text-white text-sm font-bold tracking-[-0.01em]">
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            New Certificate
          </Button>
        </Link>
      </div>

      {/* Collapsible Date Filter Panel */}
      {showDateFilter && (
        <div className="bg-[#f8fafc] border border-border rounded-xl p-4 flex flex-wrap items-center gap-4 mb-[18px]">
          <span className="text-sm font-medium text-[#475569]">Calibration Date:</span>
          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => handleDateFrom(e.target.value)}
              className="w-[160px] bg-white rounded-[9px] border-border"
            />
            <span className="text-[#94a3b8]">to</span>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => handleDateTo(e.target.value)}
              className="w-[160px] bg-white rounded-[9px] border-border"
            />
          </div>
          {hasDateFilter && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearDateFilters}
              className="text-[#94a3b8] hover:text-destructive"
            >
              <X className="h-4 w-4 mr-1" />
              Clear
            </Button>
          )}
        </div>
      )}

      {/* Table card */}
      <div className="bg-white border border-border rounded-[14px] overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="size-6 animate-spin text-[#94a3b8]" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-[#f8fafc] border-b-2 border-[#f1f5f9]">
                  <th className="text-left px-4 py-[11px] text-[11px] font-bold uppercase tracking-[0.06em] text-[#94a3b8]">
                    Certificate No.
                  </th>
                  <th className="text-left px-4 py-[11px] text-[11px] font-bold uppercase tracking-[0.06em] text-[#94a3b8]">
                    Customer
                  </th>
                  <th className="text-left px-4 py-[11px] text-[11px] font-bold uppercase tracking-[0.06em] text-[#94a3b8]">
                    Instrument
                  </th>
                  <th className="text-left px-4 py-[11px] text-[11px] font-bold uppercase tracking-[0.06em] text-[#94a3b8]">
                    Cal. Date
                  </th>
                  <th className="text-left px-4 py-[11px] text-[11px] font-bold uppercase tracking-[0.06em] text-[#94a3b8]">
                    Status
                  </th>
                  <th className="text-left px-4 py-[11px] text-[11px] font-bold uppercase tracking-[0.06em] text-[#94a3b8]">
                    Revision
                  </th>
                  {showActions && (
                    <th className="text-left px-4 py-[11px] text-[11px] font-bold uppercase tracking-[0.06em] text-[#94a3b8]">
                      Actions
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {certificates.length === 0 ? (
                  <tr>
                    <td
                      colSpan={showActions ? 7 : 6}
                      className="px-4 py-8 text-center text-[#94a3b8] text-sm"
                    >
                      No certificates found
                    </td>
                  </tr>
                ) : (
                  certificates.map((cert) => (
                    <tr key={cert.id} className="border-b border-[#f8fafc] hover:bg-[#f8fafc] cursor-pointer transition-colors">
                      <td className="px-4 py-[15px] whitespace-nowrap">
                        <span className="text-[14px] text-[#0f172a]">
                          {cert.certificateNumber}
                        </span>
                      </td>
                      <td className="px-4 py-[15px] text-[14px] text-[#0f172a]">
                        {cert.customerName}
                      </td>
                      <td className="px-4 py-[15px] text-[14px] text-[#475569] line-clamp-1">
                        {cert.uucDescription}
                      </td>
                      <td className="px-4 py-[15px] whitespace-nowrap text-[14px] text-[#475569]">
                        {cert.dateOfCalibration ? formatDate(cert.dateOfCalibration) : '-'}
                      </td>
                      <td className="px-4 py-[15px] whitespace-nowrap">
                        <StatusBadge status={cert.status} />
                      </td>
                      <td className="px-4 py-[15px] whitespace-nowrap text-[13px] text-[#475569]">
                        v{cert.currentVersion}
                      </td>
                      {showActions && (
                        <td className="px-4 py-[15px] whitespace-nowrap">
                          <div className="flex gap-2">
                            {userRole === 'ENGINEER' &&
                              (cert.status === 'DRAFT' ||
                                cert.status === 'REVISION_REQUIRED') && (
                                <Link href={`/dashboard/certificates/${cert.id}/edit`}>
                                  <button className="inline-flex items-center gap-1.5 px-[11px] py-[6px] border border-border rounded-[7px] bg-white text-[12px] font-medium text-[#475569] hover:bg-[#f8fafc] transition-colors">
                                    <Edit className="h-[13px] w-[13px]" /> Edit
                                  </button>
                                </Link>
                              )}
                            {userRole === 'ENGINEER' &&
                              cert.status !== 'DRAFT' &&
                              cert.status !== 'REVISION_REQUIRED' && (
                                <Link href={`/dashboard/certificates/${cert.id}/view`}>
                                  <button className="inline-flex items-center gap-1.5 px-[11px] py-[6px] border border-border rounded-[7px] bg-white text-[12px] font-medium text-[#475569] hover:bg-[#f8fafc] transition-colors">
                                    <Eye className="h-[13px] w-[13px]" /> View
                                  </button>
                                </Link>
                              )}
                            {cert.status === 'APPROVED' && (
                              <a href={`/api/certificates/${cert.id}/download-signed`} download>
                                <button className="inline-flex items-center gap-1.5 px-[11px] py-[6px] border border-border rounded-[7px] bg-white text-[12px] font-medium text-[#475569] hover:bg-[#f8fafc] transition-colors">
                                  <Download className="h-[13px] w-[13px]" /> PDF
                                </button>
                              </a>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        <div className="px-4 py-3 border-t border-[#f1f5f9] flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* Left: showing count */}
          <span className="text-[13px] text-[#94a3b8]">
            Showing {total === 0 ? 0 : startIndex}–{endIndex} of {total}
          </span>

          <div className="flex items-center gap-4">
            {/* Center: rows per page */}
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-[#94a3b8]">Rows per page</span>
              <select
                value={rowsPerPage}
                onChange={(e) => handleRowsPerPage(Number(e.target.value))}
                className="h-8 px-2 border border-[#e2e8f0] rounded-lg text-[13px] text-[#0f172a] bg-white outline-none focus:ring-2 focus:ring-[#7c3aed]/20 focus:border-[#7c3aed]"
              >
                {ROWS_PER_PAGE_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>

            {/* Right: page navigation */}
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="size-8 flex items-center justify-center rounded-lg border border-[#e2e8f0] text-[#64748b] hover:bg-[#f1f5f9] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="size-4" />
                </button>
                {pageNumbers.map((pg, idx) =>
                  pg === 'ellipsis' ? (
                    <span key={`e-${idx}`} className="size-8 flex items-center justify-center text-[13px] text-[#94a3b8]">
                      …
                    </span>
                  ) : (
                    <button
                      key={pg}
                      onClick={() => setPage(pg)}
                      className={`size-8 flex items-center justify-center rounded-lg text-[13px] font-medium transition-colors ${
                        pg === page
                          ? 'bg-[#0f172a] text-white'
                          : 'text-[#64748b] hover:bg-[#f1f5f9]'
                      }`}
                    >
                      {pg}
                    </button>
                  )
                )}
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="size-8 flex items-center justify-center rounded-lg border border-[#e2e8f0] text-[#64748b] hover:bg-[#f1f5f9] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="size-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
