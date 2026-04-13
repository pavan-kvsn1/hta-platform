'use client'

import { AlertCircle, CheckCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Minimal parameter result interface for table display
 */
interface ParameterResult {
  id: string
  pointNumber: number
  standardReading: string | null
  beforeAdjustment: string | null
  afterAdjustment: string | null
  errorObserved: number | null
  isOutOfLimit: boolean
}

/**
 * Minimal parameter interface for table display.
 * Compatible with both centralized Parameter type and local definitions.
 */
interface CalibrationParameter {
  id: string
  parameterName: string
  parameterUnit: string | null
  showAfterAdjustment: boolean
  results: ParameterResult[]
}

export interface CalibrationResultsTableProps {
  parameters: CalibrationParameter[]
  emptyMessage?: string
}

/**
 * Calibration results table for certificate display.
 * Shows parameter results with point number, readings, error, and status.
 */
export function CalibrationResultsTable({
  parameters,
  emptyMessage = 'No results recorded.',
}: CalibrationResultsTableProps) {
  if (parameters.length === 0) {
    return <p className="text-gray-500 text-sm">{emptyMessage}</p>
  }

  return (
    <div className="space-y-4">
      {parameters.map((param) => (
        <div key={param.id} className="border border-slate-200 rounded-lg overflow-hidden">
          {/* Parameter Name Header - Light Teal */}
          <div className="bg-primary/10 px-4 py-2 border-b border-slate-200">
            <span className="font-medium text-primary text-sm">
              {param.parameterName}
              {param.parameterUnit && (
                <span className="text-primary/70 font-normal ml-1 text-sm">
                  ({param.parameterUnit})
                </span>
              )}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              {/* Table Header - Section Inner Color */}
              <thead className="bg-section-inner">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-slate-700">
                    Point
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-slate-700">
                    Standard Reading
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-slate-700">
                    UUC Reading
                  </th>
                  {param.showAfterAdjustment && (
                    <th className="px-4 py-2 text-left text-xs font-semibold text-slate-700">
                      After Adjustment
                    </th>
                  )}
                  <th className="px-4 py-2 text-left text-xs font-semibold text-slate-700">
                    Error
                  </th>
                  <th className="px-4 py-2 text-center text-xs font-semibold text-slate-700">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {param.results.map((result) => (
                  <tr
                    key={result.id}
                    className={cn(result.isOutOfLimit && 'bg-red-50')}
                  >
                    <td className="px-4 py-2 text-gray-900 text-xs">{result.pointNumber}</td>
                    <td className="px-4 py-2 text-gray-700 text-xs">{result.standardReading || '-'}</td>
                    <td className="px-4 py-2 text-gray-700 text-xs">{result.beforeAdjustment || '-'}</td>
                    {param.showAfterAdjustment && (
                      <td className="px-4 py-2 text-gray-700 text-xs">{result.afterAdjustment || '-'}</td>
                    )}
                    <td className="px-4 py-2 text-gray-700 text-xs">{result.errorObserved ?? '-'}</td>
                    <td className="px-4 py-2 text-center">
                      {result.isOutOfLimit ? (
                        <span className="inline-flex items-center gap-1 text-red-600">
                          <AlertCircle className="h-3 w-3" />
                          <span className="text-xs">Out of Limit</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-green-600">
                          <CheckCircle className="h-3 w-3" />
                          <span className="text-xs">OK</span>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}
