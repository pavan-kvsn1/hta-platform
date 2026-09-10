import { describe, it, expect } from 'vitest'
import { masterEntryFromApi } from '@/lib/master-entry-from-api'

const id = () => 'generated'
const parameters = [{ id: 'p1' }, { id: 'p2' }]

describe('opening a master entry the API sent', () => {
  it('carries the specification the certificate recorded', () => {
    // The fault this pins: the database held the master's least count, the API sent
    // it, and the form dropped it - so the PDF said "Not recorded" about a
    // certificate that recorded it.
    const entry = masterEntryFromApi(
      {
        masterInstrumentId: '67',
        capabilityParameter: 'Temperature',
        masterLeastCount: '0.001',
        masterLeastCountUnit: '°C',
        masterAccuracy: '0.05',
        masterAccuracyUnit: '°C',
      },
      parameters,
      id,
    )
    expect(entry).toMatchObject({
      capabilityParameter: 'Temperature',
      masterLeastCount: '0.001',
      masterLeastCountUnit: '°C',
      masterAccuracy: '0.05',
      masterAccuracyUnit: '°C',
    })
  })

  it('turns the position the API sends into the parameter own id', () => {
    expect(masterEntryFromApi({ parameterIndex: 1 }, parameters, id).parameterId).toBe('p2')
  })

  it('names no parameter where the API sends none', () => {
    expect(masterEntryFromApi({}, parameters, id).parameterId).toBeUndefined()
    expect(masterEntryFromApi({ parameterIndex: -1 }, parameters, id).parameterId).toBeUndefined()
  })

  it('leaves the specification empty where the certificate has none', () => {
    const entry = masterEntryFromApi({ masterInstrumentId: 67 }, parameters, id)
    expect(entry.masterLeastCount).toBe('')
    expect(entry.masterAccuracy).toBe('')
  })

  it('marks a master whose calibration has expired', () => {
    const now = new Date('2026-09-10')
    expect(masterEntryFromApi({ calibrationDueDate: '2026-01-01' }, parameters, id, now).isExpired).toBe(true)
    expect(masterEntryFromApi({ calibrationDueDate: '2026-09-20' }, parameters, id, now).isExpiringSoon).toBe(true)
    expect(masterEntryFromApi({ calibrationDueDate: '2027-09-20' }, parameters, id, now).isExpiringSoon).toBe(false)
  })
})
