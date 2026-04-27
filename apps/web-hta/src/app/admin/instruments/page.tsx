'use client'

import { apiFetch } from '@/lib/api-client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Loader2,
  Plus,
  Download,
  Search,
  AlertCircle,
  CheckCircle,
  Clock,
  Wrench,
  Gauge,
  ChevronLeft,
  ChevronRight,
  Eye,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface Instrument {
  id: string
  legacyId: number | null
  category: string
  description: string
  make: string
  model: string
  assetNumber: string
  serialNumber: string
  calibrationDueDate: string | null
  status: string
  daysUntilExpiry: number
  isActive: boolean
  remarks: string | null
}

interface Stats {
  total: number
  expired: number
  expiring: number
  valid: number
  underRecal: number
}

interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

const CATEGORIES = [
  'ALL',
  'Electro-Technical',
  'Thermal',
  'Mechanical',
  'Dimensions',
  'Others',
  'Source',
]

const STATUS_OPTIONS = [
  { value: 'ALL', label: 'All Status' },
  { value: 'valid', label: 'Valid' },
  { value: 'expiring', label: 'Expiring Soon' },
  { value: 'expired', label: 'Expired' },
  { value: 'underRecal', label: 'Under Recal' },
]

const STAT_CARDS = [
  { key: 'total', field: 'total' as const, label: 'Total', borderColor: 'border-l-[#94a3b8]', countColor: 'text-[#0f172a]', filter: 'ALL' },
  { key: 'valid', field: 'valid' as const, label: 'Valid', borderColor: 'border-l-[#22c55e]', countColor: 'text-[#15803d]', filter: 'valid' },
  { key: 'expiring', field: 'expiring' as const, label: 'Expiring', borderColor: 'border-l-[#eab308]', countColor: 'text-[#a16207]', filter: 'expiring' },
  { key: 'expired', field: 'expired' as const, label: 'Expired', borderColor: 'border-l-[#ef4444]', countColor: 'text-[#dc2626]', filter: 'expired' },
  { key: 'underRecal', field: 'underRecal' as const, label: 'Under Recal', borderColor: 'border-l-[#3b82f6]', countColor: 'text-[#1d4ed8]', filter: 'underRecal' },
]

