'use client'

// Section 05 results table rendered from a parameter's field schema.
//
// Columns come from fieldDefinitions rather than being fixed, so each parameter can
// have its own layout. Headers are grouped Master / UUC with a field-name row and a
// unit row beneath, per docs/todos/section05-dynamic-fields-revamp.md.
//
// Sl. No is always the first column and Error Observed always the last, regardless of
// how the engineer arranged the instrument fields between them.

import { Plus, Trash2 } from 'lucide-react'
import {
  resolveRowValues,
  type CalibrationResultRow,
  type ErrorConfig,
  type FieldDefinition,
} from '@/lib/certificate-fields'
import { cn } from '@/lib/utils'

interface DynamicResultsTableProps {
  fields: FieldDefinition[]
  errorConfig: ErrorConfig
  rows: CalibrationResultRow[]
  /** Decimal places for numeric entry, from the parameter's least count. */
  precision: number
  disabled?: boolean
  onValueChange: (rowIndex: number, fieldId: string, value: string) => void
  onAddRow: () => void
  onRemoveRow: (rowIndex: number) => void
}

function byOrder(a: FieldDefinition, b: FieldDefinition) {
  return a.order - b.order
}

export function DynamicResultsTable({
  fields,
  errorConfig,
  rows,
  precision,
  disabled,
  onValueChange,
  onAddRow,
  onRemoveRow,
}: DynamicResultsTableProps) {
  const masterFields = fields.filter((f) => f.group === 'master').sort(byOrder)
  const uucFields = fields.filter((f) => f.group === 'uuc').sort(byOrder)
  const ordered = [...masterFields, ...uucFields]

  const step = precision > 0 ? (1 / Math.pow(10, precision)).toString() : '1'
  const outOfLimitCount = rows.filter((r) => r.isOutOfLimit).length

  if (ordered.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-slate-300 px-3 py-6 text-center text-sm text-slate-500">
        No columns configured. Open Column Setup to add Master and UUC fields.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50/50 text-[10px] font-bold uppercase tracking-widest text-slate-400">
            {/* Group row: which instrument each block of columns belongs to. */}
            <tr className="border-b border-slate-200">
              <th className="px-2 py-1.5 text-left" rowSpan={3}>
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
              <th className="border-l border-slate-200 px-2 py-1.5 text-center" rowSpan={3}>
                Error
                <br />
                Observed
              </th>
              <th className="px-2 py-1.5" rowSpan={3}>
                <span className="sr-only">Actions</span>
              </th>
            </tr>

            {/* Field name row. */}
            <tr className="border-b border-slate-100">
              {ordered.map((field, index) => (
                <th
                  key={field.id}
                  className={cn(
                    'px-2 py-1 text-center font-semibold text-slate-500',
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
                    'px-2 pb-1 text-center font-normal normal-case tracking-normal text-slate-400',
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
                    row.isOutOfLimit && 'bg-red-50/60',
                  )}
                >
                  <td className="px-2 py-1 text-xs text-slate-400">
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
                        <td key={field.id} className={cn('px-2 py-1', edge)}>
                          <span
                            className="block w-full rounded bg-slate-50 px-2 py-1 text-right text-sm text-slate-600"
                            title="Computed from the formula in Column Setup"
                          >
                            {value === '' || value === undefined ? '—' : value}
                          </span>
                        </td>
                      )
                    }

                    return (
                      <td key={field.id} className={cn('px-2 py-1', edge)}>
                        <input
                          type={field.type === 'numeric' ? 'number' : 'text'}
                          step={field.type === 'numeric' ? step : undefined}
                          value={row.values[field.id] ?? ''}
                          disabled={disabled}
                          aria-label={`${field.name || 'Field'}, point ${row.pointNumber}`}
                          onChange={(e) => onValueChange(rowIndex, field.id, e.target.value)}
                          className="w-full rounded border border-slate-200 px-2 py-1 text-right text-sm focus:border-slate-400 focus:outline-none disabled:bg-slate-50"
                        />
                      </td>
                    )
                  })}

                  <td className="border-l border-slate-200 px-2 py-1 text-right text-sm">
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

                  <td className="px-1 py-1">
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

      <p className="px-1 text-xs">
        {!errorConfig.masterFieldId || !errorConfig.uucFieldId ? (
          <span className="text-amber-700">
            Error column is blank until both error fields are selected in Column Setup.
          </span>
        ) : outOfLimitCount > 0 ? (
          <span className="text-red-600">
            {outOfLimitCount} of {rows.length}{' '}
            {outOfLimitCount === 1 ? 'point is' : 'points are'} outside the accuracy limit
          </span>
        ) : (
          <span className="text-emerald-700">
            All {rows.length} {rows.length === 1 ? 'point' : 'points'} within accuracy
            limits
          </span>
        )}
      </p>
    </div>
  )
}
