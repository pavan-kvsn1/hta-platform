'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Search, Eye, ChevronLeft, ChevronRight, CheckCircle, Loader2 } from 'lucide-react'
import { apiFetch } from '@/lib/api-client'
import { useDebounce } from '@/hooks/useDebounce'

const ROWS_PER_PAGE_OPTIONS = [10, 15, 25]

function getPageNumbers(currentPage: number, totalPages: number): (number | 'ellipsis')[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1)
  const pages: (number | 'ellipsis')[] = [1]
  if (currentPage > 3) pages.push('ellipsis')
  const start = Math.max(2, currentPage - 1)
  const end = Math.min(totalPages - 1, currentPage + 1)
  for (let i = start; i <= end; i++) pages.push(i)
  if (currentPage < totalPages - 2) pages.push('ellipsis')
  if (totalPages > 1) pages.push(totalPages)
  return pages
}

export interface CompletedCertificate {
  id: string
  certificateNumber: string
  uucDescription: string | null
  uucMake: string | null
  uucModel: string | null
  srfNumber: string | null
  dateOfCalibration: string | null
  calibrationDueDate: string | null
  signedAt: string
  signerName: string
  hasEngineerSig: boolean
  hasReviewerSig: boolean
  hasCustomerSig: boolean
  hasAdminSig: boolean
}

interface PaginationInfo {
  page: number
  limit: number
  total: number
  totalPages: number
}

type SortOption = 'newest' | 'oldest'

