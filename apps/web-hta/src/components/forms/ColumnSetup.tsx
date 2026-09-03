'use client'

// Column Setup panel for Section 05.
//
// Lets the engineer declare the column schema for one parameter before entering data:
// which fields each instrument contributes, their types and units, and which pair of
// numeric fields the error is computed from.
//
// Layout follows docs/todos/section05-dynamic-fields-revamp.md - Master fields and UUC
// fields side by side, error computation beneath, and a one-line summary when collapsed.

import { useState } from 'react'
import { ChevronDown, ChevronRight, Plus, X, AlertTriangle } from 'lucide-react'
import {
  buildSimpleExpression,
  createField,
  detectExpressionCycles,
  errorFieldCandidates,
  parseSimpleExpression,
  removeField,
  type ErrorConfig,
  type ExpressionOperator,
  type FieldDefinition,
  type FieldGroup,
  type FieldType,
} from '@/lib/certificate-fields'
import { cn } from '@/lib/utils'

const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: 'numeric', label: 'Numeric' },
  { value: 'expression', label: 'Expression' },
  { value: 'text', label: 'Text' },
]

const OPERATORS: { value: ExpressionOperator; label: string }[] = [
  { value: '+', label: '+' },
  { value: '-', label: '−' },
  { value: '*', label: '×' },
  { value: '/', label: '÷' },
]

const SELECT_CLASS =
  'rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/10 disabled:bg-slate-50'
const INPUT_CLASS =
  'rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/10 disabled:bg-slate-50'

interface ColumnSetupProps {
  fields: FieldDefinition[]
  errorConfig: ErrorConfig
  parameterUnit: string
  disabled?: boolean
  onChange: (fields: FieldDefinition[], errorConfig: ErrorConfig) => void
}

/** One-line description of the schema, shown when the panel is collapsed. */
function summarise(fields: FieldDefinition[], group: FieldGroup): string {
  const inGroup = fields.filter((f) => f.group === group)
  if (inGroup.length === 0) return 'none'
  return inGroup
    .map((f) => {
      const name = f.name || 'Untitled'
      return f.unit ? `${name} (${f.type}, ${f.unit})` : `${name} (${f.type})`
    })
    .join(', ')
}

