'use client'

// Free-form formula editor for a Section 05 expression column.
//
// The formula is edited as a row of tokens rather than as text. A column reference is
// one chip: it deletes in one step, it renders as the column's current name, and
// renaming that column changes the label without rewriting the formula - which is the
// whole reason the stored form uses ids rather than names.
//
// Only columns from the same instrument are offered. A UUC column derived from a
// master reading is not a derived column, it is an error calculation, and the Error
// row already covers that.
//
// The typed fallback stays: a formula the palette cannot build can still be written by
// hand, and anything already stored opens without being rewritten. It shows column
// names rather than the stored ids - {fld-mtlg4ufz-10} cannot be typed correctly by
// anyone and cannot be checked by eye - and converts back on the way in.

import { useRef, useState, type KeyboardEvent } from 'react'
import { AlertTriangle, CheckCircle2, Delete, Keyboard, MousePointerClick } from 'lucide-react'
import {
  checkExpression,
  expressionFromDisplay,
  expressionToDisplay,
  isExpressionFunction,
  evaluateExpression,
  formatToPrecision,
  tokenizeExpression,
  tokensToExpression,
  type ExpressionToken,
  type FieldDefinition,
} from '@/lib/certificate-fields'
import { cn } from '@/lib/utils'

interface FormulaEditorProps {
  field: FieldDefinition
  fields: FieldDefinition[]
  disabled?: boolean
  /**
   * A row of entered values used to show what the formula produces. Optional - without
   * it the preview line is omitted rather than shown empty, since a made-up row would
   * be worse than none.
   */
  sampleValues?: Record<string, string>
  /** Decimal places for the preview, from the column's instrument. */
  precision?: number
  onChange: (expression: string) => void
}

const OPERATOR_KEYS: { value: '+' | '-' | '*' | '/' | '^'; label: string }[] = [
  { value: '+', label: '+' },
  { value: '-', label: '−' },
  { value: '*', label: '×' },
  { value: '/', label: '÷' },
  { value: '^', label: '^' },
]

const FUNCTION_KEYS = [
  { value: 'log', label: 'log₁₀' },
  { value: 'ln', label: 'ln' },
  { value: 'exp', label: 'e^' },
] as const

const KEY =
  'rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40'

