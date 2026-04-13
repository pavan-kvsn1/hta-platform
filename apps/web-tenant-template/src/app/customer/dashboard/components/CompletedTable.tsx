'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Search, Eye, ChevronDown, ChevronRight, AlertCircle, Check } from 'lucide-react'

export interface CompletedCertificate {
  id: string
  certificateNumber: string
  uucDescription: string | null
  uucMake: string | null
  uucModel: string | null
  signedAt: string
  signerName: string
  hasEngineerSig: boolean
  hasReviewerSig: boolean
  hasCustomerSig: boolean
  hasAdminSig: boolean
}

interface CompletedTableProps {
  certificates: CompletedCertificate[]
  isLoading?: boolean
}

export function CompletedTable({ certificates, isLoading }: CompletedTableProps) {
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
                  Signed
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Pending
                </th>
                <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredCertificates.map((cert) => {
                const isExpanded = expandedRows.has(cert.id)

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
                          <div className="text-sm text-gray-500 text-xs">
                            {[cert.uucMake, cert.uucModel].filter(Boolean).join(' ')}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{formatDate(cert.signedAt)}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700 text-xs">
                          Admin Signature
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-xs">
                        <Link
                          href={`/customer/review/cert/${cert.id}`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Button size="sm" variant="outline" className="text-xs">
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
                            <div>
                              <span className="text-sm font-medium text-gray-700">
                                Signature Progress:
                              </span>
                              <div className="mt-2 flex items-center gap-2">
                                <SignatureStep
                                  label="Engineer"
                                  completed={cert.hasEngineerSig}
                                />
                                <div className="w-8 h-0.5 bg-gray-200" />
                                <SignatureStep label="Reviewer" completed={cert.hasReviewerSig} />
                                <div className="w-8 h-0.5 bg-gray-200" />
                                <SignatureStep label="Customer" completed={cert.hasCustomerSig} />
                                <div className="w-8 h-0.5 bg-gray-200" />
                                <SignatureStep
                                  label="Admin"
                                  completed={cert.hasAdminSig}
                                  pending
                                />
                              </div>
                            </div>
                            <div className="text-sm text-gray-500">
                              <span className="text-gray-400">Signed by:</span> {cert.signerName}
                              {' | '}
                              <span className="text-gray-400">Date:</span> {formatDate(cert.signedAt)}
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
            <p className="text-gray-500">No certificates awaiting Admin authorization.</p>
          </div>
        )}
      </div>
    </div>
  )
}

function SignatureStep({
  label,
  completed,
  pending,
}: {
  label: string
  completed: boolean
  pending?: boolean
}) {
  return (
    <div className="flex flex-col items-center">
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center ${
          completed
            ? 'bg-green-100 text-green-600'
            : pending
            ? 'bg-blue-100 text-blue-600 animate-pulse'
            : 'bg-gray-100 text-gray-400'
        }`}
      >
        {completed ? (
          <Check className="h-4 w-4" />
        ) : (
          <span className="text-xs font-medium">{label.charAt(0)}</span>
        )}
      </div>
      <span className="text-xs text-gray-500 mt-1">{label}</span>
    </div>
  )
}
