/**
 * Adding a master instrument.
 *
 * The flow asks what the master is for before asking which one it is. That order is
 * the point: it is what lets the instrument list rate each asset against the parameter
 * in hand instead of listing the whole lab.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MasterAddFlow } from '@/components/forms/MasterAddFlow'
import type { Parameter } from '@/lib/stores/certificate-store'
import type { MasterInstrument } from '@/lib/master-instruments'
import type { RegistryUnit } from '@/lib/master-instrument-registry'

const bucket = (min: number, max: number, lc: number, acc: number) => ({
  id: `B${min}`,
  min,
  max,
  min_inclusive: true,
  max_inclusive: true,
  least_count: { value: lc, unit: '°C' },
  accuracy: { type: 'symmetric', value: acc, unit: '°C', polarity: '±' },
})

const unitWith = (parameter: string, min: number, max: number, lc: number, acc: number) =>
  ({
    capability_profiles: [
      {
        id: 'P1',
        parameter,
        role: 'measuring',
        unit: '°C',
        min,
        max,
        buckets: [bucket(min, max, lc, acc)],
        subtypes: [],
      },
    ],
  }) as unknown as RegistryUnit

const instrument = (over: Partial<MasterInstrument> & { id: number }) =>
  ({
    type: 'TEMPERATURE',
    instrument_desc: 'Temperature Calibrator',
    make: 'Fluke',
    model: '1524',
    asset_no: `A${over.id}`,
    instrument_sl_no: 'SN1',
    usage: 'CALIBRATION',
    calibrated_at: 'FCRI Palakkad',
    report_no: 'R1',
    next_due_on: '12/31/2026',
    range: [],
    remarks: '',
    status: 'VALID',
    sop_references: ['NLAB/CAL/T01/R01'],
    ...over,
  }) as MasterInstrument

const parameter = (over: Partial<Parameter> & { id: string }) =>
  ({
    parameterName: 'Temperature',
    parameterUnit: '°C',
    rangeMin: '-20',
    rangeMax: '60',
    leastCountValue: '0.1',
    accuracyValue: '0.5',
    accuracyUnit: '°C',
    accuracyType: 'ABSOLUTE',
    requiresBinning: false,
    bins: [],
    masterInstrumentId: null,
    sopReference: '',
    results: [],
    showAfterAdjustment: false,
    ...over,
  }) as unknown as Parameter

// 68 is comfortably better than the requirement; 69 stops short of 60.
const GOOD = instrument({ id: 68, asset_no: '600 HTAIPL/L' })
const SHORT = instrument({ id: 69, asset_no: '742 HTAIPL/L' })
const units = new Map<number, RegistryUnit>([
  [68, unitWith('Temperature', -50, 200, 0.1, 0.05)],
  [69, unitWith('Temperature', -20, 40, 0.1, 0.05)],
])

function renderFlow(over: Record<string, unknown> = {}) {
  const onAdd = vi.fn()
  const onCancel = vi.fn()
  render(
    <MasterAddFlow
      index={1}
      parameters={[
        parameter({ id: 'p1', parameterName: 'Temperature' }),
        parameter({ id: 'p2', parameterName: 'Pressure', parameterUnit: 'Pa' }),
      ]}
      coveredBy={new Map()}
      instruments={[GOOD, SHORT]}
      getUnitByLegacyId={(id) => units.get(id)}
      onCancel={onCancel}
      onAdd={onAdd}
      {...over}
    />,
  )
  return { onAdd, onCancel }
}

const pick = (label: string | RegExp) =>
  fireEvent.click(screen.getByText(label).closest('button')!)

/** The asset number sits beside the description in one span, so match on the row. */
const pickInstrument = (assetNo: string) =>
  fireEvent.click(
    screen.getAllByRole('button').find((b) => b.textContent?.includes(assetNo))!,
  )

describe('step 1 - what the master is for', () => {
  it('asks for the parameter first, and nothing else', () => {
    renderFlow()
    expect(screen.getByText(/Used for which parameter/i)).toBeInTheDocument()
    expect(screen.queryByText('Instrument')).not.toBeInTheDocument()
    expect(screen.queryByText(/Instrument Selected/i)).not.toBeInTheDocument()
  })

  it('says why the order is that way round', () => {
    renderFlow()
    expect(
      screen.getByText(/Choosing the parameter first filters the instrument list/i),
    ).toBeInTheDocument()
  })

  it('counts the instruments that can actually do each parameter', () => {
    renderFlow()
    // Only 600 covers -20 to 60; 742 stops at 40.
    expect(screen.getByText(/1 instrument can do it/)).toBeInTheDocument()
  })

  it('takes a parameter that already has a master out of the running', () => {
    renderFlow({ coveredBy: new Map([['p1', '600 HTAIPL/L']]) })
    expect(screen.getByText(/already assigned to 600 HTAIPL\/L/)).toBeInTheDocument()
    expect(screen.getByText('Temperature').closest('button')).toBeDisabled()
  })
})