export function FormulaEditor({
  field,
  fields,
  disabled,
  sampleValues,
  precision = 2,
  onChange,
}: FormulaEditorProps) {
  const tokens = tokenizeExpression(field.expression)
  // A formula the token model cannot represent opens in the typed fallback rather than
  // being silently rewritten into something it is not.
  const [typing, setTyping] = useState(tokens === null)
  const [buffer, setBuffer] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const available = fields.filter(
    (f) => f.id !== field.id && f.type !== 'text' && f.group === field.group,
  )
  const nameOf = (id: string) => fields.find((f) => f.id === id)?.name || 'Untitled'
  // Read through a Map: the ids come from the formula, so indexing the object directly
  // is an injection sink.
  const sample = new Map(Object.entries(sampleValues ?? {}))
  const sampleFor = (id: string) => sample.get(id) ?? '—'

  const check = checkExpression(field.expression, { field, fields })

  const emit = (next: ExpressionToken[]) => onChange(tokensToExpression(next))
  const append = (token: ExpressionToken) => emit([...(tokens ?? []), token])
  const backspace = () => emit((tokens ?? []).slice(0, -1))

  /**
   * Commit whatever has been typed. A function name becomes a function token, a number
   * becomes a number token, and anything else is left in the buffer rather than thrown
   * away - the engineer can see what they typed and fix it.
   */
  const commitBuffer = (): ExpressionToken[] | null => {
    const text = buffer.trim()
    if (text === '') return tokens ?? []
    let token: ExpressionToken | null = null
    if (isExpressionFunction(text)) token = { kind: 'function', value: text }
    else if (Number.isFinite(Number(text))) token = { kind: 'number', value: text }
    if (!token) return null
    const next = [...(tokens ?? []), token]
    setBuffer('')
    emit(next)
    return next
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const key = event.key

    if (key === 'Backspace' && buffer === '') {
      if ((tokens ?? []).length === 0) return
      event.preventDefault()
      backspace()
      return
    }

    if ('+-*/^()'.includes(key) && key.length === 1) {
      event.preventDefault()
      const committed = commitBuffer()
      if (committed === null) return
      const token: ExpressionToken =
        key === '('
          ? { kind: 'open' }
          : key === ')'
            ? { kind: 'close' }
            : { kind: 'operator', value: key as '+' | '-' | '*' | '/' | '^' }
      emit([...committed, token])
      return
    }

    if (key === 'Enter' || key === ' ') {
      event.preventDefault()
      commitBuffer()
    }
  }

  const previewValue = (() => {
    if (!sampleValues || !check.ok) return null
    const resolved = evaluateExpression(field.expression, sampleValues)
    return resolved === null ? null : formatToPrecision(resolved, precision)
  })()

  if (typing) {
    return (
      <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/40 p-3">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={expressionToDisplay(field.expression, fields)}
            disabled={disabled}
            placeholder={
              available.length > 0 ? `{${available[0].name || 'Column'}} * 2` : '{Column} * 2'
            }
            aria-label={`Formula for ${field.name || 'field'}`}
            // Typed in names, stored as ids. Renaming a column then updates every
            // formula that uses it instead of breaking them.
            onChange={(e) => onChange(expressionFromDisplay(e.target.value, fields))}
            className="min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 py-1.5 font-mono text-xs text-slate-900 outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
          />
          <button
            type="button"
            disabled={disabled || tokens === null}
            title={
              tokens === null
                ? 'This formula is more than the builder can show'
                : undefined
            }
            onClick={() => setTyping(false)}
            className={cn(KEY, 'shrink-0 inline-flex items-center gap-1.5')}
          >
            <MousePointerClick className="h-3.5 w-3.5" />
            Use the builder
          </button>
        </div>
        <Status check={check} />
      </div>
    )
  }

  return (
    <div className="space-y-2.5 rounded-lg border border-slate-200 bg-slate-50/40 p-3">
      {/* The formula itself. Chips wrap, so a long formula grows downward rather than
          scrolling sideways out of view. */}
      <div
        className="flex min-h-[38px] flex-wrap items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1.5 focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/10"
        onClick={() => inputRef.current?.focus()}
      >
        {(tokens ?? []).map((token, index) => (
          <Token key={index} token={token} nameOf={nameOf} />
        ))}
        {/* Typing goes here. Numbers and function names build up in the buffer and
            commit on an operator, a bracket, space or Enter; operators and brackets
            commit immediately. Backspace on an empty buffer removes the previous
            token whole, which is the point of tokens in the first place. */}
        <input
          ref={inputRef}
          type="text"
          value={buffer}
          disabled={disabled}
          placeholder={
            (tokens ?? []).length === 0
              ? 'Type a formula, or use the buttons below'
              : ''
          }
          aria-label={`Formula for ${field.name || 'field'}`}
          onChange={(e) => setBuffer(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={commitBuffer}
          className="min-w-[12rem] flex-1 bg-transparent px-0.5 text-xs text-slate-900 outline-none placeholder:text-slate-300 disabled:cursor-not-allowed"
        />
      </div>

      {/* Palette: columns first, since that is what a formula is mostly made of. */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          Insert
        </span>
        {available.length === 0 ? (
          <span className="text-xs text-slate-400">
            No other {field.group === 'master' ? 'master' : 'UUC'} columns to reference yet.
          </span>
        ) : (
          available.map((f) => (
            <button
              key={f.id}
              type="button"
              disabled={disabled}
              onClick={() => append({ kind: 'field', fieldId: f.id })}
              className={cn(KEY, 'border-primary/20 bg-primary/5 text-primary')}
            >
              {f.name || 'Untitled'}
            </button>
          ))
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {OPERATOR_KEYS.map((o) => (
          <button
            key={o.value}
            type="button"
            disabled={disabled}
            aria-label={`Insert ${o.label}`}
            onClick={() => append({ kind: 'operator', value: o.value })}
            className={cn(KEY, 'w-9 text-center')}
          >
            {o.label}
          </button>
        ))}
        {FUNCTION_KEYS.map((f) => (
          <button
            key={f.value}
            type="button"
            disabled={disabled}
            onClick={() => {
              // A function is always followed by its bracket, so both go in together -
              // typing one without the other is never what was meant.
              emit([...(tokens ?? []), { kind: 'function', value: f.value }, { kind: 'open' }])
            }}
            className={KEY}
          >
            {f.label}
          </button>
        ))}
        <button
          type="button"
          disabled={disabled}
          aria-label="Insert opening bracket"
          onClick={() => append({ kind: 'open' })}
          className={cn(KEY, 'w-9 text-center')}
        >
          (
        </button>
        <button
          type="button"
          disabled={disabled}
          aria-label="Insert closing bracket"
          onClick={() => append({ kind: 'close' })}
          className={cn(KEY, 'w-9 text-center')}
        >
          )
        </button>
        <button
          type="button"
          disabled={disabled || (tokens ?? []).length === 0}
          aria-label="Delete last item"
          onClick={backspace}
          className={cn(KEY, 'inline-flex items-center gap-1')}
        >
          <Delete className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
        <Status check={check} />
        <button
          type="button"
          disabled={disabled}
          onClick={() => setTyping(true)}
          className="inline-flex shrink-0 items-center gap-1.5 text-[11px] text-slate-500 underline underline-offset-2 hover:text-slate-700"
        >
          <Keyboard className="h-3.5 w-3.5" />
          Type it instead
        </button>
      </div>

      {previewValue !== null && (
        <p className="border-t border-slate-200 pt-2 text-[11px] text-slate-500">
          <span className="font-medium text-slate-600">Preview</span>{' '}
          {check.referenced
            .map((id) => `${nameOf(id)} ${sampleFor(id)}`)
            .join(' · ')}{' '}
          <span className="text-slate-400">⟶</span>{' '}
          <span className="font-medium text-slate-700">
            {field.name || 'Result'} = {previewValue}
            {field.unit ? ` ${field.unit}` : ''}
          </span>
        </p>
      )}
    </div>
  )
}

function Token({
  token,
  nameOf,
}: {
  token: ExpressionToken
  nameOf: (id: string) => string
}) {
  if (token.kind === 'field') {
    return (
      <span className="rounded border border-primary/20 bg-primary/5 px-1.5 py-0.5 text-xs font-medium text-primary">
        {nameOf(token.fieldId)}
      </span>
    )
  }
  if (token.kind === 'number') {
    return <span className="px-0.5 text-xs tabular-nums text-slate-700">{token.value}</span>
  }
  if (token.kind === 'function') {
    return (
      <span className="px-0.5 text-xs font-medium text-slate-600">
        {token.value === 'exp' ? 'e^' : token.value}
      </span>
    )
  }
  const symbol =
    token.kind === 'open'
      ? '('
      : token.kind === 'close'
        ? ')'
        : token.value === '*'
          ? '×'
          : token.value === '/'
            ? '÷'
            : token.value === '-'
              ? '−'
              : token.value
  return <span className="px-0.5 text-xs text-slate-400">{symbol}</span>
}

function Status({ check }: { check: ReturnType<typeof checkExpression> }) {
  if (check.ok) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] text-emerald-700">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Valid · {check.referenced.length} column
        {check.referenced.length === 1 ? '' : 's'} referenced
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-amber-700">
      <AlertTriangle className="h-3.5 w-3.5" />
      {check.problem}
    </span>
  )
}
