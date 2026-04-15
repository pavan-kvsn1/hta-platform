'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
  Search,
  Wrench,
  FileCheck2,
  Gauge,
} from 'lucide-react'

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

export default function CustomerInstrumentsPage() {
  const router = useRouter()
  const [instruments, setInstruments] = useState<CertificateInstrument[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  })

  const [searchQuery, setSearchQuery] = useState('')
  const [searchInput, setSearchInput] = useState('')

  const fetchInstruments = useCallback(async (page = 1) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '20',
      })

      if (searchQuery) {
        params.set('search', searchQuery)
      }

      const res = await fetch(`/api/customer/instruments?${params}`)
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
  }, [searchQuery])

  useEffect(() => {
    fetchInstruments()
  }, [searchQuery, fetchInstruments])

  const handleSearch = () => {
    setSearchQuery(searchInput)
  }

  return (
    <div className="p-3 h-full">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden h-full">
        <div className="p-6 overflow-auto h-full">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-slate-100 rounded-lg">
                <Wrench className="h-6 w-6 text-slate-600" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900">Instruments</h1>
                <p className="text-sm text-slate-500">
                  Master instruments used in your authorized certificates
                </p>
              </div>
            </div>
          </div>

          {/* Stats Cards */}
          {stats && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
              <Card>
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-slate-100 rounded-lg">
                      <Gauge className="h-5 w-5 text-slate-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-slate-900">
                        {stats.totalInstruments}
                      </p>
                      <p className="text-sm text-slate-500">Unique Instruments</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-green-100 rounded-lg">
                      <FileCheck2 className="h-5 w-5 text-green-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-green-600">
                        {stats.totalAuthorizedCertificates}
                      </p>
                      <p className="text-sm text-slate-500">Your Certificates</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Search */}
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
                      className="pl-10"
                    />
                  </div>
                </div>
                <Button onClick={handleSearch}>Search</Button>
              </div>
            </CardContent>
          </Card>

          {/* Instruments List */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
            </div>
          ) : instruments.length === 0 ? (
            <div className="bg-slate-50 rounded-lg border border-slate-200 p-12 text-center">
              <div className="text-5xl mb-4">🔧</div>
              <h3 className="text-lg font-medium text-slate-900 mb-1">
                No instruments found
              </h3>
              <p className="text-sm text-slate-500">
                Instruments will appear here once you have authorized certificates.
              </p>
            </div>
          ) : (
            <Card>
              <CardContent className="pt-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Description</TableHead>
                      <TableHead>Make / Model</TableHead>
                      <TableHead>Asset No.</TableHead>
                      <TableHead>Calibration Due</TableHead>
                      <TableHead>Used In</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {instruments.map((inst) => (
                      <TableRow
                        key={inst.masterInstrumentId}
                        className="cursor-pointer hover:bg-slate-50"
                        onClick={() =>
                          router.push(`/customer/instruments/${inst.masterInstrumentId}`)
                        }
                      >
                        <TableCell className="font-medium">
                          {inst.description || '-'}
                        </TableCell>
                        <TableCell className="text-sm text-slate-600">
                          {inst.make || '-'}
                          {inst.model && ` / ${inst.model}`}
                        </TableCell>
                        <TableCell className="text-sm font-mono">
                          {inst.assetNo || '-'}
                        </TableCell>
                        <TableCell className="text-sm">
                          {inst.calibrationDueDate || '-'}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">
                            {inst.certificates.length} cert
                            {inst.certificates.length !== 1 ? 's' : ''}
                          </Badge>
                        </TableCell>
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
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
