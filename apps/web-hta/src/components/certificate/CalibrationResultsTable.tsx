'use client'

// Calibration results as they appear on the certificate - reviewer, admin, customer
// and the engineer's own read-only view all render through here.
//
// A parameter that declares columns is rendered with those columns. Section 05 lets an
// engineer build a table of any shape, and this used to show a fixed three - so a
// fourth column, or a computed one, was simply absent from the certificate everyone
// downstream signs. The reader would have had no way to know something was missing.
//
// A parameter with no declared columns still renders the old fixed layout. Every
// certificate written before Section 05 is in that state, and they must keep printing
// exactly as they did.

import { AlertCircle, CheckCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  formatToPrecision,
  readStoredFieldSchema,
  resolveRowValues,
  resultValues,
  type ErrorConfig,
  type FieldDefinition,
} from '@/lib/certificate-fields'
import {
  formatToCalibrationPrecision,
  resolveCalibrationPrecision,
  type CalibrationPrecisionParameter,
} from '@/lib/utils/calibration-precision'

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
  /** Values for declared columns, keyed by field id. Absent on older results. */
  values?: Record<string, string> | null
}

/**
 * Minimal parameter interface for table display.
 * Compatible with both centralized Parameter type and local definitions.
 */
interface CalibrationParameter extends CalibrationPrecisionParameter {
  id: string
  parameterName: string
  parameterUnit: string | null
  showAfterAdjustment: boolean
  results: ParameterResult[]
  /** Heading for this table on the certificate; falls back to the parameter name. */
  tableName?: string | null
  /**
   * The column schema arrives two ways: flattened by /pdf-data, or as the raw
   * fieldSchema column by GET /api/certificates/:id. Both are accepted rather than
   * requiring every caller to normalise first - a caller that gets it wrong would
   * silently fall back to the fixed layout, which is the bug this fixes.
   */
  fieldDefinitions?: FieldDefinition[] | null
  errorConfig?: ErrorConfig | null
  fieldSchema?: unknown
}

export interface CalibrationResultsTableProps {
  parameters: CalibrationParameter[]
  emptyMessage?: string
}

function schemaOf(param: CalibrationParameter): {
  fields: FieldDefinition[]
  errorConfig: ErrorConfig | null
} {
  if (param.fieldDefinitions?.length) {
    return { fields: param.fieldDefinitions, errorConfig: param.errorConfig ?? null }
  }
  const stored = readStoredFieldSchema(param.fieldSchema)
  return {
    fields: stored.fieldDefinitions,
    errorConfig: stored.fieldDefinitions.length ? stored.errorConfig : null,
  }
}

const HEAD = 'px-4 py-2 text-left text-xs font-semibold text-slate-700'
const CELL = 'px-4 py-2 text-xs'

/** Name and unit on one line, matching how the engineer entered it. */
function heading(field: FieldDefinition) {
  const name = field.name || 'Untitled'
  return field.unit ? `${name} (${field.unit})` : name
}

