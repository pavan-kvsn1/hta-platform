/**
 * The masters on a certificate, under the parameters they served.
 *
 * A flat table of instruments answers "what was used". The question a reviewer is
 * asking is "was this parameter measured by something good enough for it", and that is
 * a question per parameter - a parameter can hold several masters now, and one
 * instrument can appear twice for two of them.
 *
 * The figures come from what the certificate itself recorded, never from the register
 * as it stands today: the register is regenerated as instruments are recalibrated, so
 * a reissued certificate would otherwise print numbers the original never carried.
 */
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'

import { MasterInstrumentsByParameter } from '@/components/certificate/MasterInstrumentsByParameter'
import { masterFit } from '@/lib/certificate/master-fit'

/** HTA/S22734/165/26, which is where the grey badge and the reason came from. */
const parameters = [
  {
    id: 'pt',
    parameterName: 'Temperature (Absolute)',
    parameterUnit: '°C',
    rangeMin: '-10',
    rangeMax: '40',
    leastCountValue: '0.1',
    accuracyValue: '1',
  },
  {
    id: 'pp',
    parameterName: 'Pressure (Absolute)',
    parameterUnit: 'bar',
    rangeMin: '0',
    rangeMax: '600',
    leastCountValue: '1',
    accuracyValue: '2',
  },
]

const rtd = {
  id: 'mi1',
  parameterId: 'pt',
  masterInstrumentId: '75',
  assetNo: '717 HTAIPL/L',
  description: 'Digital RTD Thermometer with PT 100 Sensor (4 Wire)',
  make: 'Delta Ohm',
  model: 'Ind: HD 2107.1 / Sen: TP 472 I',
  serialNumber: 'Ind: 17013097 / Sen: 19012265',
  calibrationDueDate: '09/25/2026',
  calibratedAt: 'Transcal, Bangalore',
  reportNo: 'TSC/25-26/11942-3',
  rangeFrom: '-10',
  rangeTo: '40',
  masterLeastCount: null,
  masterAccuracy: '0.25',
  masterAccuracyUnit: '°C',
  masterAcceptanceReason: 'Please aprove',
}

const druck = {
  id: 'mi2',
  parameterId: 'pp',
  masterInstrumentId: '127',
  assetNo: '188 HTAIPL/L',
  description: 'High Pressure External Transducer',
  make: 'Druck',
  model: 'DPI 610',
  serialNumber: '2899734',
  calibrationDueDate: '11/25/2026',
  rangeFrom: '0',
  rangeTo: '600',
  masterLeastCount: '0.01',
  masterLeastCountUnit: 'bar',
  masterAccuracy: '0.175',
  masterAccuracyUnit: 'bar',
}

const renderIt = (props = {}) =>
  render(
    <MasterInstrumentsByParameter
      instruments={[rtd, druck]}
      parameters={parameters}
      {...props}
    />,
  )

describe('grouping', () => {
  it('puts each master under the parameter it served', () => {
    renderIt()
    expect(screen.getByText('Temperature (Absolute)')).toBeInTheDocument()
    expect(screen.getByText('Pressure (Absolute)')).toBeInTheDocument()
    expect(screen.getByText('717 HTAIPL/L')).toBeInTheDocument()
  })

  it('names the range the parameter covers, beside it', () => {
    renderIt()
    expect(screen.getByText('(-10 to 40 °C)')).toBeInTheDocument()
  })

  it('says so when a parameter has no master at all', () => {
    render(
      <MasterInstrumentsByParameter
        instruments={[rtd]}
        parameters={parameters}
      />,
    )
    expect(screen.getByText('No master recorded')).toBeInTheDocument()
  })

  it('still lists a master the certificate never paired to a parameter', () => {
    // Certificates written before the pairing named one. Dropping them would hide an
    // instrument that was genuinely used.
    render(
      <MasterInstrumentsByParameter
        instruments={[{ ...rtd, parameterId: null }]}
        parameters={parameters}
      />,
    )
    expect(screen.getByText('Not recorded against a parameter')).toBeInTheDocument()
    expect(screen.getByText('717 HTAIPL/L')).toBeInTheDocument()
  })
})

