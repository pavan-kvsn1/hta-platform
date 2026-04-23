'use client'

import { apiFetch } from '@/lib/api-client'

import { useState, useEffect, Suspense, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
// import { PDFPreviewButton } from '@/app/(dashboard)/hod/review/[id]/PDFPreviewButton'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StatusBadge } from '@/components/dashboard/StatusBadge'
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
  FileText,
} from 'lucide-react'

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
  lastModifiedBy: {
    id: string
    name: string
  }
}

interface Stats {
  total: number
  draft: number
  pendingHodReview: number
  revisionRequired: number
  pendingCustomerApproval: number
  customerRevisionRequired: number
  pendingAdminAuthorization: number
  authorized: number
  rejected: number
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
]

function AdminCertificatesContent() {
  const searchParams = useSearchParams()
  const initialStatus = searchParams.get('status') || 'ALL'

  const [certificates, setCertificates] = useState<Certificate[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  })

  // Filters
  const [statusFilter, setStatusFilter] = useState(initialStatus)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchInput, setSearchInput] = useState('')

  const fetchCertificates = useCallback(async (page = 1) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '20',
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
  }, [statusFilter, searchQuery])

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
    <div className="p-3 h-full">
      {/* Master Bounding Box */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden h-full">
        <div className="p-6 overflow-auto h-full">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">All Certificates</h1>
              <p className="text-slate-600 mt-1">
                View and manage all certificates in the system
              </p>
            </div>
          </div>

          {/* Stats Cards */}
          {stats && (
            <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-3 mb-6">
              <Card className="cursor-pointer hover:border-slate-400" onClick={() => setStatusFilter('ALL')}>
                <CardContent className="pt-4 pb-4">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-slate-900">{stats.total}</p>
                    <p className="text-xs text-slate-500">Total</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="cursor-pointer hover:border-gray-400" onClick={() => setStatusFilter('DRAFT')}>
                <CardContent className="pt-4 pb-4">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-gray-600">{stats.draft}</p>
                    <p className="text-xs text-slate-500">Draft</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="cursor-pointer hover:border-yellow-400" onClick={() => setStatusFilter('PENDING_REVIEW')}>
                <CardContent className="pt-4 pb-4">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-yellow-600">{stats.pendingHodReview}</p>
                    <p className="text-xs text-slate-500">Pending Review</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="cursor-pointer hover:border-orange-400" onClick={() => setStatusFilter('REVISION_REQUIRED')}>
                <CardContent className="pt-4 pb-4">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-orange-600">{stats.revisionRequired}</p>
                    <p className="text-xs text-slate-500">Revision Req.</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="cursor-pointer hover:border-blue-400" onClick={() => setStatusFilter('PENDING_CUSTOMER_APPROVAL')}>
                <CardContent className="pt-4 pb-4">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-blue-600">{stats.pendingCustomerApproval}</p>
                    <p className="text-xs text-slate-500">With Customer</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="cursor-pointer hover:border-purple-400" onClick={() => setStatusFilter('CUSTOMER_REVISION_REQUIRED')}>
                <CardContent className="pt-4 pb-4">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-purple-600">{stats.customerRevisionRequired}</p>
                    <p className="text-xs text-slate-500">Cust. Revision</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="cursor-pointer hover:border-indigo-400" onClick={() => setStatusFilter('PENDING_ADMIN_AUTHORIZATION')}>
                <CardContent className="pt-4 pb-4">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-indigo-600">{stats.pendingAdminAuthorization}</p>
                    <p className="text-xs text-slate-500">Pending Auth</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="cursor-pointer hover:border-emerald-400" onClick={() => setStatusFilter('AUTHORIZED')}>
                <CardContent className="pt-4 pb-4">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-emerald-600">{stats.authorized}</p>
                    <p className="text-xs text-slate-500">Authorized</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="cursor-pointer hover:border-red-400" onClick={() => setStatusFilter('REJECTED')}>
                <CardContent className="pt-4 pb-4">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-red-600">{stats.rejected}</p>
                    <p className="text-xs text-slate-500">Rejected</p>
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
                      placeholder="Search by certificate number, customer, description..."
                      value={searchInput}
                      onChange={(e) => setSearchInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                      className="pl-10"
                    />
                  </div>
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-48">
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

          {/* Certificates Table */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-slate-400" />
                Certificates
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                </div>
              ) : certificates.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  No certificates found
                </div>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Certificate No.</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>UUC Description</TableHead>
                        <TableHead>Calibration Date</TableHead>
                        <TableHead>Engineer</TableHead>
                        <TableHead>Admin</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="w-[120px]">Preview</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {certificates.map((cert) => (
                        <TableRow key={cert.id}>
                          <TableCell className="font-mono font-medium">
                            {cert.certificateNumber}
                          </TableCell>
                          <TableCell className="text-sm">
                            {cert.customerName}
                          </TableCell>
                          <TableCell className="text-sm text-slate-600">
                            {cert.uucDescription}
                            {cert.uucMake && ` - ${cert.uucMake}`}
                            {cert.uucModel && ` ${cert.uucModel}`}
                          </TableCell>
                          <TableCell className="text-sm">
                            {formatDate(cert.dateOfCalibration)}
                          </TableCell>
                          <TableCell className="text-sm text-slate-600">
                            {cert.createdBy.name}
                          </TableCell>
                          <TableCell className="text-sm text-slate-600">
                            {cert.assignedAdmin?.name || '-'}
                          </TableCell>
                          <TableCell><StatusBadge status={cert.status} /></TableCell>
                          <TableCell>
                            <Link href={`/admin/certificates/${cert.id}`}>
                              <Button variant="outline" size="sm">
                                View
                              </Button>
                            </Link>
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
                        {pagination.total} certificates
                      </p>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => fetchCertificates(pagination.page - 1)}
                          disabled={pagination.page === 1}
                        >
                          Previous
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => fetchCertificates(pagination.page + 1)}
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

export default function AdminCertificatesPage() {
  return (
    <Suspense fallback={
      <div className="p-3 h-full">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden h-full">
          <div className="p-6 flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
          </div>
        </div>
      </div>
    }>
      <AdminCertificatesContent />
    </Suspense>
  )
}