export function CompletedTable() {
  const [certificates, setCertificates] = useState<CompletedCertificate[]>([])
  const [pagination, setPagination] = useState<PaginationInfo>({ page: 1, limit: 10, total: 0, totalPages: 1 })
  const [loading, setLoading] = useState(true)

  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<SortOption>('newest')
  const [currentPage, setCurrentPage] = useState(1)
  const [rowsPerPage, setRowsPerPage] = useState(10)

  const debouncedSearch = useDebounce(searchQuery)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(currentPage),
        limit: String(rowsPerPage),
        sort: sortBy,
      })
      if (debouncedSearch) params.set('search', debouncedSearch)

      const res = await apiFetch(`/api/customer/dashboard/completed?${params}`)
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json() as { items: CompletedCertificate[]; pagination: PaginationInfo }
      setCertificates(data.items)
      setPagination(data.pagination)
    } catch (err) {
      console.error('CompletedTable fetch error:', err)
      setCertificates([])
      setPagination({ page: 1, limit: rowsPerPage, total: 0, totalPages: 1 })
    } finally {
      setLoading(false)
    }
  }, [currentPage, rowsPerPage, debouncedSearch, sortBy])

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [debouncedSearch, sortBy, rowsPerPage])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Derived pagination values from server response
  const totalPages = pagination.totalPages
  const safePage = Math.min(currentPage, totalPages)
  const startIndex = (safePage - 1) * rowsPerPage
  const endIndex = Math.min(startIndex + rowsPerPage, pagination.total)
  const pageNumbers = getPageNumbers(safePage, totalPages)

  const handleSearch = (value: string) => { setSearchQuery(value) }
  const handleSort = (value: SortOption) => { setSortBy(value) }
  const handleRowsPerPage = (value: number) => { setRowsPerPage(value) }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  }

  if (loading && certificates.length === 0) {
    return (
      <div className="bg-white border border-[#e2e8f0] rounded-[14px] p-8 flex items-center justify-center">
        <Loader2 className="size-5 animate-spin text-[#94a3b8]" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-[15px] w-[15px] text-[#94a3b8] pointer-events-none" />
          <Input
            placeholder="Search by certificate no., instrument, or make…"
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            className="h-10 rounded-[9px] border-border pl-10 pr-3.5 text-sm bg-white"
          />
        </div>
        <Select value={sortBy} onValueChange={(v) => handleSort(v as SortOption)}>
          <SelectTrigger className="h-10 w-full sm:w-[160px] rounded-[9px] border-border bg-white text-sm text-[#64748b]">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest First</SelectItem>
            <SelectItem value="oldest">Oldest First</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="bg-white border border-[#e2e8f0] rounded-[14px] overflow-hidden relative">
        {loading && certificates.length > 0 && (
          <div className="absolute inset-0 bg-white/60 flex items-center justify-center z-10">
            <Loader2 className="size-5 animate-spin text-[#94a3b8]" />
          </div>
        )}
        {certificates.length > 0 ? (
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#f1f5f9]">
                <th className="text-left px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">
                  Certificate No.
                </th>
                <th className="text-left px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">
                  Instrument
                </th>
                <th className="text-left px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">
                  SRF No.
                </th>
                <th className="text-left px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">
                  Calibrated
                </th>
                <th className="text-left px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">
                  Signed
                </th>
                <th className="text-left px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">
                  Pending
                </th>
                <th className="text-center px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {certificates.map((cert) => {
                const signatureCount = [
                  cert.hasEngineerSig,
                  cert.hasReviewerSig,
                  cert.hasCustomerSig,
                  cert.hasAdminSig,
                ].filter(Boolean).length

                return (
                  <tr
                    key={cert.id}
                    className="border-b border-[#f1f5f9] last:border-0 hover:bg-[#f8fafc] transition-colors"
                  >
                      <td className="px-4 py-3">
                        <span className="text-[13px] font-medium text-[#0f172a]">{cert.certificateNumber}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-[13px] text-[#0f172a]">{cert.uucDescription || '-'}</div>
                        {(cert.uucMake || cert.uucModel) && (
                          <div className="text-[11px] text-[#94a3b8] mt-0.5">
                            {[cert.uucMake, cert.uucModel].filter(Boolean).join(' ')}
                          </div>
                        )}
                        {cert.signerName && (
                          <div className="mt-1 text-[11px] text-[#64748b]">
                            Signed by {cert.signerName}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[13px] text-[#64748b]">{cert.srfNumber || '-'}</td>
                      <td className="px-4 py-3 text-[13px] text-[#64748b]">{formatDate(cert.dateOfCalibration)}</td>
                      <td className="px-4 py-3 text-[13px] text-[#64748b]">{formatDate(cert.signedAt)}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-[0.05em] bg-[#eff6ff] text-[#2563eb] border border-[#bfdbfe]">
                          {signatureCount}/4 signed · Admin pending
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Link
                          href={`/customer/review/cert/${cert.id}`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12.5px] font-semibold text-[#475569] border border-[#e2e8f0] bg-white hover:bg-[#f8fafc] rounded-[9px] transition-colors">
                            <Eye className="size-3.5" />
                          View
                        </button>
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : (
          <div className="py-12 text-center">
            <div className="size-10 bg-[#f1f5f9] rounded-full flex items-center justify-center mx-auto mb-3">
              <CheckCircle className="size-4.5 text-[#94a3b8]" />
            </div>
            <p className="text-[13px] text-[#94a3b8]">No certificates awaiting Admin authorization.</p>
          </div>
        )}

        {/* Pagination Footer */}
        {pagination.total > 0 && (
          <div className="px-4 py-3 border-t border-[#f1f5f9] flex flex-col sm:flex-row items-center justify-between gap-3">
            <span className="text-[13px] text-[#94a3b8]">
              Showing {startIndex + 1}–{endIndex} of {pagination.total}
            </span>
            <div className="flex items-center gap-4">
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
              {totalPages > 1 && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={safePage <= 1}
                    className="size-8 flex items-center justify-center rounded-lg border border-[#e2e8f0] text-[#64748b] hover:bg-[#f1f5f9] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft className="size-4" />
                  </button>
                  {pageNumbers.map((page, idx) =>
                    page === 'ellipsis' ? (
                      <span key={`e-${idx}`} className="size-8 flex items-center justify-center text-[13px] text-[#94a3b8]">…</span>
                    ) : (
                      <button
                        key={page}
                        onClick={() => setCurrentPage(page)}
                        className={`size-8 flex items-center justify-center rounded-lg text-[13px] font-medium transition-colors ${
                          page === safePage ? 'bg-[#0f172a] text-white' : 'text-[#64748b] hover:bg-[#f1f5f9]'
                        }`}
                      >
                        {page}
                      </button>
                    )
                  )}
                  <button
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={safePage >= totalPages}
                    className="size-8 flex items-center justify-center rounded-lg border border-[#e2e8f0] text-[#64748b] hover:bg-[#f1f5f9] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronRight className="size-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
