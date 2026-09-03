'use client'

// Section 05 results table rendered from a parameter's field schema.
//
// Columns come from fieldDefinitions rather than being fixed, so each parameter can
// have its own layout, per docs/todos/section05-dynamic-fields-revamp.md. Headers are
// two rows: the Master / UUC group, then the column itself as "Master Reading (deg C)"
// - name and unit on one line rather than stacked. Both rows are set at the same size
// and weight, including the fixed Sl./Error/Status columns, so the header reads as one
// block rather than a caption sitting above the real headings.
//
// Sl. No is always the first column and Error always the last, regardless of how the
// engineer arranged the instrument fields between them.
//
// Ruling is horizontal only. With no vertical lines the input outline becomes the
// vertical structure, which also marks out what is editable: entry cells are outlined,
// computed cells are dashed and muted so they read as read-only.

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
      <p className="rounded-lg border border-dashed border-slate-300 px-3 py-8 text-center text-sm text-slate-500">
        No columns configured. Open Column Setup to add Master and UUC fields.
      </p>
    )
  }

  const alignFor = (field: FieldDefinition) =>
    field.type === 'text' ? 'text-left' : 'text-right tabular-nums'

  /** Name and unit on one line, e.g. "Master Reading (deg C)". */
  const headingFor = (field: FieldDefinition) => {
    const name = field.name || 'Untitled'
    return field.unit ? name + ' (' + field.unit + ')' : name
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-section-inner">
            <tr>
              <th
                rowSpan={2}
                className="w-12 px-4 py-2 text-left align-bottom text-xs font-semibold text-slate-700"
              >
                Sl.
              </th>
              {masterFields.length > 0 && (
                <th
                  colSpan={masterFields.length}
                  className="px-4 pb-1 pt-2 text-center text-xs font-semibold text-slate-700"
                >
                  Master Instrument
                </th>
              )}
              {uucFields.length > 0 && (
                <th
                  colSpan={uucFields.length}
                  className="px-4 pb-1 pt-2 text-center text-xs font-semibold text-slate-700"
                >
                  UUC
                </th>
              )}
              <th
                rowSpan={2}
                className="w-24 px-4 py-2 text-center align-bottom text-xs font-semibold text-slate-700"
              >
                Error
              </th>
              {getLimit && (
                <th
                  rowSpan={2}
                  className="w-20 px-4 py-2 text-center align-bottom text-xs font-semibold text-slate-700"
                >
                  Limit
                </th>
              )}
              <th
                rowSpan={2}
                className="w-20 px-4 py-2 text-center align-bottom text-xs font-semibold text-slate-700"
              >
                Status
              </th>
              {getReadingImages && (
                <th
                  rowSpan={2}
                  className="w-16 px-2 py-2 text-center align-bottom text-xs font-semibold text-slate-700"
                >
                  Photos
                </th>
              )}
              <th rowSpan={2} className="w-10 px-2 py-2">
                <span className="sr-only">Actions</span>
              </th>
            </tr>

            <tr>
              {ordered.map((field) => (
                <th
                  key={field.id}
                  className="px-3 pb-2.5 text-center text-xs font-semibold text-slate-700"
                >
                  {field.name ? (
                    headingFor(field)
                  ) : (
                    <span className="font-normal text-slate-300">Untitled</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100 bg-white">
            {rows.map((row, rowIndex) => {
              // Expression cells show computed values, so resolve once per row.
              const resolved = resolveRowValues(row, fields)
              return (
                <tr
                  key={row.id}
                  className={cn(
                    'group transition-colors',
                    row.isOutOfLimit
                      ? 'bg-red-50/40 font-bold text-red-700'
                      : 'hover:bg-slate-50/70',
                  )}
                >
                  <td className="px-4 py-2 text-xs tabular-nums text-slate-400">
                    {String(row.pointNumber).padStart(2, '0')}
                  </td>

                  {ordered.map((field) => {
                    if (field.type === 'expression') {
                      const value = resolved[field.id]
                      return (
                        <td key={field.id} className="px-2 py-2">
                          <span
                            className={cn(
                              'block rounded-md border border-dashed border-slate-200 bg-slate-50/70 px-2.5 py-2 text-sm text-slate-500',
                              alignFor(field),
                            )}
                            title="Computed from the formula in Column Setup"
                          >
                            {value === '' || value === undefined ? '—' : value}
                          </span>
                        </td>
                      )
                    }

                    return (
                      <td key={field.id} className="px-2 py-2">
                        <input
                          type={field.type === 'numeric' ? 'number' : 'text'}
                          step={field.type === 'numeric' ? step : undefined}
                          value={row.values[field.id] ?? ''}
                          disabled={disabled}
                          aria-label={`${field.name || 'Field'}, point ${row.pointNumber}`}
                          onChange={(e) => onValueChange(rowIndex, field.id, e.target.value)}
                          className={cn(
                            'w-full rounded-md border border-slate-200 bg-white px-2.5 py-2 text-sm outline-none transition-colors',
                            'hover:border-slate-300',
                            'focus:border-primary/40 focus:ring-2 focus:ring-primary/10',
                            'disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400',
                            alignFor(field),
                            row.isOutOfLimit && 'font-bold text-red-700',
                          )}
                        />
                      </td>
                    )
                  })}

                  <td className="px-4 py-2 text-right text-sm tabular-nums">
                    {row.errorObserved === null ? (
                      <span className="text-slate-300">—</span>
                    ) : (
                      row.errorObserved
                    )}
                  </td>

                  {getLimit &&
                    (() => {
                      const { limit, binIndex } = getLimit(row)
                      return (
                        <td className="px-4 py-2 text-right text-xs tabular-nums text-slate-500">
                          {limit !== null
                            ? `±${limit.toFixed(precision).replace('-', '')}`
                            : '—'}
                          {binIndex !== null && (
                            <span className="ml-1 text-[9px] text-slate-400">
                              (Bin {binIndex + 1})
                            </span>
                          )}
                        </td>
                      )
                    })()}

                  <td className="px-4 py-2 text-center">
                    {row.isOutOfLimit ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                        <AlertTriangle className="size-3" />
                        Fail*
                      </span>
                    ) : row.errorObserved !== null ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                        <CheckCircle className="size-3" />
                        Pass
                      </span>
                    ) : (
                      <span className="text-xs text-slate-300">—</span>
                    )}
                  </td>

                  {getReadingImages && (
                    <td className="px-2 py-2 text-center">
                      {(() => {
                        // Only presence matters here; the caller owns the image type.
                        const images = getReadingImages(row.pointNumber)
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
                              'rounded-md p-1.5 transition-colors',
                              hasBoth
                                ? 'text-emerald-600 hover:bg-emerald-50'
                                : hasOne
                                  ? 'text-red-500 hover:bg-red-50'
                                  : 'text-slate-300 hover:bg-slate-100 hover:text-slate-500',
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

                  <td className="px-2 py-2">
                    {/* Revealed on row hover: a delete affordance on every row competes
                        with the data for attention. */}
                    <button
                      type="button"
                      disabled={disabled || rows.length <= 1}
                      aria-label={`Remove point ${row.pointNumber}`}
                      onClick={() => onRemoveRow(rowIndex)}
                      className="rounded-md p-1.5 text-slate-300 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-600 focus:opacity-100 group-hover:opacity-100 disabled:pointer-events-none"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <button
        type="button"
        disabled={disabled}
        onClick={onAddRow}
        className="flex w-full items-center justify-center gap-1.5 border-t border-slate-200 bg-slate-50/50 py-2 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40"
      >
        <Plus className="size-3.5" />
        Add measurement row
      </button>
    </div>
  )
}
