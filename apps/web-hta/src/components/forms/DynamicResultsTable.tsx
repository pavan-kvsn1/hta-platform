'use client'

// Section 05 results table rendered from a parameter's field schema.
//
// Columns come from fieldDefinitions rather than being fixed, so each parameter can
// have its own layout. Headers are grouped Master / UUC with a field-name row and a
// unit row beneath, per docs/todos/section05-dynamic-fields-revamp.md.
//
// Sl. No is always the first column and Error Observed always the last, regardless of
// how the engineer arranged the instrument fields between them.

import { AlertTriangle, Camera, CheckCircle, ImageIcon, Plus, Trash2 } from 'lucide-react'
import {
  resolveRowValues,
  type CalibrationResultRow,
  type FieldDefinition,
} from '@/lib/certificate-fields'
import { cn } from '@/lib/utils'

interface DynamicResultsTableProps {
  fields: FieldDefinition[]
  rows: CalibrationResultRow[]
  /** Decimal places for numeric entry, from the parameter's least count. */
  precision: number
  disabled?: boolean
  onValueChange: (rowIndex: number, fieldId: string, value: string) => void
  onAddRow: () => void
  onRemoveRow: (rowIndex: number) => void
  /**
   * Reading photos per point. Optional so the table can be used without them, but
   * supplied by ResultsSection - engineers attach a photo of the master and UUC
   * displays at each point as evidence, and dropping that when the table changed
   * would lose a feature rather than replace one.
   */
  getReadingImages?: (pointNumber: number) => { uuc: unknown; master: unknown }
  onOpenImages?: (pointNumber: number) => void
  /**
   * Accuracy limit applying at a row's master reading, with the bin it came from when
   * the parameter is binned. Supplied by ResultsSection; without it the Limit column
   * is omitted rather than shown empty.
   */
  getLimit?: (row: CalibrationResultRow) => { limit: number | null; binIndex: number | null }
}

function byOrder(a: FieldDefinition, b: FieldDefinition) {
  return a.order - b.order
}

