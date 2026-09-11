/**
 * Capability route tests.
 *
 * The mocked Prisma is deliberately narrow: only the models these routes touch. Auth is
 * bypassed with a preHandler that sets req.user and req.tenantId, as in admin-routes.
 */

vi.mock('@hta/database', () => {
  const model = () => ({
    findFirst: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    createMany: vi.fn(),
    count: vi.fn(),
  })
  const prisma = {
    masterInstrument: model(),
    masterInstrumentCertificate: model(),
    masterInstrumentComponent: model(),
    masterCapabilityProfile: model(),
    masterCapabilitySubtype: model(),
    masterCapabilityBucket: model(),
    masterCapabilityAudit: model(),
    $transaction: vi.fn(),
  }
  class Decimal {
    constructor(private readonly v: number) {}
    toNumber() {
      return this.v
    }
  }
  return { prisma, Prisma: { Decimal } }
})

vi.mock('../../src/middleware/auth.js', () => ({
  requireAdmin: async () => {},
  requireMasterAdmin: async () => {},
}))

import Fastify from 'fastify'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma, Prisma } from '@hta/database'
import capabilityRoutes from '../../src/routes/admin/capabilities.js'

const p = vi.mocked(prisma) as any
const dec = (n: number | null) => (n === null ? null : new (Prisma as any).Decimal(n))

function buildApp() {
  const app = Fastify({ logger: false })
  app.decorateRequest('tenantId', '')
  app.decorateRequest('user', null)
  app.addHook('preHandler', async (req: any) => {
    req.tenantId = (req.headers['x-tenant-id'] as string) || 'tenant-1'
    req.user = { sub: 'admin-1', email: 'admin@test.com', name: 'Test Admin', role: 'ADMIN', isAdmin: true }
  })
  app.register(capabilityRoutes, { prefix: '/api/admin' })
  return app
}

const H = { 'x-tenant-id': 'tenant-1' }
const INSTRUMENT = {
  id: 'row-v3',
  instrumentId: 'stable-1',
  tenantId: 'tenant-1',
  assetNumber: '708 HTAIPL/L',
  description: 'Universal Calibrator',
}

/** Runs the callback against the mocked client, as a real $transaction would. */
function passthroughTransaction() {
  p.$transaction.mockImplementation(async (arg: any) => (typeof arg === 'function' ? arg(p) : Promise.all(arg)))
}

let app: ReturnType<typeof buildApp>

beforeEach(() => {
  vi.clearAllMocks()
  passthroughTransaction()
  app = buildApp()
  p.masterCapabilityAudit.create.mockResolvedValue({ id: 'audit-1' })
})