export function ColumnSetup({
  fields,
  errorConfig,
  parameterUnit,
  disabled,
  onChange,
}: ColumnSetupProps) {
  const [expanded, setExpanded] = useState(false)
  const [warning, setWarning] = useState<string | null>(null)

  const masterFields = fields.filter((f) => f.group === 'master')
  const uucFields = fields.filter((f) => f.group === 'uuc')
  const cycles = detectExpressionCycles(fields)

  const masterName =
    fields.find((f) => f.id === errorConfig.masterFieldId)?.name || '—'
  const uucName = fields.find((f) => f.id === errorConfig.uucFieldId)?.name || '—'

  const updateField = (id: string, patch: Partial<FieldDefinition>) => {
    onChange(
      fields.map((f) => (f.id === id ? { ...f, ...patch } : f)),
      errorConfig,
    )
  }

  const addField = (group: FieldGroup) => {
    const created = createField(group, fields)
    // A new field defaults to the parameter's unit, which is right far more often
    // than blank and is the first thing the engineer would type otherwise.
    onChange([...fields, { ...created, unit: parameterUnit }], errorConfig)
    setWarning(null)
  }

  const deleteField = (id: string) => {
    const result = removeField(fields, errorConfig, id)
    onChange(result.fields, result.errorConfig)
    setWarning(result.warning)
  }

  /**
   * Structured editor for an expression column.
   *
   * The raw formula references fields by internal id, which nobody should have to type.
   * This composes it from a source column, an operator and either a number or a second
   * column. A formula that does not fit that shape falls back to a raw input rather than
   * being silently rewritten.
   */
  const renderExpressionBuilder = (fieldDef: FieldDefinition) => {
    const others = fields.filter((f) => f.id !== fieldDef.id && f.type !== 'text')
    const parsed = parseSimpleExpression(fieldDef.expression)
    const isRaw = Boolean(fieldDef.expression) && parsed === null

    const current =
      parsed ??
      ({
        sourceId: '',
        operator: '*' as ExpressionOperator,
        operand: { kind: 'value' as const, value: '' },
      })

    const emit = (next: typeof current) =>
      updateField(fieldDef.id, { expression: buildSimpleExpression(next) })

    if (isRaw) {
      return (
        <div className="space-y-1">
          <input
            type="text"
            value={fieldDef.expression ?? ''}
            disabled={disabled}
            aria-label={`Formula for ${fieldDef.name || 'field'}`}
            onChange={(e) => updateField(fieldDef.id, { expression: e.target.value })}
            className={cn(INPUT_CLASS, 'w-full font-mono text-xs')}
          />
          <button
            type="button"
            disabled={disabled}
            onClick={() => updateField(fieldDef.id, { expression: '' })}
            className="text-[10px] text-slate-500 underline hover:text-slate-700"
          >
            Clear and use the builder
          </button>
        </div>
      )
    }

    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <select
          value={current.sourceId}
          disabled={disabled}
          aria-label={`Source column for ${fieldDef.name || 'field'}`}
          onChange={(e) => emit({ ...current, sourceId: e.target.value })}
          className={SELECT_CLASS}
        >
          <option value="">Source column…</option>
          {others.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name || 'Untitled'}
            </option>
          ))}
        </select>

        <select
          value={current.operator}
          disabled={disabled}
          aria-label={`Operator for ${fieldDef.name || 'field'}`}
          onChange={(e) =>
            emit({ ...current, operator: e.target.value as ExpressionOperator })
          }
          className={cn(SELECT_CLASS, 'w-14 text-center')}
        >
          {OPERATORS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        <select
          value={current.operand.kind}
          disabled={disabled}
          aria-label={`Operand type for ${fieldDef.name || 'field'}`}
          onChange={(e) =>
            emit({
              ...current,
              operand:
                e.target.value === 'value'
                  ? { kind: 'value', value: '' }
                  : { kind: 'field', fieldId: '' },
            })
          }
          className={SELECT_CLASS}
        >
          <option value="value">a value</option>
          <option value="field">another column</option>
        </select>

        {current.operand.kind === 'value' ? (
          <input
            type="number"
            step="any"
            value={current.operand.value}
            disabled={disabled}
            placeholder="0.001"
            aria-label={`Value for ${fieldDef.name || 'field'}`}
            onChange={(e) =>
              emit({ ...current, operand: { kind: 'value', value: e.target.value } })
            }
            className={cn(INPUT_CLASS, 'w-24')}
          />
        ) : (
          <select
            value={current.operand.fieldId}
            disabled={disabled}
            aria-label={`Second column for ${fieldDef.name || 'field'}`}
            onChange={(e) =>
              emit({ ...current, operand: { kind: 'field', fieldId: e.target.value } })
            }
            className={SELECT_CLASS}
          >
            <option value="">Column…</option>
            {others.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name || 'Untitled'}
              </option>
            ))}
          </select>
        )}
      </div>
    )
  }

  const renderFieldCard = (fieldDef: FieldDefinition, index: number) => (
    <div
      key={fieldDef.id}
      className="rounded-lg border border-slate-200 bg-white px-2.5 py-2"
    >
      {/* One row per field: number, name, type, unit, remove. */}
      <div className="flex items-center gap-1.5">
        <span className="w-4 shrink-0 text-[10px] font-semibold text-slate-400">
          {index + 1}
        </span>
        <input
          type="text"
          value={fieldDef.name}
          disabled={disabled}
          placeholder="Column name"
          aria-label={`${fieldDef.group === 'master' ? 'Master' : 'UUC'} field ${index + 1} name`}
          onChange={(e) => updateField(fieldDef.id, { name: e.target.value })}
          className={cn(INPUT_CLASS, 'min-w-0 flex-1')}
        />
        <select
          value={fieldDef.type}
          disabled={disabled}
          aria-label={`Type for ${fieldDef.name || `field ${index + 1}`}`}
          onChange={(e) => updateField(fieldDef.id, { type: e.target.value as FieldType })}
          className={cn(SELECT_CLASS, 'w-28 shrink-0')}
        >
          {FIELD_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        {fieldDef.type !== 'text' ? (
          <input
            type="text"
            value={fieldDef.unit}
            disabled={disabled}
            placeholder="Unit"
            aria-label={`Unit for ${fieldDef.name || `field ${index + 1}`}`}
            onChange={(e) => updateField(fieldDef.id, { unit: e.target.value })}
            className={cn(INPUT_CLASS, 'w-20 shrink-0')}
          />
        ) : (
          <span className="w-20 shrink-0" />
        )}
        <button
          type="button"
          disabled={disabled}
          aria-label={`Remove ${fieldDef.name || 'field'}`}
          onClick={() => deleteField(fieldDef.id)}
          className="shrink-0 rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {fieldDef.type === 'expression' && (
        <div className="mt-1.5 pl-5">{renderExpressionBuilder(fieldDef)}</div>
      )}
    </div>
  )

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/60">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
        aria-expanded={expanded}
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-slate-400" />
        ) : (
          <ChevronRight className="h-4 w-4 text-slate-400" />
        )}
        <span className="text-xs font-semibold text-slate-700">Column Setup</span>
        {!expanded && (
          <span className="ml-2 truncate text-xs text-slate-500">
            Master: {summarise(fields, 'master')} · UUC: {summarise(fields, 'uuc')} ·
            Error: {masterName} {errorConfig.formula === 'A-B' ? '−' : '−'} {uucName}
          </span>
        )}
      </button>

      {expanded && (
        <div className="space-y-4 border-t border-slate-200 p-3">
          {warning && (
            <p className="flex items-start gap-1.5 rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {warning}
            </p>
          )}

          {cycles.length > 0 && (
            <p className="flex items-start gap-1.5 rounded border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-800">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              An expression refers back to itself, so it cannot be computed. Check the
              formulas on: {cycles.flat().map((id) => fields.find((f) => f.id === id)?.name || id).join(', ')}
            </p>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            {(['master', 'uuc'] as const).map((group) => (
              <div key={group} className="space-y-2">
                <h4 className="text-[11px] font-semibold text-slate-600">
                  {group === 'master' ? 'Master Instrument Fields' : 'UUC Fields'}
                </h4>
                {(group === 'master' ? masterFields : uucFields).map(renderFieldCard)}
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => addField(group)}
                  className="flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-slate-300 py-1.5 text-xs text-slate-500 hover:border-slate-400 hover:text-slate-700 disabled:opacity-40"
                >
                  <Plus className="h-3 w-3" />
                  Add {group === 'master' ? 'Master' : 'UUC'} Field
                </button>
              </div>
            ))}
          </div>

          <div className="space-y-2 border-t border-slate-200 pt-3">
            <h4 className="text-[11px] font-semibold text-slate-600">Error Computation</h4>
            <div className="grid gap-2 sm:grid-cols-4">
              <label className="text-[11px] font-medium text-slate-500">
                Field A (Master)
                <select
                  value={errorConfig.masterFieldId}
                  disabled={disabled}
                  onChange={(e) =>
                    onChange(fields, { ...errorConfig, masterFieldId: e.target.value })
                  }
                  className={cn(
                    'mt-1 w-full rounded-md border px-2 py-1.5 text-sm text-slate-900 disabled:bg-slate-50',
                    errorConfig.masterFieldId ? 'border-slate-200' : 'border-amber-300',
                  )}
                >
                  <option value="">Select…</option>
                  {errorFieldCandidates(fields, 'master').map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name || 'Untitled'}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-[11px] font-medium text-slate-500">
                Field B (UUC)
                <select
                  value={errorConfig.uucFieldId}
                  disabled={disabled}
                  onChange={(e) =>
                    onChange(fields, { ...errorConfig, uucFieldId: e.target.value })
                  }
                  className={cn(
                    'mt-1 w-full rounded-md border px-2 py-1.5 text-sm text-slate-900 disabled:bg-slate-50',
                    errorConfig.uucFieldId ? 'border-slate-200' : 'border-amber-300',
                  )}
                >
                  <option value="">Select…</option>
                  {errorFieldCandidates(fields, 'uuc').map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name || 'Untitled'}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-[11px] font-medium text-slate-500">
                Formula
                <select
                  value={errorConfig.formula}
                  disabled={disabled}
                  onChange={(e) =>
                    onChange(fields, {
                      ...errorConfig,
                      formula: e.target.value as ErrorConfig['formula'],
                    })
                  }
                  className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm text-slate-900 disabled:bg-slate-50"
                >
                  <option value="A-B">A − B</option>
                  <option value="B-A">B − A</option>
                </select>
              </label>

              <label className="text-[11px] font-medium text-slate-500">
                Error Unit
                <input
                  type="text"
                  value={errorConfig.unit}
                  disabled={disabled}
                  onChange={(e) =>
                    onChange(fields, { ...errorConfig, unit: e.target.value })
                  }
                  className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm text-slate-900 disabled:bg-slate-50"
                />
              </label>
            </div>

            {(!errorConfig.masterFieldId || !errorConfig.uucFieldId) && (
              <p className="text-xs text-amber-700">
                Select both fields to compute the error column.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
