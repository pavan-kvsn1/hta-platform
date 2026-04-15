'use client'

import { useState } from 'react'
import Link from 'next/link'
import { StatusBadge } from './StatusBadge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Edit, FileText as _FileText, Search, Filter, X, Eye, Send as _Send, Download } from 'lucide-react'

export interface CertificateListItem {
  id: string
  certificateNumber: string
  status: string
  customerName: string
  uucDescription: string
  dateOfCalibration: string
  currentVersion: number
  createdAt: string
  createdBy?: string // Engineer name (for Admin view)
  reviewerName?: string // Reviewer name (for new workflow)
}

interface CertificateTableProps {
  certificates: CertificateListItem[]
  userRole: 'ENGINEER' | 'ADMIN'
  showActions?: boolean
}

const statusFilters = [
  { value: 'all', label: 'All Status' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'PENDING_REVIEW', label: 'Pending Review' },
  { value: 'REVISION_REQUIRED', label: 'Revision Required' },
  { value: 'PENDING_CUSTOMER_APPROVAL', label: 'Pending Customer' },
  { value: 'CUSTOMER_REVISION_REQUIRED', label: 'Customer Revision' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
]

export function CertificateTable({
  certificates,
  userRole,
  showActions = true,
}: CertificateTableProps) {
  const [statusFilter, setStatusFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [showDateFilter, setShowDateFilter] = useState(false)

  const hasDateFilter = dateFrom || dateTo

  const filteredCertificates = certificates.filter((cert) => {
    const matchesStatus =
      statusFilter === 'all' || cert.status === statusFilter
    const matchesSearch =
      searchQuery === '' ||
      cert.certificateNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      cert.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      cert.uucDescription.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (cert.createdBy && cert.createdBy.toLowerCase().includes(searchQuery.toLowerCase()))

    // Date filter
    let matchesDate = true
    if (dateFrom || dateTo) {
      const certDate = cert.dateOfCalibration ? new Date(cert.dateOfCalibration) : null
      if (certDate) {
        if (dateFrom) {
          const fromDate = new Date(dateFrom)
          matchesDate = matchesDate && certDate >= fromDate
        }
        if (dateTo) {
          const toDate = new Date(dateTo)
          toDate.setHours(23, 59, 59, 999) // Include the entire day
          matchesDate = matchesDate && certDate <= toDate
        }
      } else {
        matchesDate = false // No date, exclude if filtering by date
      }
    }

    return matchesStatus && matchesSearch && matchesDate
  })

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  }

  const clearDateFilters = () => {
    setDateFrom('')
    setDateTo('')
    setShowDateFilter(false)
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search by certificate no., customer, or instrument..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[180px]" aria-label="Filter by status">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            {statusFilters.map((filter) => (
              <SelectItem key={filter.value} value={filter.value}>
                {filter.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Date Filter Toggle Button */}
        <Button
          variant={hasDateFilter ? "default" : "outline"}
          size="default"
          onClick={() => setShowDateFilter(!showDateFilter)}
          className={hasDateFilter ? "bg-blue-600 hover:bg-blue-700" : ""}
        >
          <Filter className="h-4 w-4 mr-2" />
          Date Filter
          {hasDateFilter && (
            <span className="ml-2 bg-white/20 text-xs px-1.5 py-0.5 rounded">1</span>
          )}
        </Button>
      </div>

      {/* Collapsible Date Filter Panel */}
      {showDateFilter && (
        <div className="bg-gray-50 border rounded-lg p-4 flex flex-wrap items-center gap-4">
          <span className="text-sm font-medium text-gray-700">Calibration Date:</span>
          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-[160px] bg-white"
            />
            <span className="text-gray-500">to</span>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-[160px] bg-white"
            />
          </div>
          {hasDateFilter && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearDateFilters}
              className="text-gray-500 hover:text-red-600"
            >
              <X className="h-4 w-4 mr-1" />
              Clear
            </Button>
          )}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-lg border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Certificate No.
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Customer
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Instrument
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Cal. Date
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Revision
                </th>
                {showActions && (
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredCertificates.length === 0 ? (
                <tr>
                  <td
                    colSpan={showActions ? 7 : 6}
                    className="px-4 py-8 text-center text-gray-500"
                  >
                    No certificates found
                  </td>
                </tr>
              ) : (
                filteredCertificates.map((cert) => (
                  <tr key={cert.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="font-medium text-gray-900 text-[13px]">
                        {cert.certificateNumber}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[13px]">
                      <span className="text-gray-700 text-[13px]">{cert.customerName}</span>
                    </td>
                    <td className="px-4 py-3 text-[13px]">
                      <span className="text-gray-700 line-clamp-1">
                        {cert.uucDescription}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-[13px]">
                      <span className="text-gray-600">
                        {cert.dateOfCalibration ? formatDate(cert.dateOfCalibration) : '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-[13px]">
                      <StatusBadge status={cert.status} />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-[13px]">
                      <span className="text-gray-600">v{cert.currentVersion}</span>
                    </td>
                    {showActions && (
                      <td className="px-4 py-3 whitespace-nowrap text-right">
                        <div className="flex justify-end gap-2">
                          {userRole === 'ENGINEER' &&
                            (cert.status === 'DRAFT' ||
                              cert.status === 'REVISION_REQUIRED') && (
                              <Link href={`/dashboard/certificates/${cert.id}/edit`}>
                                <Button variant="ghost" size="sm" title="Edit">
                                  <Edit className="h-4 w-4" />
                                </Button>
                              </Link>
                            )}
                          {userRole === 'ENGINEER' &&
                            cert.status !== 'DRAFT' &&
                            cert.status !== 'REVISION_REQUIRED' && (
                              <Link href={`/dashboard/certificates/${cert.id}/view`}>
                                <Button variant="ghost" size="sm" title="View Certificate">
                                  <Eye className="h-4 w-4" />
                                </Button>
                              </Link>
                            )}
                          {cert.status === 'APPROVED' && (
                            <a href={`/api/certificates/${cert.id}/download-signed`} download>
                              <Button variant="ghost" size="sm" title="Download Signed PDF">
                                <Download className="h-4 w-4" />
                              </Button>
                            </a>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Results count */}
      <div className="text-sm text-gray-500">
        Showing {filteredCertificates.length} of {certificates.length} certificates
      </div>
    </div>
  )
}
