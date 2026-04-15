'use client'

import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Search, Download, ChevronDown, ChevronRight, AlertCircle as _AlertCircle, Microscope } from 'lucide-react'

export interface MasterInstrumentItem {
  id: string
  description: string
  serialNumber: string | null
  category: string | null
  make: string | null
  model: string | null
  reportNo: string | null
  calibrationDueDate: string | null
  calibratedAt: string | null
  certificatesUsedIn: {
    id: string
    certificateNumber: string
    uucDescription: string | null
    dateOfCalibration: string | null
  }[]
}

interface TraceabilityTableProps {
  instruments: MasterInstrumentItem[]
  isLoading?: boolean
}

export function TraceabilityTable({ instruments, isLoading }: TraceabilityTableProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

  const filteredInstruments = instruments.filter((inst) => {
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    return (
      inst.description.toLowerCase().includes(query) ||
      inst.serialNumber?.toLowerCase().includes(query) ||
      inst.reportNo?.toLowerCase().includes(query) ||
      inst.category?.toLowerCase().includes(query)
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

  const getValidityStatus = (dueDate: string | null) => {
    if (!dueDate) return { text: 'Unknown', color: 'bg-gray-100 text-gray-600' }

    const due = new Date(dueDate)
    const today = new Date()
    const daysUntil = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

    if (daysUntil < 0) return { text: 'Expired', color: 'bg-red-100 text-red-700' }
    if (daysUntil <= 30) return { text: 'Expiring', color: 'bg-amber-100 text-amber-700' }
    return { text: 'Valid', color: 'bg-green-100 text-green-700' }
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
          placeholder="Search instruments..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
        {filteredInstruments.length > 0 ? (
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="w-8"></th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Master Instrument
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Category
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Certificate No.
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Valid Until
                </th>
                <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredInstruments.map((inst) => {
                const isExpanded = expandedRows.has(inst.id)
                const validity = getValidityStatus(inst.calibrationDueDate)

                return (
                  <React.Fragment key={inst.id}>
                    <tr
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => toggleRow(inst.id)}
                    >
                      <td className="px-2">
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-gray-400" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-gray-400" />
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{inst.description}</div>
                        {inst.serialNumber && (
                          <div className="text-sm text-gray-500">S/N: {inst.serialNumber}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{inst.category || '-'}</td>
                      <td className="px-4 py-3 text-gray-600">{inst.reportNo || '-'}</td>
                      <td className="px-4 py-3">
                        <div className="text-gray-600">{formatDate(inst.calibrationDueDate)}</div>
                        <span
                          className={`inline-flex mt-1 px-2 py-0.5 rounded-full text-xs font-medium ${validity.color}`}
                        >
                          {validity.text}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation()
                            // TODO: Implement PDF download for master instrument certificates
                            window.open(`/api/master-instruments/${inst.id}/certificate`, '_blank')
                          }}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-gray-50">
                        <td colSpan={6} className="px-4 py-4">
                          <div className="pl-6 grid grid-cols-2 gap-6">
                            {/* Instrument Details */}
                            <div>
                              <h4 className="text-sm font-medium text-gray-700 mb-2">
                                Instrument Details
                              </h4>
                              <dl className="text-sm space-y-1">
                                {inst.make && (
                                  <div>
                                    <dt className="inline text-gray-400">Make:</dt>{' '}
                                    <dd className="inline text-gray-600">{inst.make}</dd>
                                  </div>
                                )}
                                {inst.model && (
                                  <div>
                                    <dt className="inline text-gray-400">Model:</dt>{' '}
                                    <dd className="inline text-gray-600">{inst.model}</dd>
                                  </div>
                                )}
                                {inst.calibratedAt && (
                                  <div>
                                    <dt className="inline text-gray-400">Calibrated By:</dt>{' '}
                                    <dd className="inline text-gray-600">{inst.calibratedAt}</dd>
                                  </div>
                                )}
                              </dl>
                            </div>

                            {/* Used In Certificates */}
                            <div>
                              <h4 className="text-sm font-medium text-gray-700 mb-2">
                                Used in Your Calibrations
                              </h4>
                              {inst.certificatesUsedIn.length > 0 ? (
                                <ul className="text-sm space-y-1">
                                  {inst.certificatesUsedIn.map((cert) => (
                                    <li key={cert.id} className="text-gray-600">
                                      <span className="font-medium">{cert.certificateNumber}</span>
                                      {cert.uucDescription && ` - ${cert.uucDescription}`}
                                      {cert.dateOfCalibration && (
                                        <span className="text-gray-400">
                                          {' '}
                                          ({formatDate(cert.dateOfCalibration)})
                                        </span>
                                      )}
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <p className="text-sm text-gray-400 italic">No certificates found</p>
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
            <Microscope className="h-8 w-8 text-gray-300 mx-auto mb-2" />
            <p className="text-gray-500">No master instruments to display.</p>
            <p className="text-sm text-gray-400 mt-1">
              Traceability documents will appear here once your instruments have been calibrated.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
