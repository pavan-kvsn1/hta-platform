/**
 * Section 05 dynamic table and column setup rendering tests.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { DynamicResultsTable } from '@/components/forms/DynamicResultsTable'
import { ColumnSetup } from '@/components/forms/ColumnSetup'
import type {
  CalibrationResultRow,
  ErrorConfig,
  FieldDefinition,
} from '@/lib/certificate-fields'

const fields: FieldDefinition[] = [
  { id: 'm1', name: 'Std Meter Reading', group: 'master', type: 'numeric', unit: 'kg/cm²', order: 0 },
  { id: 'u1', name: 'UUC Status', group: 'uuc', type: 'text', unit: '', order: 0 },
  { id: 'u2', name: 'UUC Reading', group: 'uuc', type: 'numeric', unit: 'kg/cm²', order: 1 },
  { id: 'u3', name: 'Derived mV', group: 'uuc', type: 'expression', unit: 'mV', order: 2, expression: '{u2} * 2' },
]

const errorConfig: ErrorConfig = {
  masterFieldId: 'm1',
  uucFieldId: 'u2',
  formula: 'A-B',
  unit: 'kg/cm²',
}

const rows: CalibrationResultRow[] = [
  {
    id: 'r1',
    pointNumber: 1,
    values: { m1: '6.02', u1: 'ON', u2: '6.00' },
    errorObserved: 0.02,
    isOutOfLimit: false,
  },
  {
    id: 'r2',
    pointNumber: 2,
    values: { m1: '5.99', u1: 'OFF', u2: '5.50' },
    errorObserved: -0.01,
    isOutOfLimit: true,
  },
]

function renderTable(overrides: Partial<Parameters<typeof DynamicResultsTable>[0]> = {}) {
  const props = {
    fields,
    rows,
    precision: 2,
    onValueChange: vi.fn(),
    onAddRow: vi.fn(),
    onRemoveRow: vi.fn(),
    ...overrides,
  }
  return { ...render(<DynamicResultsTable {...props} />), props }
}

describe('DynamicResultsTable', () => {
  it('groups columns under Master Instrument and UUC', () => {
    renderTable()
    const master = screen.getByText('Master Instrument')
    const uuc = screen.getByText('UUC')
    expect(master).toHaveAttribute('colspan', '1')
    expect(uuc).toHaveAttribute('colspan', '3')
  })

  it('puts the Master columns before the UUC ones', () => {
    renderTable()
    const [groupRow] = screen.getAllByRole('row')
    const groups = within(groupRow).getAllByRole('columnheader').map((th) => th.textContent)
    expect(groups.indexOf('Master Instrument')).toBeLessThan(groups.indexOf('UUC'))

    const headings = screen
      .getAllByRole('columnheader')
      .map((th) => th.textContent ?? '')
    expect(headings.indexOf('Std Meter Reading (kg/cm²)')).toBeLessThan(
      headings.indexOf('UUC Reading (kg/cm²)'),
    )
  })

  it('renders a column per field, with the unit on the same line as the name', () => {
    renderTable()
    expect(screen.getByText('Std Meter Reading (kg/cm²)')).toBeInTheDocument()
    expect(screen.getByText('UUC Reading (kg/cm²)')).toBeInTheDocument()
    expect(screen.getByText('Derived mV (mV)')).toBeInTheDocument()
  })

  it('omits the parentheses for a column with no unit', () => {
    renderTable()
    // UUC Status is a text field and carries no unit.
    expect(screen.getByText('UUC Status')).toBeInTheDocument()
  })

  it('never gives a reading a stepper - entry is manual only', () => {
    renderTable({ precision: 3 })
    const numeric = screen.getByLabelText('Std Meter Reading, point 1')
    // type=number would increment on arrow keys and on the scroll wheel, which can
    // change a recorded measurement without the engineer meaning to.
    expect(numeric).toHaveAttribute('type', 'text')
    expect(numeric).not.toHaveAttribute('step')
    expect(screen.queryAllByRole('spinbutton')).toHaveLength(0)
  })

  it('hints a decimal keypad for numeric fields but not for text ones', () => {
    renderTable()
    expect(screen.getByLabelText('Std Meter Reading, point 1')).toHaveAttribute(
      'inputmode',
      'decimal',
    )
    expect(screen.getByLabelText('UUC Status, point 1')).toHaveAttribute(
      'inputmode',
      'text',
    )
  })

  it('shows expression cells as computed read-only values, not inputs', () => {
    renderTable()
    // Derived mV = {u2} * 2, computed per row rather than entered, and rendered at the
    // column's resolution rather than as a bare float.
    expect(screen.getByText('12.00')).toBeInTheDocument()
    expect(screen.getByText('11.00')).toBeInTheDocument()
    expect(screen.queryByLabelText('Derived mV, point 1')).not.toBeInTheDocument()
  })

  it('renders a computed value at its own column resolution', () => {
    renderTable({
      precisionFor: (field: FieldDefinition) => (field.group === 'master' ? 1 : 3),
    })
    // The expression column is a UUC column, so it takes the UUC resolution.
    expect(screen.getByText('12.000')).toBeInTheDocument()
  })

  it('does not let floating point noise reach a computed cell', () => {
    renderTable({
      fields: [
        fields[0],
        {
          id: 'x1',
          name: 'Sum',
          group: 'uuc',
          type: 'expression',
          unit: 'mV',
          order: 0,
          expression: '{m1} + 0.1',
        },
      ],
      rows: [{ ...rows[0], values: { m1: '0.2' } }],
    })
    // 0.2 + 0.1 is 0.30000000000000004 in binary floating point.
    expect(screen.getByText('0.30')).toBeInTheDocument()
    expect(screen.queryByText(/0\.30000/)).not.toBeInTheDocument()
  })

  it('reports the entered value through onValueChange', () => {
    const { props } = renderTable()
    fireEvent.change(screen.getByLabelText('Std Meter Reading, point 1'), {
      target: { value: '6.05' },
    })
    expect(props.onValueChange).toHaveBeenCalledWith(0, 'm1', '6.05')
  })

  it('marks a failed point red and bold, on the row and its inputs', () => {
    renderTable()
    const fail = screen.getAllByText('Fail*')[0]
    const failedRow = fail.closest('tr')
    expect(failedRow).toHaveClass('text-red-700', 'font-bold')
    for (const input of within(failedRow!).getAllByRole('textbox')) {
      expect(input).toHaveClass('text-red-700', 'font-bold')
    }
  })

  it('shows Pass for a point inside the limit', () => {
    renderTable({ rows: [rows[0]] })
    expect(screen.getByText('Pass')).toBeInTheDocument()
  })

  it('shows a dash rather than a number when the error cannot be computed', () => {
    renderTable({
      rows: [{ ...rows[0], errorObserved: null }],
    })
    const table = screen.getByRole('table')
    expect(within(table).getAllByText('—').length).toBeGreaterThan(0)
  })

  it('will not remove the last remaining row', () => {
    renderTable({ rows: [rows[0]] })
    expect(screen.getByLabelText('Remove point 1')).toBeDisabled()
  })

  it('prompts to configure columns when there are none', () => {
    renderTable({ fields: [] })
    expect(screen.getByText(/No columns configured/i)).toBeInTheDocument()
  })

  it('disables every input when the form is locked', () => {
    renderTable({ disabled: true })
    expect(screen.getByLabelText('Std Meter Reading, point 1')).toBeDisabled()
    expect(screen.getByRole('button', { name: /Add measurement row/i })).toBeDisabled()
  })
})

describe('ColumnSetup', () => {
  function renderSetup(overrides: Partial<Parameters<typeof ColumnSetup>[0]> = {}) {
    const props = {
      fields,
      errorConfig,
      parameterUnit: 'kg/cm²',
      onChange: vi.fn(),
      ...overrides,
    }
    return { ...render(<ColumnSetup {...props} />), props }
  }

  it('summarises the schema on one line while collapsed', () => {
    renderSetup()
    expect(screen.getByText(/Master: Std Meter Reading \(numeric, kg\/cm²\)/)).toBeInTheDocument()
    expect(screen.queryByText('Error Computation')).not.toBeInTheDocument()
  })

  it('reveals the editor when expanded', () => {
    renderSetup()
    fireEvent.click(screen.getByRole('button', { expanded: false }))
    expect(screen.getByText('Error Computation')).toBeInTheDocument()
    expect(screen.getByText('Master Instrument Fields')).toBeInTheDocument()
  })

  it('offers only numeric fields of the matching side for error computation', () => {
    renderSetup()
    fireEvent.click(screen.getByRole('button', { expanded: false }))

    const fieldA = screen.getByLabelText(/Field A \(Master\)/i)
    expect(within(fieldA).getByText('Std Meter Reading')).toBeInTheDocument()

    const fieldB = screen.getByLabelText(/Field B \(UUC\)/i)
    // UUC Status is text and Derived mV is an expression, so neither may be picked.
    expect(within(fieldB).getByText('UUC Reading')).toBeInTheDocument()
    expect(within(fieldB).queryByText('UUC Status')).not.toBeInTheDocument()
    expect(within(fieldB).queryByText('Derived mV')).not.toBeInTheDocument()
  })

  it('offers only same-side columns to an expression', () => {
    // One master column and three UUC ones; Derived mV is the expression, so its
    // operands may be UUC columns only - a UUC column derived from a master reading
    // is an error calculation, which the Error row already covers.
    const withFieldOperand: FieldDefinition[] = [
      ...fields.filter((f) => f.id !== 'u3'),
      { id: 'u4', name: 'UUC Offset', group: 'uuc', type: 'numeric', unit: 'mV', order: 3 },
      {
        id: 'u3',
        name: 'Derived mV',
        group: 'uuc',
        type: 'expression',
        unit: 'mV',
        order: 4,
        expression: '{u2} * {u4}',
      },
    ]
    renderSetup({ fields: withFieldOperand })
    fireEvent.click(screen.getByRole('button', { expanded: false }))

    const source = screen.getByLabelText(/Source column for Derived mV/i)
    expect(within(source).getByText('UUC Reading')).toBeInTheDocument()
    expect(within(source).queryByText('Std Meter Reading')).not.toBeInTheDocument()

    const second = screen.getByLabelText(/Second column for Derived mV/i)
    expect(within(second).getByText('UUC Offset')).toBeInTheDocument()
    expect(within(second).queryByText('Std Meter Reading')).not.toBeInTheDocument()
  })

  it('keeps a half-finished expression while it is being built', () => {
    // A new formula column starts empty. Choosing a source before typing a value used
    // to round-trip through an empty stored formula, so the choice vanished.
    const withEmpty: FieldDefinition[] = [
      ...fields.filter((f) => f.id !== 'u3'),
      { id: 'u3', name: 'Derived mV', group: 'uuc', type: 'expression', unit: 'mV', order: 2 },
    ]
    const { props } = renderSetup({ fields: withEmpty })
    fireEvent.click(screen.getByRole('button', { expanded: false }))

    const source = screen.getByLabelText(/Source column for Derived mV/i)
    fireEvent.change(source, { target: { value: 'u2' } })
    expect(source).toHaveValue('u2')

    // Still a builder, not the raw-formula fallback.
    expect(screen.getByLabelText(/Value for Derived mV/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/Formula for Derived mV/i)).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText(/Value for Derived mV/i), {
      target: { value: '2' },
    })
    const [nextFields] = props.onChange.mock.calls.at(-1)!
    expect(nextFields.find((f: FieldDefinition) => f.id === 'u3')?.expression).toBe(
      '{u2} * 2',
    )
  })

  it('adds a field defaulted to the parameter unit', () => {
    const { props } = renderSetup()
    fireEvent.click(screen.getByRole('button', { expanded: false }))
    fireEvent.click(screen.getByRole('button', { name: /Add Master Field/i }))

    const [nextFields] = props.onChange.mock.calls[0]
    expect(nextFields).toHaveLength(fields.length + 1)
    expect(nextFields[nextFields.length - 1]).toMatchObject({
      group: 'master',
      type: 'numeric',
      unit: 'kg/cm²',
    })
  })

  it('clears the error reference and warns when its field is removed', () => {
    const { props, rerender } = renderSetup()
    fireEvent.click(screen.getByRole('button', { expanded: false }))
    fireEvent.click(screen.getByLabelText('Remove UUC Reading'))

    const [nextFields, nextConfig] = props.onChange.mock.calls[0]
    expect(nextConfig.uucFieldId).toBe('')

    rerender(
      <ColumnSetup
        fields={nextFields}
        errorConfig={nextConfig}
        parameterUnit="kg/cm²"
        onChange={props.onChange}
      />,
    )
    expect(screen.getByText(/Select both fields to compute the error column/i)).toBeInTheDocument()
  })

  it('flags an expression that refers back to itself', () => {
    renderSetup({
      fields: [
        ...fields,
        {
          id: 'x1',
          name: 'Loop',
          group: 'uuc',
          type: 'expression',
          unit: '',
          order: 3,
          expression: '{x1} + 1',
        },
      ],
    })
    fireEvent.click(screen.getByRole('button', { expanded: false }))
    expect(screen.getByText(/refers back to itself/i)).toBeInTheDocument()
  })
})

describe('ColumnSetup expression builder', () => {
  const withExpression: FieldDefinition[] = [
    { id: 'm1', name: 'Actual Temp', group: 'master', type: 'numeric', unit: '°C', order: 0 },
    { id: 'u1', name: 'Sensor mV', group: 'uuc', type: 'numeric', unit: 'mV', order: 0 },
    { id: 'u2', name: 'Derived', group: 'uuc', type: 'expression', unit: '°C', order: 1 },
  ]

  function renderSetup(fieldList = withExpression) {
    const onChange = vi.fn()
    render(
      <ColumnSetup
        fields={fieldList}
        errorConfig={{ masterFieldId: 'm1', uucFieldId: 'u1', formula: 'A-B', unit: '°C' }}
        parameterUnit="°C"
        onChange={onChange}
      />,
    )
    fireEvent.click(screen.getByRole('button', { expanded: false }))
    return onChange
  }

  it('offers a source column and operator instead of asking for a raw formula', () => {
    renderSetup()
    expect(screen.getByLabelText('Source column for Derived')).toBeInTheDocument()
    expect(screen.getByLabelText('Operator for Derived')).toBeInTheDocument()
    expect(screen.queryByLabelText('Formula for Derived')).not.toBeInTheDocument()
  })

  it('does not offer the field itself as its own source', () => {
    renderSetup()
    const source = screen.getByLabelText('Source column for Derived')
    expect(within(source).queryByText('Derived')).not.toBeInTheDocument()
    expect(within(source).getByText('Sensor mV')).toBeInTheDocument()
  })

  it('recomposes the formula when the operator changes', () => {
    const onChange = renderSetup([
      ...withExpression.slice(0, 2),
      { ...withExpression[2], expression: '{u1} * 0.001' },
    ])
    fireEvent.change(screen.getByLabelText('Operator for Derived'), {
      target: { value: '+' },
    })
    const [nextFields] = onChange.mock.calls.at(-1)!
    expect((nextFields as FieldDefinition[]).find((f) => f.id === 'u2')?.expression).toBe(
      '{u1} + 0.001',
    )
  })

  it('emits nothing usable until both sides are chosen', () => {
    // Picking a source with no operand yet must not produce a half-written formula
    // that the evaluator would reject on every keystroke.
    const onChange = renderSetup()
    fireEvent.change(screen.getByLabelText('Source column for Derived'), {
      target: { value: 'u1' },
    })
    const [nextFields] = onChange.mock.calls.at(-1)!
    expect((nextFields as FieldDefinition[]).find((f) => f.id === 'u2')?.expression).toBe('')
  })

  it('switches the operand between a value and another column', () => {
    const onChange = renderSetup()
    fireEvent.change(screen.getByLabelText('Operand type for Derived'), {
      target: { value: 'field' },
    })
    expect(onChange).toHaveBeenCalled()
  })

  it('falls back to a raw input for a formula the builder cannot represent', () => {
    renderSetup([
      ...withExpression.slice(0, 2),
      { ...withExpression[2], expression: '({u1} + {m1}) * 2' },
    ])
    expect(screen.getByLabelText('Formula for Derived')).toHaveValue('({u1} + {m1}) * 2')
    expect(screen.getByRole('button', { name: /Use the builder/i })).toBeInTheDocument()
  })
})

describe('ColumnSetup error computation', () => {
  const setupFields: FieldDefinition[] = [
    { id: 'm1', name: 'Actual Temp', group: 'master', type: 'numeric', unit: '°C', order: 0 },
    { id: 'u1', name: 'UUC Reading', group: 'uuc', type: 'numeric', unit: '°C', order: 0 },
  ]

  function renderSetup(formula: 'A-B' | 'B-A' = 'A-B') {
    const onChange = vi.fn()
    render(
      <ColumnSetup
        fields={setupFields}
        errorConfig={{ masterFieldId: 'm1', uucFieldId: 'u1', formula, unit: '°C' }}
        parameterUnit="°C"
        onChange={onChange}
      />,
    )
    fireEvent.click(screen.getByRole('button', { expanded: false }))
    return onChange
  }

  it('reads as a sentence rather than four labelled dropdowns', () => {
    renderSetup()
    expect(screen.getByText('Error')).toBeInTheDocument()
    expect(screen.getByLabelText('Field A (Master)')).toBeInTheDocument()
    expect(screen.getByLabelText('Field B (UUC)')).toBeInTheDocument()
    expect(screen.getByLabelText('Error unit')).toHaveValue('°C')
  })

  it('swaps operand order instead of offering an A-B / B-A dropdown', () => {
    const onChange = renderSetup('A-B')
    fireEvent.click(screen.getByLabelText(/Swap the order of the error operands/i))
    const [, nextConfig] = onChange.mock.calls.at(-1)!
    expect(nextConfig).toMatchObject({ formula: 'B-A' })
  })

  it('lists each field group under a single header', () => {
    renderSetup()
    expect(screen.getByText('Master Instrument Fields')).toBeInTheDocument()
    expect(screen.getByText('UUC Fields')).toBeInTheDocument()
    // One Name/Type/Unit header per list, not per field.
    expect(screen.getAllByText('Name')).toHaveLength(2)
    expect(screen.getAllByText('Type')).toHaveLength(2)
  })
})
