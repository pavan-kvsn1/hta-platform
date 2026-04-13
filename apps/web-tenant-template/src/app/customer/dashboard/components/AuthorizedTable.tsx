'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Search, Eye, AlertCircle } from 'lucide-react'
import Link from 'next/link'

export interface AuthorizedCertificate {
  id: string
  certificateNumber: string
  uucDescription: string | null
  uucMake: string | null
  uucModel: string | null
  dateOfCalibration: string | null
  calibrationDueDate: string | null
  signedPdfPath: string | null
}

interface AuthorizedTableProps {
  certificates: AuthorizedCertificate[]
  isLoading?: boolean
}

export function AuthorizedTable({ certificates, isLoading }: AuthorizedTableProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [yearFilter, setYearFilter] = useState<string>('all')

  // Get unique years from certificates
  const years = Array.from(
    new Set(
      certificates
        .map((cert) => {
          if (!cert.dateOfCalibration) return null
          return new Date(cert.dateOfCalibration).getFullYear().toString()
        })
        .filter(Boolean)
    )
  ).sort((a, b) => Number(b) - Number(a))

  const filteredCertificates = certificates.filter((cert) => {
    // Search filter
    const matchesSearch =
      !searchQuery ||
      cert.certificateNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      cert.uucDescription?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      cert.uucMake?.toLowerCase().includes(searchQuery.toLowerCase())

    // Year filter
    const matchesYear =
      yearFilter === 'all' ||
      (cert.dateOfCalibration &&
        new Date(cert.dateOfCalibration).getFullYear().toString() === yearFilter)

    return matchesSearch && matchesYear
  })

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  }

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg border p-8 text-center">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-48 mx-auto mb-4"></div>
          <div className="h-4 bg-gray-200 rounded w-32 mx-auto"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search certificates..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={yearFilter} onValueChange={setYearFilter}>
          <SelectTrigger className="w-full sm:w-[150px]">
            <SelectValue placeholder="Filter by year" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Years</SelectItem>
            {years.map((year) => (
              <SelectItem key={year} value={year!}>
                {year}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Results count */}
      <p className="text-sm text-gray-500">
        Showing {filteredCertificates.length} of {certificates.length} certificates
      </p>

      {/* Table */}
      <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
        {filteredCertificates.length > 0 ? (
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Certificate No.
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Instrument
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Calibration Date
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Due Date
                </th>
                <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredCertificates.map((cert) => (
                <tr key={cert.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <span className="font-medium text-gray-900 text-xs">{cert.certificateNumber}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-gray-900 text-xs">{cert.uucDescription || '-'}</div>
                    {(cert.uucMake || cert.uucModel) && (
                      <div className="text-sm text-gray-500 text-xs">
                        {[cert.uucMake, cert.uucModel].filter(Boolean).join(' ')}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{formatDate(cert.dateOfCalibration)}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{formatDate(cert.calibrationDueDate)}</td>
                  <td className="px-4 py-3 text-center">
                    <Link href={`/customer/review/cert/${cert.id}`}>
                      <Button size="sm" variant="outline" className="text-xs">
                        <Eye className="h-4 w-4 mr-1" />
                        View
                      </Button>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-8 text-center">
            <AlertCircle className="h-8 w-8 text-gray-300 mx-auto mb-2" />
            <p className="text-gray-500">No authorized certificates found.</p>
          </div>
        )}
      </div>
    </div>
  )
}