describe('GET capabilities', () => {
  it('reads the version row but returns capabilities of the stable instrument', async () => {
    p.masterInstrument.findFirst.mockResolvedValue(INSTRUMENT)
    p.masterCapabilityProfile.findMany.mockResolvedValue([])
    p.masterInstrumentComponent.findMany.mockResolvedValue([])

    const res = await app.inject({ method: 'GET', url: '/api/admin/instruments/row-v3/capabilities', headers: H })

    expect(res.statusCode).toBe(200)
    // The lookup is by the row id in the URL...
    expect(p.masterInstrument.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'row-v3', tenantId: 'tenant-1' } }),
    )
    // ...but profiles are fetched by the identity that survives a new version.
    expect(p.masterCapabilityProfile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: 'tenant-1', instrumentId: 'stable-1' } }),
    )
  })

  it('turns Decimal bounds into numbers, so the browser can compare them', async () => {
    p.masterInstrument.findFirst.mockResolvedValue(INSTRUMENT)
    p.masterInstrumentComponent.findMany.mockResolvedValue([])
    p.masterCapabilityProfile.findMany.mockResolvedValue([
      {
        id: 'p1',
        profileKey: 'P1',
        parameter: 'Thermocouple',
        role: 'MEASURING',
        unit: '°C',
        kind: 'RANGE',
        minValue: dec(-210),
        maxValue: dec(1820),
        minInclusive: true,
        maxInclusive: true,
        subtypeKind: 'thermocouple_type',
        sopReferences: ['NLAB/CAL/ET1/R01'],
        source: 'registry',
        sortOrder: 0,
        subtypes: [
          {
            id: 's1',
            subtypeKey: 'Type J',
            minValue: dec(-210),
            maxValue: dec(1200),
            minInclusive: true,
            maxInclusive: true,
            sortOrder: 0,
            buckets: [
              {
                id: 'b1',
                bucketKey: 'B1',
                minValue: dec(-210),
                maxValue: dec(-200),
                minInclusive: true,
                maxInclusive: true,
                leastCountValue: dec(0.1),
                leastCountUnit: '°C',
                accuracyKind: 'SYMMETRIC',
                accuracyValue: dec(0.6),
                accuracyUnit: '°C',
                accuracyPolarity: '±',
                accuracyFormula: null,
                accuracyClass: null,
                sortOrder: 0,
              },
            ],
          },
        ],
        buckets: [],
      },
    ])

    const body = (await app.inject({ method: 'GET', url: '/api/admin/instruments/row-v3/capabilities', headers: H })).json()
    const b = body.profiles[0].subtypes[0].buckets[0]

    expect(body.profiles[0].min).toBe(-210)
    expect(b.leastCountValue).toBe(0.1)
    expect(b.accuracyValue).toBe(0.6)
    expect(typeof b.min).toBe('number')
  })

  it('keeps an undeclared least count null rather than calling it zero', async () => {
    p.masterInstrument.findFirst.mockResolvedValue(INSTRUMENT)
    p.masterInstrumentComponent.findMany.mockResolvedValue([])
    p.masterCapabilityProfile.findMany.mockResolvedValue([
      {
        id: 'p1', profileKey: 'P1', parameter: 'Mass', role: 'MEASURING', unit: 'kg', kind: 'ARTIFACT',
        minValue: null, maxValue: null, minInclusive: true, maxInclusive: true, subtypeKind: null,
        sopReferences: [], source: 'registry', sortOrder: 0, subtypes: [],
        buckets: [{
          id: 'b1', bucketKey: 'B1', minValue: dec(2), maxValue: dec(2), minInclusive: true, maxInclusive: true,
          leastCountValue: null, leastCountUnit: null, accuracyKind: null, accuracyValue: null,
          accuracyUnit: null, accuracyPolarity: null, accuracyFormula: null, accuracyClass: null, sortOrder: 0,
        }],
      },
    ])

    const body = (await app.inject({ method: 'GET', url: '/api/admin/instruments/row-v3/capabilities', headers: H })).json()
    expect(body.profiles[0].buckets[0].leastCountValue).toBeNull()
    expect(body.profiles[0].min).toBeNull()
  })

  it('asks only for buckets with no subtype, so none is rendered twice', async () => {
    p.masterInstrument.findFirst.mockResolvedValue(INSTRUMENT)
    p.masterCapabilityProfile.findMany.mockResolvedValue([])
    p.masterInstrumentComponent.findMany.mockResolvedValue([])

    await app.inject({ method: 'GET', url: '/api/admin/instruments/row-v3/capabilities', headers: H })

    const include = p.masterCapabilityProfile.findMany.mock.calls[0][0].include
    expect(include.buckets.where).toEqual({ subtypeId: null })
  })

  it('derives assetType from the components rather than storing it', async () => {
    p.masterInstrument.findFirst.mockResolvedValue(INSTRUMENT)
    p.masterCapabilityProfile.findMany.mockResolvedValue([])
    p.masterInstrumentComponent.findMany.mockResolvedValue([
      { id: 'c1', componentKey: 'ind', role: 'INDICATOR', make: null, model: 'HP 32', serialNumber: '5250062', sortOrder: 0 },
      { id: 'c2', componentKey: 'sen', role: 'SENSOR', make: null, model: 'HC2A-S4', serialNumber: '25005083', sortOrder: 1 },
    ])

    const body = (await app.inject({ method: 'GET', url: '/api/admin/instruments/row-v3/capabilities', headers: H })).json()
    expect(body.assetType).toBe('composite')
    expect(body.components).toHaveLength(2)
  })

  it('404s an instrument belonging to another tenant, without confirming it exists', async () => {
    p.masterInstrument.findFirst.mockResolvedValue(null)
    const res = await app.inject({ method: 'GET', url: '/api/admin/instruments/someone-elses/capabilities', headers: H })
    expect(res.statusCode).toBe(404)
    expect(res.json().error).toBe('Instrument not found')
  })
})

