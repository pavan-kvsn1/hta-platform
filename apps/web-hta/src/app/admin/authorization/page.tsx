'use client'

import { apiFetch } from '@/lib/api-client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  Loader2,
  ShieldCheck,
  Eye,
  FileText,
  ChevronLeft,
  ChevronRight,
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
    limit: 10,
    total: 0,
    totalPages: 0,
  })
  const [rowsPerPage, setRowsPerPage] = useState(10)

  const fetchCertificates = async (page = 1) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: rowsPerPage.toString(),
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
  }, [rowsPerPage]) // eslint-disable-line react-hooks/exhaustive-deps

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
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-[22px] font-bold text-[#0f172a] flex items-center gap-2.5">
              <ShieldCheck className="size-[22px] text-[#94a3b8]" />
              Certificate Authorization
            </h1>
            <p className="text-[13px] text-[#94a3b8] mt-1">
              Review and authorize certificates that have been approved by customers
            </p>
          </div>
          {!loading && (
            <div className="border border-[#e2e8f0] rounded-xl px-5 py-4 border-l-[3px] border-l-[#6366f1] bg-white">
              <div className="text-[38px] font-extrabold leading-none tracking-tight text-[#4f46e5]">
                {pagination.total}
              </div>
              <div className="text-[10px] font-bold uppercase tracking-[0.07em] text-[#94a3b8] mt-2">
                Awaiting Auth
              </div>
            </div>
          )}
        </div>

        {/* Certificates Table */}
        <div className="bg-white rounded-[14px] border border-[#e2e8f0] overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="size-6 animate-spin text-[#94a3b8]" />
            </div>
          ) : certificates.length === 0 ? (
            <div className="text-center py-16">
              <ShieldCheck className="size-10 mx-auto mb-3 text-[#bbf7d0]" />
              <p className="text-[14px] font-semibold text-[#16a34a]">All caught up!</p>
              <p className="text-[13px] text-[#94a3b8] mt-1">
                No certificates are awaiting authorization
              </p>
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
                      <th className="text-left py-2.5 px-4 text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Make / Model</th>
                      <th className="text-left py-2.5 px-4 text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Cal Date</th>
                      <th className="text-left py-2.5 px-4 text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Engineer</th>
                      <th className="text-center py-2.5 px-4 text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8] w-[80px]">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {certificates.map((cert) => (
                      <tr
                        key={cert.id}
                        className="border-b border-[#f1f5f9] hover:bg-[#f8fafc] transition-colors"
                      >
                        <td className="py-2.5 px-4 font-mono font-medium text-[#0f172a]">
                          <div className="flex items-center gap-2">
                            <FileText className="size-3.5 text-[#94a3b8]" />
                            {cert.certificateNumber}
                          </div>
                        </td>
                        <td className="py-2.5 px-4 text-[#0f172a]">{cert.customerName || '-'}</td>
                        <td className="py-2.5 px-4 text-[#64748b] max-w-[200px] truncate">
                          {cert.uucDescription || '-'}
                        </td>
                        <td className="py-2.5 px-4 text-[#64748b]">
                          {cert.uucMake && cert.uucModel
                            ? `${cert.uucMake} / ${cert.uucModel}`
                            : cert.uucMake || cert.uucModel || '-'}
                        </td>
                        <td className="py-2.5 px-4 text-[#64748b]">
                          {formatDate(cert.dateOfCalibration)}
                        </td>
                        <td className="py-2.5 px-4 text-[#64748b]">
                          {cert.createdBy?.name || '-'}
                        </td>
                        <td className="py-2.5 px-4 text-center">
                          <Link href={`/admin/authorization/${cert.id}`}>
                            <button className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12.5px] font-semibold text-white bg-[#4f46e5] hover:bg-[#4338ca] rounded-[9px] transition-colors">
                              <Eye className="size-3.5" />
                              Review
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
