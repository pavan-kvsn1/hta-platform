'use client'

import { apiFetch } from '@/lib/api-client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Loader2,
  Search,
  Gauge,
  FileCheck2,
  Wrench,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'

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

interface CertificateInfo {
  id: string
  certificateNumber: string
  uucDescription: string | null
  dateOfCalibration: string | null
}

interface CertificateInstrument {
  masterInstrumentId: string
  category: string | null
  description: string | null
  make: string | null
  model: string | null
  assetNo: string | null
  serialNumber: string | null
  calibratedAt: string | null
  reportNo: string | null
  calibrationDueDate: string | null
  sopReference: string
  certificates: CertificateInfo[]
}

interface Stats {
  totalInstruments: number
  totalAuthorizedCertificates: number
}

interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

const STAT_CARDS = [
  { key: 'totalInstruments' as const, label: 'Unique Instruments', icon: Gauge, borderColor: 'border-l-[#2563eb]', countColor: 'text-[#1e40af]' },
  { key: 'totalAuthorizedCertificates' as const, label: 'Your Certificates', icon: FileCheck2, borderColor: 'border-l-[#16a34a]', countColor: 'text-[#15803d]' },
]

export default function CustomerInstrumentsPage() {
  const router = useRouter()
  const [instruments, setInstruments] = useState<CertificateInstrument[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
  })

  const [searchQuery, setSearchQuery] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [rowsPerPage, setRowsPerPage] = useState(10)

  const fetchInstruments = useCallback(async (page = 1) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: rowsPerPage.toString(),
      })

      if (searchQuery) {
        params.set('search', searchQuery)
      }

      const res = await apiFetch(`/api/customer/instruments?${params}`)
      if (res.ok) {
        const data = await res.json()
        setInstruments(data.instruments)
        setPagination(data.pagination)
        setStats(data.stats)
      }
    } catch (error) {
      console.error('Failed to fetch instruments:', error)
    } finally {
      setLoading(false)
    }
  }, [searchQuery, rowsPerPage])

  useEffect(() => {
    fetchInstruments()
  }, [searchQuery, rowsPerPage, fetchInstruments])

  const handleSearch = () => {
    setSearchQuery(searchInput)
  }

  const handleRowsPerPage = (value: number) => {
    setRowsPerPage(value)
    // fetchInstruments(1) will be triggered by useEffect
  }

  const pageNumbers = getPageNumbers(pagination.page, pagination.totalPages)

  return (
    <div className="h-full overflow-auto bg-[#f1f5f9]">
      <div className="px-6 sm:px-9 py-8">
        {/* Page Header */}
        <div className="mb-7">
          <h1 className="text-[26px] font-extrabold tracking-tight text-[#0f172a]">Instruments</h1>
          <p className="text-sm text-[#94a3b8] mt-1">Master instruments used in your authorized certificates</p>
        </div>

        {/* Stat Cards */}
        {stats && (
          <div className="grid grid-cols-2 gap-4 mb-7">
            {STAT_CARDS.map((card) => {
              const Icon = card.icon
              return (
                <div
                  key={card.key}
                  className={`bg-white border border-[#e2e8f0] rounded-xl px-5 py-5 border-l-[3px] ${card.borderColor}`}
                >
                  <div className="flex items-center justify-between mb-2.5">
                    <span className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">
                      {card.label}
                    </span>
                    <Icon className={`size-4 ${card.countColor}`} />
                  </div>
                  <p className={`text-[38px] font-extrabold leading-none tracking-tight ${card.countColor}`}>
                    {stats[card.key]}
                  </p>
                </div>
              )
            })}
          </div>
        )}

        {/* Search */}
        <div className="bg-white border border-[#e2e8f0] rounded-[14px] px-4 py-3 mb-5">
          <div className="flex items-center gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-[#94a3b8]" />
              <input
                placeholder="Search by description, asset number, make..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="w-full pl-9 pr-3 py-2 text-[13px] text-[#0f172a] placeholder:text-[#94a3b8] border border-[#e2e8f0] rounded-[9px] focus:outline-none focus:ring-2 focus:ring-[#0f172a]/10 focus:border-[#0f172a]/20"
              />
            </div>
            <Button
              onClick={handleSearch}
              size="sm"
              className="bg-[#0f172a] hover:bg-[#1e293b] text-white rounded-[9px] text-[12.5px] font-semibold h-9 px-4"
            >
              Search
            </Button>
          </div>
        </div>

        {/* Instruments Table */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="size-6 animate-spin text-[#94a3b8]" />
          </div>
        ) : instruments.length === 0 ? (
          <div className="bg-white border border-[#e2e8f0] rounded-[14px] p-12 text-center">
            <div className="size-14 bg-[#f1f5f9] rounded-full flex items-center justify-center mx-auto mb-4">
              <Wrench className="size-6 text-[#94a3b8]" />
            </div>
            <h3 className="text-[15px] font-semibold text-[#0f172a] mb-1">No instruments found</h3>
            <p className="text-[13px] text-[#94a3b8]">
              Instruments will appear here once you have authorized certificates.
            </p>
          </div>
        ) : (
          <div className="bg-white border border-[#e2e8f0] rounded-[14px] overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-[#f1f5f9] hover:bg-transparent">
                  <TableHead className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8] h-10">Description</TableHead>
                  <TableHead className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8] h-10">Make / Model</TableHead>
                  <TableHead className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8] h-10">Asset No.</TableHead>
                  <TableHead className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8] h-10">Calibration Due</TableHead>
                  <TableHead className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8] h-10">Used In</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {instruments.map((inst) => (
                  <TableRow
                    key={inst.masterInstrumentId}
                    className="cursor-pointer hover:bg-[#f8fafc] border-b border-[#f1f5f9] last:border-0"
                    onClick={() =>
                      router.push(`/customer/instruments/${inst.masterInstrumentId}`)
                    }
                  >
                    <TableCell className="text-[13px] font-medium text-[#0f172a]">
                      {inst.description || '-'}
                    </TableCell>
                    <TableCell className="text-[13px] text-[#64748b]">
                      {inst.make || '-'}
                      {inst.model && ` / ${inst.model}`}
                    </TableCell>
                    <TableCell className="text-[13px] text-[#64748b]">
                      {inst.assetNo || '-'}
                    </TableCell>
                    <TableCell className="text-[13px] text-[#64748b]">
                      {inst.calibrationDueDate || '-'}
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center px-2 py-0.5 text-[11px] font-medium text-[#475569] bg-[#f1f5f9] rounded-[5px]">
                        {inst.certificates.length} cert{inst.certificates.length !== 1 ? 's' : ''}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {/* Pagination Footer */}
            <div className="px-4 py-3 border-t border-[#f1f5f9] flex flex-col sm:flex-row items-center justify-between gap-3">
              <span className="text-[13px] text-[#94a3b8]">
                Showing {(pagination.page - 1) * pagination.limit + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
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
                {pagination.totalPages > 1 && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => fetchInstruments(pagination.page - 1)}
                      disabled={pagination.page <= 1}
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
                          onClick={() => fetchInstruments(page)}
                          className={`size-8 flex items-center justify-center rounded-lg text-[13px] font-medium transition-colors ${
                            page === pagination.page ? 'bg-[#0f172a] text-white' : 'text-[#64748b] hover:bg-[#f1f5f9]'
                          }`}
                        >
                          {page}
                        </button>
                      )
                    )}
                    <button
                      onClick={() => fetchInstruments(pagination.page + 1)}
                      disabled={pagination.page >= pagination.totalPages}
                      className="size-8 flex items-center justify-center rounded-lg border border-[#e2e8f0] text-[#64748b] hover:bg-[#f1f5f9] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronRight className="size-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
