/**
 * Declaring how a master was used for one parameter.
 *
 * Only a question with more than one answer gets asked. An instrument that records one
 * capability, one role and no curves asks nothing and states the facts instead.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MasterCapabilityDeclaration } from '@/components/forms/MasterCapabilityDeclaration'
import type { RegistryUnit } from '@/lib/master-instrument-registry'
import type { RequiredRange } from '@/lib/master-instrument-capability'

const bucket = (min: number, max: number, lc: number, acc: number) => ({
  id: `B${min}`,
  min,
  max,
  min_inclusive: true,
  max_inclusive: true,
  least_count: { value: lc, unit: '°C' },
  accuracy: { type: 'symmetric', value: acc, unit: '°C', polarity: '±' },
})

const profile = (over: Record<string, unknown>) =>
  ({
    id: 'P1',
    parameter: 'Temperature',
    role: 'measuring',
    unit: '°C',
    min: -100,
    max: 100,
    buckets: [bucket(-100, 100, 0.1, 0.05)],
    subtypes: [],
    ...over,
  }) as never

const unit = (profiles: unknown[]) => ({ capability_profiles: profiles }) as RegistryUnit

const required: RequiredRange[] = [{ from: -20, to: 60, leastCount: 0.1, accuracy: 0.5 }]

function renderIt(u: RegistryUnit, over: Record<string, unknown> = {}) {
  const onChange = vi.fn()
  render(
    <MasterCapabilityDeclaration
      unit={u}
      parameterName="Temperature"
      required={required}
      onChange={onChange}
      {...over}
    />,
  )
  return onChange
}

describe('when there is nothing to choose', () => {
  it('asks nothing and states what was used', () => {
    renderIt(unit([profile({})]))
    // The words still appear as labels in the settled summary; what must not appear is
    // anything to choose between.
    expect(screen.queryByRole('button', { name: /measuring/i })).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Sensor type/i)).not.toBeInTheDocument()
    expect(screen.getByText('Temperature')).toBeInTheDocument()
    expect(screen.getByText('measuring')).toBeInTheDocument()
    expect(screen.getByText(/the only option, so not asked/i)).toBeInTheDocument()
  })
})

describe('when the same parameter is recorded two ways', () => {
  const both = unit([
    profile({ id: 'P1', role: 'measuring' }),
    profile({ id: 'P2', role: 'source', min: -50, max: 80 }),
  ])

  it('asks which role it was used in', () => {
    renderIt(both)
    expect(screen.getByText(/Used as/i)).toBeInTheDocument()
    expect(screen.getByText('measuring')).toBeInTheDocument()
    expect(screen.getByText('source')).toBeInTheDocument()
  })

  it('explains the two roles rather than assuming they are understood', () => {
    renderIt(both)
    expect(screen.getByText('it produced the value')).toBeInTheDocument()
    expect(screen.getByText('it read the value')).toBeInTheDocument()
  })

  it('reports the profile chosen', () => {
    const onChange = renderIt(both)
    fireEvent.click(screen.getByText('source').closest('button')!)
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ profileId: 'P2' }))
  })
})

describe('when the capability records curves', () => {
  const curves = unit([
    profile({
      subtypes: [
        { id: 'Pt-100', min: -200, max: 660, buckets: [bucket(-200, 660, 0.1, 0.05)] },
        { id: 'Cu-53', min: -70, max: 150, buckets: [bucket(-70, 150, 0.5, 0.5)] },
        { id: 'Ni-100', min: 0, max: 40, buckets: [bucket(0, 40, 0.1, 0.4)] },
      ],
    }),
  ])

  it('asks which curve was used', () => {
    renderIt(curves)
    expect(screen.getByLabelText(/Sensor type/i)).toBeInTheDocument()
  })

  it('offers only the curves that reach the required range', () => {
    renderIt(curves)
    const select = screen.getByLabelText(/Sensor type/i)
    // Ni-100 stops at 40 and cannot cover -20 to 60.
    expect(select.textContent).toContain('Pt-100')
    expect(select.textContent).toContain('Cu-53')
    expect(select.textContent).not.toContain('Ni-100')
  })

  it('says how many were set aside, and can show them', () => {
    renderIt(curves)
    expect(screen.getByText(/1 option hidden/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Show all options/i }))
    expect(screen.getByLabelText(/Sensor type/i).textContent).toContain('Ni-100')
  })

  it('states the reach of the curve in hand', () => {
    renderIt(curves, { profileId: 'P1', subtype: 'Cu-53' })
    expect(screen.getByText('-70 to 150 °C')).toBeInTheDocument()
  })

  it('reports the curve chosen', () => {
    const onChange = renderIt(curves, { profileId: 'P1', subtype: 'Pt-100' })
    fireEvent.change(screen.getByLabelText(/Sensor type/i), { target: { value: 'Cu-53' } })
    expect(onChange).toHaveBeenCalledWith({ profileId: 'P1', subtype: 'Cu-53' })
  })
})

describe('when the instrument records nothing for the parameter', () => {
  it('renders nothing at all', () => {
    const { container } = render(
      <MasterCapabilityDeclaration
        unit={unit([profile({ parameter: 'Pressure' })])}
        parameterName="Temperature"
        required={required}
        onChange={vi.fn()}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