export default function InstrumentsPage() {
  const [instruments, setInstruments] = useState<Instrument[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
  })

  // Filters
  const [categoryFilter, setCategoryFilter] = useState('ALL')
  const [statusFilter, setStatusFilter] = useState('ALL')
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

      if (categoryFilter !== 'ALL') {
        params.set('category', categoryFilter)
      }
      if (statusFilter !== 'ALL') {
        params.set('status', statusFilter)
      }
      if (searchQuery) {
        params.set('search', searchQuery)
      }

      const res = await apiFetch(`/api/admin/instruments?${params}`)
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
  }, [categoryFilter, statusFilter, searchQuery, rowsPerPage])

  useEffect(() => {
    fetchInstruments()
  }, [categoryFilter, statusFilter, searchQuery, fetchInstruments])

  const handleSearch = () => {
    setSearchQuery(searchInput)
  }

  const handleExport = async (format: 'csv' | 'json') => {
    try {
      const res = await apiFetch(`/api/admin/instruments/export?format=${format}`)
      if (res.ok) {
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `master-instruments.${format}`
        a.click()
        URL.revokeObjectURL(url)
      }
    } catch (error) {
      console.error('Export failed:', error)
    }
  }

  const getStatusBadge = (status: string) => {
    const config: Record<string, { bg: string; text: string; icon: typeof CheckCircle; label: string }> = {
      VALID: { bg: 'bg-[#dcfce7]', text: 'text-[#15803d]', icon: CheckCircle, label: 'Valid' },
      EXPIRING_SOON: { bg: 'bg-[#fef3c7]', text: 'text-[#92400e]', icon: Clock, label: 'Expiring' },
      EXPIRED: { bg: 'bg-[#fee2e2]', text: 'text-[#991b1b]', icon: AlertCircle, label: 'Expired' },
      UNDER_RECAL: { bg: 'bg-[#dbeafe]', text: 'text-[#1e40af]', icon: Wrench, label: 'Recal' },
    }
    const c = config[status]
    if (!c) return <span className="px-2 py-0.5 text-[11px] font-semibold rounded-full bg-[#f1f5f9] text-[#64748b]">{status}</span>
    const Icon = c.icon
    return (
      <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded-full', c.bg, c.text)}>
        <Icon className="size-3" />
        {c.label}
      </span>
    )
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleDateString()
  }

  return (
    <div className="h-full overflow-auto bg-[#f1f5f9]">
      <div className="px-6 sm:px-9 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-[22px] font-bold text-[#0f172a] flex items-center gap-2.5">
              <Gauge className="size-[22px] text-[#94a3b8]" />
              Master Instruments
            </h1>
            <p className="text-[13px] text-[#94a3b8] mt-1">
              Manage calibration instruments and their status
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleExport('csv')}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-[12.5px] font-semibold text-[#0f172a] border border-[#e2e8f0] rounded-[9px] hover:bg-[#f8fafc] transition-colors"
            >
              <Download className="size-4" />
              Export CSV
            </button>
            <Link href="/admin/instruments/new">
              <button className="inline-flex items-center gap-1.5 px-4 py-2 text-[12.5px] font-semibold text-white bg-[#16a34a] hover:bg-[#15803d] rounded-[9px] transition-colors">
                <Plus className="size-4" />
                Add Instrument
              </button>
            </Link>
          </div>
        </div>

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
            {STAT_CARDS.map((card) => (
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
                  {stats[card.field]}
                </div>
                <div className="text-[10px] font-bold uppercase tracking-[0.07em] text-[#94a3b8] mt-2">{card.label}</div>
              </button>
            ))}
          </div>
        )}

        {/* Filters */}
        <div className="bg-white rounded-[14px] border border-[#e2e8f0] p-4 mb-5">
          <div className="flex flex-wrap items-end gap-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-[#94a3b8]" />
              <input
                type="text"
                placeholder="Search by description, asset number, make..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="w-full pl-9 pr-4 py-2 text-[13px] text-[#0f172a] border border-[#e2e8f0] rounded-[9px] placeholder:text-[#94a3b8] focus:ring-2 focus:ring-[#7c3aed]/20 focus:border-[#7c3aed] outline-none"
              />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[180px] px-3 py-2 text-[13px] text-[#0f172a] border border-[#e2e8f0] rounded-[9px] bg-white focus:ring-2 focus:ring-[#7c3aed]/20 focus:border-[#7c3aed]">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat === 'ALL' ? 'All Categories' : cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[160px] px-3 py-2 text-[13px] text-[#0f172a] border border-[#e2e8f0] rounded-[9px] bg-white focus:ring-2 focus:ring-[#7c3aed]/20 focus:border-[#7c3aed]">
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

        {/* Instruments Table */}
        <div className="bg-white rounded-[14px] border border-[#e2e8f0] overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="size-6 animate-spin text-[#94a3b8]" />
            </div>
          ) : instruments.length === 0 ? (
            <div className="text-center py-16">
              <Gauge className="size-10 mx-auto mb-3 text-[#e2e8f0]" />
              <p className="text-[13px] text-[#94a3b8]">No instruments found</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-[#e2e8f0] bg-[#f8fafc]">
                      <th className="text-left py-2.5 px-4 text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Category</th>
                      <th className="text-left py-2.5 px-4 text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Description</th>
                      <th className="text-left py-2.5 px-4 text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Make / Model</th>
                      <th className="text-left py-2.5 px-4 text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Asset No.</th>
                      <th className="text-left py-2.5 px-4 text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Due Date</th>
                      <th className="text-left py-2.5 px-4 text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Status</th>
                      <th className="text-center py-2.5 px-4 text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8] w-[60px]">View</th>
                    </tr>
                  </thead>
                  <tbody>
                    {instruments.map((inst) => (
                      <tr
                        key={inst.id}
                        className="border-b border-[#f1f5f9] hover:bg-[#f8fafc] transition-colors cursor-pointer"
                        onClick={() => (window.location.href = `/admin/instruments/${inst.id}`)}
                      >
                        <td className="py-2.5 px-4 text-[#64748b]">{inst.category}</td>
                        <td className="py-2.5 px-4 font-medium text-[#0f172a]">{inst.description}</td>
                        <td className="py-2.5 px-4 text-[#64748b]">
                          {inst.make}
                          {inst.model && ` / ${inst.model}`}
                        </td>
                        <td className="py-2.5 px-4 font-mono text-[#0f172a]">{inst.assetNumber}</td>
                        <td className="py-2.5 px-4 text-[#64748b]">{formatDate(inst.calibrationDueDate)}</td>
                        <td className="py-2.5 px-4">{getStatusBadge(inst.status)}</td>
                        <td className="py-2.5 px-4 text-center">
                          <Link href={`/admin/instruments/${inst.id}`} onClick={(e) => e.stopPropagation()}>
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
                    {pagination.total} instruments
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
                        onClick={() => fetchInstruments(pagination.page - 1)}
                        className="px-2.5 py-1.5 text-[12px] border border-[#e2e8f0] rounded-[7px] hover:bg-[#f8fafc] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        <ChevronLeft className="size-3.5" />
                      </button>
                      <button
                        disabled={pagination.page === pagination.totalPages}
                        onClick={() => fetchInstruments(pagination.page + 1)}
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
