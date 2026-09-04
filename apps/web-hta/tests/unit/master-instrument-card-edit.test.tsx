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