describe('adding a profile', () => {
  beforeEach(() => p.masterInstrument.findFirst.mockResolvedValue(INSTRUMENT))

  it('never reuses a key that has been used before', async () => {
    // P2 was deleted. The next one must not be P2 again, or the audit log for the old P2
    // reads as history of the new one.
    p.masterCapabilityProfile.findMany.mockResolvedValue([
      { profileKey: 'P1', sortOrder: 0 },
      { profileKey: 'P3', sortOrder: 2 },
    ])
    p.masterCapabilityProfile.create.mockResolvedValue({ id: 'new', profileKey: 'P4' })

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/instruments/row-v3/capabilities',
      headers: H,
      payload: { parameter: 'Pressure', role: 'MEASURING', unit: 'bar' },
    })

    expect(res.statusCode).toBe(201)
    expect(p.masterCapabilityProfile.create.mock.calls[0][0].data.profileKey).toBe('P4')
  })

  it('marks a hand-added profile manual, so the registry seed leaves it alone', async () => {
    p.masterCapabilityProfile.findMany.mockResolvedValue([])
    p.masterCapabilityProfile.create.mockResolvedValue({ id: 'new', profileKey: 'P1' })

    await app.inject({
      method: 'POST',
      url: '/api/admin/instruments/row-v3/capabilities',
      headers: H,
      payload: { parameter: 'Pressure', role: 'SOURCE', unit: 'bar' },
    })

    expect(p.masterCapabilityProfile.create.mock.calls[0][0].data.source).toBe('manual')
  })

  it('rejects a profile with no parameter', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/instruments/row-v3/capabilities',
      headers: H,
      payload: { role: 'MEASURING', unit: 'bar' },
    })
    expect(res.statusCode).toBe(400)
    expect(p.masterCapabilityProfile.create).not.toHaveBeenCalled()
  })

  it('rejects a role it does not recognise', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/instruments/row-v3/capabilities',
      headers: H,
      payload: { parameter: 'Pressure', role: 'WHATEVER' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('records the addition in the audit log', async () => {
    p.masterCapabilityProfile.findMany.mockResolvedValue([])
    p.masterCapabilityProfile.create.mockResolvedValue({ id: 'new', profileKey: 'P1' })

    await app.inject({
      method: 'POST',
      url: '/api/admin/instruments/row-v3/capabilities',
      headers: H,
      payload: { parameter: 'Pressure', role: 'MEASURING', unit: 'bar' },
    })

    expect(p.masterCapabilityAudit.create.mock.calls[0][0].data).toMatchObject({
      action: 'PROFILE_ADDED',
      profileKey: 'P1',
      instrumentId: 'stable-1',
      actorId: 'admin-1',
    })
  })
})

describe('deleting a profile', () => {
  beforeEach(() => {
    p.masterInstrument.findFirst.mockResolvedValue(INSTRUMENT)
    p.masterCapabilityProfile.findFirst.mockResolvedValue({
      id: 'p1', profileKey: 'P1', parameter: 'Pressure', role: 'MEASURING', tenantId: 'tenant-1', instrumentId: 'stable-1',
    })
  })

  it('refuses while a certificate still points at it', async () => {
    p.masterInstrumentCertificate.count.mockResolvedValue(2)

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/admin/instruments/row-v3/capabilities/p1',
      headers: H,
    })

    expect(res.statusCode).toBe(409)
    expect(res.json().error).toContain('2 certificates')
    expect(p.masterCapabilityProfile.delete).not.toHaveBeenCalled()
  })

  it('deletes when nothing references it, and says so in the audit log', async () => {
    p.masterInstrumentCertificate.count.mockResolvedValue(0)
    p.masterCapabilityProfile.delete.mockResolvedValue({ id: 'p1' })

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/admin/instruments/row-v3/capabilities/p1',
      headers: H,
    })

    expect(res.statusCode).toBe(200)
    expect(p.masterCapabilityProfile.delete).toHaveBeenCalledWith({ where: { id: 'p1' } })
    expect(p.masterCapabilityAudit.create.mock.calls[0][0].data).toMatchObject({ action: 'PROFILE_DELETED' })
  })
})

