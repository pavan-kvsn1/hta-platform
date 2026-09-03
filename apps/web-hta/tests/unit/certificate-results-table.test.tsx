/**
 * The results table as it appears on the certificate.
 *
 * This one component renders for the reviewer, the admin authorising, the customer and
 * the engineer's read-only view, so a column missing here is a column missing from what
 * everyone downstream signs.
 */
import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { CalibrationResultsTable } from '@/components/certificate/CalibrationResultsTable'

const legacyParameter = {
  id: 'p1',
  parameterName: 'Temperature',
  parameterUnit: '°C',
  showAfterAdjustment: false,
  leastCountValue: '0.1',
  requiresBinning: false,
  bins: null,
  results: [
    {
      id: 'r1',
      pointNumber: 1,
      standardReading: '50.0',
      beforeAdjustment: '50.2',
      afterAdjustment: '',
      errorObserved: -0.2,
      isOutOfLimit: false,
    },
  ],
}

const fieldDefinitions = [
  { id: 'm1', name: 'Master Reading', group: 'master' as const, type: 'numeric' as const, unit: '°C', order: 0 },
  { id: 'm2', name: 'Ambient', group: 'master' as const, type: 'numeric' as const, unit: '°C', order: 1 },
  { id: 'u1', name: 'UUC Reading', group: 'uuc' as const, type: 'numeric' as const, unit: '°C', order: 0 },
  { id: 'u2', name: 'Probe', group: 'uuc' as const, type: 'text' as const, unit: '', order: 1 },
  {
    id: 'u3',
    name: 'Adjusted',
    group: 'uuc' as const,
    type: 'expression' as const,
    unit: '°C',
    order: 2,
    expression: '{u1} + 0.5',
  },
]

const errorConfig = { masterFieldId: 'm1', uucFieldId: 'u1', formula: 'A-B' as const, unit: '°C' }

const dynamicParameter = {
  ...legacyParameter,
  tableName: 'Calibration of Surface Temperature',
  fieldDefinitions,
  errorConfig,
  results: [
    {
      id: 'r1',
      pointNumber: 1,
      standardReading: '50.0',
      beforeAdjustment: '50.2',
      afterAdjustment: '',
      errorObserved: -0.2,
      isOutOfLimit: false,
      values: { m1: '50.0', m2: '23.4', u1: '50.2', u2: 'Type K' },
    },
  ],
}

describe('a certificate written before Section 05', () => {
  it('still prints the fixed three columns', () => {
    render(<CalibrationResultsTable parameters={[legacyParameter]} />)
    expect(screen.getByText('Standard Reading')).toBeInTheDocument()
    expect(screen.getByText('UUC Reading')).toBeInTheDocument()
    expect(screen.getByText('Error')).toBeInTheDocument()
    expect(screen.queryByText('Master Instrument')).not.toBeInTheDocument()
  })

  it('still shows the parameter name and unit as the heading', () => {
    render(<CalibrationResultsTable parameters={[legacyParameter]} />)
    expect(screen.getByText('Temperature')).toBeInTheDocument()
    expect(screen.getByText('(°C)')).toBeInTheDocument()
  })

  it('adds the after-adjustment column only when the parameter asks for it', () => {
    const { rerender } = render(<CalibrationResultsTable parameters={[legacyParameter]} />)
    expect(screen.queryByText('After Adjustment')).not.toBeInTheDocument()
    rerender(
      <CalibrationResultsTable
        parameters={[{ ...legacyParameter, showAfterAdjustment: true }]}
      />,
    )
    expect(screen.getByText('After Adjustment')).toBeInTheDocument()
  })
})

