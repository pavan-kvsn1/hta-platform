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

  // Nothing assigned yet, so the card offers what this master could serve - and that
  // is where a parameter it cannot measure would otherwise appear.
  const renderBoth = (over: Partial<Parameter> = {}) =>
    renderCard(parameter({ masterInstrumentId: null }), {
      instrument: calibrator,
      mastersOnCertificate: new Set([10]),
      parameters: [
        parameter({ masterInstrumentId: null }),
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

  it('lists only the parameter it is against, once there is one', () => {
    // The other is one this master could serve, and is not a choice to be made here:
    // the flow asks which parameter a master is for, and the declaration below the row
    // is written for that one. Listing the rest put a second parameter and a second SOP
    // box under a declaration that was never about it.
    renderCard(two[0], {
      instrument: calibrator,
      mastersOnCertificate: new Set([10]),
      parameters: two,
    })
    // One row, so one radio and one SOP field. ("RTD" itself appears further down as
    // one of 1018's capabilities, so the name alone says nothing here.)
    expect(screen.getAllByRole('radio')).toHaveLength(1)
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
    expect(screen.getAllByText(/SOP Ref/i)).toHaveLength(1)
  })

  it('offers the candidates while none is chosen', () => {
    const { onParameterUpdate } = renderCard(two[0], {
      instrument: calibrator,
      mastersOnCertificate: new Set([10]),
      parameters: two.map((p) => ({ ...p, masterInstrumentId: null })),
    })
    expect(screen.getAllByRole('radio')).toHaveLength(2)
    fireEvent.click(screen.getAllByRole('radio')[1])
    expect(onParameterUpdate).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ masterInstrumentId: 10 }),
    )
  })
})

describe('two parameters of the same name', () => {
  /**
   * A certificate calibrating one instrument over two spans has two parameters called
   * Temperature and a master for each. Both cards said "Master Instrument N" and both
   * rows said "Temperature", so which master was for which span could not be read
   * anywhere without opening them and comparing ranges.
   */
  const twoSpans = [
    parameter({ id: 'p1', rangeMin: '-10', rangeMax: '40', masterInstrumentId: LEGACY_ID }),
    parameter({ id: 'p2', rangeMin: '0', rangeMax: '100', masterInstrumentId: null }),
  ]

  beforeAll(() => {
    useMasterInstrumentStore.getState().loadFromRegistry()
  })

  it('tells them apart by range on the row', () => {
    renderCard(twoSpans[0], { parameters: twoSpans })
    expect(screen.getByText('Temperature (-10 to 40 °C)')).toBeInTheDocument()
  })

  it('says on the outside which one the master is for', () => {
    renderCard(twoSpans[0], { parameters: twoSpans })
    // Parent elements carry the same text, hence "all".
    expect(
      screen.getAllByText((_c, el) =>
        /Master Instrument 1\s*—\s*Temperature \(-10 to 40 °C\)/.test(
          el?.textContent?.replace(/\s+/g, ' ') ?? '',
        ),
      ).length,
    ).toBeGreaterThan(0)
  })

  it('leaves a lone parameter alone', () => {
    // Nothing to be confused with, so no range is added. ("Temperature" also appears
    // as one of the instrument's capabilities further down.)
    renderCard(twoSpans[0], { parameters: [twoSpans[0]] })
    expect(screen.queryByText(/Temperature \(-10 to 40/)).not.toBeInTheDocument()
  })
})

describe('the same instrument used for two parameters', () => {
  /**
   * 781 HTAIPL/L is the master for both temperature spans on a certificate, so it is
   * on it twice. A parameter used to name the instrument, and two entries carried the
   * same instrument id - so neither could say which span it was declared against, both
   * cards reported the first span as their own, and the second span could not be
   * assigned at all, since writing that instrument id on it would have said nothing new.
   *
   * The entry names its parameter now.
   */
  const spans = [
    parameter({ id: 'p1', rangeMin: '-10', rangeMax: '40', masterInstrumentId: LEGACY_ID }),
    parameter({ id: 'p2', rangeMin: '0', rangeMax: '100', masterInstrumentId: LEGACY_ID }),
  ]
  const second = { ...master, id: 'mi-2', parameterId: 'p2' } as unknown as SelectedMasterInstrument
  const first = { ...master, parameterId: 'p1' } as unknown as SelectedMasterInstrument

  beforeAll(() => {
    useMasterInstrumentStore.getState().loadFromRegistry()
  })

  it('gives each entry its own span', () => {
    renderCard(spans[0], { instrument: first, parameters: spans })
    expect(screen.getAllByText(/Temperature \(-10 to 40 °C\)/).length).toBeGreaterThan(0)
    expect(screen.queryByText(/Temperature \(0 to 100 °C\)/)).not.toBeInTheDocument()
  })

  it('and the second entry the other', () => {
    renderCard(spans[1], { instrument: second, parameters: spans })
    expect(screen.getAllByText(/Temperature \(0 to 100 °C\)/).length).toBeGreaterThan(0)
    expect(screen.queryByText(/Temperature \(-10 to 40 °C\)/)).not.toBeInTheDocument()
  })

  it('falls back to the instrument where the entry names no parameter', () => {
    // Saved before the link was recorded, and right for a certificate that uses an
    // instrument once.
    renderCard(spans[0], { instrument: master, parameters: [spans[0]] })
    expect(screen.getAllByText(/Temperature/).length).toBeGreaterThan(0)
  })
})
