/**
 * The parameters a lab calibrates, over the wire.
 *
 * The split being tested: standards come from the master registry and are shared, while
 * the name shown to an engineer belongs to the tenant. Every response carries both, so
 * the UI can display one and match on the other.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@hta/database', () => ({
  prisma: {
    calibrationParameter: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
  Prisma: {},
}))

vi.mock('../../src/middleware/auth.js', () => ({
  requireStaff: vi.fn((_req: any, _reply: any, done: any) => done?.()),
  requireAdmin: vi.fn((_req: any, _reply: any, done: any) => done?.()),
}))

import Fastify from 'fastify'
import { prisma } from '@hta/database'
import calibrationParameterRoutes from '../../src/routes/calibration-parameters/index.js'

const mockedPrisma = vi.mocked(prisma)

const TENANT = 'tenant-1'

function buildApp() {
  const app = Fastify()
  app.decorateRequest('tenantId', '')
  app.addHook('onRequest', async (req) => {
    ;(req as any).tenantId = TENANT
  })
  app.register(calibrationParameterRoutes, { prefix: '/api/calibration-parameters' })
  return app
}

/** A tenant row and the standard behind it, as Prisma returns them. */
const row = (over: Record<string, unknown> = {}) => ({
  id: 'p-rtd',
  customName: 'RTD',
  units: [],
  defaultUnit: null,
  subtypes: [],
  active: true,
  standard: {
    standardName: 'RTD',
    category: 'Temperature',
    units: ['°C'],
    defaultUnit: '°C',
    subtypes: ['Pt-100', 'Cu-53'],
    aliases: [],
    source: 'registry',
    ...((over.standard as object) ?? {}),
  },
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/calibration-parameters', () => {
  it('returns the standard name alongside the one this lab uses', async () => {
    // The UI shows one and matches masters on the other; a response with only the
    // custom name could not do the second.
    mockedPrisma.calibrationParameter.findMany.mockResolvedValue([
      row({ customName: 'Platinum RTD' }),
    ] as never)

    const res = await buildApp().inject({ method: 'GET', url: '/api/calibration-parameters' })

    expect(res.statusCode).toBe(200)
    const { parameters } = res.json()
    expect(parameters[0]).toMatchObject({
      standardName: 'RTD',
      customName: 'Platinum RTD',
      category: 'Temperature',
    })
  })

  it('falls back to the standard where the lab set nothing of its own', async () => {
    mockedPrisma.calibrationParameter.findMany.mockResolvedValue([row()] as never)

    const res = await buildApp().inject({ method: 'GET', url: '/api/calibration-parameters' })

    const { parameters } = res.json()
    expect(parameters[0].units).toEqual(['°C'])
    expect(parameters[0].defaultUnit).toBe('°C')
    expect(parameters[0].subtypes).toEqual(['Pt-100', 'Cu-53'])
  })

  it('prefers the lab list where it set one', async () => {
    mockedPrisma.calibrationParameter.findMany.mockResolvedValue([
      row({ units: ['°C', 'K'], defaultUnit: 'K', subtypes: ['Pt-100'] }),
    ] as never)

    const res = await buildApp().inject({ method: 'GET', url: '/api/calibration-parameters' })

    const { parameters } = res.json()
    expect(parameters[0].units).toEqual(['°C', 'K'])
    expect(parameters[0].defaultUnit).toBe('K')
    expect(parameters[0].subtypes).toEqual(['Pt-100'])
  })

  it('carries the other names the quantity is known by', async () => {
    // Without these an existing certificate saying "Voltage DC" resolves to nothing.
    mockedPrisma.calibrationParameter.findMany.mockResolvedValue([
      row({
        customName: 'DC Voltage',
        standard: { standardName: 'DC Voltage', aliases: ['Voltage DC'], category: 'Electrical' },
      }),
    ] as never)

    const res = await buildApp().inject({ method: 'GET', url: '/api/calibration-parameters' })

    expect(res.json().parameters[0].aliases).toEqual(['Voltage DC'])
  })

  it('hides the ones a lab switched off, unless asked', async () => {
    mockedPrisma.calibrationParameter.findMany.mockResolvedValue([] as never)

    const app = buildApp()
    await app.inject({ method: 'GET', url: '/api/calibration-parameters' })
    expect(mockedPrisma.calibrationParameter.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: TENANT, active: true } }),
    )

    await app.inject({
      method: 'GET',
      url: '/api/calibration-parameters?includeInactive=true',
    })
    expect(mockedPrisma.calibrationParameter.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { tenantId: TENANT } }),
    )
  })

  it('groups them the way the dropdown reads', async () => {
    mockedPrisma.calibrationParameter.findMany.mockResolvedValue([
      row({ id: 'b', customName: 'Pressure', standard: { standardName: 'Pressure', category: 'Pressure' } }),
      row({ id: 'c', customName: 'Thermocouple', standard: { standardName: 'Thermocouple', category: 'Temperature' } }),
      row({ id: 'a', customName: 'DC Voltage', standard: { standardName: 'DC Voltage', category: 'Electrical' } }),
    ] as never)

    const res = await buildApp().inject({ method: 'GET', url: '/api/calibration-parameters' })

    expect(res.json().parameters.map((p: { category: string }) => p.category)).toEqual([
      'Electrical', 'Pressure', 'Temperature',
    ])
  })

  it('asks only for this tenant', async () => {
    mockedPrisma.calibrationParameter.findMany.mockResolvedValue([] as never)
    await buildApp().inject({ method: 'GET', url: '/api/calibration-parameters' })
    expect(mockedPrisma.calibrationParameter.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: TENANT }) }),
    )
  })
})

