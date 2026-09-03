/**
 * Free-form formula editor for Section 05 expression columns.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { FormulaEditor } from '@/components/forms/FormulaEditor'
import {
  checkExpression,
  formulaBreakdown,
  expressionFromDisplay,
  expressionToDisplay,
  tokenizeExpression,
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
  it('shows the formula in column names, not stored ids', () => {
    renderEditor()
    expect(screen.getByLabelText(/Formula for Corrected mV/i)).toHaveValue(
      '{UUC Reading} + {Cold Junction}',
    )
  })

  it('lists the columns that can be referenced', () => {
    renderEditor()
    expect(screen.getByRole('button', { name: '{UUC Reading}' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '{Cold Junction}' })).toBeInTheDocument()
    // The master column, the text column and the formula's own column are not offered.
    expect(screen.queryByRole('button', { name: '{Std Reading}' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '{UUC Status}' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '{Corrected mV}' })).not.toBeInTheDocument()
  })

  it('appends a column when its name is clicked, storing the id', () => {
    const { props } = renderEditor({ field: { ...fields[4], expression: '' } })
    fireEvent.click(screen.getByRole('button', { name: '{Cold Junction}' }))
    expect(props.onChange).toHaveBeenCalledWith('{u2}')
  })

  it('reports a valid formula with the number of columns it reads', () => {
    renderEditor()
    expect(screen.getByText(/Valid · 2 columns referenced/)).toBeInTheDocument()
  })

  it('explains an unbalanced formula rather than just failing', () => {
    renderEditor({ field: { ...fields[4], expression: '( {u1} + {u2}' } })
    expect(screen.getByText(/incomplete or unbalanced/i)).toBeInTheDocument()
  })

  it('shows the working one operation at a time', () => {
    renderEditor({
      field: { ...fields[4], expression: '( {u1} + {u2} ) * 2' },
      sampleValues: { u1: '12.40', u2: '0.35' },
    })
    // Each line after the first is prefixed with "=" in the markup.
    const steps = screen
      .getAllByRole('listitem')
      .map((li) => (li.textContent ?? '').replace(/^=/, ''))
    expect(steps).toEqual([
      '( UUC Reading + Cold Junction ) × 2',
      '( 12.4 + 0.35 ) × 2',
      '12.75 × 2',
      '25.5 mV',
    ])
  })

  it('shows only the formula until a row is entered', () => {
    renderEditor()
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    expect(screen.getByText(/Enter a row to see this worked through/i)).toBeInTheDocument()
  })

  it('lists the columns used with the values they took', () => {
    renderEditor({ sampleValues: { u1: '12.40', u2: '0.35' } })
    const used = screen.getByText('Columns used').parentElement
    expect(used?.textContent).toContain('UUC Reading 12.40')
    expect(used?.textContent).toContain('Cold Junction 0.35')
  })

  it('states the result at the column resolution, separate from the working', () => {
    renderEditor({ sampleValues: { u1: '12.404', u2: '0.35' }, precision: 2 })
    // The working keeps the full value; the recorded line rounds it.
    expect(screen.getByText(/Recorded at this column/)).toHaveTextContent('12.75 mV')
  })

  it('omits the working when the formula is not usable', () => {
    renderEditor({
      field: { ...fields[4], expression: '{m1} * 2' },
      sampleValues: { m1: '10' },
    })
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument()
    expect(screen.getByText(/other instrument/i)).toBeInTheDocument()
  })
})

describe('typed formulas are written in names, stored as ids', () => {
  it('stores a typed column name as its id', () => {
    const { props } = renderEditor()
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
  it('returns null for something it cannot represent', () => {
    expect(tokenizeExpression('{u1} @@ 2')).toBeNull()
  })

  it('treats an empty formula as no tokens rather than an error', () => {
    expect(tokenizeExpression('')).toEqual([])
  })
})

describe('formulaBreakdown', () => {
  const uuc: FieldDefinition[] = [
    { id: 'a', name: 'A', group: 'uuc', type: 'numeric', unit: 'mV', order: 0 },
    { id: 'b', name: 'B', group: 'uuc', type: 'numeric', unit: 'mV', order: 1 },
    { id: 'c', name: 'Gain', group: 'uuc', type: 'numeric', unit: '', order: 2 },
  ]
  const steps = (expression: string, values?: Record<string, string>) =>
    formulaBreakdown(expression, { fields: uuc, values })?.steps

  it('works through one operation per line', () => {
    expect(steps('( {a} + {b} ) * {c}', { a: '12.4', b: '0.35', c: '1.02' })).toEqual([
      '( A + B ) × Gain',
      '( 12.4 + 0.35 ) × 1.02',
      '12.75 × 1.02',
      '13.005',
    ])
  })

  it('respects precedence rather than going left to right', () => {
    // 2 + 3 * 4 multiplies first.
    expect(steps('{a} + {b} * {c}', { a: '2', b: '3', c: '4' })).toEqual([
      'A + B × Gain',
      '2 + 3 × 4',
      '2 + 12',
      '14',
    ])
  })

  it('keeps brackets only where they change the meaning', () => {
    expect(steps('( {a} + {b} ) * {c}')).toEqual(['( A + B ) × Gain'])
    expect(steps('{a} + {b} * {c}')).toEqual(['A + B × Gain'])
    // Subtraction and division are not associative, so the right operand keeps its
    // brackets even though the precedence is equal.
    expect(steps('{a} - ( {b} - {c} )')).toEqual(['A − ( B − Gain )'])
    expect(steps('{a} / ( {b} / {c} )')).toEqual(['A ÷ ( B ÷ Gain )'])
  })

  it('shows a function collapsing to its value', () => {
    expect(steps('log( {a} ) + 1', { a: '100' })).toEqual([
      'log( A ) + 1',
      'log( 100 ) + 1',
      '2 + 1',
      '3',
    ])
  })

  it('shows the formula alone when no readings are given', () => {
    expect(steps('{a} + {b}')).toEqual(['A + B'])
  })

  it('shows the formula alone when a referenced column is empty', () => {
    // Substituting a blank would invent a reading.
    expect(steps('{a} + {b}', { a: '1', b: '' })).toEqual(['A + B'])
  })

  it('reports the result and the columns it used', () => {
    const result = formulaBreakdown('{a} * {c}', {
      fields: uuc,
      values: { a: '2.5', c: '4' },
    })
    expect(result?.result).toBe(10)
    expect(result?.columns).toEqual([
      { id: 'a', name: 'A', value: '2.5' },
      { id: 'c', name: 'Gain', value: '4' },
    ])
  })

  it('stops without a result rather than dividing by zero', () => {
    const result = formulaBreakdown('{a} / {b}', { fields: uuc, values: { a: '1', b: '0' } })
    expect(result?.result).toBeNull()
    expect(result?.steps.at(-1)).toBe('1 ÷ 0')
  })

  it('stops where a function leaves its domain', () => {
    const result = formulaBreakdown('log( {a} )', { fields: uuc, values: { a: '0' } })
    expect(result?.result).toBeNull()
    expect(result?.steps.at(-1)).toBe('log( 0 )')
  })

  it('does not let floating point noise into the working', () => {
    // 0.1 + 0.2 is 0.30000000000000004 in binary floating point.
    expect(steps('{a} + {b}', { a: '0.1', b: '0.2' })?.at(-1)).toBe('0.3')
  })

  it('returns null for a formula it cannot parse', () => {
    expect(formulaBreakdown('{a} +', { fields: uuc })).toBeNull()
    expect(formulaBreakdown('', { fields: uuc })).toBeNull()
  })

  it('names a column that no longer exists by its id rather than crashing', () => {
    expect(steps('{gone} + 1')).toEqual(['gone + 1'])
  })

  it('cannot be made to loop forever by a long formula', () => {
    const long = Array.from({ length: 40 }, () => '1').join(' + ')
    const result = formulaBreakdown(long, { fields: uuc, maxSteps: 5 })
    expect(result?.steps.length).toBeLessThanOrEqual(6)
  })
})

describe('the working shows the formula that is actually computed', () => {
  const uuc: FieldDefinition[] = [
    { id: 'a', name: 'A', group: 'uuc', type: 'numeric', unit: 'mV', order: 0 },
    { id: 'b', name: 'B', group: 'uuc', type: 'numeric', unit: 'mV', order: 1 },
    { id: 'c', name: 'C', group: 'uuc', type: 'numeric', unit: 'mV', order: 2 },
  ]
  const line = (expression: string) =>
    formulaBreakdown(expression, { fields: uuc })?.steps[0]

  it('keeps the brackets around a product used as a divisor', () => {
    // Dropping these renders (x / a) * a, which is a different formula entirely.
    expect(line('({a} ^ 3 + 1) / ({b} * {c})')).toBe('( A ^ 3 + 1 ) ÷ ( B × C )')
  })

  it('keeps brackets on the right of a subtraction and a division', () => {
    expect(line('{a} - ({b} - {c})')).toBe('A − ( B − C )')
    expect(line('{a} - ({b} + {c})')).toBe('A − ( B + C )')
    expect(line('{a} / ({b} / {c})')).toBe('A ÷ ( B ÷ C )')
  })

  it('drops brackets that change nothing', () => {
    expect(line('({a} - {b}) - {c}')).toBe('A − B − C')
    expect(line('({a} + {b}) + {c}')).toBe('A + B + C')
    expect(line('({a} * {b}) / {c}')).toBe('A × B ÷ C')
    expect(line('{a} + ({b} * {c})')).toBe('A + B × C')
  })

  it('keeps brackets on the left of a power, which is right-associative', () => {
    expect(line('({a} ^ {b}) ^ {c}')).toBe('( A ^ B ) ^ C')
    expect(line('{a} ^ {b} ^ {c}')).toBe('A ^ B ^ C')
  })

  it('brackets a negative value next to an operator', () => {
    // -5 ^ 3 would read as -(5 ^ 3), a different formula even where the answer agrees.
    const steps = formulaBreakdown('{a} ^ 3', { fields: uuc, values: { a: '-5' } })?.steps
    expect(steps).toEqual(['A ^ 3', '( -5 ) ^ 3', '-125'])
  })

  it('renders the reported formula correctly through every step', () => {
    const steps = formulaBreakdown('({a} ^ 3 + 0.0001) / ({a} * {a})', {
      fields: uuc,
      values: { a: '-5' },
    })?.steps
    expect(steps).toEqual([
      '( A ^ 3 + 0.0001 ) ÷ ( A × A )',
      '( ( -5 ) ^ 3 + 0.0001 ) ÷ ( -5 × ( -5 ) )',
      '( -125 + 0.0001 ) ÷ ( -5 × ( -5 ) )',
      '-124.9999 ÷ ( -5 × ( -5 ) )',
      '-124.9999 ÷ 25',
      '-4.999996',
    ])
  })
})
