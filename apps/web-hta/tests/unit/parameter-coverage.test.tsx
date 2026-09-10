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
  // A master is half the answer; the section also wants the procedure. Assigned
  // parameters in these fixtures carry one unless a test is about its absence.
  sopReference: 'NLAB/CAL/T01/R01',
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
        assetByInstrumentId={new Map([[7, '600 HTAIPL/L']])}
      />,
    )
    expect(screen.getByText('1 of 2 parameters ready')).toBeInTheDocument()
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
        assetByInstrumentId={new Map([[7, '600 HTAIPL/L']])}
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
    render(
      <ParameterCoverage
        parameters={[param({ masterInstrumentId: 7 })]}
        assetByInstrumentId={new Map([[7, '600 HTAIPL/L']])}
      />,
    )
    // Not "All 1 parameters have a master".
    expect(screen.getByText(/The parameter has a master and a procedure/i)).toBeInTheDocument()
  })

  it('reports completion for several', () => {
    render(
      <ParameterCoverage
        parameters={[
          param({ id: 'a', masterInstrumentId: 7 }),
          param({ id: 'b', parameterName: 'Flow', masterInstrumentId: 8 }),
        ]}
        assetByInstrumentId={new Map([[7, '600'], [8, '742']])}
      />,
    )
    expect(screen.getByText(/All 2 parameters have a master/i)).toBeInTheDocument()
  })

  it('tells two parameters of the same name apart by their range', () => {
    // Certificate 5eed80c6 calibrates Temperature twice. "Temperature, Pressure and
    // Temperature" names neither of them.
    render(
      <ParameterCoverage
        parameters={[
          param({ id: 'a', rangeMin: '-20', rangeMax: '60' }),
          param({ id: 'b', parameterName: 'Pressure', parameterUnit: 'Pa', rangeMin: '0', rangeMax: '3000' }),
          param({ id: 'c', rangeMin: '10', rangeMax: '100' }),
        ]}
      />,
    )
    expect(
      screen.getByText('Temperature (-20 to 60 °C), Pressure and Temperature (10 to 100 °C)'),
    ).toBeInTheDocument()
  })

  it('does not count a master that is no longer on the certificate', () => {
    // Certificate 5eed80c6 is in this state: its parameters name master 5 while the
    // only master saved on it is 68. Counting that as covered says the section is
    // finished when not one row on screen can be ticked.
    render(
      <ParameterCoverage
        parameters={[param({ masterInstrumentId: 5 })]}
        assetByInstrumentId={new Map([[68, '252 HTAIPL/L']])}
      />,
    )
    expect(screen.getByText('0 of 1 parameter ready')).toBeInTheDocument()
    expect(screen.getByText(/no longer on this certificate/i)).toBeInTheDocument()
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

describe('a parameter with a master but no procedure', () => {
  /**
   * The section wants both. This panel used to report only the master, so it could say
   * "complete" while the section header said otherwise - leaving the engineer to hunt
   * for a field nothing on screen named.
   */
  const assets = new Map([[68, '600 HTAIPL/L']])

  it('does not count it as ready', () => {
    render(
      <ParameterCoverage
        parameters={[param({ masterInstrumentId: 68, sopReference: '' })]}
        assetByInstrumentId={assets}
      />,
    )
    expect(screen.getByText('0 of 1 parameter ready')).toBeInTheDocument()
  })

  it('says which half is missing, on the parameter and in the summary', () => {
    render(
      <ParameterCoverage
        parameters={[param({ masterInstrumentId: 68, sopReference: '   ' })]}
        assetByInstrumentId={assets}
      />,
    )
    // Once on the parameter's own card, once in the summary beneath.
    expect(screen.getByText(/Assigned to 600 HTAIPL\/L — no SOP reference/)).toBeInTheDocument()
    expect(
      screen.getAllByText((_c, el) => /has a master but no SOP reference/.test(el?.textContent ?? ''))
        .length,
    ).toBeGreaterThan(0)
  })

  it('calls it complete once both are there', () => {
    render(
      <ParameterCoverage
        parameters={[param({ masterInstrumentId: 68 })]}
        assetByInstrumentId={assets}
      />,
    )
    expect(screen.getByText('1 of 1 parameter ready')).toBeInTheDocument()
    expect(screen.getByText(/a master and a procedure/i)).toBeInTheDocument()
  })
})