describe('a certificate with declared columns', () => {
  it('prints every declared column, not a fixed three', () => {
    render(<CalibrationResultsTable parameters={[dynamicParameter]} />)
    for (const name of [
      'Master Reading (°C) - (x)',
      'Ambient (°C)',
      'UUC Reading (°C) - (y)',
      'Probe',
      'Adjusted (°C)',
    ]) {
      expect(screen.getByText(name)).toBeInTheDocument()
    }
  })

  it('groups them under the instrument they belong to', () => {
    render(<CalibrationResultsTable parameters={[dynamicParameter]} />)
    expect(screen.getByText('Master Instrument')).toHaveAttribute('colspan', '2')
    expect(screen.getByText('UUC')).toHaveAttribute('colspan', '3')
  })

  it('uses the engineer&rsquo;s table name as the heading', () => {
    render(<CalibrationResultsTable parameters={[dynamicParameter]} />)
    expect(screen.getByText('Calibration of Surface Temperature')).toBeInTheDocument()
  })

  it('prints the entered values in their own columns', () => {
    render(<CalibrationResultsTable parameters={[dynamicParameter]} />)
    const row = screen.getAllByRole('row').at(-1)!
    const cells = within(row).getAllByRole('cell').map((c) => c.textContent)
    // Point, master x2, uuc x3, error, status.
    expect(cells.slice(0, 6)).toEqual(['1', '50.0', '23.4', '50.2', 'Type K', '50.7'])
  })

  it('computes an expression column rather than leaving it blank', () => {
    render(<CalibrationResultsTable parameters={[dynamicParameter]} />)
    // Adjusted = UUC Reading + 0.5, at the parameter's least count.
    expect(screen.getByText('50.7')).toBeInTheDocument()
  })

  it('shows a dash for a column with nothing entered', () => {
    const sparse = {
      ...dynamicParameter,
      results: [{ ...dynamicParameter.results[0], values: { m1: '50.0' } }],
    }
    render(<CalibrationResultsTable parameters={[sparse]} />)
    const row = screen.getAllByRole('row').at(-1)!
    expect(within(row).getAllByRole('cell').map((c) => c.textContent)).toContain('—')
  })

  it('reads the schema from the raw fieldSchema column too', () => {
    // GET /api/certificates/:id returns the Prisma row, so the schema arrives nested;
    // /pdf-data flattens it. Both reach this component from different pages.
    const raw = {
      ...legacyParameter,
      fieldSchema: { fieldDefinitions, errorConfig },
      results: dynamicParameter.results,
    }
    render(<CalibrationResultsTable parameters={[raw]} />)
    expect(screen.getByText('Ambient (°C)')).toBeInTheDocument()
    expect(screen.getByText('Master Instrument')).toBeInTheDocument()
  })

  it('marks a failed point red and bold, as the legacy table did', () => {
    const failed = {
      ...dynamicParameter,
      results: [{ ...dynamicParameter.results[0], isOutOfLimit: true }],
    }
    render(<CalibrationResultsTable parameters={[failed]} />)
    expect(screen.getByText('Fail*')).toBeInTheDocument()
    expect(screen.getAllByRole('row').at(-1)).toHaveClass('text-red-700', 'font-bold')
  })

  it('falls back to the fixed layout when the schema is empty', () => {
    // An empty array is what a parameter that never declared columns looks like.
    render(
      <CalibrationResultsTable
        parameters={[{ ...legacyParameter, fieldDefinitions: [], errorConfig: null }]}
      />,
    )
    expect(screen.getByText('Standard Reading')).toBeInTheDocument()
    expect(screen.queryByText('Master Instrument')).not.toBeInTheDocument()
  })
})

describe('the shape a real saved certificate has', () => {
  // Taken from HTA/S22734/165/26, which was written through the Section 05 editor:
  // hyphenated field ids, a computed column in the master group, and no table name.
  const stored = {
    id: 'p-real',
    parameterName: 'Temperature',
    parameterUnit: '°C',
    showAfterAdjustment: false,
    leastCountValue: '0.1',
    requiresBinning: false,
    bins: null,
    tableName: null,
    fieldSchema: {
      fieldDefinitions: [
        { id: 'fld-mtlh11bp-4', name: 'Master Reading', group: 'master', type: 'numeric', unit: '°C', order: 0 },
        { id: 'fld-mtlh11bp-5', name: 'UUC Reading', group: 'uuc', type: 'numeric', unit: '°C', order: 0 },
        {
          id: 'fld-mtlh1j9e-10',
          name: 'Adjusted Reading',
          group: 'master',
          type: 'expression',
          unit: '°C',
          order: 1,
          expression: '({fld-mtlh11bp-4}^3 + 0.00001)/( {fld-mtlh11bp-4}*{fld-mtlh11bp-4})',
        },
      ],
      errorConfig: {
        masterFieldId: 'fld-mtlh11bp-4',
        uucFieldId: 'fld-mtlh11bp-5',
        formula: 'B-A',
        unit: '°C',
      },
    },
    results: [
      {
        id: 'r1',
        pointNumber: 1,
        standardReading: '-5.0',
        beforeAdjustment: '-5.1',
        afterAdjustment: '',
        errorObserved: -0.1,
        isOutOfLimit: false,
        values: { 'fld-mtlh11bp-4': '-5.0', 'fld-mtlh11bp-5': '-5.1' },
      },
    ],
  }

  it('prints the third column that used to be missing', () => {
    render(<CalibrationResultsTable parameters={[stored]} />)
    expect(screen.getByText('Adjusted Reading (°C)')).toBeInTheDocument()
  })

  it('handles hyphenated field ids in a formula', () => {
    render(<CalibrationResultsTable parameters={[stored]} />)
    // (-5^3 + 0.00001) / (-5 * -5) = -4.9999996, at one decimal.
    const row = screen.getAllByRole('row').at(-1)!
    expect(within(row).getAllByRole('cell').map((c) => c.textContent)).toEqual([
      '1',
      '-5.0',
      '-5.0',
      '-5.1',
      '-0.1',
      'OK',
    ])
  })

  it('falls back to the parameter name when no table name was given', () => {
    render(<CalibrationResultsTable parameters={[stored]} />)
    expect(screen.getByText('Temperature')).toBeInTheDocument()
  })
})
