'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Search, Eye, Download, MessageCircle, Clock, CheckCircle, AlertCircle } from 'lucide-react'

export interface CustomerCertificateItem {
  id: string
  certificateNumber: string
  status: 'pending_approval' | 'awaiting_response' | 'approved'
  uucDescription: string | null
  dateOfCalibration: string | null
  calibrationDueDate: string | null
  // For pending approval
  sentAt: string | null
  tokenId: string | null
  hasToken: boolean
  // For awaiting response
  adminResponse: string | null
  adminName: string | null
  respondedAt: string | null
  // For approved
  approvedAt: string | null
}

interface CustomerCertificateTableProps {
  certificates: CustomerCertificateItem[]
}

const statusFilters = [
  { value: 'all', label: 'All Certificates' },
  { value: 'pending_approval', label: 'Pending Approval' },
  { value: 'awaiting_response', label: 'Awaiting Response' },
  { value: 'approved', label: 'Approved' },
]

const statusConfig = {
  pending_approval: {
    label: 'Pending Approval',
    bgColor: 'bg-orange-100',
    textColor: 'text-orange-700',
    icon: Clock,
  },
  awaiting_response: {
    label: 'Awaiting Response',
    bgColor: 'bg-purple-100',
    textColor: 'text-purple-700',
    icon: MessageCircle,
  },
  approved: {
    label: 'Approved',
    bgColor: 'bg-green-100',
    textColor: 'text-green-700',
    icon: CheckCircle,
  },
}

export function CustomerCertificateTable({ certificates }: CustomerCertificateTableProps) {
  const [statusFilter, setStatusFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')

  const filteredCertificates = certificates.filter((cert) => {
    const matchesStatus = statusFilter === 'all' || cert.status === statusFilter
    const matchesSearch =
      searchQuery === '' ||
      cert.certificateNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (cert.uucDescription?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false)

    return matchesStatus && matchesSearch
  })

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  }

  const getReviewLink = (cert: CustomerCertificateItem) => {
    if (cert.hasToken && cert.tokenId) {
      return `/customer/review/${cert.tokenId}`
    }
    return `/customer/review/cert/${cert.id}`
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search by certificate no. or instrument..."
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

      {/* Results count */}
      <p className="text-sm text-gray-500">
        Showing {filteredCertificates.length} of {certificates.length} certificates
      </p>

      {/* Table */}
      <div className="bg-white rounded-lg border overflow-hidden">
        {filteredCertificates.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <th className="px-4 py-3">Certificate No.</th>
                  <th className="px-4 py-3">Instrument</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredCertificates.map((cert) => {
                  const config = statusConfig[cert.status]
                  const StatusIcon = config.icon

                  return (
                    <tr key={cert.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <span className="font-medium text-gray-900">{cert.certificateNumber}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {cert.uucDescription || '-'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${config.bgColor} ${config.textColor}`}>
                          <StatusIcon className="h-3 w-3" />
                          {config.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-sm">
                        {cert.status === 'pending_approval' && (
                          <>
                            <span className="text-gray-400">Received:</span>{' '}
                            {formatDate(cert.sentAt)}
                          </>
                        )}
                        {cert.status === 'awaiting_response' && (
                          <>
                            <span className="text-gray-400">Admin replied:</span>{' '}
                            {formatDate(cert.respondedAt)}
                          </>
                        )}
                        {cert.status === 'approved' && (
                          <>
                            <span className="text-gray-400">Approved:</span>{' '}
                            {formatDate(cert.approvedAt)}
                          </>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {cert.status === 'pending_approval' && (
                          <Link href={getReviewLink(cert)}>
                            <Button size="sm" className="bg-green-600 hover:bg-green-700">
                              <Eye className="h-4 w-4 mr-1" />
                              Review
                            </Button>
                          </Link>
                        )}
                        {cert.status === 'awaiting_response' && (
                          <Link href={`/customer/review/cert/${cert.id}`}>
                            <Button size="sm" className="bg-purple-600 hover:bg-purple-700">
                              <MessageCircle className="h-4 w-4 mr-1" />
                              Reply
                            </Button>
                          </Link>
                        )}
                        {cert.status === 'approved' && (
                          <a href={`/api/certificates/${cert.id}/download-signed`} download>
                            <Button variant="outline" size="sm">
                              <Download className="h-4 w-4 mr-1" />
                              PDF
                            </Button>
                          </a>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center">
            <AlertCircle className="h-8 w-8 text-gray-300 mx-auto mb-2" />
            <p className="text-gray-500">No certificates found matching your filters.</p>
          </div>
        )}
      </div>
    </div>
  )
}
