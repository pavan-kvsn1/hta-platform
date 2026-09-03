'use client'

// Formula editor for a Section 05 expression column.
//
// The formula is typed, not assembled. A palette of chips and operator keys was more
// chrome than the job needs - people write ( a + b ) * c faster than they can click it
// - so the input is the whole editor and the space goes to showing the working.
//
// It is written in column names and stored as ids. An id like {fld-mtlg4ufz-10} cannot
// be typed correctly by anyone and cannot be checked by eye, and a mistyped one is
// still syntactically valid - it parses cleanly and references nothing. Names convert
// to ids on the way in; storage keeps ids so renaming a column relabels every formula
// that uses it rather than breaking them.
//
// Below the input is the working: the formula, the same formula with the row's
// readings substituted, then one line per operation. When a computed column looks
// wrong, the line where it goes wrong is the thing worth seeing.

import { useLayoutEffect, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight } from 'lucide-react'
import {
  checkExpression,
  expressionFromDisplay,
  expressionToDisplay,
  formatToPrecision,
  formulaBreakdown,
  type FieldDefinition,
} from '@/lib/certificate-fields'
import { cn } from '@/lib/utils'

interface FormulaEditorProps {
  field: FieldDefinition
  fields: FieldDefinition[]
  disabled?: boolean
  /**
   * A row of entered values, used to work the formula through against real readings.
   * Without it only the formula line is shown - an invented row would be worse.
   */
  sampleValues?: Record<string, string>
  /** Decimal places for the result, from the column's instrument. */
  precision?: number
  onChange: (expression: string) => void
}

