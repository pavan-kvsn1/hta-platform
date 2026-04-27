'use client'

import { apiFetch } from '@/lib/api-client'

import { useState, useEffect, use, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  CheckCircle,
  Clock,
  AlertCircle,
  Wrench,
  FileText,
  ChevronLeft,
  Loader2,
} from 'lucide-react'

interface RangeDataItem {
  parameter?: string
  min?: string
  max?: string
  unit?: string
  uncertainty?: string
  referencedoc?: string
}

interface Instrument {
  id: string
  instrumentId: string
  version: number
  category: string
  description: string
  make: string
  model: string
  assetNumber: string
  serialNumber: string
  usage: string | null
  calibratedAtLocation: string | null
  reportNo: string | null
  calibrationDueDate: string | null
  remarks: string | null
  isActive: boolean
  status: string
  daysUntilExpiry: number
  rangeData: RangeDataItem[]
}

interface CertificateUsage {
  id: string
  certificateNumber: string
  uucDescription: string | null
  uucMake: string | null
  uucModel: string | null
  uucSerialNumber: string | null
  dateOfCalibration: string | null
  calibrationDueDate: string | null
  createdAt: string
  parameter: {
    id: string
    parameterName: string
    parameterUnit: string
  } | null
  sopReference: string
}

const STATUS_CONFIG: Record<string, { label: string; icon: typeof CheckCircle; bg: string; text: string; border: string }> = {
  VALID: { label: 'Valid', icon: CheckCircle, bg: 'bg-[#f0fdf4]', text: 'text-[#16a34a]', border: 'border-[#bbf7d0]' },
  EXPIRING_SOON: { label: 'Expiring', icon: Clock, bg: 'bg-[#fffbeb]', text: 'text-[#d97706]', border: 'border-[#fde68a]' },
  EXPIRED: { label: 'Expired', icon: AlertCircle, bg: 'bg-[#fef2f2]', text: 'text-[#dc2626]', border: 'border-[#fecaca]' },
  UNDER_RECAL: { label: 'Recal', icon: Wrench, bg: 'bg-[#eff6ff]', text: 'text-[#2563eb]', border: 'border-[#bfdbfe]' },
}

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status]
  if (!config) {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.05em] text-[#64748b] bg-[#f8fafc] border border-[#e2e8f0] rounded-full">
        {status}
      </span>
    )
  }
  const Icon = config.icon
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.05em] ${config.text} ${config.bg} border ${config.border} rounded-full`}>
      <Icon className="size-3" />
      {config.label}
    </span>
  )
}

function DetailField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8] mb-1">{label}</p>
      <p className="text-[13px] text-[#0f172a]">{children}</p>
    </div>
  )
}

export default function CustomerInstrumentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [instrument, setInstrument] = useState<Instrument | null>(null)
  const [certificates, setCertificates] = useState<CertificateUsage[]>([])
  const [totalCertificates, setTotalCertificates] = useState(0)

  const fetchInstrument = useCallback(async () => {
    try {
      const response = await apiFetch(`/api/customer/instruments/${id}`)
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Instrument not found')
        }
        throw new Error('Failed to fetch instrument')
      }
      const data = await response.json()
      setInstrument(data.instrument)
      setCertificates(data.certificates)
      setTotalCertificates(data.totalCertificates)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    fetchInstrument()
  }, [id, fetchInstrument])

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  }

  if (loading) {
    return (
      <div className="h-full overflow-auto bg-[#f1f5f9] flex items-center justify-center">
        <Loader2 className="size-6 animate-spin text-[#94a3b8]" />
      </div>
    )
  }

  if (!instrument) {
    return (
      <div className="h-full overflow-auto bg-[#f1f5f9]">
        <div className="px-6 sm:px-9 py-8">
          <div className="flex items-center gap-2.5 mb-6">
            <Link
              href="/customer/instruments"
              className="text-[#94a3b8] hover:text-[#475569] transition-colors"
            >
              <ChevronLeft className="size-[18px]" strokeWidth={2} />
            </Link>
            <span className="text-[#e2e8f0] text-lg">|</span>
            <h1 className="text-[18px] font-bold text-[#0f172a]">Instrument Not Found</h1>
          </div>
          <div className="bg-[#fef2f2] border border-[#fecaca] rounded-[14px] p-4 text-[13px] text-[#dc2626]">
            {error || 'The requested instrument could not be found.'}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto bg-[#f1f5f9]">
      <div className="px-6 sm:px-9 py-8 space-y-6">
        {/* Header */}
        <div>
          <div className="flex items-center gap-2.5 mb-3">
            <Link
              href="/customer/instruments"
              className="text-[#94a3b8] hover:text-[#475569] transition-colors"
            >
              <ChevronLeft className="size-[18px]" strokeWidth={2} />
            </Link>
            <span className="text-[#e2e8f0] text-lg">|</span>
            <h1 className="text-[22px] font-extrabold tracking-tight text-[#0f172a]">
              {instrument.description}
            </h1>
            <StatusBadge status={instrument.status} />
          </div>
          <div className="flex items-center gap-3 text-[12.5px] text-[#64748b] ml-[42px]">
            <span>Asset: <span className="font-medium text-[#0f172a]">{instrument.assetNumber}</span></span>
            <span className="text-[#e2e8f0]">|</span>
            <span>Category: <span className="font-medium text-[#0f172a]">{instrument.category}</span></span>
            <span className="text-[#e2e8f0]">|</span>
            <span className="inline-flex items-center px-2 py-0.5 text-[11px] font-medium text-[#475569] bg-[#f1f5f9] rounded-[5px]">
              Used in {totalCertificates} cert{totalCertificates !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {/* Instrument Details */}
        <div className="bg-white border border-[#e2e8f0] rounded-[14px] overflow-hidden">
          {/* Basic Information */}
          <div className="px-6 py-5 border-b border-[#f1f5f9]">
            <h3 className="text-[12px] font-bold uppercase tracking-[0.07em] text-[#94a3b8] mb-4">
              Basic Information
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <DetailField label="Category">{instrument.category}</DetailField>
              <DetailField label="Asset Number">{instrument.assetNumber}</DetailField>
              <DetailField label="Description">{instrument.description}</DetailField>
            </div>
          </div>

          {/* Equipment Details */}
          <div className="px-6 py-5 border-b border-[#f1f5f9]">
            <h3 className="text-[12px] font-bold uppercase tracking-[0.07em] text-[#94a3b8] mb-4">
              Equipment Details
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <DetailField label="Make">{instrument.make || '-'}</DetailField>
              <DetailField label="Model">{instrument.model || '-'}</DetailField>
              <DetailField label="Serial Number">{instrument.serialNumber || '-'}</DetailField>
            </div>
          </div>

          {/* Calibration Information */}
          <div className="px-6 py-5 border-b border-[#f1f5f9]">
            <h3 className="text-[12px] font-bold uppercase tracking-[0.07em] text-[#94a3b8] mb-4">
              Calibration Information
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
              <DetailField label="Calibrated At">{instrument.calibratedAtLocation || '-'}</DetailField>
              <DetailField label="Report Number">{instrument.reportNo || '-'}</DetailField>
              <DetailField label="Due Date">{formatDate(instrument.calibrationDueDate)}</DetailField>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8] mb-1">Status</p>
                <StatusBadge status={instrument.status} />
              </div>
            </div>
          </div>

          {/* Range Data */}
          {instrument.rangeData && instrument.rangeData.length > 0 && (
            <div className="px-6 py-5">
              <h3 className="text-[12px] font-bold uppercase tracking-[0.07em] text-[#94a3b8] mb-4">
                Range Data
              </h3>
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead>
                    <tr className="border-b border-[#f1f5f9]">
                      <th className="px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Parameter</th>
                      <th className="px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Min</th>
                      <th className="px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Max</th>
                      <th className="px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Unit</th>
                      <th className="px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Uncertainty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {instrument.rangeData.map((range, idx) => (
                      <tr key={idx} className="border-b border-[#f1f5f9] last:border-0">
                        <td className="px-4 py-2.5 text-[13px] text-[#0f172a]">{range.parameter || '-'}</td>
                        <td className="px-4 py-2.5 text-[13px] text-[#64748b]">{range.min || '-'}</td>
                        <td className="px-4 py-2.5 text-[13px] text-[#64748b]">{range.max || '-'}</td>
                        <td className="px-4 py-2.5 text-[13px] text-[#64748b]">{range.unit || '-'}</td>
                        <td className="px-4 py-2.5 text-[13px] text-[#64748b]">{range.uncertainty || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Certificates Using This Instrument */}
        <div className="bg-white border border-[#e2e8f0] rounded-[14px] overflow-hidden">
          <div className="px-6 py-4 border-b border-[#f1f5f9] flex items-center gap-2.5">
            <FileText className="size-4 text-[#94a3b8]" />
            <span className="text-[12px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">
              Your Certificates Using This Instrument
            </span>
          </div>

          {certificates.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-[13px] text-[#94a3b8]">No certificates found using this instrument.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-b border-[#f1f5f9] hover:bg-transparent">
                  <TableHead className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8] h-10">Certificate No.</TableHead>
                  <TableHead className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8] h-10">UUC Description</TableHead>
                  <TableHead className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8] h-10">Parameter</TableHead>
                  <TableHead className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8] h-10">Date of Calibration</TableHead>
                  <TableHead className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8] h-10">Due Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {certificates.map((cert) => (
                  <TableRow
                    key={`${cert.id}-${cert.parameter?.id || 'no-param'}`}
                    className="cursor-pointer hover:bg-[#f8fafc] border-b border-[#f1f5f9] last:border-0"
                    onClick={() => router.push(`/customer/certificates/${cert.id}`)}
                  >
                    <TableCell className="text-[13px] font-medium text-[#0f172a]">
                      {cert.certificateNumber}
                    </TableCell>
                    <TableCell className="text-[13px] text-[#64748b] max-w-[200px] truncate">
                      {cert.uucDescription || '-'}
                    </TableCell>
                    <TableCell className="text-[13px] text-[#64748b]">
                      {cert.parameter
                        ? `${cert.parameter.parameterName} (${cert.parameter.parameterUnit})`
                        : '-'}
                    </TableCell>
                    <TableCell className="text-[13px] text-[#64748b]">
                      {formatDate(cert.dateOfCalibration)}
                    </TableCell>
                    <TableCell className="text-[13px] text-[#64748b]">
                      {formatDate(cert.calibrationDueDate)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
    </div>
  )
}
