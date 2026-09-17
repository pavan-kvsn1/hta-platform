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

import { Fragment, useState } from 'react'
import { AlertCircle, CheckCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  formatToPrecision,
  readStoredFieldSchema,
  errorFormulaLabel,
  columnHeading,
  expressionToDisplay,
  formulaBreakdown,
  resolveRowValues,
  resultValues,
  type ErrorConfig,
  type FieldDefinition,
} from '@/lib/certificate/fields'
import {
  formatToCalibrationPrecision,
  resolveCalibrationPrecision,
  MAX_CALIBRATION_PRECISION,
  type CalibrationPrecisionParameter,
} from '@/lib/utils/calibration-precision'
import { bandsOf, calculateErrorLimit } from '@/lib/certificate/error-limit'

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
  /**
   * What the lab allows a point, which is the whole of why a row says OK or Fail.
   * Optional: a caller that does not pass these gets the table exactly as before.
   */
  accuracyType?: string | null
  accuracyValue?: string | null
  rangeMin?: string | null
  rangeMax?: string | null
}

export interface CalibrationResultsTableProps {
  parameters: CalibrationParameter[]
  emptyMessage?: string
  /**
   * Whether to print the error each point was allowed, beside the verdict it produced.
   *
   * On a banded parameter that figure changes from row to row - one certificate here
   * judges its five points against 0.26, 0.5, 0.75, 1 and 1.25 - so a column of
   * identical ticks tells the reader nothing about what any of them cleared.
   *
   * Off by default. A certificate already prints the parameter's accuracy, so this is
   * not a secret; it is column width, and the people who need it are the ones checking
   * the verdict rather than the ones receiving it.
   */
  showLimits?: boolean
  /**
   * Whether to say which columns were computed, and show the working on request.
   *
   * An expression column is evaluated in the browser and never stored, and its heading
   * is built from name, unit and error alias like any other - so on the certificate a
   * computed column is indistinguishable from a reading somebody took. That is fine for
   * a customer, who is being given a result; it is not fine for the person whose job is
   * to satisfy themselves the result follows from the readings.
   */
  showFormulas?: boolean
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

/**
 * Name, unit, then the alias when the error reads this column - so a heading reads
 * "Standard Meter Reading (°C) - (x)" and the error column can state its formula
 * without naming the columns again.
 */
function heading(field: FieldDefinition, errorConfig: ErrorConfig | null) {
  return columnHeading(field, errorConfig)
}

/**
 * Decimals for an allowed error.
 *
 * Not the readings' precision, which comes from the instrument's least count and is
 * about what can be read. A limit is a figure the lab specified, and rounding it to the
 * readings threw it away: a band allowing ±1.25 °C whose least count is 1 °C printed
 * "±1", which is a different and stricter specification than the one written down.
 *
 * So: never fewer decimals than the limit itself needs, and never fewer than the
 * readings carry, so the column still reads down.
 */
function limitPrecision(limit: number, readingPrecision: number): number {
  const own = String(limit).split('.')[1]?.length ?? 0
  return Math.min(MAX_CALIBRATION_PRECISION, Math.max(readingPrecision, own))
}

export function CalibrationResultsTable({
  parameters,
  emptyMessage = 'No results recorded.',
  showLimits = false,
  showFormulas = false,
}: CalibrationResultsTableProps) {
  /**
   * Which workings are open, keyed by result id and column. Closed by default: the
   * reader wants the number, and the working only when the number looks wrong.
   */
  const [openWorking, setOpenWorking] = useState<string | null>(null)
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
                          Error {errorFormulaLabel(errorConfig)}
                        </th>
                        {showLimits && (
                          <th rowSpan={2} className={cn(HEAD, 'align-bottom')}>
                            Limit
                          </th>
                        )}
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
                            {heading(field, errorConfig)}
                            {showFormulas && field.type === 'expression' && (
                              <>
                                {' '}
                                <span
                                  className="inline-block rounded border border-amber-300 bg-amber-50 px-1 font-mono text-[10px] font-bold text-amber-800"
                                  title="Computed from other columns, not measured"
                                >
                                  &fnof;
                                </span>
                                <span className="mt-0.5 block font-mono text-[10px] font-normal normal-case tracking-normal text-amber-800">
                                  {expressionToDisplay(field.expression, fields)}
                                </span>
                              </>
                            )}
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
                      {showLimits && <th className={HEAD}>Limit</th>}
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
                    // The same band that set the precision also sets what the point was
                    // allowed, so both are read from the master's reading.
                    const allowed = calculateErrorLimit(
                      { ...param, bins: bandsOf(param.bins) },
                      Number(masterReading),
                    )
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

                    /**
                     * The working for whichever computed cell on this row is open.
                     * formulaBreakdown already writes it the way it would be shown on
                     * paper - the formula, the formula with the readings in, then one
                     * line per operation - so this only has to find the field and
                     * render it.
                     */
                    const openField =
                      showFormulas && openWorking?.startsWith(`${result.id}:`)
                        ? ordered.find((f) => f.id === openWorking.slice(result.id.length + 1))
                        : undefined
                    const working = openField
                      ? formulaBreakdown(openField.expression, { fields, values: resolved })
                      : null
                    const columnCount =
                      1 + (dynamic ? ordered.length : param.showAfterAdjustment ? 3 : 2) + (showLimits ? 2 : 1) + 1

                    return (
                      <Fragment key={result.id}>
                      <tr
                        className={cn(failed && 'bg-red-50 text-red-700 font-bold')}
                      >
                        <td className={cn(CELL, failed ? 'text-red-700 font-bold' : 'text-gray-900')}>
                          {result.pointNumber}
                        </td>

                        {dynamic ? (
                          ordered.map((field) => {
                            const raw = resolved[field.id] ?? ''
                            const numeric = field.type !== 'text' && raw !== '' && Number.isFinite(Number(raw))
                            const shown = numeric ? formatToPrecision(Number(raw), precision) : raw || '—'
                            const computed = showFormulas && field.type === 'expression'
                            const key = `${result.id}:${field.id}`
                            return (
                              <td key={field.id} className={cn(cell, computed && 'bg-amber-50/60')}>
                                {computed ? (
                                  <button
                                    type="button"
                                    onClick={() => setOpenWorking((open) => (open === key ? null : key))}
                                    aria-expanded={openWorking === key}
                                    className="underline decoration-amber-400 decoration-dotted underline-offset-2 hover:decoration-amber-700"
                                    title="Show the working for this point"
                                  >
                                    {shown}
                                  </button>
                                ) : (
                                  shown
                                )}
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
                        {showLimits && (
                          <td className={cn(cell, 'text-slate-500')}>
                            {allowed.limit === null
                              ? '\u2014'
                              : `\u00b1${formatToPrecision(allowed.limit, limitPrecision(allowed.limit, precision))}`}
                          </td>
                        )}
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
                      {openField && (
                        <tr className="bg-amber-50">
                          <td colSpan={columnCount} className="px-4 py-3">
                            <p className="text-[11px] font-bold uppercase tracking-wider text-amber-800">
                              {openField.name || 'Untitled'} &mdash; how this point was computed
                            </p>
                            {working ? (
                              <>
                                <ol className="mt-1.5 space-y-0.5">
                                  {working.steps.map((step, i) => (
                                    <li key={i} className="font-mono text-[11px] text-amber-900">
                                      {step}
                                    </li>
                                  ))}
                                </ol>
                                <p className="mt-1.5 text-[11px] text-amber-800">
                                  Reads{' '}
                                  {working.columns
                                    .map((c) => `${c.name} = ${c.value || '\u2014'}`)
                                    .join(', ')}
                                  . Computed when this page was drawn; the certificate
                                  stores the readings, not this figure.
                                </p>
                              </>
                            ) : (
                              <p className="mt-1.5 text-[11px] text-amber-900">
                                This column&rsquo;s formula could not be read, so the value
                                above cannot be checked here.
                              </p>
                            )}
                          </td>
                        </tr>
                      )}
                      </Fragment>
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
