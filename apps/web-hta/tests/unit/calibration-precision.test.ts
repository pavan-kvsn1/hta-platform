import { describe, expect, it } from 'vitest'
import {
  decimalsWritten,
  errorPrecision,
  formatToCalibrationPrecision,
  getPrecisionFromLeastCount,
  resolveCalibrationPrecision,
  roundToCalibrationPrecision,
} from '@/lib/utils/calibration-precision'

describe('calibration precision', () => {
  it('uses the absolute least count for a non-bucketed parameter', () => {
    expect(getPrecisionFromLeastCount('0.0001')).toBe(4)
    expect(resolveCalibrationPrecision({
      requiresBinning: false,
      leastCountValue: '0.0001',
    }, '25.0000')).toEqual({
      precision: 4,
      leastCount: '0.0001',
      binIndex: null,
    })
  })

  it('uses the matching bucket least count for a bucketed parameter', () => {
    const parameter = {
      requiresBinning: true,
      leastCountValue: '',
      bins: [
        { binMin: '0', binMax: '10', leastCount: '0.1' },
        { binMin: '10.01', binMax: '100', leastCount: '0.0001' },
      ],
    }

    expect(resolveCalibrationPrecision(parameter, '5')).toEqual({
      precision: 1,
      leastCount: '0.1',
      binIndex: 0,
    })
    expect(resolveCalibrationPrecision(parameter, '25')).toEqual({
      precision: 4,
      leastCount: '0.0001',
      binIndex: 1,
    })
  })

  it('supports serialized bucket data returned by certificate APIs', () => {
    const bins = JSON.stringify([
      { binMin: '0', binMax: '100', leastCount: '0.001' },
    ])

    expect(resolveCalibrationPrecision({ requiresBinning: true, bins }, '50').precision).toBe(3)
  })

  it('rounds and formats all readings with the resolved precision', () => {
    expect(roundToCalibrationPrecision(0.00006, 4)).toBe(0.0001)
    expect(roundToCalibrationPrecision(-0.00004, 4)).toBe(0)
    expect(formatToCalibrationPrecision(25, 4)).toBe('25.0000')
    expect(formatToCalibrationPrecision(0.1, 4)).toBe('0.1000')
    expect(formatToCalibrationPrecision(null, 4)).toBe('-')
  })
})

describe('what the error is rounded to', () => {
  /**
   * The least count is the smallest division the instrument can show, so it governs
   * what can be read and written down. The error is a difference of two readings, not
   * a reading, and is good to whatever they were good to.
   *
   * Rounding it to the least count threw the finding away: on a bin resolving to one
   * degree, an error of -0.41 became -0, was normalised to 0, and the certificate
   * reported no error where there was one.
   */
  it('counts the decimals a reading was written to', () => {
    expect(decimalsWritten('90.41')).toBe(2)
    expect(decimalsWritten('90')).toBe(0)
    expect(decimalsWritten('90.4100')).toBe(4)
    expect(decimalsWritten('')).toBe(0)
    expect(decimalsWritten(null)).toBe(0)
  })

  it('takes the wider of the two readings', () => {
    // 90 minus 90.41 is good to two decimals, not to none.
    expect(errorPrecision('90', '90.41')).toBe(2)
    expect(errorPrecision('20.0', '20.00')).toBe(2)
    expect(errorPrecision('20', '20')).toBe(0)
  })

  it('keeps an error the bin would have rounded away', () => {
    // Bin 6 of the certificate this came from resolves to 1 degree.
    expect(roundToCalibrationPrecision(-0.41, errorPrecision('90.00', '90.41'))).toBe(-0.41)
    expect(roundToCalibrationPrecision(-0.41, 0)).toBe(0)
  })

  it('still tidies what floating point leaves behind', () => {
    // 40.00 - 40.11 is -0.10999999999999943.
    const raw = 40.0 - 40.11
    expect(roundToCalibrationPrecision(raw, errorPrecision('40.00', '40.11'))).toBe(-0.11)
  })
})
