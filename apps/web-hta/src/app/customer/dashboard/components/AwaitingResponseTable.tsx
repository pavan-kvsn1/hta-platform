'use client'

import React, { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Search, Eye, ChevronDown, ChevronRight, ChevronLeft, MessageSquare, Loader2 } from 'lucide-react'
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

export interface AwaitingCertificate {
  id: string
  certificateNumber: string
  uucDescription: string | null
  uucMake: string | null
  uucModel: string | null
  updatedAt: string
  internalStatus: 'PENDING_REVIEW' | 'CUSTOMER_REVISION_REQUIRED' | 'REVISION_REQUIRED'
  customerFeedback: string | null
  feedbackDate: string | null
  adminResponse: string | null
  adminName: string | null
  respondedAt: string | null
}

interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

const statusDisplayMap: Record<string, { text: string; bg: string; text_color: string; border: string }> = {
  PENDING_REVIEW: { text: 'Internal Review', bg: 'bg-[#eff6ff]', text_color: 'text-[#2563eb]', border: 'border-[#bfdbfe]' },
  CUSTOMER_REVISION_REQUIRED: { text: 'Addressing Feedback', bg: 'bg-[#faf5ff]', text_color: 'text-[#7c3aed]', border: 'border-[#e9d5ff]' },
  REVISION_REQUIRED: { text: 'Being Corrected', bg: 'bg-[#fffbeb]', text_color: 'text-[#d97706]', border: 'border-[#fde68a]' },
}

type SortOption = 'newest' | 'oldest' | 'status'

export function AwaitingResponseTable() {
  const [certificates, setCertificates] = useState<AwaitingCertificate[]>([])
  const [pagination, setPagination] = useState<Pagination | null>(null)
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<SortOption>('newest')
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [currentPage, setCurrentPage] = useState(1)
  const [rowsPerPage, setRowsPerPage] = useState(10)

  const debouncedSearch = useDebounce(searchQuery)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('page', currentPage.toString())
      params.set('limit', rowsPerPage.toString())
      if (debouncedSearch) params.set('search', debouncedSearch)
      params.set('sort', sortBy)

      const res = await apiFetch(`/api/customer/dashboard/awaiting?${params}`)
      if (res.ok) {
        const data = await res.json()
        setCertificates(data.items)
        setPagination(data.pagination)
      }
    } catch (error) {
      console.error('Failed to fetch awaiting certificates:', error)
    } finally {
      setLoading(false)
    }
  }, [currentPage, rowsPerPage, debouncedSearch, sortBy])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const totalPages = pagination?.totalPages ?? 1
  const total = pagination?.total ?? 0
  const startIndex = (currentPage - 1) * rowsPerPage
  const endIndex = Math.min(startIndex + rowsPerPage, total)
  const pageNumbers = getPageNumbers(currentPage, totalPages)

  const handleSearch = (value: string) => { setSearchQuery(value); setCurrentPage(1) }
  const handleSort = (value: SortOption) => { setSortBy(value); setCurrentPage(1) }
  const handleRowsPerPage = (value: number) => { setRowsPerPage(value); setCurrentPage(1) }

  const toggleRow = (id: string) => {
    const newExpanded = new Set(expandedRows)
    if (newExpanded.has(id)) {
      newExpanded.delete(id)
    } else {
      newExpanded.add(id)
    }
    setExpandedRows(newExpanded)
  }

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
            <SelectItem value="status">By Status</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="bg-white border border-[#e2e8f0] rounded-[14px] overflow-hidden">
        {certificates.length > 0 ? (
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#f1f5f9]">
                <th className="w-8"></th>
                <th className="text-left px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">
                  Certificate No.
                </th>
                <th className="text-left px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">
                  Instrument
                </th>
                <th className="text-left px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">
                  Last Updated
                </th>
                <th className="text-left px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">
                  Status
                </th>
                <th className="text-center px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {certificates.map((cert) => {
                const isExpanded = expandedRows.has(cert.id)
                const statusDisplay = statusDisplayMap[cert.internalStatus] || {
                  text: 'Processing',
                  bg: 'bg-[#f1f5f9]',
                  text_color: 'text-[#64748b]',
                  border: 'border-[#e2e8f0]',
                }

                return (
                  <React.Fragment key={cert.id}>
                    <tr
                      className="border-b border-[#f1f5f9] last:border-0 hover:bg-[#f8fafc] cursor-pointer transition-colors"
                      onClick={() => toggleRow(cert.id)}
                    >
                      <td className="px-2">
                        {isExpanded ? (
                          <ChevronDown className="size-3.5 text-[#94a3b8]" />
                        ) : (
                          <ChevronRight className="size-3.5 text-[#94a3b8]" />
                        )}
                      </td>
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
                      </td>
                      <td className="px-4 py-3 text-[13px] text-[#64748b]">{formatDate(cert.updatedAt)}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-[0.05em] border ${statusDisplay.bg} ${statusDisplay.text_color} ${statusDisplay.border}`}
                        >
                          {statusDisplay.text}
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
                    {isExpanded && (
                      <tr className="bg-[#f8fafc]">
                        <td colSpan={6} className="px-4 py-4">
                          <div className="pl-6 space-y-3">
                            {cert.customerFeedback && (
                              <div>
                                <span className="text-[12px] font-semibold text-[#0f172a]">
                                  Your Request ({formatDate(cert.feedbackDate)}):
                                </span>
                                <p className="mt-1 text-[12.5px] text-[#475569] bg-[#faf5ff] border border-[#e9d5ff] rounded-lg p-2.5">
                                  {cert.customerFeedback}
                                </p>
                              </div>
                            )}
                            {cert.adminResponse ? (
                              <div>
                                <span className="text-[12px] font-semibold text-[#0f172a]">
                                  Admin Response ({cert.adminName}, {formatDate(cert.respondedAt)}):
                                </span>
                                <p className="mt-1 text-[12.5px] text-[#475569] bg-[#fffbeb] border border-[#fde68a] rounded-lg p-2.5">
                                  {cert.adminResponse}
                                </p>
                              </div>
                            ) : (
                              <p className="text-[12.5px] text-[#94a3b8] italic">
                                Admin is reviewing your request...
                              </p>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        ) : (
          <div className="py-12 text-center">
            <div className="size-10 bg-[#f1f5f9] rounded-full flex items-center justify-center mx-auto mb-3">
              <MessageSquare className="size-4.5 text-[#94a3b8]" />
            </div>
            <p className="text-[13px] text-[#94a3b8]">No certificates awaiting response.</p>
          </div>
        )}

        {/* Pagination Footer */}
        {total > 0 && (
          <div className="px-4 py-3 border-t border-[#f1f5f9] flex flex-col sm:flex-row items-center justify-between gap-3">
            <span className="text-[13px] text-[#94a3b8]">
              Showing {startIndex + 1}–{endIndex} of {total}
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
                    disabled={currentPage <= 1}
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
                          page === currentPage ? 'bg-[#0f172a] text-white' : 'text-[#64748b] hover:bg-[#f1f5f9]'
                        }`}
                      >
                        {page}
                      </button>
                    )
                  )}
                  <button
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage >= totalPages}
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