export function DynamicResultsTable({
  fields,
  rows,
  precision,
  disabled,
  onValueChange,
  onAddRow,
  onRemoveRow,
  getReadingImages,
  onOpenImages,
  getLimit,
}: DynamicResultsTableProps) {
  const masterFields = fields.filter((f) => f.group === 'master').sort(byOrder)
  const uucFields = fields.filter((f) => f.group === 'uuc').sort(byOrder)
  const ordered = [...masterFields, ...uucFields]

  const step = precision > 0 ? (1 / Math.pow(10, precision)).toString() : '1'

  if (ordered.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-slate-300 px-3 py-6 text-center text-sm text-slate-500">
        No columns configured. Open Column Setup to add Master and UUC fields.
      </p>
    )
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50/50 text-[10px] font-bold uppercase tracking-widest text-slate-400">
            {/* Group row: which instrument each block of columns belongs to. */}
            <tr className="border-b border-slate-200">
              <th className="w-10 px-2 py-1 text-left" rowSpan={3}>
                Sl.
              </th>
              {masterFields.length > 0 && (
                <th className="border-l border-slate-200 px-2 py-1.5 text-center" colSpan={masterFields.length}>
                  Master Instrument
                </th>
              )}
              {uucFields.length > 0 && (
                <th className="border-l border-slate-200 px-2 py-1.5 text-center" colSpan={uucFields.length}>
                  UUC
                </th>
              )}
              <th
                className="w-24 border-l border-slate-200 px-2 py-1 text-center leading-tight"
                rowSpan={3}
              >
                Error
                <br />
                Observed
              </th>
              {getLimit && (
                <th className="w-20 px-2 py-1 text-center" rowSpan={3}>
                  Limit
                </th>
              )}
              <th className="w-20 px-2 py-1 text-center" rowSpan={3}>
                Status
              </th>
              {getReadingImages && (
                <th className="w-14 px-2 py-1 text-center" rowSpan={3}>
                  Photos
                </th>
              )}
              <th className="w-8 px-1 py-1" rowSpan={3}>
                <span className="sr-only">Actions</span>
              </th>
            </tr>

            {/* Field name row. */}
            <tr className="border-b border-slate-100">
              {ordered.map((field, index) => (
                <th
                  key={field.id}
                  className={cn(
                    'px-2 py-0.5 text-center font-semibold leading-tight text-slate-500',
                    (index === 0 || index === masterFields.length) &&
                      'border-l border-slate-200',
                  )}
                >
                  {field.name || <span className="text-slate-300">Untitled</span>}
                </th>
              ))}
            </tr>

            {/* Unit row. */}
            <tr className="border-b border-slate-300">
              {ordered.map((field, index) => (
                <th
                  key={field.id}
                  className={cn(
                    'px-2 pb-1 text-center text-[9px] font-normal normal-case tracking-normal text-slate-400',
                    (index === 0 || index === masterFields.length) &&
                      'border-l border-slate-200',
                  )}
                >
                  {field.unit || ' '}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {rows.map((row, rowIndex) => {
              // Expression cells show computed values, so resolve once per row.
              const resolved = resolveRowValues(row, fields)
              return (
                <tr
                  key={row.id}
                  className={cn(
                    'border-b border-slate-100 last:border-0',
                    // A failed point is called out on the row and on its inputs, so it
                    // stays obvious while the engineer is typing in the cell.
                    row.isOutOfLimit && 'bg-red-50/60 text-red-700 font-bold',
                  )}
                >
                  <td className="px-2 py-0.5 text-xs tabular-nums text-slate-400">
                    {String(row.pointNumber).padStart(2, '0')}
                  </td>

                  {ordered.map((field, index) => {
                    const edge =
                      index === 0 || index === masterFields.length
                        ? 'border-l border-slate-200'
                        : ''

                    if (field.type === 'expression') {
                      const value = resolved[field.id]
                      return (
                        <td key={field.id} className={cn('px-1.5 py-0.5', edge)}>
                          <span
                            className="block w-full rounded bg-slate-50 px-2 py-1 text-right text-sm tabular-nums text-slate-600"
                            title="Computed from the formula in Column Setup"
                          >
                            {value === '' || value === undefined ? '—' : value}
                          </span>
                        </td>
                      )
                    }

                    return (
                      <td key={field.id} className={cn('px-1.5 py-0.5', edge)}>
                        <input
                          type={field.type === 'numeric' ? 'number' : 'text'}
                          step={field.type === 'numeric' ? step : undefined}
                          value={row.values[field.id] ?? ''}
                          disabled={disabled}
                          aria-label={`${field.name || 'Field'}, point ${row.pointNumber}`}
                          onChange={(e) => onValueChange(rowIndex, field.id, e.target.value)}
                          className={cn(
                            'w-full rounded border border-slate-200 px-2 py-1 text-sm focus:border-slate-400 focus:outline-none disabled:bg-slate-50',
                            field.type === 'numeric'
                              ? 'text-right tabular-nums'
                              : 'text-left',
                            row.isOutOfLimit && 'font-bold text-red-700',
                          )}
                        />
                      </td>
                    )
                  })}

                  <td className="border-l border-slate-200 px-2 py-0.5 text-right text-sm tabular-nums">
                    {row.errorObserved === null ? (
                      <span className="text-slate-300">—</span>
                    ) : (
                      <span
                        className={cn(
                          'font-medium',
                          row.isOutOfLimit ? 'text-red-600' : 'text-slate-700',
                        )}
                      >
                        {row.errorObserved}
                      </span>
                    )}
                  </td>

                  {getLimit && (() => {
                    const { limit, binIndex } = getLimit(row)
                    return (
                      <td className="px-2 py-0.5 text-right tabular-nums">
                        <span
                          className={cn(
                            'text-xs',
                            row.isOutOfLimit
                              ? 'font-bold text-red-700'
                              : 'font-medium text-slate-500',
                          )}
                        >
                          {limit !== null ? `±${limit.toFixed(precision).replace('-', '')}` : '—'}
                          {binIndex !== null && (
                            <span className="ml-1 text-[9px] text-slate-400">
                              (Bin {binIndex + 1})
                            </span>
                          )}
                        </span>
                      </td>
                    )
                  })()}

                  <td className="px-2 py-0.5 text-center">
                    {row.isOutOfLimit ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-red-700">
                        <AlertTriangle className="size-2.5" />
                        Fail*
                      </span>
                    ) : row.errorObserved !== null ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-green-700">
                        <CheckCircle className="size-2.5" />
                        Pass
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-300">—</span>
                    )}
                  </td>

                  {getReadingImages && (
                    <td className="px-2 py-0.5 text-center">
                      {(() => {
                        const images = getReadingImages(row.pointNumber)
                        // Only presence matters here; the caller owns the image type.
                        const hasUuc = images.uuc != null
                        const hasMaster = images.master != null
                        const hasBoth = hasUuc && hasMaster
                        const hasOne = (hasUuc || hasMaster) && !hasBoth
                        return (
                          <button
                            type="button"
                            disabled={disabled}
                            onClick={() => onOpenImages?.(row.pointNumber)}
                            aria-label={`Photos for point ${row.pointNumber}`}
                            title={
                              hasBoth
                                ? 'View/edit photos'
                                : hasOne
                                  ? 'Missing one photo'
                                  : 'Add photos'
                            }
                            className={cn(
                              'rounded-md p-1 transition-colors',
                              hasBoth
                                ? 'bg-green-100 text-green-600 hover:bg-green-200'
                                : hasOne
                                  ? 'bg-red-100 text-red-500 hover:bg-red-200'
                                  : 'bg-slate-100 text-slate-400 hover:bg-slate-200 hover:text-slate-600',
                              disabled && 'cursor-not-allowed opacity-50',
                            )}
                          >
                            {!hasUuc && !hasMaster ? (
                              <Camera className="size-4" />
                            ) : (
                              <ImageIcon className="size-4" />
                            )}
                          </button>
                        )
                      })()}
                    </td>
                  )}

                  <td className="px-1 py-0.5">
                    <button
                      type="button"
                      disabled={disabled || rows.length <= 1}
                      aria-label={`Remove point ${row.pointNumber}`}
                      onClick={() => onRemoveRow(rowIndex)}
                      className="rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-600 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-300"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        <div className="border-t border-slate-200">
          <button
            type="button"
            disabled={disabled}
            onClick={onAddRow}
            className="flex w-full items-center justify-center gap-1 py-2 text-xs text-slate-500 hover:bg-slate-50 hover:text-slate-700 disabled:opacity-40"
          >
            <Plus className="h-3 w-3" />
            Add measurement row
          </button>
        </div>
    </div>
  )
}