describe('PUT /api/calibration-parameters/:id', () => {
  it('renames it for this lab', async () => {
    mockedPrisma.calibrationParameter.findFirst.mockResolvedValueOnce(row() as never)
    mockedPrisma.calibrationParameter.findFirst.mockResolvedValueOnce(null as never)
    mockedPrisma.calibrationParameter.update.mockResolvedValue(
      row({ customName: 'Platinum RTD' }) as never,
    )

    const res = await buildApp().inject({
      method: 'PUT',
      url: '/api/calibration-parameters/p-rtd',
      payload: { customName: 'Platinum RTD' },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().parameter.customName).toBe('Platinum RTD')
    // The standard is untouched: it is what masters are recorded against.
    expect(res.json().parameter.standardName).toBe('RTD')
  })

  it('refuses a name another parameter already has', async () => {
    // Two parameters with one name make the dropdown ambiguous and the certificate
    // that stores it unreadable later.
    mockedPrisma.calibrationParameter.findFirst.mockResolvedValueOnce(row() as never)
    mockedPrisma.calibrationParameter.findFirst.mockResolvedValueOnce({ id: 'other' } as never)

    const res = await buildApp().inject({
      method: 'PUT',
      url: '/api/calibration-parameters/p-rtd',
      payload: { customName: 'Temperature' },
    })

    expect(res.statusCode).toBe(409)
    expect(res.json().message).toContain('already called')
    expect(mockedPrisma.calibrationParameter.update).not.toHaveBeenCalled()
  })

  it('refuses a default unit that is not on offer', async () => {
    mockedPrisma.calibrationParameter.findFirst.mockResolvedValueOnce(row() as never)

    const res = await buildApp().inject({
      method: 'PUT',
      url: '/api/calibration-parameters/p-rtd',
      payload: { defaultUnit: 'bar' },
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().message).toContain('not one of the units')
  })

  it('accepts a default that is among the units being set', async () => {
    mockedPrisma.calibrationParameter.findFirst.mockResolvedValueOnce(row() as never)
    mockedPrisma.calibrationParameter.findFirst.mockResolvedValueOnce(null as never)
    mockedPrisma.calibrationParameter.update.mockResolvedValue(
      row({ units: ['°C', 'K'], defaultUnit: 'K' }) as never,
    )

    const res = await buildApp().inject({
      method: 'PUT',
      url: '/api/calibration-parameters/p-rtd',
      payload: { units: ['°C', 'K'], defaultUnit: 'K' },
    })

    expect(res.statusCode).toBe(200)
  })

  it('refuses an empty name', async () => {
    const res = await buildApp().inject({
      method: 'PUT',
      url: '/api/calibration-parameters/p-rtd',
      payload: { customName: '   ' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('says not found for a parameter belonging to another lab', async () => {
    // Not "forbidden": that would confirm the id exists somewhere.
    mockedPrisma.calibrationParameter.findFirst.mockResolvedValue(null as never)

    const res = await buildApp().inject({
      method: 'PUT',
      url: '/api/calibration-parameters/someone-elses',
      payload: { customName: 'Mine now' },
    })

    expect(res.statusCode).toBe(404)
    expect(mockedPrisma.calibrationParameter.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'someone-elses', tenantId: TENANT } }),
    )
  })

  it('can switch one off without renaming it', async () => {
    mockedPrisma.calibrationParameter.findFirst.mockResolvedValueOnce(row() as never)
    mockedPrisma.calibrationParameter.update.mockResolvedValue(row({ active: false }) as never)

    const res = await buildApp().inject({
      method: 'PUT',
      url: '/api/calibration-parameters/p-rtd',
      payload: { active: false },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().parameter.active).toBe(false)
  })
})
