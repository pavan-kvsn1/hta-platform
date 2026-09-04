/**
 * Which parameters still have no master instrument.
 *
 * Masters are chosen per instrument but a certificate is signed per parameter, so a
 * parameter could be left unassigned with nothing on screen saying so.
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ParameterCoverage, listOf } from '@/components/forms/ParameterCoverage'

const param = (over: Partial<Parameters<typeof ParameterCoverage>[0]['parameters'][0]> = {}) => ({
  id: 'p1',
  parameterName: 'Temperature',
  parameterUnit: '°C',
  rangeMin: '-20',
  rangeMax: '60',
  masterInstrumentId: null as number | null,
  ...over,
})

describe('listOf', () => {
  it('reads as a person would write it', () => {
    expect(listOf(['Flow'])).toBe('Flow')
    expect(listOf(['Pressure', 'Flow'])).toBe('Pressure and Flow')
    expect(listOf(['Temperature', 'Pressure', 'Flow'])).toBe('Temperature, Pressure and Flow')
    expect(listOf(['A', 'B', 'C', 'D'])).toBe('A, B, C and D')
  })
})

describe('ParameterCoverage', () => {
  it('counts what is assigned', () => {
    render(
      <ParameterCoverage
        parameters={[
          param({ id: 'a', masterInstrumentId: 7 }),
          param({ id: 'b', parameterName: 'Pressure' }),
        ]}
      />,
    )
    expect(screen.getByText('1 of 2 parameters assigned')).toBeInTheDocument()
  })

  it('names the master a parameter is assigned to', () => {
    render(
      <ParameterCoverage
        parameters={[param({ masterInstrumentId: 7 })]}
        assetByInstrumentId={new Map([[7, '600 HTAIPL/L']])}
      />,
    )
    expect(screen.getByText('Assigned to 600 HTAIPL/L')).toBeInTheDocument()
  })

  it('blocks submission while a parameter has none, naming it', () => {
    render(
      <ParameterCoverage
        parameters={[
          param({ id: 'a', masterInstrumentId: 7 }),
          param({ id: 'b', parameterName: 'Flow' }),
        ]}
      />,
    )
    // Named twice on purpose: once on its own card, once in the sentence that blocks.
    expect(screen.getAllByText('Flow')).toHaveLength(2)
    expect(screen.getByText(/has no master instrument assigned/i)).toBeInTheDocument()
  })

  it('lists three missing parameters as a sentence, not three ands', () => {
    render(
      <ParameterCoverage
        parameters={[
          param({ id: 'a' }),
          param({ id: 'b', parameterName: 'Pressure' }),
          param({ id: 'c', parameterName: 'Flow' }),
        ]}
      />,
    )
    expect(screen.getByText('Temperature, Pressure and Flow')).toBeInTheDocument()
    expect(screen.getByText(/have no master instrument assigned/i)).toBeInTheDocument()
  })

  it('reports completion in the singular when there is one parameter', () => {
    render(<ParameterCoverage parameters={[param({ masterInstrumentId: 7 })]} />)
    // Not "All 1 parameters have a master".
    expect(screen.getByText(/The parameter has a master/i)).toBeInTheDocument()
  })

  it('reports completion for several', () => {
    render(
      <ParameterCoverage
        parameters={[
          param({ id: 'a', masterInstrumentId: 7 }),
          param({ id: 'b', parameterName: 'Flow', masterInstrumentId: 8 }),
        ]}
      />,
    )
    expect(screen.getByText(/All 2 parameters have a master/i)).toBeInTheDocument()
  })

  it('falls back to a position when a parameter has no name yet', () => {
    render(<ParameterCoverage parameters={[param({ parameterName: '' })]} />)
    expect(screen.getAllByText('Parameter 1').length).toBeGreaterThan(0)
  })

  it('renders nothing when the certificate has no parameters', () => {
    const { container } = render(<ParameterCoverage parameters={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})
