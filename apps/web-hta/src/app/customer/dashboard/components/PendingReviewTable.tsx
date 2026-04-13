'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Search, Eye, ChevronDown, ChevronRight, AlertCircle } from 'lucide-react'

export interface PendingCertificate {
  id: string
  certificateNumber: string
  uucDescription: string | null
  uucMake: string | null
  uucModel: string | null
  sentAt: string
  expiresAt: string | null
  tokenId: string | null
  hasToken: boolean
  adminMessage: string | null
  srfNumber: string | null
  dateOfCalibration: string | null
}

interface PendingReviewTableProps {
  certificates: PendingCertificate[]
  isLoading?: boolean
}

export function PendingReviewTable({ certificates, isLoading }: PendingReviewTableProps) {
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

  const getDaysUntilExpiry = (expiresAt: string | null) => {
    if (!expiresAt) return null
    const expires = new Date(expiresAt)
    const now = new Date()
    const days = Math.ceil((expires.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    return days
  }

  const getReviewLink = (cert: PendingCertificate) => {
    // Always use the cert route for logged-in users
    // Token route is only for unauthenticated email link access
    return `/customer/review/cert/${cert.id}`
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
                  Received
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Expires In
                </th>
                <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredCertificates.map((cert) => {
                const isExpanded = expandedRows.has(cert.id)
                const daysLeft = getDaysUntilExpiry(cert.expiresAt)

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
                          <div className="text-xs text-gray-500 text-xs">
                            {[cert.uucMake, cert.uucModel].filter(Boolean).join(' ')}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{formatDate(cert.sentAt)}</td>
                      <td className="px-4 py-3">
                        {daysLeft !== null && (
                          <span
                            className={`text-sm font-medium ${
                              daysLeft <= 2
                                ? 'text-red-600'
                                : daysLeft <= 5
                                ? 'text-amber-600'
                                : 'text-gray-600'
                            } text-xs`}
                          >
                            {daysLeft} day{daysLeft !== 1 ? 's' : ''}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Link href={getReviewLink(cert)} onClick={(e) => e.stopPropagation()}>
                          <Button size="sm" className="bg-green-600 hover:bg-green-700 text-xs">
                            <Eye className="h-4 w-4 mr-1" />
                            Review
                          </Button>
                        </Link>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-gray-50">
                        <td colSpan={6} className="px-4 py-4">
                          <div className="pl-6 space-y-2">
                            {cert.adminMessage && (
                              <div>
                                <span className="text-sm font-medium text-gray-700">
                                  Message from Admin:
                                </span>
                                <p className="mt-1 text-sm text-gray-600 bg-blue-50 border border-blue-100 rounded p-2">
                                  {cert.adminMessage}
                                </p>
                              </div>
                            )}
                            <div className="flex flex-wrap gap-4 text-sm text-gray-500">
                              {cert.srfNumber && (
                                <span>
                                  <span className="text-gray-400">SRF:</span> {cert.srfNumber}
                                </span>
                              )}
                              {cert.dateOfCalibration && (
                                <span>
                                  <span className="text-gray-400">Calibrated:</span>{' '}
                                  {formatDate(cert.dateOfCalibration)}
                                </span>
                              )}
                            </div>
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
            <p className="text-gray-500">No certificates pending your review.</p>
          </div>
        )}
      </div>
    </div>
  )
}