export function CalibrationResultsTable({
  parameters,
  emptyMessage = 'No results recorded.',
}: CalibrationResultsTableProps) {
  if (parameters.length === 0) {
    return <p className="text-gray-500 text-sm">{emptyMessage}</p>
  }

  return (
    <div className="space-y-4">
      {parameters.map((param) => {
        const { fields, errorConfig } = schemaOf(param)
        const masterFields = fields
          .filter((f) => f.group === 'master')
          .sort((a, b) => a.order - b.order)
        const uucFields = fields
          .filter((f) => f.group === 'uuc')
          .sort((a, b) => a.order - b.order)
        const ordered = [...masterFields, ...uucFields]
        const dynamic = ordered.length > 0

        return (
          <div key={param.id} className="border border-slate-200 rounded-lg overflow-hidden">
            {/* Parameter Name Header - Light Teal */}
            <div className="bg-primary/10 px-4 py-2 border-b border-slate-200">
              <span className="font-medium text-primary text-sm">
                {param.tableName?.trim() || param.parameterName}
                {!param.tableName?.trim() && param.parameterUnit && (
                  <span className="text-primary/70 font-normal ml-1 text-sm">
                    ({param.parameterUnit})
                  </span>
                )}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-section-inner">
                  {dynamic ? (
                    <>
                      <tr>
                        <th rowSpan={2} className={cn(HEAD, 'align-bottom')}>
                          Point
                        </th>
                        {masterFields.length > 0 && (
                          <th
                            colSpan={masterFields.length}
                            className="px-4 py-2 text-center text-xs font-semibold text-slate-700 border-b border-slate-200"
                          >
                            Master Instrument
                          </th>
                        )}
                        {uucFields.length > 0 && (
                          <th
                            colSpan={uucFields.length}
                            className="px-4 py-2 text-center text-xs font-semibold text-slate-700 border-b border-slate-200"
                          >
                            UUC
                          </th>
                        )}
                        <th rowSpan={2} className={cn(HEAD, 'align-bottom')}>
                          Error
                        </th>
                        <th
                          rowSpan={2}
                          className="px-4 py-2 text-center text-xs font-semibold text-slate-700 align-bottom"
                        >
                          Status
                        </th>
                      </tr>
                      <tr>
                        {ordered.map((field) => (
                          <th key={field.id} className={HEAD}>
                            {heading(field)}
                          </th>
                        ))}
                      </tr>
                    </>
                  ) : (
                    <tr>
                      <th className={HEAD}>Point</th>
                      <th className={HEAD}>Standard Reading</th>
                      <th className={HEAD}>UUC Reading</th>
                      {param.showAfterAdjustment && <th className={HEAD}>After Adjustment</th>}
                      <th className={HEAD}>Error</th>
                      <th className="px-4 py-2 text-center text-xs font-semibold text-slate-700">
                        Status
                      </th>
                    </tr>
                  )}
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {param.results.map((result) => {
                    // The reading the least count is judged at: the master field under a
                    // declared schema, the legacy standardReading otherwise.
                    // A row may predate the schema and hold only the legacy three, so
                    // map those onto the declared columns rather than print blanks.
                    const rowValues = dynamic ? resultValues(result, fields, errorConfig) : {}
                    const masterReading = dynamic
                      ? (rowValues[errorConfig?.masterFieldId ?? ''] ?? null)
                      : result.standardReading
                    const { precision } = resolveCalibrationPrecision(param, masterReading)
                    const failed = result.isOutOfLimit
                    const cell = cn(CELL, failed ? 'text-red-700 font-bold' : 'text-gray-700')

                    const resolved = dynamic
                      ? resolveRowValues(
                          {
                            id: result.id,
                            pointNumber: result.pointNumber,
                            values: rowValues,
                            errorObserved: result.errorObserved,
                            isOutOfLimit: result.isOutOfLimit,
                          },
                          fields,
                        )
                      : {}

                    return (
                      <tr
                        key={result.id}
                        className={cn(failed && 'bg-red-50 text-red-700 font-bold')}
                      >
                        <td className={cn(CELL, failed ? 'text-red-700 font-bold' : 'text-gray-900')}>
                          {result.pointNumber}
                        </td>

                        {dynamic ? (
                          ordered.map((field) => {
                            const raw = resolved[field.id] ?? ''
                            const numeric = field.type !== 'text' && raw !== '' && Number.isFinite(Number(raw))
                            return (
                              <td key={field.id} className={cell}>
                                {numeric ? formatToPrecision(Number(raw), precision) : raw || '—'}
                              </td>
                            )
                          })
                        ) : (
                          <>
                            <td className={cell}>
                              {formatToCalibrationPrecision(result.standardReading, precision)}
                            </td>
                            <td className={cell}>
                              {formatToCalibrationPrecision(result.beforeAdjustment, precision)}
                            </td>
                            {param.showAfterAdjustment && (
                              <td className={cell}>
                                {formatToCalibrationPrecision(result.afterAdjustment, precision)}
                              </td>
                            )}
                          </>
                        )}

                        <td className={cell}>
                          {formatToCalibrationPrecision(result.errorObserved, precision)}
                        </td>
                        <td className="px-4 py-2 text-center">
                          {failed ? (
                            <span className="inline-flex items-center gap-1 text-red-700 font-bold">
                              <AlertCircle className="h-3 w-3" />
                              <span className="text-xs font-bold">Fail*</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-green-600">
                              <CheckCircle className="h-3 w-3" />
                              <span className="text-xs">OK</span>
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}
    </div>
  )
}