describe('the two verdicts', () => {
  it('greys the least count where the certificate recorded none', () => {
    /**
     * This is the real case on HTA/S22734/165/26: the band serving that range has no
     * least count, which is what stopped the engineer and made them write a reason.
     * Grey is "nothing to judge by", which is a different answer from "falls short".
     */
    const fit = masterFit(rtd, parameters[0])
    expect(fit.leastCount).toBe('unknown')
    expect(fit.leastCountNote).toMatch(/No least count recorded/)
  })

  it('reads the accuracy as a ratio against what the parameter asked', () => {
    // +/-0.25 against the UUC's +/-1 is exactly the lab's 4:1.
    const fit = masterFit(rtd, parameters[0])
    expect(fit.ratio).toBe(4)
    expect(fit.accuracy).toBe('safe')
  })

  it('shows that ratio on the row', () => {
    renderIt()
    expect(screen.getByText('4.0 : 1')).toBeInTheDocument()
  })

  it('calls a master no better than the unit it checks incompatible', () => {
    const fit = masterFit({ masterAccuracy: '2' }, { accuracyValue: '1' })
    expect(fit.ratio).toBe(0.5)
    expect(fit.accuracy).toBe('incompatible')
  })

  it('calls a thin but usable ratio compatible, not safe', () => {
    const fit = masterFit({ masterAccuracy: '0.5' }, { accuracyValue: '1' })
    expect(fit.accuracy).toBe('compatible')
  })

  it('has margin where the master reads finer than the parameter is recorded to', () => {
    expect(masterFit(druck, parameters[1]).leastCount).toBe('safe')
  })

  it('has none where the two least counts are the same', () => {
    expect(masterFit({ masterLeastCount: '1' }, { leastCountValue: '1' }).leastCount).toBe(
      'compatible',
    )
  })

  it('falls short where the master cannot read as fine as the readings were written', () => {
    expect(masterFit({ masterLeastCount: '1' }, { leastCountValue: '0.1' }).leastCount).toBe(
      'incompatible',
    )
  })
})

describe('a master judged on a different scale', () => {
  const inMillivolts = {
    ...rtd,
    id: 'mi3',
    masterLeastCount: '0.001',
    masterLeastCountUnit: 'mV',
    masterAccuracy: '0.05',
    masterAccuracyUnit: 'mV',
  }

  it('is spotted from the unit the certificate recorded', () => {
    const fit = masterFit(inMillivolts, parameters[0])
    expect(fit.otherScale).toBe('mV')
  })

  it('is not spotted when the two units agree, whatever their case', () => {
    expect(masterFit({ masterAccuracyUnit: '°c ' }, { parameterUnit: '°C' }).otherScale).toBeNull()
  })

  it('is said on the row, because the ratio compares two different quantities', () => {
    render(
      <MasterInstrumentsByParameter instruments={[inMillivolts]} parameters={parameters} />,
    )
    expect(screen.getByText('mV')).toBeInTheDocument()
  })
})

describe('what opens on a row', () => {
  it('keeps the detail closed until it is asked for', () => {
    renderIt()
    expect(screen.queryByText('Calibrated at')).not.toBeInTheDocument()
  })

  it('shows where the master was calibrated and the range it was used over', () => {
    renderIt()
    fireEvent.click(screen.getByText('717 HTAIPL/L'))
    expect(screen.getByText('Transcal, Bangalore · TSC/25-26/11942-3')).toBeInTheDocument()
    expect(screen.getByText('-10 to 40 °C')).toBeInTheDocument()
  })

  it('says plainly which of the two figures the certificate did not record', () => {
    renderIt()
    fireEvent.click(screen.getByText('717 HTAIPL/L'))
    const leastCount = screen.getByText('Least count').parentElement!
    expect(within(leastCount).getByText('Not recorded')).toBeInTheDocument()
    expect(screen.getByText('±0.25 °C')).toBeInTheDocument()
  })

  it('carries the reason the engineer wrote for accepting it', () => {
    renderIt()
    fireEvent.click(screen.getByText('717 HTAIPL/L'))
    expect(screen.getByText(/Please aprove/)).toBeInTheDocument()
  })

  it('offers the photos, which no reviewer could open before', () => {
    const onViewPhotos = vi.fn()
    renderIt({ onViewPhotos })
    fireEvent.click(screen.getByText('717 HTAIPL/L'))
    fireEvent.click(screen.getByText('View'))
    expect(onViewPhotos).toHaveBeenCalledWith(expect.objectContaining({ id: 'mi1' }))
  })

  it('does not offer to open photos where the caller cannot show them', () => {
    renderIt()
    fireEvent.click(screen.getByText('717 HTAIPL/L'))
    expect(screen.getByText('No photos')).toBeInTheDocument()
    expect(screen.queryByText('View')).not.toBeInTheDocument()
  })
})
