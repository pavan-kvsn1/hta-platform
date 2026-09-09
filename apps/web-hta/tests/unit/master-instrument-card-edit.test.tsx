/**
 * Editing a master that is already on the certificate.
 *
 * Editing means going back to the whole selection, not just to the declaration: which
 * instrument was used is as much a part of the answer as which of its capabilities.
 * The card's job is only to hand that request up - the section reopens the flow on the
 * answers already given.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MasterInstrumentCard } from '@/components/forms/MasterInstrumentSection'
import { useMasterInstrumentStore } from '@/lib/stores/master-instrument-store'
import type { Parameter, SelectedMasterInstrument } from '@/lib/stores/certificate-store'

// 230 HTAIPL/L records Temperature once, as a measuring device, with no curves.
const LEGACY_ID = 38

const master = {
  id: 'mi-1',
  masterInstrumentId: LEGACY_ID,
  category: 'TEMPERATURE',
  description: 'Digital RTD Thermometer',
  make: 'Fluke',
  model: '1524',
  assetNo: '230 HTAIPL/L',
  serialNumber: 'SN1',
  calibratedAt: 'HTAIPL, Bangalore',
  reportNo: 'R1',
  calibrationDueDate: '12/31/2026',
  isExpired: false,
  isExpiringSoon: false,
  availableSopReferences: ['NLAB/CAL/T01/R01'],
} as unknown as SelectedMasterInstrument

const parameter = (over: Partial<Parameter> = {}) =>
  ({
    id: 'p1',
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
    masterInstrumentId: LEGACY_ID,
    sopReference: 'NLAB/CAL/T01/R01',
    results: [],
    showAfterAdjustment: false,
    ...over,
  }) as unknown as Parameter

function renderCard(param: Parameter, over: Record<string, unknown> = {}) {
  const onEdit = vi.fn()
  const onParameterUpdate = vi.fn()
  render(
    <MasterInstrumentCard
      instrument={master}
      index={0}
      onRemove={vi.fn()}
      onEdit={onEdit}
      parameters={[param]}
      mastersOnCertificate={new Set([LEGACY_ID])}
      onParameterUpdate={onParameterUpdate}
      certificateId="cert-1"
      images={[]}
      onImageUpload={vi.fn()}
      onImageDelete={vi.fn()}
      {...over}
    />,
  )
  return { onEdit, onParameterUpdate }
}

const pencil = () => screen.queryByLabelText('Edit how this instrument was used')

describe('a master already chosen', () => {
  beforeAll(() => {
    useMasterInstrumentStore.getState().loadFromRegistry()
  })

  it('reads as a record, with the questions put away', () => {
    renderCard(parameter({ masterProfileId: 'P1' }))
    expect(screen.queryByRole('group', { name: /Compatibility/i })).not.toBeInTheDocument()
    expect(screen.getByText('Instrument Selected')).toBeInTheDocument()
    expect(pencil()).toBeInTheDocument()
  })

  it('hands the edit up rather than acting on the declaration itself', () => {
    // Which instrument was used is part of what is being edited, and the card cannot
    // reopen the selection - only the section can.
    const { onEdit, onParameterUpdate } = renderCard(parameter({ masterProfileId: 'P1' }))
    fireEvent.click(pencil()!)
    expect(onEdit).toHaveBeenCalled()
    expect(onParameterUpdate).not.toHaveBeenCalled()
  })

  it('offers the edit even where nothing was ever declared', () => {
    // The instrument can still be changed, which is the greater part of the answer.
    renderCard(parameter({ masterProfileId: undefined }))
    expect(pencil()).toBeInTheDocument()
  })
})

describe('a declaration never made', () => {
  beforeAll(() => {
    useMasterInstrumentStore.getState().loadFromRegistry()
  })

  it('is asked for in place, so an older draft can be completed', () => {
    renderCard(parameter({ masterProfileId: undefined }))
    expect(
      screen.getByRole('group', { name: /Compatibility - For Temperature/i }),
    ).toBeInTheDocument()
  })

  it('is not asked again once it has been made', () => {
    renderCard(parameter({ masterProfileId: 'P1' }))
    expect(screen.queryByRole('group', { name: /Compatibility/i })).not.toBeInTheDocument()
  })
})

describe('a card that cannot be edited', () => {
  beforeAll(() => {
    useMasterInstrumentStore.getState().loadFromRegistry()
  })

  it('offers no pencil and no trash', () => {
    renderCard(parameter({ masterProfileId: 'P1' }), { disabled: true })
    expect(pencil()).not.toBeInTheDocument()
    expect(screen.queryByTitle('Remove')).not.toBeInTheDocument()
  })
})

describe('a capability that serves the parameter under another name', () => {
  /**
   * 1018 HTAIPL/L records RTD, Thermocouple, DC Voltage, DC Current and Resistance.
   * It records nothing called "Temperature", but RTD measures temperature and the flow
   * knows it - a Temperature parameter is declared against the RTD capability at
   * 6.7 : 1.
   *
   * The card judged the same pairing by asking whether the capability's name contains
   * the parameter's. "RTD" does not contain "temperature", so the master declared on
   * one screen came back "Not supported by this instrument" on the next.
   */
  const calibrator = {
    ...master,
    masterInstrumentId: 10,
    assetNo: '1018 HTAIPL/L',
    description: 'Thermocouple RTD Calibrator',
  } as unknown as SelectedMasterInstrument

  beforeAll(() => {
    useMasterInstrumentStore.getState().loadFromRegistry()
  })

  const renderIt = (param: Parameter) =>
    renderCard(param, { instrument: calibrator, mastersOnCertificate: new Set([10]) })

  it('does not call it unsupported', () => {
    renderIt(parameter({ masterInstrumentId: 10, rangeMin: '-10', rangeMax: '40' }))
    expect(
      screen.queryByText('Not supported by this instrument'),
    ).not.toBeInTheDocument()
  })

  it('leaves the parameter tickable', () => {
    renderIt(parameter({ masterInstrumentId: 10, rangeMin: '-10', rangeMax: '40' }))
    expect(screen.getByRole('radio')).not.toBeDisabled()
  })

  it('still refuses a parameter the instrument measures nothing like', () => {
    renderIt(
      parameter({
        masterInstrumentId: 10,
        parameterName: 'Relative Humidity',
        parameterUnit: '%RH',
        rangeMin: '10',
        rangeMax: '90',
      }),
    )
    // The sentence sits beside the range in one line, so match on the line - and it
    // matches the wrapping elements too, hence "all".
    expect(
      screen.getAllByText((_c, el) =>
        /Not supported by this instrument/.test(el?.textContent ?? ''),
      ).length,
    ).toBeGreaterThan(0)
  })
})