describe('step 2 - which instrument', () => {
  it('appears only once the parameter is answered', () => {
    renderFlow()
    pick('Temperature')
    expect(screen.getByText('Category')).toBeInTheDocument()
    expect(
      screen.getAllByRole('button').some((b) => b.textContent?.includes('600 HTAIPL/L')),
    ).toBe(true)
  })

  it('rates each instrument against that parameter', () => {
    renderFlow()
    pick('Temperature')
    // 0.5 required against 0.05 recorded.
    expect(screen.getByText('10.0 : 1')).toBeInTheDocument()
  })

  it('keeps an unusable instrument on screen with the reason', () => {
    renderFlow()
    pick('Temperature')
    expect(screen.getByText('Range Exceeds')).toBeInTheDocument()
    expect(screen.getByText(/short of your 60 by 20/)).toBeInTheDocument()
    expect(
      screen.getAllByRole('button').find((b) => b.textContent?.includes('742 HTAIPL/L')),
    ).toBeDisabled()
  })

  it('says how many of the listed instruments can be used', () => {
    renderFlow()
    pick('Temperature')
    expect(screen.getByText(/1 of 2 shown can be used for Temperature/)).toBeInTheDocument()
  })

  it('offers no instrument for a parameter none of them record', () => {
    renderFlow()
    pick('Pressure')
    expect(screen.getByText(/0 of 0 shown can be used for Pressure/)).toBeInTheDocument()
  })
})

describe('steps 3 and 4 - the declaration and what it gives', () => {
  const openToDeclare = () => {
    const handles = renderFlow()
    pick('Temperature')
    pickInstrument('600 HTAIPL/L')
    return handles
  }

  it('shows the instrument once chosen', () => {
    openToDeclare()
    expect(screen.getByText('Instrument Selected')).toBeInTheDocument()
  })

  it('states the requirement as read from the unit under test', () => {
    openToDeclare()
    expect(screen.getByText('Required of the master')).toBeInTheDocument()
    expect(screen.getByText(/Taken from the unit under test in Section 02/)).toBeInTheDocument()
    expect(screen.getByText(/Change it there, not here/)).toBeInTheDocument()
  })

  it('lays the master bands against that requirement', () => {
    openToDeclare()
    expect(screen.getByText(/What 600 HTAIPL\/L offers/)).toBeInTheDocument()
    expect(screen.getByText('Least count matches on every required range.')).toBeInTheDocument()
  })

  it('asks for the SOP reference the instrument records', () => {
    openToDeclare()
    expect(screen.getByLabelText(/SOP Ref/i)).toHaveValue('NLAB/CAL/T01/R01')
  })

  it('does not ask for a reason when the ratio clears the threshold', () => {
    openToDeclare()
    expect(screen.queryByText(/Lowest ratio across your buckets/)).not.toBeInTheDocument()
  })

  it('asks for a reason when it does not', () => {
    render(
      <MasterAddFlow
        index={1}
        parameters={[parameter({ id: 'p1' })]}
        coveredBy={new Map()}
        instruments={[GOOD]}
        getUnitByLegacyId={() => unitWith('Temperature', -50, 200, 0.1, 0.2)}
        onCancel={vi.fn()}
        onAdd={vi.fn()}
      />,
    )
    pick('Temperature')
    pickInstrument('600 HTAIPL/L')
    expect(screen.getByText(/Lowest ratio across your buckets is 2.5 : 1/)).toBeInTheDocument()
    expect(screen.getByText(/Below the 4:1 the lab asks for/)).toBeInTheDocument()
  })
})

describe('committing', () => {
  it('writes nothing until the master is added', () => {
    const { onAdd } = renderFlow()
    pick('Temperature')
    pickInstrument('600 HTAIPL/L')
    expect(onAdd).not.toHaveBeenCalled()
  })

  it('reports the parameter, the instrument and the declaration together', () => {
    const { onAdd } = renderFlow()
    pick('Temperature')
    pickInstrument('600 HTAIPL/L')
    fireEvent.click(screen.getByRole('button', { name: 'Add this master' }))
    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        parameterIndex: 0,
        profileId: 'P1',
        sopReference: 'NLAB/CAL/T01/R01',
        acceptanceReason: '',
      }),
    )
    expect(onAdd.mock.calls[0][0].instrument.asset_no).toBe('600 HTAIPL/L')
  })

  it('carries the accepted reason when the ratio falls short', () => {
    const onAdd = vi.fn()
    render(
      <MasterAddFlow
        index={1}
        parameters={[parameter({ id: 'p1' })]}
        coveredBy={new Map()}
        instruments={[GOOD]}
        getUnitByLegacyId={() => unitWith('Temperature', -50, 200, 0.1, 0.2)}
        onCancel={vi.fn()}
        onAdd={onAdd}
      />,
    )
    pick('Temperature')
    pickInstrument('600 HTAIPL/L')
    fireEvent.change(screen.getByRole('textbox', { name: '' }) ?? screen.getByPlaceholderText(/Customer tolerance/), {
      target: { value: 'Agreed with the reviewer.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add this master' }))
    expect(onAdd.mock.calls[0][0].acceptanceReason).toBe('Agreed with the reviewer.')
  })

  it('can be abandoned', () => {
    const { onCancel, onAdd } = renderFlow()
    pick('Temperature')
    pickInstrument('600 HTAIPL/L')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalled()
    expect(onAdd).not.toHaveBeenCalled()
  })
})

describe('the instrument list', () => {
  it('puts the best answer first', () => {
    renderFlow()
    pick('Temperature')
    const rows = screen.getAllByRole('button').filter((b) => b.textContent?.includes('HTAIPL/L'))
    expect(within(rows[0]).getByText('10.0 : 1')).toBeInTheDocument()
  })
})
