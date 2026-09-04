/**
 * Reopening a declaration that is already settled.
 *
 * Most instruments record one capability in one role, so their declaration is settled
 * without being asked - and MasterCapabilityDeclaration reports that answer back the
 * moment it mounts, so the certificate keeps it. That is right, and it is also why
 * "edit" cannot be expressed by clearing the declaration: clearing it set it again
 * immediately and the panel shut, which made the pencil look like it did nothing.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MasterInstrumentCard } from '@/components/forms/MasterInstrumentSection'
import { useMasterInstrumentStore } from '@/lib/stores/master-instrument-store'
import type { Parameter, SelectedMasterInstrument } from '@/lib/stores/certificate-store'

// 230 HTAIPL/L records Temperature once, as a measuring device, with no curves - the
// shape that made the pencil a no-op.
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

function renderCard(param: Parameter) {
  const onParameterUpdate = vi.fn()
  render(
    <MasterInstrumentCard
      instrument={master}
      index={0}
      onRemove={vi.fn()}
      parameters={[param]}
      mastersOnCertificate={new Set([LEGACY_ID])}
      onParameterUpdate={onParameterUpdate}
      certificateId="cert-1"
      images={[]}
      onImageUpload={vi.fn()}
      onImageDelete={vi.fn()}
    />,
  )
  return onParameterUpdate
}

const pencil = () => screen.queryByLabelText('Edit how this instrument was used')

describe('a declaration that is already made', () => {
  beforeAll(() => {
    useMasterInstrumentStore.getState().loadFromRegistry()
  })

  it('is shown as a fact, with the questions put away', () => {
    renderCard(parameter({ masterProfileId: 'P1' }))
    expect(screen.queryByRole('group', { name: /Compatibility/i })).not.toBeInTheDocument()
    expect(pencil()).toBeInTheDocument()
  })

  it('reopens when the pencil is clicked, and stays open', () => {
    // The whole point: on an instrument whose answer settles itself, the panel used to
    // reappear and vanish in the same tick.
    renderCard(parameter({ masterProfileId: 'P1' }))
    fireEvent.click(pencil()!)
    expect(screen.getByRole('group', { name: /Compatibility - For Temperature/i })).toBeInTheDocument()
  })

  it('does not rewrite the declaration just to open it', () => {
    const onParameterUpdate = renderCard(parameter({ masterProfileId: 'P1' }))
    fireEvent.click(pencil()!)
    // Opening is a state of the screen. Clearing the answer to open the panel is what
    // made the button a no-op.
    expect(onParameterUpdate).not.toHaveBeenCalled()
  })

  it('offers a way back out', () => {
    renderCard(parameter({ masterProfileId: 'P1' }))
    fireEvent.click(pencil()!)
    expect(pencil()).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.queryByRole('group', { name: /Compatibility/i })).not.toBeInTheDocument()
    expect(pencil()).toBeInTheDocument()
  })
})

describe('an instrument that records a real choice', () => {
  // 711 HTAIPL/L records Thermocouple both as a source and as a measuring device, so
  // there is something to be asked again.
  const CHOICE_ID = 3
  const choiceMaster = { ...master, masterInstrumentId: CHOICE_ID, assetNo: '711 HTAIPL/L' }
  const choiceParam = (over: Partial<Parameter> = {}) =>
    parameter({ parameterName: 'Thermocouple', masterInstrumentId: CHOICE_ID, ...over })

  beforeAll(() => {
    useMasterInstrumentStore.getState().loadFromRegistry()
  })

  const renderChoice = (param: Parameter) => {
    const onParameterUpdate = vi.fn()
    render(
      <MasterInstrumentCard
        instrument={choiceMaster as unknown as SelectedMasterInstrument}
        index={0}
        onRemove={vi.fn()}
        parameters={[param]}
        mastersOnCertificate={new Set([CHOICE_ID])}
        onParameterUpdate={onParameterUpdate}
        certificateId="cert-1"
        images={[]}
        onImageUpload={vi.fn()}
        onImageDelete={vi.fn()}
      />,
    )
    return onParameterUpdate
  }

  it('starts the declaration over rather than showing the answer pre-filled', () => {
    // Editing means being asked again. The role belongs to a capability, so until the
    // capability is answered afresh there is no role question to show.
    renderChoice(choiceParam({ masterProfileId: 'P2', masterSubtype: undefined }))
    fireEvent.click(pencil()!)
    const panel = screen.getByRole('group', { name: /Compatibility - For Thermocouple/i })
    expect(within(panel).getByText(/Used as/i)).toBeInTheDocument()
    // Neither role is chosen: the radios are all empty until it is answered again.
    const chosen = within(panel)
      .getAllByRole('button')
      .filter((b) => /^(source|measuring)/i.test(b.textContent ?? ''))
      .filter((b) => b.querySelector('[style*="inset"]'))
    expect(chosen).toHaveLength(0)
  })

  it('leaves the stored answer alone until a new one is given', () => {
    const onParameterUpdate = renderChoice(choiceParam({ masterProfileId: 'P2' }))
    fireEvent.click(pencil()!)
    expect(onParameterUpdate).not.toHaveBeenCalled()
  })

  it('records the new answer once it is given', () => {
    const onParameterUpdate = renderChoice(choiceParam({ masterProfileId: 'P2' }))
    fireEvent.click(pencil()!)
    const panel = screen.getByRole('group', { name: /Compatibility - For Thermocouple/i })
    fireEvent.click(within(panel).getByText('measuring').closest('button')!)
    expect(onParameterUpdate).toHaveBeenCalledWith(
      0,
      expect.objectContaining({ masterProfileId: expect.any(String) }),
    )
  })
})

describe('a declaration that has not been made', () => {
  beforeAll(() => {
    useMasterInstrumentStore.getState().loadFromRegistry()
  })

  it('asks for it without being prompted', () => {
    renderCard(parameter({ masterProfileId: undefined }))
    expect(screen.getByRole('group', { name: /Compatibility - For Temperature/i })).toBeInTheDocument()
    // Nothing to reopen - it is already open.
    expect(pencil()).not.toBeInTheDocument()
  })
})

describe('a card that cannot be edited', () => {
  beforeAll(() => {
    useMasterInstrumentStore.getState().loadFromRegistry()
  })

  it('offers no pencil at all', () => {
    render(
      <MasterInstrumentCard
        instrument={master}
        index={0}
        onRemove={vi.fn()}
        parameters={[parameter({ masterProfileId: 'P1' })]}
        mastersOnCertificate={new Set([LEGACY_ID])}
        onParameterUpdate={vi.fn()}
        certificateId="cert-1"
        images={[]}
        onImageUpload={vi.fn()}
        onImageDelete={vi.fn()}
        disabled
      />,
    )
    expect(pencil()).not.toBeInTheDocument()
  })
})