describe('a parameter with a stale reference to a removed master', () => {
  /**
   * The parameter still holds the id of a master that is no longer on the certificate.
   * Worth saying - but it is not what greys the row out when the instrument also does
   * not serve the parameter, and said first it hid the reason that did: the badge read
   * "Incompatible" while the line beneath talked about a master that is not here.
   */
  const calibrator = {
    ...master,
    masterInstrumentId: 10,
    assetNo: '1018 HTAIPL/L',
  } as unknown as SelectedMasterInstrument

  beforeAll(() => {
    useMasterInstrumentStore.getState().loadFromRegistry()
  })

  // queryAll, not getAll: the absence of a line is half of what is being checked, and
  // getAll throws rather than returning nothing.
  const line = (re: RegExp) =>
    screen.queryAllByText((_c, el) => re.test(el?.textContent ?? '')).length > 0

  it('names the reason that blocks it', () => {
    // Assigned to this master, and no longer something it measures - a parameter
    // renamed after the master was chosen. It stays on the card, since the answer was
    // given, and says what is wrong with it.
    renderCard(
      parameter({
        parameterName: 'Relative Humidity',
        parameterUnit: '%RH',
        masterInstrumentId: 10,
      }),
      { instrument: calibrator, mastersOnCertificate: new Set([10]) },
    )
    expect(line(/Not supported by this instrument/)).toBe(true)
  })

  it('still says so where nothing else is wrong', () => {
    renderCard(
      parameter({ masterInstrumentId: 999 }),
      { instrument: calibrator, mastersOnCertificate: new Set([10]) },
    )
    expect(line(/no longer on this certificate/)).toBe(true)
  })
})

