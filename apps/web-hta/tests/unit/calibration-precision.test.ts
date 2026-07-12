import { describe, expect, it } from 'vitest'
import {
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
