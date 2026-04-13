'use client'

import { useState } from 'react'
import Link from 'next/link'
import { StatusBadge } from '@/components/dashboard/StatusBadge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { FileText, Search, MessageSquare, Eye } from 'lucide-react'
import type { ReviewCertificateItem } from './page'

interface ReviewerCertificateTableProps {
  certificates: ReviewCertificateItem[]
}

const statusFilters = [
  { value: 'all', label: 'All Status' },
  { value: 'PENDING_REVIEW', label: 'Pending Review' },
  { value: 'REVISION_REQUIRED', label: 'Revision Requested' },
  { value: 'PENDING_CUSTOMER_APPROVAL', label: 'Sent to Customer' },
  { value: 'APPROVED', label: 'Approved' },
]

export function ReviewerCertificateTable({ certificates }: ReviewerCertificateTableProps) {
  const [statusFilter, setStatusFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')

  const filteredCertificates = certificates.filter((cert) => {
    const matchesStatus = statusFilter === 'all' || cert.status === statusFilter
    const matchesSearch =
      searchQuery === '' ||
      cert.certificateNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      cert.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      cert.uucDescription.toLowerCase().includes(searchQuery.toLowerCase()) ||
      cert.assigneeName.toLowerCase().includes(searchQuery.toLowerCase())

    return matchesStatus && matchesSearch
  })

  const formatDateTime = (dateStr: string | null) => {
    if (!dateStr) return '-'
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search by certificate no., customer, instrument, or engineer..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[200px]">
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
      </div>

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
                  Assignee
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Customer
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Instrument
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Submitted
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredCertificates.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
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
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div>
                        <span className="text-gray-900 text-[13px] font-medium">
                          {cert.assigneeName}
                        </span>
                        <p className="text-gray-500 text-[11px]">{cert.assigneeEmail}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[13px]">
                      <span className="text-gray-700">{cert.customerName}</span>
                    </td>
                    <td className="px-4 py-3 text-[13px]">
                      <span className="text-gray-700 line-clamp-1">{cert.uucDescription}</span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-[13px]">
                      <span className="text-gray-600">{formatDateTime(cert.submittedAt)}</span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-[13px]">
                      <StatusBadge status={cert.status} />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right">
                      <div className="flex justify-end gap-2">
                        {cert.status === 'PENDING_REVIEW' ? (
                          <Link href={`/dashboard/reviewer/${cert.id}`}>
                            <Button variant="default" size="sm" title="Review Certificate">
                              <FileText className="h-4 w-4 mr-1" />
                              Review
                            </Button>
                          </Link>
                        ) : cert.status === 'REVISION_REQUIRED' || cert.status === 'CUSTOMER_REVISION_REQUIRED' ? (
                          <Link href={`/dashboard/reviewer/${cert.id}`}>
                            <Button variant="outline" size="sm" title="View / Chat">
                              <MessageSquare className="h-4 w-4 mr-1" />
                              Chat
                            </Button>
                          </Link>
                        ) : (
                          <Link href={`/dashboard/reviewer/${cert.id}`}>
                            <Button variant="ghost" size="sm" title="View">
                              <Eye className="h-4 w-4" />
                            </Button>
                          </Link>
                        )}
                      </div>
                    </td>
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
