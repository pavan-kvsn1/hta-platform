'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Search, Eye, ChevronDown, ChevronRight, AlertCircle } from 'lucide-react'

export interface AwaitingCertificate {
  id: string
  certificateNumber: string
  uucDescription: string | null
  uucMake: string | null
  uucModel: string | null
  updatedAt: string
  internalStatus: 'PENDING_REVIEW' | 'CUSTOMER_REVISION_REQUIRED' | 'REVISION_REQUIRED'
  customerFeedback: string | null
  feedbackDate: string | null
  adminResponse: string | null
  adminName: string | null
  respondedAt: string | null
}

interface AwaitingResponseTableProps {
  certificates: AwaitingCertificate[]
  isLoading?: boolean
}

const statusDisplayMap: Record<string, { text: string; color: string }> = {
  PENDING_REVIEW: { text: 'Internal Review', color: 'bg-blue-100 text-blue-700' },
  CUSTOMER_REVISION_REQUIRED: { text: 'Addressing Feedback', color: 'bg-purple-100 text-purple-700' },
  REVISION_REQUIRED: { text: 'Being Corrected', color: 'bg-amber-100 text-amber-700' },
}

export function AwaitingResponseTable({ certificates, isLoading }: AwaitingResponseTableProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

  const filteredCertificates = certificates.filter((cert) => {
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    return (
      cert.certificateNumber.toLowerCase().includes(query) ||
      cert.uucDescription?.toLowerCase().includes(query) ||
      cert.uucMake?.toLowerCase().includes(query)
    )
  })

  const toggleRow = (id: string) => {
    const newExpanded = new Set(expandedRows)
    if (newExpanded.has(id)) {
      newExpanded.delete(id)
    } else {
      newExpanded.add(id)
    }
    setExpandedRows(newExpanded)
  }

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
      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          placeholder="Search certificates..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
        {filteredCertificates.length > 0 ? (
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="w-8"></th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Certificate No.
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Instrument
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Last Updated
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredCertificates.map((cert) => {
                const isExpanded = expandedRows.has(cert.id)
                const statusDisplay = statusDisplayMap[cert.internalStatus] || {
                  text: 'Processing',
                  color: 'bg-gray-100 text-gray-700',
                }

                return (
                  <React.Fragment key={cert.id}>
                    <tr
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => toggleRow(cert.id)}
                    >
                      <td className="px-2">
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-gray-400" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-gray-400" />
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-medium text-gray-900 text-xs">{cert.certificateNumber}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-gray-900 text-xs">{cert.uucDescription || '-'}</div>
                        {(cert.uucMake || cert.uucModel) && (
                          <div className="text-xs text-gray-500">
                            {[cert.uucMake, cert.uucModel].filter(Boolean).join(' ')}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{formatDate(cert.updatedAt)}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${statusDisplay.color}`}
                        >
                          {statusDisplay.text}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Link
                          href={`/customer/review/cert/${cert.id}`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Button size="sm" variant="outline" className='text-xs'>
                            <Eye className="h-4 w-4 mr-1" />
                            View
                          </Button>
                        </Link>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-gray-50">
                        <td colSpan={6} className="px-4 py-4">
                          <div className="pl-6 space-y-3">
                            {cert.customerFeedback && (
                              <div>
                                <span className="text-sm font-medium text-gray-700">
                                  Your Request ({formatDate(cert.feedbackDate)}):
                                </span>
                                <p className="mt-1 text-sm text-gray-600 bg-purple-50 border border-purple-100 rounded p-2">
                                  {cert.customerFeedback}
                                </p>
                              </div>
                            )}
                            {cert.adminResponse ? (
                              <div>
                                <span className="text-sm font-medium text-gray-700">
                                  Admin Response ({cert.adminName}, {formatDate(cert.respondedAt)}):
                                </span>
                                <p className="mt-1 text-sm text-gray-600 bg-orange-50 border border-orange-100 rounded p-2">
                                  {cert.adminResponse}
                                </p>
                              </div>
                            ) : (
                              <p className="text-sm text-gray-500 italic">
                                Admin is reviewing your request...
                              </p>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        ) : (
          <div className="p-8 text-center">
            <AlertCircle className="h-8 w-8 text-gray-300 mx-auto mb-2" />
            <p className="text-gray-500">No certificates awaiting response.</p>
          </div>
        )}
      </div>
    </div>
  )
}
