import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const apiFetch = vi.fn()
vi.mock('@/lib/api-client', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }))

import CapabilitiesTab from '@/components/admin/CapabilitiesTab'

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body })
const fail = (status: number, body: unknown = null) => ({
  ok: false,
  status,
  json: async () => {
    if (body === null) throw new Error('no body')
    return body
  },
})

const bucket = (over: Record<string, unknown> = {}) => ({
  id: 'b1',
  bucketKey: 'B1',
  min: 0,
  max: 100,
  minInclusive: true,
  maxInclusive: true,
  leastCountValue: 0.01,
  leastCountUnit: 'bar',
  accuracyKind: 'SYMMETRIC',
  accuracyValue: 0.1,
  accuracyUnit: '%FS',
  accuracyPolarity: '±',
  accuracyFormula: null,
  accuracyClass: null,
  sortOrder: 0,
  ...over,
})

const profile = (over: Record<string, unknown> = {}) => ({
  id: 'p1',
  profileKey: 'P1',
  parameter: 'Pressure',
  role: 'MEASURING',
  unit: 'bar',
  kind: 'RANGE',
  min: 0,
  max: 700,
  minInclusive: true,
  maxInclusive: true,
  subtypeKind: null,
  sopReferences: ['NLAB/CAL/ML1/R01'],
  source: 'registry',
  sortOrder: 0,
  subtypes: [],
  buckets: [bucket()],
  ...over,
})

const payload = (over: Record<string, unknown> = {}) => ({
  instrument: { id: 'row-1', instrumentId: 'stable-1', assetNumber: '708 HTAIPL/L', description: 'Universal Calibrator' },
  profiles: [profile()],
  assetType: 'simple',
  components: [],
  ...over,
})

describe('reading capabilities', () => {
  it('lists a capability with its role and unit', async () => {
    apiFetch.mockResolvedValue(ok(payload()))
    render(<CapabilitiesTab instrumentId="row-1" />)

    // The wireframe titles each card "CAPABILITY PROFILE 1: PRESSURE (measuring)".
    expect(await screen.findByText(/CAPABILITY PROFILE 1: PRESSURE/)).toBeTruthy()
    expect(screen.getByText(/\(measuring\)/)).toBeTruthy()
    expect(screen.getByText('1 capability')).toBeTruthy()
  })

  it('shows an undeclared least count as undeclared, never as zero', async () => {
    apiFetch.mockResolvedValue(
      ok(payload({ profiles: [profile({ buckets: [bucket({ leastCountValue: null, leastCountUnit: null })] })] })),
    )
    render(<CapabilitiesTab instrumentId="row-1" />)

    await userEvent.click(await screen.findByRole('button', { name: 'Expand Pressure' }))
    const row = screen.getByText('B1').closest('tr')!
    expect(within(row).getByText('not declared')).toBeTruthy()
    expect(within(row).queryByText('0')).toBeNull()
  })

  it('says which range owns a shared boundary', async () => {
    // Two ranges meeting at 100: without this the reading at 100 takes whichever
    // accuracy is found first.
    apiFetch.mockResolvedValue(
      ok(
        payload({
          profiles: [
            profile({
              buckets: [bucket(), bucket({ id: 'b2', bucketKey: 'B2', min: 100, max: 500, minInclusive: false })],
            }),
          ],
        }),
      ),
    )
    render(<CapabilitiesTab instrumentId="row-1" />)

    await userEvent.click(await screen.findByRole('button', { name: 'Expand Pressure' }))
    expect(screen.getByText('above 100 to 500 bar')).toBeTruthy()
    expect(screen.getByText('0 to 100 bar')).toBeTruthy()
  })

  it('renders a formula accuracy as written, not as a number', async () => {
    apiFetch.mockResolvedValue(
      ok(
        payload({
          profiles: [
            profile({
              buckets: [
                bucket({
                  accuracyKind: 'FORMULA',
                  accuracyValue: null,
                  accuracyPolarity: null,
                  accuracyFormula: '±(0.02% of reading + 2 counts)',
                }),
              ],
            }),
          ],
        }),
      ),
    )
    render(<CapabilitiesTab instrumentId="row-1" />)

    await userEvent.click(await screen.findByRole('button', { name: 'Expand Pressure' }))
    expect(screen.getByText('±(0.02% of reading + 2 counts)')).toBeTruthy()
  })

  it('nests ranges under subtypes and shows none on the profile itself', async () => {
    apiFetch.mockResolvedValue(
      ok(
        payload({
          profiles: [
            profile({
              parameter: 'Thermocouple',
              unit: '°C',
              subtypeKind: 'thermocouple_type',
              buckets: [],
              subtypes: [
                {
                  id: 's1',
                  subtypeKey: 'Type J',
                  min: -210,
                  max: 1200,
                  minInclusive: true,
                  maxInclusive: true,
                  sortOrder: 0,
                  buckets: [bucket({ min: -210, max: -200, leastCountUnit: '°C' })],
                },
              ],
            }),
          ],
        }),
      ),
    )
    render(<CapabilitiesTab instrumentId="row-1" />)

    await userEvent.click(await screen.findByRole('button', { name: 'Expand Thermocouple' }))
    // Named twice on purpose: once in AVAILABLE SUBTYPES, once as the card's own heading.
    expect(screen.getAllByText(/Type J/).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('-210 to 1200 °C')).toBeTruthy()
    expect(screen.getByText('1 subtypes · 1 ranges')).toBeTruthy()
    expect(screen.getByText(/AVAILABLE SUBTYPES/)).toBeTruthy()
    expect(screen.getAllByText('RANGE BUCKETS:').length).toBe(1)
  })

  it('marks a capability somebody added by hand', async () => {
    apiFetch.mockResolvedValue(ok(payload({ profiles: [profile({ source: 'manual' })] })))
    render(<CapabilitiesTab instrumentId="row-1" />)
    expect(await screen.findByText('added here')).toBeTruthy()
  })

  it('names the indicator and sensor of a composite instrument', async () => {
    apiFetch.mockResolvedValue(
      ok(
        payload({
          assetType: 'composite',
          components: [
            { id: 'c1', componentKey: 'ind', role: 'INDICATOR', make: null, model: 'HP 32', serialNumber: '5250062' },
            { id: 'c2', componentKey: 'sen', role: 'SENSOR', make: null, model: 'HC2A-S4', serialNumber: '25005083' },
          ],
        }),
      ),
    )
    render(<CapabilitiesTab instrumentId="row-1" />)
    expect(await screen.findByText(/Indicator 5250062, Sensor 25005083/)).toBeTruthy()
  })
})

