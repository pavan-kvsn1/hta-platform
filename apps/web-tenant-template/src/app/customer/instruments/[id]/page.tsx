'use client'

import { useState, useEffect, use } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
  ArrowLeft,
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

function getStatusBadge(status: string) {
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

  useEffect(() => {
    fetchInstrument()
  }, [id])

  const fetchInstrument = async () => {
    try {
      const response = await fetch(`/api/customer/instruments/${id}`)
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
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleDateString()
  }

  if (loading) {
    return (
      <div className="p-3 h-full">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden h-full">
          <div className="p-6 flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-600"></div>
          </div>
        </div>
      </div>
    )
  }

  if (!instrument) {
    return (
      <div className="p-3 h-full">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden h-full">
          <div className="p-6 space-y-6">
            <div className="flex items-center gap-4">
              <Link
                href="/customer/instruments"
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </Link>
              <h1 className="text-2xl font-bold text-slate-900">Instrument Not Found</h1>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
              {error || 'The requested instrument could not be found.'}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-3 h-full">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden h-full">
        <div className="p-6 overflow-auto h-full space-y-8">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link
                href="/customer/instruments"
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </Link>
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-bold text-slate-900">
                    {instrument.description}
                  </h1>
                  {getStatusBadge(instrument.status)}
                </div>
                <p className="text-sm text-slate-600 mt-1">
                  Asset: {instrument.assetNumber} | Category: {instrument.category}
                </p>
              </div>
            </div>
            <Badge variant="secondary" className="text-base px-3 py-1">
              Used in {totalCertificates} of your certificate
              {totalCertificates !== 1 ? 's' : ''}
            </Badge>
          </div>

          {/* Instrument Details */}
          <Card>
            <CardHeader>
              <CardTitle>Instrument Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Basic Information */}
              <div>
                <h3 className="text-sm font-semibold text-slate-700 mb-3">
                  Basic Information
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-slate-500">Category</p>
                    <p className="text-sm text-slate-900">{instrument.category}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Asset Number</p>
                    <p className="text-sm text-slate-900 font-mono">
                      {instrument.assetNumber}
                    </p>
                  </div>
                  <div className="md:col-span-2">
                    <p className="text-xs text-slate-500">Description</p>
                    <p className="text-sm text-slate-900">{instrument.description}</p>
                  </div>
                </div>
              </div>

              {/* Equipment Details */}
              <div>
                <h3 className="text-sm font-semibold text-slate-700 mb-3">
                  Equipment Details
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs text-slate-500">Make</p>
                    <p className="text-sm text-slate-900">{instrument.make || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Model</p>
                    <p className="text-sm text-slate-900">{instrument.model || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Serial Number</p>
                    <p className="text-sm text-slate-900">
                      {instrument.serialNumber || '-'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Calibration Information */}
              <div>
                <h3 className="text-sm font-semibold text-slate-700 mb-3">
                  Calibration Information
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-slate-500">Calibrated At</p>
                    <p className="text-sm text-slate-900">
                      {instrument.calibratedAtLocation || '-'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Report Number</p>
                    <p className="text-sm text-slate-900">{instrument.reportNo || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Calibration Due Date</p>
                    <p className="text-sm text-slate-900">
                      {formatDate(instrument.calibrationDueDate)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Status</p>
                    <div className="mt-1">{getStatusBadge(instrument.status)}</div>
                  </div>
                </div>
              </div>

              {/* Range Data */}
              {instrument.rangeData && instrument.rangeData.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-slate-700 mb-3">Range Data</h3>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-200">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">
                            Parameter
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">
                            Min
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">
                            Max
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">
                            Unit
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">
                            Uncertainty
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-slate-200">
                        {instrument.rangeData.map((range, idx) => (
                          <tr key={idx}>
                            <td className="px-4 py-2 text-sm text-slate-900">
                              {range.parameter || '-'}
                            </td>
                            <td className="px-4 py-2 text-sm text-slate-900">
                              {range.min || '-'}
                            </td>
                            <td className="px-4 py-2 text-sm text-slate-900">
                              {range.max || '-'}
                            </td>
                            <td className="px-4 py-2 text-sm text-slate-900">
                              {range.unit || '-'}
                            </td>
                            <td className="px-4 py-2 text-sm text-slate-900">
                              {range.uncertainty || '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Certificates Using This Instrument */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-slate-400" />
                Your Certificates Using This Instrument
              </CardTitle>
            </CardHeader>
            <CardContent>
              {certificates.length === 0 ? (
                <p className="text-slate-500 text-sm py-4 text-center">
                  No certificates found using this instrument.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Certificate No.</TableHead>
                      <TableHead>UUC Description</TableHead>
                      <TableHead>Parameter</TableHead>
                      <TableHead>Date of Calibration</TableHead>
                      <TableHead>Due Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {certificates.map((cert) => (
                      <TableRow
                        key={`${cert.id}-${cert.parameter?.id || 'no-param'}`}
                        className="cursor-pointer hover:bg-slate-50"
                        onClick={() => router.push(`/customer/certificates/${cert.id}`)}
                      >
                        <TableCell className="font-mono text-sm">
                          {cert.certificateNumber}
                        </TableCell>
                        <TableCell className="text-sm max-w-[200px] truncate">
                          {cert.uucDescription || '-'}
                        </TableCell>
                        <TableCell className="text-sm">
                          {cert.parameter
                            ? `${cert.parameter.parameterName} (${cert.parameter.parameterUnit})`
                            : '-'}
                        </TableCell>
                        <TableCell className="text-sm">
                          {formatDate(cert.dateOfCalibration)}
                        </TableCell>
                        <TableCell className="text-sm">
                          {formatDate(cert.calibrationDueDate)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