describe('parameters the master cannot measure', () => {
  /**
   * A thermometer's card offered "Pressure - not supported by this instrument", greyed
   * out and unclickable: a row that exists only to be refused. What belongs on the card
   * is what the master serves, or could.
   */
  const calibrator = {
    ...master,
    masterInstrumentId: 10,
    assetNo: '1018 HTAIPL/L',
  } as unknown as SelectedMasterInstrument

  beforeAll(() => {
    useMasterInstrumentStore.getState().loadFromRegistry()
  })

  const renderBoth = (over: Partial<Parameter> = {}) =>
    renderCard(parameter({ masterInstrumentId: 10 }), {
      instrument: calibrator,
      mastersOnCertificate: new Set([10]),
      parameters: [
        parameter({ masterInstrumentId: 10 }),
        parameter({
          id: 'p2',
          parameterName: 'Pressure (Absolute)',
          parameterUnit: 'bar',
          masterInstrumentId: null,
          ...over,
        }),
      ],
    })

  it('leaves them off the card', () => {
    renderBoth()
    expect(screen.getByText('Temperature')).toBeInTheDocument()
    expect(screen.queryByText('Pressure (Absolute)')).not.toBeInTheDocument()
  })

  it('says how many were left off, so none vanish quietly', () => {
    renderBoth()
    // The sentence wraps the count in its own element, so the parent matches too.
    expect(
      screen.getAllByText((_c, el) => /1 other on this certificate/.test(el?.textContent ?? ''))
        .length,
    ).toBeGreaterThan(0)
  })

  it('keeps one that is assigned to this master anyway', () => {
    // An answer already given is not hidden because the capability no longer matches.
    renderBoth({ masterInstrumentId: 10 })
    expect(screen.getByText('Pressure (Absolute)')).toBeInTheDocument()
  })
})

describe('one parameter per master, on the card', () => {
  /**
   * The add flow asks for one parameter. The card was still offering ticks, so a
   * master could be spread over several afterwards - and the declaration underneath is
   * written once per master, so the second parameter inherited the first's capability,
   * curve and procedure without anyone saying they applied to it.
   */
  const calibrator = {
    ...master,
    masterInstrumentId: 10,
    assetNo: '1018 HTAIPL/L',
  } as unknown as SelectedMasterInstrument

  beforeAll(() => {
    useMasterInstrumentStore.getState().loadFromRegistry()
  })

  const two = [
    parameter({ id: 'p1', parameterName: 'Temperature', masterInstrumentId: 10 }),
    parameter({ id: 'p2', parameterName: 'RTD', masterInstrumentId: null }),
  ]

  it('offers a choice, not a set of ticks', () => {
    renderCard(two[0], {
      instrument: calibrator,
      mastersOnCertificate: new Set([10]),
      parameters: two,
    })
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
    expect(screen.getAllByRole('radio').length).toBeGreaterThan(1)
  })

  it('lets the one it was against go when another is picked', () => {
    const { onParameterUpdate } = renderCard(two[0], {
      instrument: calibrator,
      mastersOnCertificate: new Set([10]),
      parameters: two,
    })
    // The second radio in the list is the second parameter's.
    fireEvent.click(screen.getAllByRole('radio')[1])

    const calls = onParameterUpdate.mock.calls
    // The one it was against is released, with everything read off this master.
    expect(calls.some(([i, p]) => i === 0 && p.masterInstrumentId === null && p.sopReference === ''))
      .toBe(true)
    // And the new one takes it.
    expect(calls.some(([i, p]) => i === 1 && p.masterInstrumentId === 10)).toBe(true)
  })
})
