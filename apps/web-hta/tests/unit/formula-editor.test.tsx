/**
 * Free-form formula editor for Section 05 expression columns.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { FormulaEditor } from '@/components/forms/FormulaEditor'
import {
  checkExpression,
  expressionFromDisplay,
  expressionToDisplay,
  tokenizeExpression,
  tokensToExpression,
  type FieldDefinition,
} from '@/lib/certificate-fields'

const fields: FieldDefinition[] = [
  { id: 'm1', name: 'Std Reading', group: 'master', type: 'numeric', unit: '°C', order: 0 },
  { id: 'u1', name: 'UUC Reading', group: 'uuc', type: 'numeric', unit: 'mV', order: 0 },
  { id: 'u2', name: 'Cold Junction', group: 'uuc', type: 'numeric', unit: 'mV', order: 1 },
  { id: 'u3', name: 'UUC Status', group: 'uuc', type: 'text', unit: '', order: 2 },
  {
    id: 'u4',
    name: 'Corrected mV',
    group: 'uuc',
    type: 'expression',
    unit: 'mV',
    order: 3,
    expression: '{u1} + {u2}',
  },
]

function renderEditor(overrides: Partial<Parameters<typeof FormulaEditor>[0]> = {}) {
  const props = {
    field: fields[4],
    fields,
    onChange: vi.fn(),
    ...overrides,
  }
  return { ...render(<FormulaEditor {...props} />), props }
}

describe('FormulaEditor', () => {
  it('renders each reference as its column name, not its id', () => {
    renderEditor()
    // Each referenced column appears twice: once as a chip in the formula, once as a
    // palette button. The chip is the span.
    const chips = screen
      .getAllByText(/UUC Reading|Cold Junction/)
      .filter((el) => el.tagName === 'SPAN')
    expect(chips.map((el) => el.textContent)).toEqual(['UUC Reading', 'Cold Junction'])
    expect(screen.queryByText(/\{u1\}/)).not.toBeInTheDocument()
  })

  it('offers only same-side numeric columns to insert', () => {
    renderEditor()
    // Palette buttons carry the column names. The master column is absent, and so are
    // the text column and the formula's own row.
    expect(screen.getAllByRole('button', { name: 'UUC Reading' })).toHaveLength(1)
    expect(screen.queryByRole('button', { name: 'Std Reading' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'UUC Status' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Corrected mV' })).not.toBeInTheDocument()
  })

  it('appends a column reference by id', () => {
    const { props } = renderEditor()
    fireEvent.click(screen.getByRole('button', { name: 'Cold Junction' }))
    expect(props.onChange).toHaveBeenCalledWith('{u1} + {u2} {u2}')
  })

  it('inserts a function together with its opening bracket', () => {
    const { props } = renderEditor({ field: { ...fields[4], expression: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'log₁₀' }))
    expect(props.onChange).toHaveBeenCalledWith('log (')
  })

  it('deletes a whole reference in one step, not one character', () => {
    const { props } = renderEditor()
    fireEvent.click(screen.getByLabelText('Delete last item'))
    expect(props.onChange).toHaveBeenCalledWith('{u1} +')
  })

  it('will not delete from an empty formula', () => {
    renderEditor({ field: { ...fields[4], expression: '' } })
    expect(screen.getByLabelText('Delete last item')).toBeDisabled()
  })

  it('lets a number be typed straight into the formula', () => {
    const { props } = renderEditor()
    const input = screen.getByLabelText(/Formula for Corrected mV/i)
    fireEvent.change(input, { target: { value: '2.5' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(props.onChange).toHaveBeenCalledWith('{u1} + {u2} 2.5')
  })

  it('commits what is typed when an operator is pressed', () => {
    const { props } = renderEditor({ field: { ...fields[4], expression: '' } })
    const input = screen.getByLabelText(/Formula for Corrected mV/i)
    fireEvent.change(input, { target: { value: '3' } })
    fireEvent.keyDown(input, { key: '*' })
    expect(props.onChange).toHaveBeenLastCalledWith('3 *')
  })

  it('reads a typed function name as a function', () => {
    const { props } = renderEditor({ field: { ...fields[4], expression: '' } })
    const input = screen.getByLabelText(/Formula for Corrected mV/i)
    fireEvent.change(input, { target: { value: 'log' } })
    fireEvent.keyDown(input, { key: '(' })
    expect(props.onChange).toHaveBeenLastCalledWith('log (')
  })

  it('backspaces a whole token once what was typed is cleared', () => {
    const { props } = renderEditor()
    const input = screen.getByLabelText(/Formula for Corrected mV/i)
    fireEvent.keyDown(input, { key: 'Backspace' })
    expect(props.onChange).toHaveBeenCalledWith('{u1} +')
  })

  it('keeps an entry it cannot read rather than discarding it', () => {
    const { props } = renderEditor()
    const input = screen.getByLabelText(/Formula for Corrected mV/i)
    fireEvent.change(input, { target: { value: 'abc' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(props.onChange).not.toHaveBeenCalled()
    expect(input).toHaveValue('abc')
  })

  it('reports a valid formula with the number of columns it reads', () => {
    renderEditor()
    expect(screen.getByText(/Valid · 2 columns referenced/)).toBeInTheDocument()
  })

  it('explains an unbalanced formula rather than just failing', () => {
    renderEditor({ field: { ...fields[4], expression: '( {u1} + {u2}' } })
    expect(screen.getByText(/incomplete or unbalanced/i)).toBeInTheDocument()
  })

  it('previews against the entered row', () => {
    renderEditor({ sampleValues: { u1: '12.40', u2: '0.35' }, precision: 2 })
    expect(screen.getByText(/Corrected mV = 12.75/)).toBeInTheDocument()
  })

  it('omits the preview when nothing has been entered', () => {
    renderEditor()
    expect(screen.queryByText('Preview')).not.toBeInTheDocument()
  })

  it('opens in the typed fallback for a formula the builder cannot show', () => {
    // A stray identifier is not something the token model can represent.
    renderEditor({ field: { ...fields[4], expression: '{u1} @@ 2' } })
    expect(screen.getByLabelText(/Formula for Corrected mV/i)).toHaveValue(
      '{UUC Reading} @@ 2',
    )
    expect(screen.getByRole('button', { name: /Use the builder/i })).toBeDisabled()
    // No palette in the fallback - it is a raw text field.
    expect(screen.queryByRole('button', { name: 'UUC Reading' })).not.toBeInTheDocument()
  })

  it('can switch to typing and back', () => {
    renderEditor()
    fireEvent.click(screen.getByRole('button', { name: /Type it instead/i }))
    // Names, not the stored ids.
    expect(screen.getByLabelText(/Formula for Corrected mV/i)).toHaveValue(
      '{UUC Reading} + {Cold Junction}',
    )
    fireEvent.click(screen.getByRole('button', { name: /Use the builder/i }))
    expect(screen.getByRole('button', { name: 'UUC Reading' })).toBeInTheDocument()
  })
})

describe('typed formulas are written in names, stored as ids', () => {
  it('stores a typed column name as its id', () => {
    const { props } = renderEditor()
    fireEvent.click(screen.getByRole('button', { name: /Type it instead/i }))
    fireEvent.change(screen.getByLabelText(/Formula for Corrected mV/i), {
      target: { value: '{UUC Reading} * 2' },
    })
    expect(props.onChange).toHaveBeenCalledWith('{u1} * 2')
  })

  it('matches a name regardless of case and surrounding space', () => {
    expect(expressionFromDisplay('{ uuc reading } + 1', fields)).toBe('{u1} + 1')
  })

  it('leaves an unknown name alone so it is reported, not bound to something else', () => {
    expect(expressionFromDisplay('{Nonexistent} + 1', fields)).toBe('{Nonexistent} + 1')
    expect(
      checkExpression('{Nonexistent} + 1', { field: fields[4], fields }).problem,
    ).toMatch(/no longer exists/i)
  })

  it('refuses to guess when two columns share a name', () => {
    const twins: FieldDefinition[] = [
      ...fields,
      { id: 'u9', name: 'UUC Reading', group: 'uuc', type: 'numeric', unit: 'mV', order: 9 },
    ]
    // Binding to whichever came first would be a silent wrong answer.
    expect(expressionFromDisplay('{UUC Reading} + 1', twins)).toBe('{UUC Reading} + 1')
  })

  it('still accepts an id typed directly', () => {
    expect(expressionFromDisplay('{u1} + 1', fields)).toBe('{u1} + 1')
  })

  it('round-trips a formula through display and back', () => {
    const stored = '( {u1} + {u2} ) * 2'
    expect(expressionFromDisplay(expressionToDisplay(stored, fields), fields)).toBe(stored)
  })

  it('leaves an id with no column as it is', () => {
    expect(expressionToDisplay('{gone} + 1', fields)).toBe('{gone} + 1')
  })
})

describe('checkExpression', () => {
  const check = (expression: string, field = fields[4]) =>
    checkExpression(expression, { field, fields })

  it('rejects a reference to the other instrument', () => {
    expect(check('{m1} * 2').problem).toMatch(/other instrument/i)
  })

  it('rejects a reference to a text column', () => {
    expect(check('{u3} * 2').problem).toMatch(/holds text/i)
  })

  it('rejects a self reference', () => {
    expect(check('{u4} + 1').problem).toMatch(/its own column/i)
  })

  it('rejects a reference to a column that has gone', () => {
    expect(check('{gone} + 1').problem).toMatch(/no longer exists/i)
  })

  it('rejects an indirect cycle', () => {
    const cyclic: FieldDefinition[] = [
      { id: 'a', name: 'A', group: 'uuc', type: 'expression', unit: '', order: 0, expression: '{b} + 1' },
      { id: 'b', name: 'B', group: 'uuc', type: 'expression', unit: '', order: 1, expression: '{a} + 1' },
    ]
    expect(checkExpression('{b} + 1', { field: cyclic[0], fields: cyclic }).problem).toMatch(
      /depending on itself/i,
    )
  })

  it('does not call division by a column a failure', () => {
    // Probed with 1 rather than 0, so a legitimate division is not reported as
    // divide-by-zero before any data exists.
    expect(check('{u1} / {u2}').ok).toBe(true)
  })

  it('accepts nested functions and powers', () => {
    expect(check('log( {u1} ) ^ 2 + ln( {u2} )').ok).toBe(true)
  })
})

describe('token round-trip', () => {
  it('survives a trip through tokens unchanged in meaning', () => {
    const tokens = tokenizeExpression('( {u1} + {u2} ) * 2 ^ 3')
    expect(tokens).not.toBeNull()
    expect(tokensToExpression(tokens!)).toBe('( {u1} + {u2} ) * 2 ^ 3')
  })

  it('returns null for something it cannot represent', () => {
    expect(tokenizeExpression('{u1} @@ 2')).toBeNull()
  })

  it('treats an empty formula as no tokens rather than an error', () => {
    expect(tokenizeExpression('')).toEqual([])
  })
})