describe('ranges', () => {
  const bucket = {
    id: 'b1',
    bucketKey: 'B1',
    profileId: 'p1',
    minValue: dec(0),
    maxValue: dec(100),
    minInclusive: true,
    maxInclusive: true,
    leastCountValue: dec(0.01),
    leastCountUnit: 'bar',
    accuracyKind: 'SYMMETRIC',
    accuracyValue: dec(0.1),
    accuracyUnit: '%FS',
    accuracyPolarity: '±',
    accuracyFormula: null,
    accuracyClass: null,
    sortOrder: 0,
  }

  beforeEach(() => {
    p.masterInstrument.findFirst.mockResolvedValue(INSTRUMENT)
    p.masterCapabilityProfile.findFirst.mockResolvedValue({
      id: 'p1', profileKey: 'P1', parameter: 'Pressure', role: 'MEASURING', tenantId: 'tenant-1', instrumentId: 'stable-1',
    })
  })

  it('clears the other accuracy shapes when one is chosen', async () => {
    // Switching symmetric to formula has to drop the ±0.1 %FS. Leaving it behind means
    // two accuracies on one range, and whichever a certificate reads first wins.
    p.masterCapabilityBucket.findFirst.mockResolvedValue(bucket)
    p.masterCapabilityBucket.update.mockResolvedValue({ id: 'b1' })

    await app.inject({
      method: 'PATCH',
      url: '/api/admin/instruments/row-v3/capabilities/p1/buckets/b1',
      headers: H,
      payload: {
        min: 0, max: 100, leastCountValue: 0.01, leastCountUnit: 'bar',
        accuracyKind: 'FORMULA', accuracyFormula: '±(0.02% of reading + 2 counts)',
      },
    })

    const data = p.masterCapabilityBucket.update.mock.calls[0][0].data
    expect(data.accuracyKind).toBe('FORMULA')
    expect(data.accuracyFormula).toBe('±(0.02% of reading + 2 counts)')
    expect(data.accuracyValue).toBeNull()
    expect(data.accuracyPolarity).toBeNull()
  })

  it('audits only what actually moved', async () => {
    p.masterCapabilityBucket.findFirst.mockResolvedValue(bucket)
    p.masterCapabilityBucket.update.mockResolvedValue({ id: 'b1' })

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/admin/instruments/row-v3/capabilities/p1/buckets/b1',
      headers: H,
      payload: {
        min: 0, max: 100, leastCountValue: 0.05, leastCountUnit: 'bar',
        accuracyKind: 'SYMMETRIC', accuracyValue: 0.1, accuracyUnit: '%FS', accuracyPolarity: '±',
      },
    })

    expect(res.json().changed).toEqual(['leastCountValue'])
    expect(p.masterCapabilityAudit.create).toHaveBeenCalledTimes(1)
    expect(p.masterCapabilityAudit.create.mock.calls[0][0].data).toMatchObject({
      action: 'BUCKET_UPDATED', field: 'leastCountValue', beforeValue: '0.01', afterValue: '0.05',
    })
  })

  it('writes nothing when the save changes nothing', async () => {
    p.masterCapabilityBucket.findFirst.mockResolvedValue(bucket)

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/admin/instruments/row-v3/capabilities/p1/buckets/b1',
      headers: H,
      payload: {
        min: 0, max: 100, leastCountValue: 0.01, leastCountUnit: 'bar',
        accuracyKind: 'SYMMETRIC', accuracyValue: 0.1, accuracyUnit: '%FS', accuracyPolarity: '±',
      },
    })

    expect(res.json().changed).toEqual([])
    expect(p.masterCapabilityBucket.update).not.toHaveBeenCalled()
    expect(p.masterCapabilityAudit.create).not.toHaveBeenCalled()
  })

  it('refuses a subtype belonging to a different capability', async () => {
    p.masterCapabilitySubtype.findFirst.mockResolvedValue(null)

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/instruments/row-v3/capabilities/p1/buckets',
      headers: H,
      payload: { subtypeId: 'someone-elses-subtype', min: 0, max: 1 },
    })

    expect(res.statusCode).toBe(400)
    expect(p.masterCapabilityBucket.create).not.toHaveBeenCalled()
  })

  it('numbers a new range past the highest already used', async () => {
    p.masterCapabilityBucket.findMany.mockResolvedValue([
      { bucketKey: 'B1', sortOrder: 0 },
      { bucketKey: 'B5', sortOrder: 4 },
    ])
    p.masterCapabilityBucket.create.mockResolvedValue({ id: 'new', bucketKey: 'B6' })

    await app.inject({
      method: 'POST',
      url: '/api/admin/instruments/row-v3/capabilities/p1/buckets',
      headers: H,
      payload: { min: 100, max: 200 },
    })

    expect(p.masterCapabilityBucket.create.mock.calls[0][0].data.bucketKey).toBe('B6')
  })

  it('treats an empty string as not given, not as zero', async () => {
    p.masterCapabilityBucket.findMany.mockResolvedValue([])
    p.masterCapabilityBucket.create.mockResolvedValue({ id: 'new', bucketKey: 'B1' })

    await app.inject({
      method: 'POST',
      url: '/api/admin/instruments/row-v3/capabilities/p1/buckets',
      headers: H,
      payload: { min: 0, max: 10, leastCountValue: '' },
    })

    const data = p.masterCapabilityBucket.create.mock.calls[0][0].data
    expect(data.leastCountValue).toBeNull()
    expect(data.minValue).toBe(0)
  })
})

