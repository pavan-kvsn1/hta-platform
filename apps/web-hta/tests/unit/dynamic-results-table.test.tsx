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
    errorConfig,
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

  it('renders a column per field, with its unit beneath', () => {
    renderTable()
    expect(screen.getByText('Std Meter Reading')).toBeInTheDocument()
    expect(screen.getByText('UUC Status')).toBeInTheDocument()
    expect(screen.getByText('Derived mV')).toBeInTheDocument()
    expect(screen.getAllByText('kg/cm²').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('mV')).toBeInTheDocument()
  })

  it('uses a number input for numeric fields and text for text fields', () => {
    renderTable()
    const numeric = screen.getByLabelText('Std Meter Reading, point 1')
    const text = screen.getByLabelText('UUC Status, point 1')
    expect(numeric).toHaveAttribute('type', 'number')
    expect(text).toHaveAttribute('type', 'text')
  })

  it('steps numeric inputs by the parameter precision', () => {
    renderTable({ precision: 3 })
    expect(screen.getByLabelText('Std Meter Reading, point 1')).toHaveAttribute(
      'step',
      '0.001',
    )
  })

  it('shows expression cells as computed read-only values, not inputs', () => {
    renderTable()
    // Derived mV = {u2} * 2, computed per row rather than entered.
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText('11')).toBeInTheDocument()
    expect(screen.queryByLabelText('Derived mV, point 1')).not.toBeInTheDocument()
  })

  it('reports the entered value through onValueChange', () => {
    const { props } = renderTable()
    fireEvent.change(screen.getByLabelText('Std Meter Reading, point 1'), {
      target: { value: '6.05' },
    })
    expect(props.onValueChange).toHaveBeenCalledWith(0, 'm1', '6.05')
  })

  it('marks out-of-limit rows and summarises them', () => {
    renderTable()
    expect(screen.getByText(/1 of 2 point is outside the accuracy limit/i)).toBeInTheDocument()
  })

  it('confirms all points pass when none are out of limit', () => {
    renderTable({ rows: [rows[0]] })
    expect(screen.getByText(/All 1 point within accuracy limits/i)).toBeInTheDocument()
  })

  it('shows a dash rather than a number when the error cannot be computed', () => {
    renderTable({
      rows: [{ ...rows[0], errorObserved: null }],
    })
    const table = screen.getByRole('table')
    expect(within(table).getAllByText('—').length).toBeGreaterThan(0)
  })

  it('warns instead of silently blanking when error fields are unset', () => {
    renderTable({ errorConfig: { ...errorConfig, uucFieldId: '' } })
    expect(
      screen.getByText(/Error column is blank until both error fields are selected/i),
    ).toBeInTheDocument()
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
