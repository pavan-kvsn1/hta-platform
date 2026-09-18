/**
 * Which sections a reviewer has to look at again.
 *
 * A tick used to be held against a revision number, which was wrong in both
 * directions: a resubmission cleared all seven even where the engineer touched two, and
 * a section edited without raising a revision kept its tick. Hashing the section's
 * content answers both, and needs no list of which edits matter.
 */
import { describe, expect, it } from 'vitest'

import { REVIEW_SECTIONS, sectionHash, sectionHashes } from '../../src/lib/section-content.js'

/** HTA/S22734/165/26, cut down to what the hashes read. */
const certificate = () => ({
  id: 'cert-1',
  certificateNumber: 'HTA/S22734/165/26',
  currentRevision: 1,
  srfNumber: 'S22734',
  srfDate: new Date('2026-07-01'),
  calibratedAt: 'SITE',
  dateOfCalibration: new Date('2026-07-26'),
  calibrationDueDate: new Date('2026-12-25'),
  calibrationDueDateFormat: 'MonthName DD, YYYY',
  customerName: 'OneSource',
  uucDescription: 'MMI (3 Channel)',
  uucMake: 'Dixcell',
  ambientTemperature: '23.5',
  relativeHumidity: '52.7',
  calibrationStatus: '["satisfied"]',
  stickerOldRemoved: 'yes',
  selectedConclusionStatements: '["within_accuracy"]',
  additionalConclusionStatement: null,
  updatedAt: new Date('2026-09-18T10:00:00Z'),
  parameters: [
    {
      id: 'p1',
      parameterName: 'Temperature (Absolute)',
      parameterUnit: '°C',
      rangeMin: '-10',
      rangeMax: '40',
      accuracyValue: '1',
      leastCountValue: '0.1',
      results: [
        { pointNumber: 1, standardReading: '-5.00', beforeAdjustment: '-5.1', errorObserved: 0.1 },
        { pointNumber: 2, standardReading: '15.00', beforeAdjustment: '15.2', errorObserved: -0.2 },
      ],
    },
  ],
  masterInstruments: [
    {
      id: 'mi-1',
      masterInstrumentId: '75',
      assetNo: '717 HTAIPL/L',
      description: 'Digital RTD Thermometer',
      masterAcceptanceReason: 'Please aprove',
    },
  ],
})

const changed = (mutate: (c: ReturnType<typeof certificate>) => void) => {
  const c = certificate()
  mutate(c)
  return c
}

/** Which sections differ between two versions of a certificate. */
const drifted = (a: object, b: object) =>
  REVIEW_SECTIONS.filter((s) => sectionHash(a, s) !== sectionHash(b, s))

describe('a section that did not change', () => {
  it('hashes the same twice', () => {
    expect(sectionHashes(certificate())).toEqual(sectionHashes(certificate()))
  })

  it('does not move when a timestamp is touched', () => {
    // updatedAt changes on every save. If it fed the hash, one keystroke anywhere would
    // un-tick all seven sections, which is the behaviour this replaces.
    const later = changed((c) => {
      c.updatedAt = new Date('2026-09-18T18:00:00Z')
    })
    expect(drifted(certificate(), later)).toEqual([])
  })

  it('does not move when the revision does', () => {
    const resubmitted = changed((c) => {
      c.currentRevision = 2
    })
    expect(drifted(certificate(), resubmitted)).toEqual([])
  })
})

describe('an edit lands on the section it belongs to, and no other', () => {
  it('a corrected reading is the results, not the specifications', () => {
    /**
     * This is the case that matters. An engineer sent back to fix the master
     * instruments corrects a reading while they are in there; the revision request said
     * nothing about it, so nothing outside the content itself would have caught it.
     */
    const fixed = changed((c) => {
      c.parameters[0].results[1].beforeAdjustment = '15.3'
    })
    expect(drifted(certificate(), fixed)).toEqual(['results'])
  })

  it('a swapped master is the master instruments', () => {
    const swapped = changed((c) => {
      c.masterInstruments[0].assetNo = '781 HTAIPL/L'
      c.masterInstruments[0].masterInstrumentId = '67'
    })
    expect(drifted(certificate(), swapped)).toEqual(['master-inst'])
  })

  it('a changed acceptance reason is the master instruments', () => {
    const reworded = changed((c) => {
      c.masterInstruments[0].masterAcceptanceReason = 'Certificate states 0.01 resolution.'
    })
    expect(drifted(certificate(), reworded)).toEqual(['master-inst'])
  })

  it('a changed parameter range is the UUC details', () => {
    const widened = changed((c) => {
      c.parameters[0].rangeMax = '60'
    })
    expect(drifted(certificate(), widened)).toEqual(['uuc-details'])
  })

  it('a changed ambient temperature is the environment', () => {
    const warmer = changed((c) => {
      c.ambientTemperature = '24.1'
    })
    expect(drifted(certificate(), warmer)).toEqual(['environment'])
  })

  it('a changed due date is the summary', () => {
    const later = changed((c) => {
      c.calibrationDueDate = new Date('2027-01-31')
    })
    expect(drifted(certificate(), later)).toEqual(['summary'])
  })

  it('a changed conclusion is the conclusion', () => {
    const revised = changed((c) => {
      c.additionalConclusionStatement = 'Calibrated at customer site.'
    })
    expect(drifted(certificate(), revised)).toEqual(['conclusion'])
  })

  it('a changed sticker answer is the remarks', () => {
    const revised = changed((c) => {
      c.stickerOldRemoved = 'no'
    })
    expect(drifted(certificate(), revised)).toEqual(['remarks'])
  })
})

describe('ordering does not count as a change', () => {
  it('master rows coming back in a different order hash the same', () => {
    // The update route deletes and recreates every master row on each save, and nothing
    // guarantees the order they come back in.
    const two = certificate()
    two.masterInstruments = [
      { id: 'mi-2', masterInstrumentId: '67', assetNo: '781 HTAIPL/L', description: 'Fluke', masterAcceptanceReason: null },
      ...two.masterInstruments,
    ]
    const reversed = { ...two, masterInstruments: [...two.masterInstruments].reverse() }
    expect(sectionHash(two, 'master-inst')).toBe(sectionHash(reversed, 'master-inst'))
  })

  it('results coming back out of order hash the same', () => {
    const c = certificate()
    const reversed = changed((x) => {
      x.parameters[0].results = [...x.parameters[0].results].reverse()
    })
    expect(sectionHash(c, 'results')).toBe(sectionHash(reversed, 'results'))
  })
})

describe('an empty certificate', () => {
  it('hashes every section without throwing', () => {
    const hashes = sectionHashes({})
    expect(Object.keys(hashes)).toHaveLength(7)
    for (const s of REVIEW_SECTIONS) expect(hashes[s]).toMatch(/^[0-9a-f]{32}$/)
  })
})
