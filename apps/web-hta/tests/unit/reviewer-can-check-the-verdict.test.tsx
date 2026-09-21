/**
 * What a reviewer needs in order to check a result rather than take it on trust.
 *
 * The table prints a verdict per point. Two things behind that verdict were not on the
 * page: the error the point was allowed - which on a banded parameter is a different
 * figure on every row - and the fact that a column was computed from the others rather
 * than measured. Both are shown to the people whose job is to weigh the certificate and
 * to nobody else, because a customer is being given a result, not auditing one.
 */
import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'

import { CalibrationResultsTable } from '@/components/certificate/CalibrationResultsTable'

/** The bands on HTA/S22734/165/26's third parameter, as the lab wrote them. */
const BANDS = [
  { binMin: '0', binMax: '20', leastCount: '0.01', accuracy: '0.26' },
  { binMin: '20', binMax: '40', leastCount: '0.01', accuracy: '0.5' },
  { binMin: '40', binMax: '50', leastCount: '0.01', accuracy: '0.75' },
  { binMin: '50', binMax: '60', leastCount: '0.01', accuracy: '1' },
  { binMin: '60', binMax: '80', leastCount: '0.1', accuracy: '1' },
  { binMin: '80', binMax: '100', leastCount: '1', accuracy: '1.25' },
]

const point = (n: number, master: string, uuc: string, error: number) => ({
  id: `r${n}`,
  pointNumber: n,
  standardReading: master,
  beforeAdjustment: uuc,
  afterAdjustment: '',
  errorObserved: error,
  isOutOfLimit: false,
})

const bandedParameter = {
  id: 'p1',
  parameterName: 'Temperature (Absolute)',
  parameterUnit: '°C',
  showAfterAdjustment: false,
  leastCountValue: '1',
  accuracyType: 'ABSOLUTE',
  accuracyValue: '3',
  rangeMin: '0',
  rangeMax: '100',
  requiresBinning: true,
  bins: BANDS,
  results: [
    point(1, '20.000', '20.00', 0),
    point(2, '40.000', '40.11', -0.11),
    point(3, '50.000', '49.72', 0.28),
    point(4, '60.000', '59.80', 0.2),
    point(5, '90.110', '90', 0.11),
  ],
}

const limitsOf = () =>
  screen
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell').at(-2)?.textContent)

describe('the error a point was allowed', () => {
  it('is not printed for the customer', () => {
    render(<CalibrationResultsTable parameters={[bandedParameter]} />)
    expect(screen.queryByText('Limit')).not.toBeInTheDocument()
  })

  it('is printed for the people checking the verdict', () => {
    render(<CalibrationResultsTable parameters={[bandedParameter]} showLimits />)
    expect(screen.getByText('Limit')).toBeInTheDocument()
  })

  it('changes from row to row, because the band does', () => {
    /**
     * This is the whole point. Five identical green ticks tell the reader nothing when
     * the five points cleared five different figures.
     */
    render(<CalibrationResultsTable parameters={[bandedParameter]} showLimits />)
    expect(limitsOf()).toEqual(['±0.26', '±0.50', '±0.75', '±1.00', '±1.25'])
  })

  it('is not the flat figure the parameter also states', () => {
    // The parameter says +/-3, which no band agrees with and no point was judged by.
    render(<CalibrationResultsTable parameters={[bandedParameter]} showLimits />)
    expect(limitsOf()).not.toContain('±3.00')
  })

  it('says nothing where the parameter records nothing to judge by', () => {
    const unrateable = {
      ...bandedParameter,
      requiresBinning: false,
      bins: null,
      accuracyValue: null,
      results: [point(1, '20.000', '20.00', 0)],
    }
    render(<CalibrationResultsTable parameters={[unrateable]} showLimits />)
    expect(limitsOf()).toEqual(['—'])
  })
})

