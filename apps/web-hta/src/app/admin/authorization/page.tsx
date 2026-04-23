'use client'

import { apiFetch } from '@/lib/api-client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
  ShieldCheck,
  Eye,
  FileText,
} from 'lucide-react'

interface Certificate {
  id: string
  certificateNumber: string
  customerName: string | null
  uucDescription: string | null
  uucMake: string | null
  uucModel: string | null
  uucSerialNumber: string | null
  dateOfCalibration: string | null
  status: string
  currentRevision: number
  createdBy: { id: string; name: string; email: string } | null
  createdAt: string
  updatedAt: string
}

interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

export default function AuthorizationPage() {
  const [certificates, setCertificates] = useState<Certificate[]>([])
  const [loading, setLoading] = useState(true)
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  })

  const fetchCertificates = async (page = 1) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '20',
        status: 'PENDING_ADMIN_AUTHORIZATION',
      })
      const res = await apiFetch(`/api/admin/authorization?${params}`)
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
  }

  useEffect(() => {
    fetchCertificates()
  }, [])

  return (
    <div className="p-3 h-full">
      {/* Master Bounding Box */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden h-full">
        <div className="p-6 overflow-auto h-full">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="flex items-center gap-3 text-2xl font-bold text-slate-900">
                <ShieldCheck className="h-8 w-8 text-indigo-500 shrink-0" />
                <span>Certificate Authorization</span>
              </h1>
              <p className="text-slate-600 mt-1">
                Review and authorize certificates that have been approved by customers
              </p>
            </div>
            {!loading && (
              <div className="text-right">
                <p className="text-3xl font-bold text-indigo-600">{pagination.total}</p>
                <p className="text-sm text-slate-500">Awaiting Authorization</p>
              </div>
            )}
          </div>

          <Card>
            <CardContent className="pt-6">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                </div>
              ) : certificates.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  <ShieldCheck className="h-16 w-16 mx-auto mb-4 text-green-300" />
                  <p className="font-medium text-lg text-green-700">All caught up!</p>
                  <p className="text-sm mt-1">
                    No certificates are awaiting authorization
                  </p>
                </div>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Certificate #</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>UUC Description</TableHead>
                        <TableHead>Make / Model</TableHead>
                        <TableHead>Calibration Date</TableHead>
                        <TableHead>Engineer</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {certificates.map((cert) => (
                        <TableRow key={cert.id}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <FileText className="h-4 w-4 text-slate-400" />
                              {cert.certificateNumber}
                            </div>
                          </TableCell>
                          <TableCell>{cert.customerName || '-'}</TableCell>
                          <TableCell className="max-w-[200px] truncate">
                            {cert.uucDescription || '-'}
                          </TableCell>
                          <TableCell>
                            {cert.uucMake && cert.uucModel
                              ? `${cert.uucMake} / ${cert.uucModel}`
                              : cert.uucMake || cert.uucModel || '-'}
                          </TableCell>
                          <TableCell className="text-slate-500">
                            {cert.dateOfCalibration
                              ? new Date(cert.dateOfCalibration).toLocaleDateString()
                              : '-'}
                          </TableCell>
                          <TableCell className="text-slate-500">
                            {cert.createdBy?.name || '-'}
                          </TableCell>
                          <TableCell className="text-right">
                            <Link href={`/admin/authorization/${cert.id}`}>
                              <Button
                                size="sm"
                                className="bg-indigo-600 hover:bg-indigo-700"
                              >
                                <Eye className="h-4 w-4 mr-1" />
                                Review
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
