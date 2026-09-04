/**
 * The comparison shown under a parameter once a master is assigned to it.
 *
 * The requirement is read from the unit under test; what this adds is the master's
 * side of it and the verdict. Nothing here is entered by hand.
 */
import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MasterCapabilityComparison } from '@/components/forms/MasterCapabilityComparison'
import type { RegistryUnit } from '@/lib/master-instrument-registry'

const bucket = (min: number, max: number, lc: number, acc: number) => ({
  id: `B${min}`,
  min,
  max,
  min_inclusive: true,
  max_inclusive: true,
  least_count: { value: lc, unit: '°C' },
  accuracy: { type: 'symmetric', value: acc, unit: '°C', polarity: '±' },
})

function unit(profiles: unknown[]): RegistryUnit {
  return { capability_profiles: profiles } as RegistryUnit
}

const temperature = unit([
  {
    id: 'P1',
    parameter: 'Temperature',
    role: 'measuring',
    unit: '°C',
    min: -100,
    max: 100,
    buckets: [bucket(-100, 100, 0.1, 0.0625)],
    subtypes: [],
  },
])

const parameter = {
  parameterName: 'Temperature',
  parameterUnit: '°C',
  rangeMin: '-20',
  rangeMax: '60',
  leastCountValue: '0.1',
  accuracyValue: '±0.5',
  requiresBinning: false,
  bins: [],
}

describe('MasterCapabilityComparison', () => {
  it('shows the required range beside the band that serves it', () => {
    render(<MasterCapabilityComparison unit={temperature} parameter={parameter} />)
    expect(screen.getByText(/-20 to 60/)).toBeInTheDocument()
    expect(screen.getByText('-100 to 100')).toBeInTheDocument()
  })

  it('names the capability and the role it was used in', () => {
    render(<MasterCapabilityComparison unit={temperature} parameter={parameter} />)
    expect(screen.getByText('Temperature')).toBeInTheDocument()
    expect(screen.getByText('measuring')).toBeInTheDocument()
  })

  it('reports the accuracy ratio and clears the threshold', () => {
    render(<MasterCapabilityComparison unit={temperature} parameter={parameter} />)
    expect(screen.getByText('8.0 : 1')).toBeInTheDocument()
    expect(screen.getByText(/clears 4:1/i)).toBeInTheDocument()
  })

  it('says the least count matches rather than showing arithmetic', () => {
    render(<MasterCapabilityComparison unit={temperature} parameter={parameter} />)
    expect(screen.getByText('Matches')).toBeInTheDocument()
  })

  it('warns when the master is close to the unit it is checking', () => {
    const marginal = unit([
      { ...(temperature.capability_profiles[0] as object), buckets: [bucket(-100, 100, 0.1, 0.3)] },
    ])
    render(<MasterCapabilityComparison unit={marginal} parameter={parameter} />)
    expect(screen.getByText('1.7 : 1')).toBeInTheDocument()
    expect(screen.getByText(/may not decide pass or fail/i)).toBeInTheDocument()
  })

  it('stops on a least count the instrument cannot resolve', () => {
    const coarse = unit([
      { ...(temperature.capability_profiles[0] as object), buckets: [bucket(-100, 100, 0.5, 0.0625)] },
    ])
    render(<MasterCapabilityComparison unit={coarse} parameter={parameter} />)
    expect(screen.getByText('Does not match')).toBeInTheDocument()
    expect(screen.getByText(/finer than it can actually read/i)).toBeInTheDocument()
  })

  it('reports a range the instrument does not reach', () => {
    const short = unit([
      { ...(temperature.capability_profiles[0] as object), min: 0, max: 40, buckets: [bucket(0, 40, 0.1, 0.0625)] },
    ])
    render(<MasterCapabilityComparison unit={short} parameter={parameter} />)
    expect(screen.getByText(/falls outside every band/i)).toBeInTheDocument()
  })

  it('gives a binned parameter one row per bin, judged separately', () => {
    const binnedUnit = unit([
      {
        ...(temperature.capability_profiles[0] as object),
        min: 0,
        max: 100,
        buckets: [bucket(0, 50, 0.1, 0.05), bucket(50, 100, 0.1, 0.4)],
      },
    ])
    const binned = {
      ...parameter,
      requiresBinning: true,
      bins: [
        { binMin: '0', binMax: '50', leastCount: '0.1', accuracy: '±0.5' },
        { binMin: '50', binMax: '100', leastCount: '0.1', accuracy: '±0.5' },
      ],
    }
    render(<MasterCapabilityComparison unit={binnedUnit} parameter={binned} />)
    const rows = screen.getAllByRole('row').slice(1)
    expect(rows).toHaveLength(2)
    expect(within(rows[0]).getByText('10.0 : 1')).toBeInTheDocument()
    // The second bin is the weak one, and the verdict follows it rather than the first.
    expect(within(rows[1]).getByText('1.3 : 1')).toBeInTheDocument()
    expect(screen.getByText(/may not decide pass or fail/i)).toBeInTheDocument()
  })

  it('says so when the accuracy cannot be compared as a number', () => {
    const classAcc = unit([
      {
        ...(temperature.capability_profiles[0] as object),
        buckets: [{ ...bucket(-100, 100, 0.1, 0), accuracy: { type: 'class', class: '0.5' } }],
      },
    ])
    render(<MasterCapabilityComparison unit={classAcc} parameter={parameter} />)
    expect(screen.getByText('Not comparable')).toBeInTheDocument()
    expect(screen.getByText(/recorded as a class/i)).toBeInTheDocument()
  })

  it('asks for the parameter to be set up before comparing anything', () => {
    render(
      <MasterCapabilityComparison
        unit={temperature}
        parameter={{ ...parameter, rangeMin: '', rangeMax: '' }}
      />,
    )
    expect(screen.getByText(/Set this parameter/i)).toBeInTheDocument()
  })

  it('says plainly when the instrument records nothing for the parameter', () => {
    render(<MasterCapabilityComparison unit={unit([])} parameter={parameter} />)
    expect(screen.getByText(/No capability is recorded/i)).toBeInTheDocument()
  })

  it('honours a lab threshold other than the default', () => {
    const marginal = unit([
      { ...(temperature.capability_profiles[0] as object), buckets: [bucket(-100, 100, 0.1, 0.2)] },
    ])
    render(<MasterCapabilityComparison unit={marginal} parameter={parameter} threshold={2} />)
    expect(screen.getByText(/clears 2:1/i)).toBeInTheDocument()
  })
})