const fields = [
  { id: 'm1', name: 'Standard', group: 'master' as const, type: 'numeric' as const, unit: '°C', order: 0 },
  { id: 'u1', name: 'Run 1', group: 'uuc' as const, type: 'numeric' as const, unit: '°C', order: 0 },
  { id: 'u2', name: 'Run 2', group: 'uuc' as const, type: 'numeric' as const, unit: '°C', order: 1 },
  {
    id: 'u3',
    name: 'Mean',
    group: 'uuc' as const,
    type: 'expression' as const,
    unit: '°C',
    order: 2,
    expression: '({u1} + {u2}) / 2',
  },
]

const computedParameter = {
  ...bandedParameter,
  requiresBinning: false,
  bins: null,
  leastCountValue: '0.01',
  fieldDefinitions: fields,
  errorConfig: { masterFieldId: 'm1', uucFieldId: 'u3', formula: 'B-A' as const, unit: '°C' },
  results: [
    {
      ...point(1, '50.000', '', -0.28),
      values: { m1: '50.00', u1: '49.70', u2: '49.74' },
    },
  ],
}

describe('a column that was computed rather than measured', () => {
  it('looks like any other column to the customer', () => {
    render(<CalibrationResultsTable parameters={[computedParameter]} />)
    expect(screen.queryByText('ƒ')).not.toBeInTheDocument()
  })

  it('is marked for the reviewer, with its formula in the heading', () => {
    render(<CalibrationResultsTable parameters={[computedParameter]} showFormulas />)
    expect(screen.getByText('ƒ')).toBeInTheDocument()
    expect(screen.getByText('({Run 1} + {Run 2}) / 2')).toBeInTheDocument()
  })

  it('keeps the working closed until it is asked for', () => {
    render(<CalibrationResultsTable parameters={[computedParameter]} showFormulas />)
    expect(screen.queryByText(/how this point was computed/)).not.toBeInTheDocument()
  })

  it('shows the arithmetic with this row\'s readings in it', () => {
    render(<CalibrationResultsTable parameters={[computedParameter]} showFormulas />)
    fireEvent.click(screen.getByTitle('Show the working for this point'))

    expect(screen.getByText(/Mean — how this point was computed/)).toBeInTheDocument()
    // The readings, not the column names, are what makes it checkable: the formula, the
    // same formula with this row's numbers in, then the arithmetic down to one figure.
    const steps = screen.getAllByRole('listitem').map((li) => li.textContent)
    expect(steps).toEqual([
      '( Run 1 + Run 2 ) ÷ 2',
      // 49.70, matching the "Reads Run 1 = 49.70" line below: a reading keeps the
      // resolution it was read to. It used to print 49.7 here and 49.70 there, which
      // is the panel disagreeing with itself about what the engineer wrote down.
      '( 49.70 + 49.74 ) ÷ 2',
      // Trimmed, because these two the arithmetic produced rather than the instrument.
      '99.44 ÷ 2',
      '49.72',
    ])
    expect(screen.getByText(/Reads Run 1 = 49\.70, Run 2 = 49\.74/)).toBeInTheDocument()
  })

  it('says the figure is not one the certificate stores', () => {
    // It is recomputed every time the page is drawn, which is the fact that decides
    // how much weight a reviewer should put on it.
    render(<CalibrationResultsTable parameters={[computedParameter]} showFormulas />)
    fireEvent.click(screen.getByTitle('Show the working for this point'))
    expect(screen.getByText(/stores the readings, not this figure/)).toBeInTheDocument()
  })

  it('closes again when the same value is clicked', () => {
    render(<CalibrationResultsTable parameters={[computedParameter]} showFormulas />)
    const cell = screen.getByTitle('Show the working for this point')
    fireEvent.click(cell)
    fireEvent.click(cell)
    expect(screen.queryByText(/how this point was computed/)).not.toBeInTheDocument()
  })

  it('leaves a measured column alone', () => {
    render(<CalibrationResultsTable parameters={[computedParameter]} showFormulas />)
    // One computed column, so one openable value - not four.
    expect(screen.getAllByTitle('Show the working for this point')).toHaveLength(1)
  })
})
