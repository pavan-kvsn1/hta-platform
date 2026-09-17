import { describe, it, expect } from 'vitest'
import { masterEntryForView } from '@/lib/master-entry/for-view'

describe('a master entry on its way to a reader', () => {
  it('carries everything the certificate holds about it', () => {
    // Five pages listed five fields each, so the certificate number, where it was
    // calibrated, the parameter it served and the specification never reached the
    // page - and the PDF said "Not recorded" about a certificate that records it.
    expect(
      masterEntryForView({
        id: 'e1',
        masterInstrumentId: '67',
        parameterId: 'p1',
        category: 'Thermal',
        description: 'RTD Thermometer',
        make: 'Fluke',
        model: '1524',
        assetNo: '966 HTAIPL/L',
        serialNumber: 'B12345',
        calibratedAt: 'NABL Lab',
        reportNo: '966/25',
        calibrationDueDate: '2027-03-12',
        capabilityParameter: 'Temperature',
        masterLeastCount: '0.001',
        masterLeastCountUnit: '°C',
        masterAccuracy: '0.05',
        masterAccuracyUnit: '°C',
      }),
    ).toMatchObject({
      parameterId: 'p1',
      reportNo: '966/25',
      calibratedAt: 'NABL Lab',
      capabilityParameter: 'Temperature',
      masterLeastCount: '0.001',
      masterAccuracy: '0.05',
    })
  })

  it('turns the stored instrument id into the number the app works in', () => {
    expect(masterEntryForView({ id: 'e1', masterInstrumentId: '67' }).masterInstrumentId).toBe(67)
    expect(masterEntryForView({ id: 'e1' }).masterInstrumentId).toBe(0)
  })

  it('leaves a field the certificate never recorded empty rather than undefined', () => {
    const entry = masterEntryForView({ id: 'e1' })
    expect(entry.masterLeastCount).toBe('')
    expect(entry.parameterId).toBe('')
  })
})