describe('subtypes', () => {
  beforeEach(() => {
    p.masterInstrument.findFirst.mockResolvedValue(INSTRUMENT)
    p.masterCapabilityProfile.findFirst.mockResolvedValue({
      id: 'p1', profileKey: 'P1', parameter: 'Thermocouple', role: 'MEASURING', tenantId: 'tenant-1', instrumentId: 'stable-1',
    })
  })

  it('refuses a duplicate name on the same capability', async () => {
    p.masterCapabilitySubtype.findFirst.mockResolvedValue({ id: 'existing' })

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/instruments/row-v3/capabilities/p1/subtypes',
      headers: H,
      payload: { subtypeKey: 'Type J' },
    })

    expect(res.statusCode).toBe(409)
    expect(res.json().error).toContain('Type J')
  })

  it('records how many ranges went with a deleted subtype', async () => {
    p.masterCapabilitySubtype.findFirst.mockResolvedValue({
      id: 's1', subtypeKey: 'Type J', profileId: 'p1', _count: { buckets: 6 },
    })
    p.masterCapabilitySubtype.delete.mockResolvedValue({ id: 's1' })

    await app.inject({
      method: 'DELETE',
      url: '/api/admin/instruments/row-v3/capabilities/p1/subtypes/s1',
      headers: H,
    })

    expect(p.masterCapabilityAudit.create.mock.calls[0][0].data).toMatchObject({
      action: 'SUBTYPE_DELETED', subtypeKey: 'Type J', beforeValue: '6 ranges',
    })
  })
})

describe('the audit log', () => {
  it('pages, and reports a cursor only when there is more', async () => {
    p.masterInstrument.findFirst.mockResolvedValue(INSTRUMENT)
    const entry = (i: number) => ({
      id: `a${i}`, action: 'BUCKET_UPDATED', profileKey: 'P1', subtypeKey: null, bucketKey: 'B1',
      field: 'leastCountValue', beforeValue: '0.01', afterValue: '0.05',
      createdAt: new Date('2026-09-11T10:00:00Z'), actor: { id: 'admin-1', name: 'Test Admin', email: 'a@b.c' },
    })
    p.masterCapabilityAudit.findMany.mockResolvedValue([entry(1), entry(2), entry(3)])

    const body = (
      await app.inject({ method: 'GET', url: '/api/admin/instruments/row-v3/capabilities/audit?limit=2', headers: H })
    ).json()

    expect(body.entries).toHaveLength(2)
    expect(body.nextCursor).toBe('a2')
  })

  it('caps an absurd limit rather than trying to serve it', async () => {
    p.masterInstrument.findFirst.mockResolvedValue(INSTRUMENT)
    p.masterCapabilityAudit.findMany.mockResolvedValue([])

    await app.inject({ method: 'GET', url: '/api/admin/instruments/row-v3/capabilities/audit?limit=99999', headers: H })

    expect(p.masterCapabilityAudit.findMany.mock.calls[0][0].take).toBe(201)
  })
})