export function FormulaEditor({
  field,
  fields,
  disabled,
  sampleValues,
  precision = 2,
  onChange,
}: FormulaEditorProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null)
  // The working is worth seeing while a formula is being written and worth folding
  // away once it is settled, so it starts open and stays where the engineer puts it.
  const [showWorking, setShowWorking] = useState(true)

  // Height follows the content. Reset first, or the box can only ever grow.
  useLayoutEffect(() => {
    const node = inputRef.current
    if (!node) return
    node.style.height = 'auto'
    node.style.height = `${node.scrollHeight}px`
  }, [field.expression, fields])
  const candidates = fields.filter(
    (f) => f.id !== field.id && f.type !== 'text' && f.group === field.group,
  )
  // A formula names its columns, so a column with no name cannot be referenced -
  // {Untitled} matches nothing and inserting it just produces a broken formula.
  const available = candidates.filter((f) => f.name.trim() !== '')
  const unnamed = candidates.length - available.length
  const display = expressionToDisplay(field.expression, fields)
  const check = checkExpression(field.expression, { field, fields })
  const breakdown = formulaBreakdown(field.expression, { fields, values: sampleValues })

  // More than one step means the readings actually went in; one step is the formula
  // alone, which is what happens before anything is entered.
  const worked = (breakdown?.steps.length ?? 0) > 1

  const appendColumn = (name: string) =>
    onChange(
      expressionFromDisplay(`${display}${display ? ' ' : ''}{${name}}`, fields),
    )

  return (
    <div className="space-y-2.5 rounded-lg border border-slate-200 bg-slate-50/40 p-3">
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-xs text-slate-400">=</span>
        {/* A textarea rather than an input: a formula naming three or four columns is
            longer than the panel is wide, and a one-line field scrolls it out of sight
            just when it most needs checking. It grows to fit instead. */}
        <textarea
          ref={inputRef}
          rows={1}
          value={display}
          disabled={disabled}
          spellCheck={false}
          placeholder={
            available.length > 0
              ? `{${available[0].name || 'Column'}} * 2`
              : 'Add another column to reference'
          }
          aria-label={`Formula for ${field.name || 'field'}`}
          onChange={(e) => onChange(expressionFromDisplay(e.target.value, fields))}
          className="min-w-0 flex-1 resize-none overflow-hidden rounded-md border border-slate-200 bg-white px-2 py-1.5 font-mono text-xs leading-5 text-slate-900 outline-none transition-colors hover:border-slate-300 focus:border-primary/40 focus:ring-2 focus:ring-primary/10 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
        />
      </div>

      {/* The columns that can be named, so they need not be remembered or guessed. */}
      {candidates.length > 0 && (
        <p className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1 text-[11px] text-slate-400">
          <span>Columns:</span>
          {available.map((f) => (
            <button
              key={f.id}
              type="button"
              disabled={disabled}
              title="Add to the formula"
              onClick={() => appendColumn(f.name)}
              className="rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[11px] text-slate-600 transition-colors hover:border-primary/30 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              {`{${f.name}}`}
            </button>
          ))}
          {unnamed > 0 && (
            <span className="text-slate-300">
              ({unnamed} unnamed column{unnamed === 1 ? '' : 's'} cannot be referenced
              until named)
            </span>
          )}
        </p>
      )}

      <Status check={check} />

      {check.ok && breakdown && (
        <div className="space-y-1 border-t border-slate-200 pt-2">
          <button
            type="button"
            onClick={() => setShowWorking((open) => !open)}
            aria-expanded={showWorking}
            className="-ml-1 inline-flex items-center gap-1 rounded px-1 py-0.5 text-left transition-colors hover:bg-slate-100"
          >
            {showWorking ? (
              <ChevronDown className="h-3 w-3 text-slate-400" />
            ) : (
              <ChevronRight className="h-3 w-3 text-slate-400" />
            )}
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              {worked ? 'Working, from the first row entered' : 'Formula'}
            </span>
            {/* Collapsed, the answer is still worth having - it is the line most often
                being checked. */}
            {!showWorking && worked && breakdown.result !== null && (
              <span className="font-mono text-[11px] text-slate-600">
                = {formatToPrecision(breakdown.result, precision)}
                {field.unit ? ` ${field.unit}` : ''}
              </span>
            )}
          </button>

          {showWorking && (
            <>
          <ol className="space-y-0.5 font-mono text-[11px] leading-5 text-slate-500">
            {breakdown.steps.map((step, index) => {
              const last = index === breakdown.steps.length - 1
              return (
                <li
                  key={index}
                  className={cn(
                    'flex items-start gap-1',
                    last && worked && 'font-medium text-slate-800',
                  )}
                >
                  {/* The sign hangs in the margin, so a step too long for one line
                      wraps under its own first character rather than under the sign.
                      The opening line has none, so the formula starts flush. */}
                  {index > 0 && <span className="shrink-0 text-slate-300">=</span>}
                  <span className="min-w-0 flex-1 break-words">
                    {step}
                    {last && worked && breakdown.result !== null && field.unit
                      ? ` ${field.unit}`
                      : ''}
                  </span>
                </li>
              )
            })}
          </ol>

          {worked ? (
            <>
              {breakdown.result !== null && (
                <p className="pt-1 text-[11px] text-slate-500">
                  Recorded at this column&rsquo;s resolution as{' '}
                  <span className="font-medium tabular-nums text-slate-700">
                    {formatToPrecision(breakdown.result, precision)}
                    {field.unit ? ` ${field.unit}` : ''}
                  </span>
                </p>
              )}
              {breakdown.columns.length > 0 && (
                <p className="flex flex-wrap gap-x-3 gap-y-0.5 pt-1 text-[11px] text-slate-400">
                  <span>Columns used</span>
                  {breakdown.columns.map((column) => (
                    <span key={column.id}>
                      {column.name}{' '}
                      <span className="tabular-nums text-slate-600">
                        {column.value === '' ? '—' : column.value}
                      </span>
                    </span>
                  ))}
                </p>
              )}
            </>
          ) : (
            breakdown.columns.length > 0 && (
              <p className="pt-1 text-[11px] text-slate-400">
                Enter a row to see this worked through.
              </p>
            )
          )}
            </>
          )}
        </div>
      )}
    </div>
  )
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
