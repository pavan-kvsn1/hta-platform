'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
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
  Plus,
  Download,
  Search,
  AlertCircle,
  CheckCircle,
  Clock,
  Wrench,
  Gauge,
} from 'lucide-react'

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

export default function InstrumentsPage() {
  const [instruments, setInstruments] = useState<Instrument[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  })

  // Filters
  const [categoryFilter, setCategoryFilter] = useState('ALL')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchInput, setSearchInput] = useState('')

  const fetchInstruments = async (page = 1) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '20',
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

      const res = await fetch(`/api/admin/instruments?${params}`)
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
  }

  useEffect(() => {
    fetchInstruments()
  }, [categoryFilter, statusFilter, searchQuery])

  const handleSearch = () => {
    setSearchQuery(searchInput)
  }

  const handleExport = async (format: 'csv' | 'json') => {
    try {
      const res = await fetch(`/api/admin/instruments/export?format=${format}`)
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
    switch (status) {
      case 'VALID':
        return (
          <Badge className="bg-green-100 text-green-800">
            <CheckCircle className="h-3 w-3 mr-1" />
            Valid
          </Badge>
        )
      case 'EXPIRING_SOON':
        return (
          <Badge className="bg-amber-100 text-amber-800">
            <Clock className="h-3 w-3 mr-1" />
            Expiring
          </Badge>
        )
      case 'EXPIRED':
        return (
          <Badge className="bg-red-100 text-red-800">
            <AlertCircle className="h-3 w-3 mr-1" />
            Expired
          </Badge>
        )
      case 'UNDER_RECAL':
        return (
          <Badge className="bg-blue-100 text-blue-800">
            <Wrench className="h-3 w-3 mr-1" />
            Recal
          </Badge>
        )
      default:
        return <Badge>{status}</Badge>
    }
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleDateString()
  }

  return (
    <div className="p-3 h-full">
      {/* Master Bounding Box */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden h-full">
        <div className="p-6 overflow-auto h-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Master Instruments</h1>
          <p className="text-slate-600 mt-1">
            Manage calibration instruments and their status
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => handleExport('csv')}
          >
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
          <Link href="/admin/instruments/new">
            <Button className="bg-green-600 hover:bg-green-700">
              <Plus className="h-4 w-4 mr-2" />
              Add Instrument
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
          <Card className="cursor-pointer" onClick={() => setStatusFilter('ALL')}>
            <CardContent className="pt-4 pb-4 border border-slate-300 rounded-lg hover:border-slate-500">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-slate-100 rounded-lg">
                  <Gauge className="h-5 w-5 text-slate-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-900">{stats.total}</p>
                  <p className="text-sm text-slate-500">Total</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="cursor-pointer" onClick={() => setStatusFilter('valid')}>
            <CardContent className="pt-4 pb-4 border border-green-300 rounded-lg hover:border-green-500">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-green-600">{stats.valid}</p>
                  <p className="text-sm text-slate-500">Valid</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="cursor-pointer" onClick={() => setStatusFilter('expiring')}>
            <CardContent className="pt-4 pb-4 border border-amber-300 rounded-lg hover:border-amber-500">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-100 rounded-lg">
                  <Clock className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-amber-600">{stats.expiring}</p>
                  <p className="text-sm text-slate-500">Expiring</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="cursor-pointer" onClick={() => setStatusFilter('expired')}>
            <CardContent className="pt-4 pb-4 border border-red-300 rounded-lg hover:border-red-500">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-100 rounded-lg">
                  <AlertCircle className="h-5 w-5 text-red-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-red-600">{stats.expired}</p>
                  <p className="text-sm text-slate-500">Expired</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="cursor-pointer" onClick={() => setStatusFilter('underRecal')}>
            <CardContent className="pt-4 pb-4 border border-blue-300 rounded-lg hover:border-blue-500">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Wrench className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-blue-600">{stats.underRecal}</p>
                  <p className="text-sm text-slate-500">Under Recal</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Search by description, asset number, make..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  className="pl-10 border-slate-300"
                />
              </div>
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-48 border-slate-300">
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
              <SelectTrigger className="w-40 border-slate-300">
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
            <Button onClick={handleSearch}>Search</Button>
          </div>
        </CardContent>
      </Card>

      {/* Instruments Table */}
      <Card className="border-slate-300">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gauge className="h-5 w-5 text-slate-400" />
            Instruments
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
          ) : instruments.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              No instruments found
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow className="border border-slate-300 rounded-lg">
                    <TableHead>Category</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Make / Model</TableHead>
                    <TableHead>Asset No.</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {instruments.map((inst) => (
                    <TableRow
                      key={inst.id}
                      className="cursor-pointer hover:bg-slate-300 border border-slate-300 rounded-lg"
                      onClick={() => (window.location.href = `/admin/instruments/${inst.id}`)}
                    >
                      <TableCell className="text-sm text-slate-600">
                        {inst.category}
                      </TableCell>
                      <TableCell className="font-medium">{inst.description}</TableCell>
                      <TableCell className="text-sm text-slate-600">
                        {inst.make}
                        {inst.model && ` / ${inst.model}`}
                      </TableCell>
                      <TableCell className="text-sm font-mono">
                        {inst.assetNumber}
                      </TableCell>
                      <TableCell className="text-sm">
                        {formatDate(inst.calibrationDueDate)}
                      </TableCell>
                      <TableCell>{getStatusBadge(inst.status)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Pagination */}
              {pagination.totalPages > 1 && (
                <div className="flex items-center justify-between pt-4 border-t mt-4">
                  <p className="text-sm text-slate-500">
                    Showing {(pagination.page - 1) * pagination.limit + 1} to{' '}
                    {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
                    {pagination.total} instruments
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fetchInstruments(pagination.page - 1)}
                      disabled={pagination.page === 1}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fetchInstruments(pagination.page + 1)}
                      disabled={pagination.page === pagination.totalPages}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
        </div>
      </div>
    </div>
  )
}
