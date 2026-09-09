/**
 * Where the requirement comes from, and which capability has to meet it.
 *
 * Ordinarily the unit under test's own. Not so where the master measures something
 * else: a temperature indicator calibrated with a millivolt source has to be judged in
 * millivolts, against a figure the engineer took from a table.
 */
import { describe, it, expect } from 'vitest'
import { mappedCapability, requirementFor } from '@/lib/master-instrument-capability'

const uucParameter = {
  parameterName: 'Temperature',
  parameterUnit: '°C',
  rangeMin: '-20',
  rangeMax: '60',
  leastCountValue: '0.1',
  accuracyValue: '0.5',
  requiresBinning: false,
  bins: [],
}

const throughMillivolts = {
  ...uucParameter,
  masterMapping: {
    parameter: 'DC Voltage',
    unit: 'mV',
    ranges: [{ from: 0, to: 20, leastCount: 0.001, accuracy: 0.01 }],
  },
}

describe('when the master measures the same thing', () => {
  it('takes the requirement from the unit under test', () => {
    const { ranges, unit, stated } = requirementFor(uucParameter)
    expect(ranges).toEqual([{ from: -20, to: 60, leastCount: 0.1, accuracy: 0.5 }])
    expect(unit).toBe('°C')
    expect(stated).toBe(false)
  })

  it('looks for a capability recording that parameter', () => {
    expect(mappedCapability(uucParameter)).toEqual({ name: 'Temperature', unit: '°C' })
  })
})

describe('when the master measures something else', () => {
  it('takes the requirement the engineer stated, in the master\u2019s units', () => {
    const { ranges, unit, stated } = requirementFor(throughMillivolts)
    expect(ranges).toEqual([{ from: 0, to: 20, leastCount: 0.001, accuracy: 0.01 }])
    expect(unit).toBe('mV')
    // The caller says so on screen: the ratio checks the instrument, not the
    // arithmetic that produced the figure.
    expect(stated).toBe(true)
  })

  it('looks for a capability recording the mapped parameter', () => {
    // Without this the list would hold thermometers and never a voltage source.
    expect(mappedCapability(throughMillivolts)).toEqual({ name: 'DC Voltage', unit: 'mV' })
  })
})

describe('a mapping whose requirement has not been stated yet', () => {
  it('judges nothing, rather than judging against the wrong units', () => {
    // Falling back to the unit under test would compare a 0 to 100 mV source against
    // a requirement of -20 to 60 °C and report it out of range - arithmetic on two
    // different quantities, which means nothing. Everything downstream already knows
    // what to do with an empty requirement: it says so and rates nothing.
    const half = { ...throughMillivolts, masterMapping: { ...throughMillivolts.masterMapping, ranges: [] } }
    const { ranges, unit, stated } = requirementFor(half)
    expect(ranges).toEqual([])
    expect(unit).toBe('mV')
    expect(stated).toBe(true)
  })
})

describe('a parameter that states nothing at all', () => {
  it('yields no ranges rather than inventing them', () => {
    const bare = { parameterName: 'Temperature', parameterUnit: '°C' }
    expect(requirementFor(bare).ranges).toEqual([])
  })
})

describe('a binned parameter', () => {
  it('keeps its bins when the master measures the same thing', () => {
    const binned = {
      ...uucParameter,
      requiresBinning: true,
      bins: [
        { binMin: '-20', binMax: '20', leastCount: '0.1', accuracy: '0.5' },
        { binMin: '20', binMax: '60', leastCount: '0.1', accuracy: '0.8' },
      ],
    }
    expect(requirementFor(binned).ranges).toHaveLength(2)
  })

  it('is overridden by a stated master requirement, which has its own bands', () => {
    const binned = {
      ...throughMillivolts,
      requiresBinning: true,
      bins: [{ binMin: '-20', binMax: '20', leastCount: '0.1', accuracy: '0.5' }],
    }
    expect(requirementFor(binned).ranges).toEqual([
      { from: 0, to: 20, leastCount: 0.001, accuracy: 0.01 },
    ])
  })
})