describe('when something goes wrong', () => {
  it('says the session expired rather than showing an empty list', async () => {
    apiFetch.mockResolvedValue(fail(401))
    render(<CapabilitiesTab instrumentId="row-1" />)

    expect(await screen.findByText(/session has expired/i)).toBeTruthy()
    expect(screen.queryByText(/No capabilities recorded/)).toBeNull()
  })

  it('reports a server error with its status, and offers a retry', async () => {
    apiFetch.mockResolvedValue(fail(500))
    render(<CapabilitiesTab instrumentId="row-1" />)

    expect(await screen.findByText(/error 500/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /try again/i })).toBeTruthy()
  })

  it('still shows the empty state when there really are no capabilities', async () => {
    apiFetch.mockResolvedValue(ok(payload({ profiles: [] })))
    render(<CapabilitiesTab instrumentId="row-1" />)

    expect(await screen.findByText('No capabilities recorded yet.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /try again/i })).toBeNull()
  })

  it('passes on the reason a capability could not be deleted', async () => {
    apiFetch
      .mockResolvedValueOnce(ok(payload()))
      .mockResolvedValueOnce(fail(409, { error: '2 certificates still reference this capability. Reassign them first.' }))

    render(<CapabilitiesTab instrumentId="row-1" />)
    await screen.findByText(/CAPABILITY PROFILE 1: PRESSURE/)
    await userEvent.click(screen.getByRole('button', { name: /Delete capability Pressure/ }))

    expect(await screen.findByText(/2 certificates still reference/)).toBeTruthy()
  })

  it('says it could not reach the server when the request throws', async () => {
    apiFetch.mockImplementation(() => Promise.reject(new Error('offline')))
    render(<CapabilitiesTab instrumentId="row-1" />)

    expect(await screen.findByText(/could not reach the server/i)).toBeTruthy()
  })
})

describe('adding a range', () => {
  it('sends a blank least count as blank, so the server can store "not declared"', async () => {
    apiFetch.mockResolvedValue(ok(payload()))
    render(<CapabilitiesTab instrumentId="row-1" />)

    await userEvent.click(await screen.findByRole('button', { name: 'Expand Pressure' }))
    await userEvent.click(screen.getByRole('button', { name: /Add Bucket/ }))

    await userEvent.type(screen.getByLabelText('Min'), '100')
    await userEvent.type(screen.getByLabelText('Max'), '500')
    // least count deliberately left alone

    apiFetch.mockClear()
    apiFetch.mockResolvedValue(ok({ bucket: { id: 'new', bucketKey: 'B2' } }))
    await userEvent.click(screen.getByRole('button', { name: 'Add Bucket' }))

    await waitFor(() => expect(apiFetch).toHaveBeenCalled())
    const body = JSON.parse(apiFetch.mock.calls[0][1].body)
    expect(body.leastCountValue).toBe('')
    expect(body.leastCountUnit).toBeNull()
    expect(body.min).toBe('100')
  })

  it('offers the formula field only once a formula accuracy is chosen', async () => {
    apiFetch.mockResolvedValue(ok(payload()))
    render(<CapabilitiesTab instrumentId="row-1" />)

    await userEvent.click(await screen.findByRole('button', { name: 'Expand Pressure' }))
    await userEvent.click(screen.getByRole('button', { name: /Add Bucket/ }))

    expect(screen.getByLabelText('± value')).toBeTruthy()
    await userEvent.selectOptions(screen.getByLabelText('Accuracy'), 'FORMULA')

    expect(screen.queryByLabelText('± value')).toBeNull()
    expect(screen.getByLabelText(/Formula, exactly as the certificate states it/)).toBeTruthy()
  })
})
