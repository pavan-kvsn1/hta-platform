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
  // 19 stands for 165 HTAIPL/L: on the list, but recording nothing.
  [19, { capability_profiles: [] } as unknown as RegistryUnit],
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
      resolveUnit={(inst) => units.get(inst.id)}
      onCancel={onCancel}
      onAdd={onAdd}
      {...over}
    />,
  )
  return { onAdd, onCancel }
}

/** The parameter step ticks, since one master can serve several. */
const pick = (label: string | RegExp) =>
  fireEvent.click(
    within(screen.getByText(label).closest('label')!).getByRole('checkbox'),
  )

/** The asset number sits beside the description in one span, so match on the row. */
const pickInstrument = (assetNo: string) =>
  fireEvent.click(
    screen.getAllByRole('button').find((b) => b.textContent?.includes(assetNo))!,
  )

describe('step 1 - what the master is for', () => {
  it('asks for the parameter first, and nothing else', () => {
    renderFlow()
    expect(screen.getByText(/Used for which parameters/i)).toBeInTheDocument()
    expect(screen.queryByText('Instrument')).not.toBeInTheDocument()
    expect(screen.queryByText(/Instrument Selected/i)).not.toBeInTheDocument()
  })

  it('says why the order is that way round', () => {
    renderFlow()
    expect(
      screen.getByText(/Choosing the parameters first filters the instrument list/i),
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
    expect(
      within(screen.getByText('Temperature').closest('label')!).getByRole('checkbox'),
    ).toBeDisabled()
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
    expect(screen.getByText('Compatible')).toBeInTheDocument()
    // A compatible least count needs no sentence - the table already said so.
    expect(screen.queryByText(/least count is/i)).not.toBeInTheDocument()
  })

  it('keeps all of it inside the one panel', () => {
    // The requirement, the comparison and the SOP are what the declaration produced.
    // Rendered as sections below it they read as separate questions.
    openToDeclare()
    const panel = screen.getByRole('group', { name: /Compatibility - For Temperature/i })
    expect(within(panel).getByText('Required of the master')).toBeInTheDocument()
    expect(within(panel).getByText(/What 600 HTAIPL\/L offers/)).toBeInTheDocument()
    expect(within(panel).getByLabelText(/SOP Ref/i)).toBeInTheDocument()
  })

  it('can be folded away, and still says which parameter it covers', () => {
    // A master serving three parameters produces three of these, each long enough to
    // bury the next.
    openToDeclare()
    const panel = screen.getByRole('group', { name: /Compatibility - For Temperature/i })
    fireEvent.click(within(panel).getByRole('button', { expanded: true }))
    expect(within(panel).queryByText('Required of the master')).not.toBeInTheDocument()
    expect(
      screen.getByRole('group', { name: /Compatibility - For Temperature/i }),
    ).toBeInTheDocument()
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
        resolveUnit={() => unitWith('Temperature', -50, 200, 0.1, 0.2)}
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
    expect(onAdd.mock.calls[0][0].instrument.asset_no).toBe('600 HTAIPL/L')
    expect(onAdd.mock.calls[0][0].assignments).toEqual([
      expect.objectContaining({
        parameterIndex: 0,
        profileId: 'P1',
        sopReference: 'NLAB/CAL/T01/R01',
        acceptanceReason: '',
      }),
    ])
  })

  it('carries the accepted reason when the ratio falls short', () => {
    const onAdd = vi.fn()
    render(
      <MasterAddFlow
        index={1}
        parameters={[parameter({ id: 'p1' })]}
        coveredBy={new Map()}
        instruments={[GOOD]}
        resolveUnit={() => unitWith('Temperature', -50, 200, 0.1, 0.2)}
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
    expect(onAdd.mock.calls[0][0].assignments[0].acceptanceReason).toBe('Agreed with the reviewer.')
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

describe('when there is nothing to compare', () => {
  // 1027 and 1028 HTAIPL/L name Temperature and Relative Humidity and record no span,
  // least count or accuracy for either. Nine of this lab's units are like that, and
  // the panel below the declaration was simply empty for all of them.
  const NAMED_ONLY = {
    capability_profiles: [
      {
        id: 'P1',
        parameter: 'Temperature',
        role: 'measuring',
        unit: null,
        min: null,
        max: null,
        buckets: [],
        subtypes: [],
      },
    ],
  } as unknown as RegistryUnit

  it('says the registry names the capability but records no ranges', () => {
    render(
      <MasterAddFlow
        index={1}
        parameters={[parameter({ id: 'p1' })]}
        coveredBy={new Map()}
        instruments={[instrument({ id: 50, asset_no: '1027 HTAIPL/L' })]}
        resolveUnit={() => NAMED_ONLY}
        onCancel={vi.fn()}
        onAdd={vi.fn()}
      />,
    )
    pick('Temperature')
    pickInstrument('1027 HTAIPL/L')
    expect(
      screen.getByText(/names this capability but records no ranges/i),
    ).toBeInTheDocument()
    expect(screen.getByText(/It can still be used/)).toBeInTheDocument()
  })

  it('names which part of the requirement the parameter is missing', () => {
    render(
      <MasterAddFlow
        index={1}
        parameters={[parameter({ id: 'p1', leastCountValue: '', accuracyValue: '' })]}
        coveredBy={new Map()}
        instruments={[GOOD]}
        resolveUnit={(inst) => units.get(inst.id)}
        onCancel={vi.fn()}
        onAdd={vi.fn()}
      />,
    )
    pick('Temperature')
    pickInstrument('600 HTAIPL/L')
    expect(screen.getByText(/Nothing to check this master against yet/i)).toBeInTheDocument()
    expect(screen.getByText('no least count and no accuracy')).toBeInTheDocument()
    expect(screen.getByText(/set it in Section 02/i)).toBeInTheDocument()
  })

  it('still lets the master be added', () => {
    const onAdd = vi.fn()
    render(
      <MasterAddFlow
        index={1}
        parameters={[parameter({ id: 'p1', leastCountValue: '' })]}
        coveredBy={new Map()}
        instruments={[GOOD]}
        resolveUnit={(inst) => units.get(inst.id)}
        onCancel={vi.fn()}
        onAdd={onAdd}
      />,
    )
    pick('Temperature')
    pickInstrument('600 HTAIPL/L')
    fireEvent.click(screen.getByRole('button', { name: 'Add this master' }))
    expect(onAdd).toHaveBeenCalled()
  })
})

describe('instruments with nothing recorded', () => {
  // 165, 237 and 30 HTAIPL/L record no capability at all. Folding them into every
  // parameter's list padded it with the same handful each time, and for a parameter
  // few instruments serve they became most of the list.
  const BLANK = instrument({ id: 19, asset_no: '165 HTAIPL/L' })
  const withBlank = (over: Record<string, unknown> = {}) => {
    const onAdd = vi.fn()
    render(
      <MasterAddFlow
        index={1}
        parameters={[parameter({ id: 'p1' })]}
        coveredBy={new Map()}
        instruments={[GOOD, BLANK]}
        resolveUnit={(inst) => units.get(inst.id)}
        onCancel={vi.fn()}
        onAdd={onAdd}
        {...over}
      />,
    )
    return onAdd
  }

  it('are left out of the list', () => {
    withBlank()
    pick('Temperature')
    expect(
      screen.getAllByRole('button').some((b) => b.textContent?.includes('165 HTAIPL/L')),
    ).toBe(false)
    expect(screen.queryByText('Capability not recorded')).not.toBeInTheDocument()
  })

  it('are counted and named, not silently dropped', () => {
    withBlank()
    pick('Temperature')
    expect(
      screen.getByText(/1 instrument records no capability at all and is not listed/),
    ).toBeInTheDocument()
  })

  it('can still be reached, since one may be the right instrument', () => {
    withBlank()
    pick('Temperature')
    fireEvent.click(screen.getByRole('button', { name: 'Show them' }))
    expect(
      screen.getAllByRole('button').some((b) => b.textContent?.includes('165 HTAIPL/L')),
    ).toBe(true)
  })

  it('do not count towards what can serve a parameter', () => {
    withBlank()
    // GOOD serves it; the blank one must not be counted as a second.
    expect(screen.getByText(/1 instrument can do it/)).toBeInTheDocument()
  })
})

describe('a master serving more than one parameter', () => {
  // A universal calibrator sources temperature and reads pressure on the same
  // certificate, so the parameter step ticks rather than picks.
  const bothUnit = {
    capability_profiles: [
      ...(unitWith('Temperature', -50, 200, 0.1, 0.05) as unknown as {
        capability_profiles: unknown[]
      }).capability_profiles,
      ...(unitWith('Pressure', 0, 3000, 0.1, 0.05) as unknown as {
        capability_profiles: unknown[]
      }).capability_profiles,
    ],
  } as unknown as RegistryUnit

  const renderBoth = () => {
    const onAdd = vi.fn()
    render(
      <MasterAddFlow
        index={1}
        parameters={[
          parameter({ id: 'p1', parameterName: 'Temperature' }),
          parameter({
            id: 'p2',
            parameterName: 'Pressure',
            parameterUnit: 'Pa',
            rangeMin: '0',
            rangeMax: '3000',
          }),
        ]}
        coveredBy={new Map()}
        instruments={[instrument({ id: 70, asset_no: '900 HTAIPL/L' })]}
        resolveUnit={() => bothUnit}
        onCancel={vi.fn()}
        onAdd={onAdd}
      />,
    )
    return onAdd
  }

  it('takes both parameters at once', () => {
    renderBoth()
    pick('Temperature')
    pick('Pressure')
    expect(screen.getByText(/can be used for Temperature and Pressure/)).toBeInTheDocument()
  })

  it('declares each parameter separately, naming which is which', () => {
    renderBoth()
    pick('Temperature')
    pick('Pressure')
    pickInstrument('900 HTAIPL/L')
    // One panel per parameter, each with its own requirement and procedure.
    expect(
      screen.getByRole('group', { name: /Compatibility - For Temperature/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('group', { name: /Compatibility - For Pressure/i }),
    ).toBeInTheDocument()
    expect(screen.getAllByText('Required of the master')).toHaveLength(2)
    expect(screen.getAllByLabelText(/SOP Ref/i)).toHaveLength(2)
  })

  it('reports one assignment per parameter', () => {
    const onAdd = renderBoth()
    pick('Temperature')
    pick('Pressure')
    pickInstrument('900 HTAIPL/L')
    fireEvent.click(screen.getByRole('button', { name: 'Add this master' }))
    expect(onAdd.mock.calls[0][0].assignments.map((a: { parameterIndex: number }) => a.parameterIndex))
      .toEqual([0, 1])
  })

  it('drops the chosen instrument when the parameters change under it', () => {
    // It was rated against the old set; keeping it would carry a verdict that no
    // longer refers to anything on screen.
    renderBoth()
    pick('Temperature')
    pickInstrument('900 HTAIPL/L')
    expect(screen.getByText('Instrument Selected')).toBeInTheDocument()
    pick('Pressure')
    expect(screen.queryByText('Instrument Selected')).not.toBeInTheDocument()
  })
})

describe('finding an instrument', () => {
  const many = [
    GOOD,
    instrument({ id: 71, asset_no: '901 HTAIPL/L', make: 'Druck', model: 'DPI 610' }),
    instrument({ id: 72, asset_no: '902 HTAIPL/L', make: 'Ametek', model: 'RTC-159' }),
  ]
  const unitsMany = new Map<number, RegistryUnit>([
    [68, unitWith('Temperature', -50, 200, 0.1, 0.05)],
    [71, unitWith('Temperature', -50, 200, 0.1, 0.05)],
    [72, unitWith('Temperature', -50, 200, 0.1, 0.05)],
  ])

  const renderMany = () => {
    render(
      <MasterAddFlow
        index={1}
        parameters={[parameter({ id: 'p1' })]}
        coveredBy={new Map()}
        instruments={many}
        resolveUnit={(inst) => unitsMany.get(inst.id)}
        onCancel={vi.fn()}
        onAdd={vi.fn()}
      />,
    )
    pick('Temperature')
  }

  const rows = () =>
    screen.getAllByRole('button').filter((b) => b.textContent?.includes('HTAIPL/L'))

  it('offers a make filter beside the category', () => {
    renderMany()
    expect(screen.getByLabelText('Category')).toBeInTheDocument()
    expect(screen.getByLabelText('Make')).toBeInTheDocument()
    expect(screen.getByLabelText('Description')).toBeInTheDocument()
  })

  it('shortens the list as the search narrows it', () => {
    renderMany()
    expect(rows()).toHaveLength(3)
    fireEvent.change(screen.getByLabelText('Search instruments'), {
      target: { value: 'Druck' },
    })
    expect(rows()).toHaveLength(1)
    expect(rows()[0].textContent).toContain('901 HTAIPL/L')
  })

  it('searches the asset number, and says what it left out', () => {
    renderMany()
    fireEvent.change(screen.getByLabelText('Search instruments'), {
      target: { value: '902' },
    })
    expect(rows()).toHaveLength(1)
    expect(screen.getByText(/2 more are hidden by the search/)).toBeInTheDocument()
  })

  it('says so rather than showing an empty box when nothing matches', () => {
    renderMany()
    fireEvent.change(screen.getByLabelText('Search instruments'), {
      target: { value: 'no such thing' },
    })
    expect(screen.getByText(/No instrument matches those filters/i)).toBeInTheDocument()
  })
})

describe('the SOP reference', () => {
  it('falls back to the registry when the instrument row carries none', () => {
    // availableSopReferences is not persisted, so a reloaded draft had none and the
    // dropdown rendered empty. All 209 registry units record their procedures.
    const withRegistrySops = {
      ...(unitWith('Temperature', -50, 200, 0.1, 0.05) as unknown as object),
      sop_references: ['NLAB/CAL/ET1/R01', 'NLAB/CAL/ET2/R01'],
    } as unknown as RegistryUnit

    render(
      <MasterAddFlow
        index={1}
        parameters={[parameter({ id: 'p1' })]}
        coveredBy={new Map()}
        instruments={[instrument({ id: 68, asset_no: '600 HTAIPL/L', sop_references: [] })]}
        resolveUnit={() => withRegistrySops}
        onCancel={vi.fn()}
        onAdd={vi.fn()}
      />,
    )
    pick('Temperature')
    pickInstrument('600 HTAIPL/L')
    const select = screen.getByLabelText(/SOP Ref/i)
    expect(select.textContent).toContain('NLAB/CAL/ET1/R01')
    expect(select).toHaveValue('NLAB/CAL/ET1/R01')
  })

  it('takes a typed reference when nothing records one', () => {
    render(
      <MasterAddFlow
        index={1}
        parameters={[parameter({ id: 'p1' })]}
        coveredBy={new Map()}
        instruments={[instrument({ id: 68, asset_no: '600 HTAIPL/L', sop_references: [] })]}
        resolveUnit={() => unitWith('Temperature', -50, 200, 0.1, 0.05)}
        onCancel={vi.fn()}
        onAdd={vi.fn()}
      />,
    )
    pick('Temperature')
    pickInstrument('600 HTAIPL/L')
    expect(screen.getByText(/No procedure is recorded against 600 HTAIPL\/L/)).toBeInTheDocument()
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
