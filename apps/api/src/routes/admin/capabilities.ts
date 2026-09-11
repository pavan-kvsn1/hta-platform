/**
 * Master instrument capabilities: what an instrument measures or sources, at what
 * resolution, and how accurately.
 *
 * Two things about the addressing are worth knowing before reading further.
 *
 * The URL takes a MasterInstrument row id, like every other instrument route, but
 * capabilities hang off `instrumentId` - the stable identity - and not off that row. A
 * MasterInstrument row is one *version*: editing a description creates another, and
 * anything attached to the row it replaces is stranded. Certificates already work that
 * way and 25 of 210 are stranded as a result. So every handler here resolves the row id
 * to its instrumentId first, which also means a capability stays put when someone edits
 * the instrument's name.
 *
 * Keys are never reused. If P2 is deleted the next profile is P11, not P2, because the
 * audit log records changes against the key and reusing one makes its history a lie.
 */

import { FastifyPluginAsync } from 'fastify'
import { prisma, Prisma } from '@hta/database'
import { requireAdmin } from '../../middleware/auth.js'

type AccuracyKind = 'SYMMETRIC' | 'FORMULA' | 'CLASS'
type CapabilityKind = 'RANGE' | 'ARTIFACT'
type CapabilityRole = 'MEASURING' | 'SOURCE'

const ACCURACY_KINDS: AccuracyKind[] = ['SYMMETRIC', 'FORMULA', 'CLASS']
const CAPABILITY_KINDS: CapabilityKind[] = ['RANGE', 'ARTIFACT']
const CAPABILITY_ROLES: CapabilityRole[] = ['MEASURING', 'SOURCE']

/**
 * Prisma hands back Decimal objects. JSON.stringify turns those into strings, and a
 * range whose bounds arrive as "0" and "700" sorts and compares wrongly in the browser,
 * so they are converted here and null is kept as null rather than becoming 0.
 */
function num(d: Prisma.Decimal | null): number | null {
  return d === null ? null : d.toNumber()
}

/** A number, or null. Rejects NaN and the empty string, which both mean "not given". */
function readNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

function readBool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback
}

interface BucketInput {
  bucketKey?: unknown
  min?: unknown
  max?: unknown
  minInclusive?: unknown
  maxInclusive?: unknown
  leastCountValue?: unknown
  leastCountUnit?: unknown
  accuracyKind?: unknown
  accuracyValue?: unknown
  accuracyUnit?: unknown
  accuracyPolarity?: unknown
  accuracyFormula?: unknown
  accuracyClass?: unknown
  sortOrder?: unknown
}

/**
 * Read an accuracy off a request body.
 *
 * The three shapes do not share fields, so the fields belonging to the other two are
 * cleared. Without that, switching a bucket from symmetric to formula would leave
 * ±0.6 °C sitting behind the formula, and whichever the certificate read first would win.
 */
function accuracyFromInput(body: BucketInput) {
  const kind = ACCURACY_KINDS.find((k) => k === body.accuracyKind) ?? null
  const blank = {
    accuracyKind: null as AccuracyKind | null,
    accuracyValue: null as number | null,
    accuracyUnit: null as string | null,
    accuracyPolarity: null as string | null,
    accuracyFormula: null as string | null,
    accuracyClass: null as string | null,
  }
  if (!kind) return blank
  if (kind === 'SYMMETRIC')
    return {
      ...blank,
      accuracyKind: kind,
      accuracyValue: readNumber(body.accuracyValue),
      accuracyUnit: typeof body.accuracyUnit === 'string' ? body.accuracyUnit : null,
      accuracyPolarity: typeof body.accuracyPolarity === 'string' ? body.accuracyPolarity : '±',
    }
  if (kind === 'FORMULA')
    return {
      ...blank,
      accuracyKind: kind,
      accuracyFormula: typeof body.accuracyFormula === 'string' ? body.accuracyFormula : null,
      accuracyUnit: typeof body.accuracyUnit === 'string' ? body.accuracyUnit : null,
    }
  return {
    ...blank,
    accuracyKind: kind,
    accuracyClass: typeof body.accuracyClass === 'string' ? body.accuracyClass : null,
  }
}

/**
 * A range written the way it is read - "0 to 100 bar". Recorded on every audit entry
 * about a range, because ranges are numbered by position now and positions move.
 */
function rangeLabel(min: number | null, max: number | null, unit?: string | null): string {
  const suffix = unit ? ` ${unit}` : ''
  if (min === null && max === null) return 'a range with no bounds'
  if (min === max) return `${max}${suffix}`
  return `${min ?? '?'} to ${max ?? '?'}${suffix}`
}

function bucketDataFromInput(body: BucketInput) {
  return {
    minValue: readNumber(body.min),
    maxValue: readNumber(body.max),
    minInclusive: readBool(body.minInclusive, true),
    maxInclusive: readBool(body.maxInclusive, true),
    leastCountValue: readNumber(body.leastCountValue),
    leastCountUnit: typeof body.leastCountUnit === 'string' ? body.leastCountUnit : null,
    ...accuracyFromInput(body),
  }
}

const capabilityRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * Resolve a MasterInstrument row id to the identity its capabilities hang off, and
   * confirm it belongs to this tenant. Returns null when it does not exist here, which
   * every caller turns into a 404 - never a 403, which would confirm the id exists
   * somewhere.
   */
  async function resolveInstrument(id: string, tenantId: string) {
    const row = await prisma.masterInstrument.findFirst({
      where: { id, tenantId },
      select: { id: true, instrumentId: true, tenantId: true, assetNumber: true, description: true },
    })
    return row
  }

  /** The profile, only if it belongs to this instrument and tenant. */
  async function findProfile(profileId: string, tenantId: string, instrumentId: string) {
    return prisma.masterCapabilityProfile.findFirst({
      where: { id: profileId, tenantId, instrumentId },
    })
  }

  async function audit(
    tx: Prisma.TransactionClient,
    where: { tenantId: string; instrumentId: string },
    entry: {
      action: string
      profileKey?: string | null
      subtypeKey?: string | null
      bucketKey?: string | null
      bucketLabel?: string | null
      field?: string | null
      beforeValue?: string | null
      afterValue?: string | null
      actorId?: string | null
    },
  ) {
    await tx.masterCapabilityAudit.create({ data: { ...where, ...entry } })
  }

  /**
   * The next free key in a series, never reusing one that has been used before.
   *
   * Deriving it from the count would hand out a key that already exists the moment
   * anything has been deleted, so it comes off the highest number in use.
   */
  function nextKey(prefix: string, existing: string[]): string {
    let highest = 0
    for (const k of existing) {
      const m = new RegExp(`^${prefix}(\\d+)$`).exec(k)
      if (m) highest = Math.max(highest, Number(m[1]))
    }
    return `${prefix}${highest + 1}`
  }

  // -------------------------------------------------------------------------
  // Read
  // -------------------------------------------------------------------------

  fastify.get<{ Params: { id: string } }>(
    '/instruments/:id/capabilities',
    { preHandler: [requireAdmin] },
    async (request, reply) => {
      const tenantId = request.tenantId
      const instrument = await resolveInstrument(request.params.id, tenantId)
      if (!instrument) return reply.status(404).send({ error: 'Instrument not found' })

      const [profiles, components] = await Promise.all([
        prisma.masterCapabilityProfile.findMany({
          where: { tenantId, instrumentId: instrument.instrumentId },
          include: {
            subtypes: {
              orderBy: { sortOrder: 'asc' },
              include: { buckets: { orderBy: { sortOrder: 'asc' } } },
            },
            // Only the ones hanging straight off the profile. The rest belong to a
            // subtype and are already nested above; returning them twice would have the
            // tab render each one in both places.
            buckets: { where: { subtypeId: null }, orderBy: { sortOrder: 'asc' } },
          },
          orderBy: { sortOrder: 'asc' },
        }),
        prisma.masterInstrumentComponent.findMany({
          where: { tenantId, instrumentId: instrument.instrumentId },
          orderBy: { sortOrder: 'asc' },
        }),
      ])

      const bucket = (b: (typeof profiles)[number]['buckets'][number]) => ({
        id: b.id,
        bucketKey: b.bucketKey,
        min: num(b.minValue),
        max: num(b.maxValue),
        minInclusive: b.minInclusive,
        maxInclusive: b.maxInclusive,
        leastCountValue: num(b.leastCountValue),
        leastCountUnit: b.leastCountUnit,
        accuracyKind: b.accuracyKind,
        accuracyValue: num(b.accuracyValue),
        accuracyUnit: b.accuracyUnit,
        accuracyPolarity: b.accuracyPolarity,
        accuracyFormula: b.accuracyFormula,
        accuracyClass: b.accuracyClass,
        sortOrder: b.sortOrder,
      })

      return {
        instrument: {
          id: instrument.id,
          instrumentId: instrument.instrumentId,
          assetNumber: instrument.assetNumber,
          description: instrument.description,
        },
        profiles: profiles.map((p) => ({
          id: p.id,
          profileKey: p.profileKey,
          parameter: p.parameter,
          role: p.role,
          unit: p.unit,
          kind: p.kind,
          min: num(p.minValue),
          max: num(p.maxValue),
          minInclusive: p.minInclusive,
          maxInclusive: p.maxInclusive,
          subtypeKind: p.subtypeKind,
          sopReferences: p.sopReferences,
          source: p.source,
          sortOrder: p.sortOrder,
          subtypes: p.subtypes.map((s) => ({
            id: s.id,
            subtypeKey: s.subtypeKey,
            min: num(s.minValue),
            max: num(s.maxValue),
            minInclusive: s.minInclusive,
            maxInclusive: s.maxInclusive,
            sortOrder: s.sortOrder,
            buckets: s.buckets.map(bucket),
          })),
          buckets: p.buckets.map(bucket),
        })),
        // Derived, not stored. A stored flag next to the components it describes is a
        // second copy of the same fact, and the two drift.
        assetType: components.length > 0 ? 'composite' : 'simple',
        components: components.map((c) => ({
          id: c.id,
          componentKey: c.componentKey,
          role: c.role,
          make: c.make,
          model: c.model,
          serialNumber: c.serialNumber,
          sortOrder: c.sortOrder,
        })),
      }
    },
  )

  // -------------------------------------------------------------------------
  // Profiles
  // -------------------------------------------------------------------------

  fastify.post<{
    Params: { id: string }
    Body: {
      parameter?: unknown
      role?: unknown
      unit?: unknown
      kind?: unknown
      min?: unknown
      max?: unknown
      minInclusive?: unknown
      maxInclusive?: unknown
      subtypeKind?: unknown
      sopReferences?: unknown
    }
  }>('/instruments/:id/capabilities', { preHandler: [requireAdmin] }, async (request, reply) => {
    const tenantId = request.tenantId
    const instrument = await resolveInstrument(request.params.id, tenantId)
    if (!instrument) return reply.status(404).send({ error: 'Instrument not found' })

    const body = request.body ?? {}
    const parameter = typeof body.parameter === 'string' ? body.parameter.trim() : ''
    if (!parameter) return reply.status(400).send({ error: 'A parameter is required' })

    const role = CAPABILITY_ROLES.find((r) => r === body.role)
    if (!role) return reply.status(400).send({ error: 'Role must be MEASURING or SOURCE' })

    const kind = CAPABILITY_KINDS.find((k) => k === body.kind) ?? 'RANGE'
    const unit = typeof body.unit === 'string' ? body.unit.trim() : ''

    const existing = await prisma.masterCapabilityProfile.findMany({
      where: { tenantId, instrumentId: instrument.instrumentId },
      select: { profileKey: true, sortOrder: true },
    })
    const profileKey = nextKey('P', existing.map((e) => e.profileKey))
    const sortOrder = existing.reduce((n, e) => Math.max(n, e.sortOrder + 1), 0)

    const created = await prisma.$transaction(async (tx) => {
      const profile = await tx.masterCapabilityProfile.create({
        data: {
          tenantId,
          instrumentId: instrument.instrumentId,
          profileKey,
          parameter,
          role,
          unit,
          kind,
          minValue: readNumber(body.min),
          maxValue: readNumber(body.max),
          minInclusive: readBool(body.minInclusive, true),
          maxInclusive: readBool(body.maxInclusive, true),
          subtypeKind: typeof body.subtypeKind === 'string' && body.subtypeKind ? body.subtypeKind : null,
          sopReferences: Array.isArray(body.sopReferences)
            ? body.sopReferences.filter((s): s is string => typeof s === 'string')
            : [],
          // Typed in by hand, so the registry seed must never overwrite it.
          source: 'manual',
          sortOrder,
          createdById: request.user?.sub ?? null,
        },
      })
      await audit(
        tx,
        { tenantId, instrumentId: instrument.instrumentId },
        {
          action: 'PROFILE_ADDED',
          profileKey,
          afterValue: `${parameter} (${role.toLowerCase()})${unit ? ` in ${unit}` : ''}`,
          actorId: request.user?.sub ?? null,
        },
      )
      return profile
    })

    return reply.status(201).send({ profile: { id: created.id, profileKey: created.profileKey } })
  })

  fastify.patch<{
    Params: { id: string; profileId: string }
    Body: Record<string, unknown>
  }>('/instruments/:id/capabilities/:profileId', { preHandler: [requireAdmin] }, async (request, reply) => {
    const tenantId = request.tenantId
    const instrument = await resolveInstrument(request.params.id, tenantId)
    if (!instrument) return reply.status(404).send({ error: 'Instrument not found' })

    const profile = await findProfile(request.params.profileId, tenantId, instrument.instrumentId)
    if (!profile) return reply.status(404).send({ error: 'Capability profile not found' })

    const body = request.body ?? {}
    const data: Prisma.MasterCapabilityProfileUpdateInput = {}
    const changes: Array<{ field: string; before: string | null; after: string | null }> = []

    const note = (field: string, before: unknown, after: unknown) => {
      changes.push({
        field,
        before: before === null || before === undefined ? null : String(before),
        after: after === null || after === undefined ? null : String(after),
      })
    }

    if (typeof body.parameter === 'string' && body.parameter.trim() !== profile.parameter) {
      data.parameter = body.parameter.trim()
      note('parameter', profile.parameter, data.parameter)
    }
    if (typeof body.unit === 'string' && body.unit.trim() !== profile.unit) {
      data.unit = body.unit.trim()
      note('unit', profile.unit, data.unit)
    }
    const role = CAPABILITY_ROLES.find((r) => r === body.role)
    if (role && role !== profile.role) {
      data.role = role
      note('role', profile.role, role)
    }
    const kind = CAPABILITY_KINDS.find((k) => k === body.kind)
    if (kind && kind !== profile.kind) {
      data.kind = kind
      note('kind', profile.kind, kind)
    }
    if ('min' in body) {
      const v = readNumber(body.min)
      if (v !== num(profile.minValue)) {
        data.minValue = v
        note('min', num(profile.minValue), v)
      }
    }
    if ('max' in body) {
      const v = readNumber(body.max)
      if (v !== num(profile.maxValue)) {
        data.maxValue = v
        note('max', num(profile.maxValue), v)
      }
    }
    if (typeof body.minInclusive === 'boolean' && body.minInclusive !== profile.minInclusive) {
      data.minInclusive = body.minInclusive
      note('minInclusive', profile.minInclusive, body.minInclusive)
    }
    if (typeof body.maxInclusive === 'boolean' && body.maxInclusive !== profile.maxInclusive) {
      data.maxInclusive = body.maxInclusive
      note('maxInclusive', profile.maxInclusive, body.maxInclusive)
    }
    if ('subtypeKind' in body) {
      const v = typeof body.subtypeKind === 'string' && body.subtypeKind ? body.subtypeKind : null
      if (v !== profile.subtypeKind) {
        data.subtypeKind = v
        note('subtypeKind', profile.subtypeKind, v)
      }
    }
    if (Array.isArray(body.sopReferences)) {
      const v = body.sopReferences.filter((s): s is string => typeof s === 'string')
      if (v.join('|') !== profile.sopReferences.join('|')) {
        data.sopReferences = v
        note('sopReferences', profile.sopReferences.join(', '), v.join(', '))
      }
    }

    if (!changes.length) return { profile: { id: profile.id }, changed: [] }

    await prisma.$transaction(async (tx) => {
      await tx.masterCapabilityProfile.update({ where: { id: profile.id }, data })
      for (const c of changes) {
        await audit(
          tx,
          { tenantId, instrumentId: instrument.instrumentId },
          {
            action: 'PROFILE_UPDATED',
            profileKey: profile.profileKey,
            field: c.field,
            beforeValue: c.before,
            afterValue: c.after,
            actorId: request.user?.sub ?? null,
          },
        )
      }
    })

    return { profile: { id: profile.id }, changed: changes.map((c) => c.field) }
  })

  fastify.delete<{ Params: { id: string; profileId: string } }>(
    '/instruments/:id/capabilities/:profileId',
    { preHandler: [requireAdmin] },
    async (request, reply) => {
      const tenantId = request.tenantId
      const instrument = await resolveInstrument(request.params.id, tenantId)
      if (!instrument) return reply.status(404).send({ error: 'Instrument not found' })

      const profile = await findProfile(request.params.profileId, tenantId, instrument.instrumentId)
      if (!profile) return reply.status(404).send({ error: 'Capability profile not found' })

      // A certificate pointing at this profile is a record of a calibration that was
      // actually done against it. Deleting the profile would leave the certificate
      // describing a capability nobody can look up, so the link has to be dealt with
      // first - deliberately, by a person.
      const certificates = await prisma.masterInstrumentCertificate.count({
        where: { capabilityProfileId: profile.id },
      })
      if (certificates > 0) {
        return reply.status(409).send({
          error: `${certificates} certificate${certificates === 1 ? '' : 's'} still reference this capability. Reassign them first.`,
        })
      }

      await prisma.$transaction(async (tx) => {
        // Subtypes and buckets cascade from the schema.
        await tx.masterCapabilityProfile.delete({ where: { id: profile.id } })
        await audit(
          tx,
          { tenantId, instrumentId: instrument.instrumentId },
          {
            action: 'PROFILE_DELETED',
            profileKey: profile.profileKey,
            beforeValue: `${profile.parameter} (${profile.role.toLowerCase()})`,
            actorId: request.user?.sub ?? null,
          },
        )
      })

      return { deleted: true }
    },
  )

  // -------------------------------------------------------------------------
  // Subtypes
  // -------------------------------------------------------------------------

  fastify.post<{
    Params: { id: string; profileId: string }
    Body: { subtypeKey?: unknown; min?: unknown; max?: unknown; minInclusive?: unknown; maxInclusive?: unknown }
  }>('/instruments/:id/capabilities/:profileId/subtypes', { preHandler: [requireAdmin] }, async (request, reply) => {
    const tenantId = request.tenantId
    const instrument = await resolveInstrument(request.params.id, tenantId)
    if (!instrument) return reply.status(404).send({ error: 'Instrument not found' })

    const profile = await findProfile(request.params.profileId, tenantId, instrument.instrumentId)
    if (!profile) return reply.status(404).send({ error: 'Capability profile not found' })

    const body = request.body ?? {}
    const subtypeKey = typeof body.subtypeKey === 'string' ? body.subtypeKey.trim() : ''
    if (!subtypeKey) return reply.status(400).send({ error: 'A subtype name is required' })

    const clash = await prisma.masterCapabilitySubtype.findFirst({
      where: { profileId: profile.id, subtypeKey },
      select: { id: true },
    })
    if (clash) return reply.status(409).send({ error: `This capability already has a "${subtypeKey}"` })

    const siblings = await prisma.masterCapabilitySubtype.findMany({
      where: { profileId: profile.id },
      select: { sortOrder: true },
    })

    const created = await prisma.$transaction(async (tx) => {
      const subtype = await tx.masterCapabilitySubtype.create({
        data: {
          profileId: profile.id,
          subtypeKey,
          minValue: readNumber(body.min),
          maxValue: readNumber(body.max),
          minInclusive: readBool(body.minInclusive, true),
          maxInclusive: readBool(body.maxInclusive, true),
          sortOrder: siblings.reduce((n, s) => Math.max(n, s.sortOrder + 1), 0),
        },
      })
      await audit(
        tx,
        { tenantId, instrumentId: instrument.instrumentId },
        {
          action: 'SUBTYPE_ADDED',
          profileKey: profile.profileKey,
          subtypeKey,
          actorId: request.user?.sub ?? null,
        },
      )
      return subtype
    })

    return reply.status(201).send({ subtype: { id: created.id, subtypeKey: created.subtypeKey } })
  })

  fastify.delete<{ Params: { id: string; profileId: string; subtypeId: string } }>(
    '/instruments/:id/capabilities/:profileId/subtypes/:subtypeId',
    { preHandler: [requireAdmin] },
    async (request, reply) => {
      const tenantId = request.tenantId
      const instrument = await resolveInstrument(request.params.id, tenantId)
      if (!instrument) return reply.status(404).send({ error: 'Instrument not found' })

      const profile = await findProfile(request.params.profileId, tenantId, instrument.instrumentId)
      if (!profile) return reply.status(404).send({ error: 'Capability profile not found' })

      const subtype = await prisma.masterCapabilitySubtype.findFirst({
        where: { id: request.params.subtypeId, profileId: profile.id },
        include: { _count: { select: { buckets: true } } },
      })
      if (!subtype) return reply.status(404).send({ error: 'Subtype not found' })

      await prisma.$transaction(async (tx) => {
        await tx.masterCapabilitySubtype.delete({ where: { id: subtype.id } })
        await audit(
          tx,
          { tenantId, instrumentId: instrument.instrumentId },
          {
            action: 'SUBTYPE_DELETED',
            profileKey: profile.profileKey,
            subtypeKey: subtype.subtypeKey,
            beforeValue: `${subtype._count.buckets} range${subtype._count.buckets === 1 ? '' : 's'}`,
            actorId: request.user?.sub ?? null,
          },
        )
      })

      return { deleted: true }
    },
  )

  // -------------------------------------------------------------------------
  // Buckets - the rows that carry the least count and the accuracy
  // -------------------------------------------------------------------------

  fastify.post<{
    Params: { id: string; profileId: string }
    Body: BucketInput & { subtypeId?: unknown }
  }>('/instruments/:id/capabilities/:profileId/buckets', { preHandler: [requireAdmin] }, async (request, reply) => {
    const tenantId = request.tenantId
    const instrument = await resolveInstrument(request.params.id, tenantId)
    if (!instrument) return reply.status(404).send({ error: 'Instrument not found' })

    const profile = await findProfile(request.params.profileId, tenantId, instrument.instrumentId)
    if (!profile) return reply.status(404).send({ error: 'Capability profile not found' })

    const body = request.body ?? {}
    let subtypeId: string | null = null
    if (typeof body.subtypeId === 'string' && body.subtypeId) {
      const subtype = await prisma.masterCapabilitySubtype.findFirst({
        where: { id: body.subtypeId, profileId: profile.id },
        select: { id: true },
      })
      if (!subtype) return reply.status(400).send({ error: 'That subtype does not belong to this capability' })
      subtypeId = subtype.id
    }

    const siblings = await prisma.masterCapabilityBucket.findMany({
      where: { profileId: profile.id, subtypeId },
      select: { bucketKey: true, sortOrder: true },
    })
    const bucketKey = nextKey('B', siblings.map((s) => s.bucketKey))

    const created = await prisma.$transaction(async (tx) => {
      const b = await tx.masterCapabilityBucket.create({
        data: {
          profileId: profile.id,
          subtypeId,
          bucketKey,
          ...bucketDataFromInput(body),
          sortOrder: siblings.reduce((n, s) => Math.max(n, s.sortOrder + 1), 0),
        },
      })
      await audit(
        tx,
        { tenantId, instrumentId: instrument.instrumentId },
        {
          action: 'BUCKET_ADDED',
          profileKey: profile.profileKey,
          bucketKey,
          bucketLabel: rangeLabel(readNumber(body.min), readNumber(body.max), profile.unit),
          afterValue: rangeLabel(readNumber(body.min), readNumber(body.max), profile.unit),
          actorId: request.user?.sub ?? null,
        },
      )
      return b
    })

    return reply.status(201).send({ bucket: { id: created.id, bucketKey: created.bucketKey } })
  })

  fastify.patch<{
    Params: { id: string; profileId: string; bucketId: string }
    Body: BucketInput
  }>(
    '/instruments/:id/capabilities/:profileId/buckets/:bucketId',
    { preHandler: [requireAdmin] },
    async (request, reply) => {
      const tenantId = request.tenantId
      const instrument = await resolveInstrument(request.params.id, tenantId)
      if (!instrument) return reply.status(404).send({ error: 'Instrument not found' })

      const profile = await findProfile(request.params.profileId, tenantId, instrument.instrumentId)
      if (!profile) return reply.status(404).send({ error: 'Capability profile not found' })

      const bucket = await prisma.masterCapabilityBucket.findFirst({
        where: { id: request.params.bucketId, profileId: profile.id },
      })
      if (!bucket) return reply.status(404).send({ error: 'Range not found' })

      const body = request.body ?? {}
      const next = bucketDataFromInput(body)

      // Only what actually moved, so the audit log stays readable. A save that changed
      // one least count should not print eleven rows saying nothing changed.
      const before: Record<string, unknown> = {
        min: num(bucket.minValue),
        max: num(bucket.maxValue),
        minInclusive: bucket.minInclusive,
        maxInclusive: bucket.maxInclusive,
        leastCountValue: num(bucket.leastCountValue),
        leastCountUnit: bucket.leastCountUnit,
        accuracyKind: bucket.accuracyKind,
        accuracyValue: num(bucket.accuracyValue),
        accuracyUnit: bucket.accuracyUnit,
        accuracyPolarity: bucket.accuracyPolarity,
        accuracyFormula: bucket.accuracyFormula,
        accuracyClass: bucket.accuracyClass,
      }
      const after: Record<string, unknown> = {
        min: next.minValue,
        max: next.maxValue,
        minInclusive: next.minInclusive,
        maxInclusive: next.maxInclusive,
        leastCountValue: next.leastCountValue,
        leastCountUnit: next.leastCountUnit,
        accuracyKind: next.accuracyKind,
        accuracyValue: next.accuracyValue,
        accuracyUnit: next.accuracyUnit,
        accuracyPolarity: next.accuracyPolarity,
        accuracyFormula: next.accuracyFormula,
        accuracyClass: next.accuracyClass,
      }
      const changed = Object.keys(after).filter((k) => before[k] !== after[k])
      if (!changed.length) return { bucket: { id: bucket.id }, changed: [] }

      await prisma.$transaction(async (tx) => {
        await tx.masterCapabilityBucket.update({ where: { id: bucket.id }, data: next })
        for (const field of changed) {
          await audit(
            tx,
            { tenantId, instrumentId: instrument.instrumentId },
            {
              action: 'BUCKET_UPDATED',
              profileKey: profile.profileKey,
              bucketKey: bucket.bucketKey,
              // The range as it read before the change, so the entry still points at the
              // right one after other ranges are added or removed.
              bucketLabel: rangeLabel(num(bucket.minValue), num(bucket.maxValue), profile.unit),
              field,
              beforeValue: before[field] === null || before[field] === undefined ? null : String(before[field]),
              afterValue: after[field] === null || after[field] === undefined ? null : String(after[field]),
              actorId: request.user?.sub ?? null,
            },
          )
        }
      })

      return { bucket: { id: bucket.id }, changed }
    },
  )

  fastify.delete<{ Params: { id: string; profileId: string; bucketId: string } }>(
    '/instruments/:id/capabilities/:profileId/buckets/:bucketId',
    { preHandler: [requireAdmin] },
    async (request, reply) => {
      const tenantId = request.tenantId
      const instrument = await resolveInstrument(request.params.id, tenantId)
      if (!instrument) return reply.status(404).send({ error: 'Instrument not found' })

      const profile = await findProfile(request.params.profileId, tenantId, instrument.instrumentId)
      if (!profile) return reply.status(404).send({ error: 'Capability profile not found' })

      const bucket = await prisma.masterCapabilityBucket.findFirst({
        where: { id: request.params.bucketId, profileId: profile.id },
      })
      if (!bucket) return reply.status(404).send({ error: 'Range not found' })

      await prisma.$transaction(async (tx) => {
        await tx.masterCapabilityBucket.delete({ where: { id: bucket.id } })
        await audit(
          tx,
          { tenantId, instrumentId: instrument.instrumentId },
          {
            action: 'BUCKET_DELETED',
            profileKey: profile.profileKey,
            bucketKey: bucket.bucketKey,
            bucketLabel: rangeLabel(num(bucket.minValue), num(bucket.maxValue), profile.unit),
            beforeValue: rangeLabel(num(bucket.minValue), num(bucket.maxValue), profile.unit),
            actorId: request.user?.sub ?? null,
          },
        )
      })

      return { deleted: true }
    },
  )

  // -------------------------------------------------------------------------
  // Components - the indicator and its sensors
  //
  // Not a fixed pair. 188 HTAIPL/L is one indicator with three transducers, each
  // pairing holding its own certificate, so they are added one at a time.
  // -------------------------------------------------------------------------

  fastify.post<{
    Params: { id: string }
    Body: { role?: unknown; make?: unknown; model?: unknown; serialNumber?: unknown }
  }>('/instruments/:id/components', { preHandler: [requireAdmin] }, async (request, reply) => {
    const tenantId = request.tenantId
    const instrument = await resolveInstrument(request.params.id, tenantId)
    if (!instrument) return reply.status(404).send({ error: 'Instrument not found' })

    const body = request.body ?? {}
    const role = body.role === 'SENSOR' || body.role === 'INDICATOR' ? body.role : null
    if (!role) return reply.status(400).send({ error: 'Role must be INDICATOR or SENSOR' })

    const existing = await prisma.masterInstrumentComponent.findMany({
      where: { tenantId, instrumentId: instrument.instrumentId },
      select: { componentKey: true, sortOrder: true },
    })
    // ind, sen, sen2, sen3 - the registry's own names, extended rather than replaced.
    const prefix = role === 'INDICATOR' ? 'ind' : 'sen'
    const taken = new Set(existing.map((e) => e.componentKey))
    let componentKey = prefix
    let n = 1
    while (taken.has(componentKey)) componentKey = `${prefix}${++n}`

    const created = await prisma.masterInstrumentComponent.create({
      data: {
        tenantId,
        instrumentId: instrument.instrumentId,
        componentKey,
        role,
        make: typeof body.make === 'string' && body.make.trim() ? body.make.trim() : null,
        model: typeof body.model === 'string' && body.model.trim() ? body.model.trim() : null,
        serialNumber:
          typeof body.serialNumber === 'string' && body.serialNumber.trim() ? body.serialNumber.trim() : null,
        sortOrder: existing.reduce((m, e) => Math.max(m, e.sortOrder + 1), 0),
      },
    })
    return reply.status(201).send({ component: { id: created.id, componentKey: created.componentKey } })
  })

  fastify.patch<{
    Params: { id: string; componentId: string }
    Body: { make?: unknown; model?: unknown; serialNumber?: unknown }
  }>('/instruments/:id/components/:componentId', { preHandler: [requireAdmin] }, async (request, reply) => {
    const tenantId = request.tenantId
    const instrument = await resolveInstrument(request.params.id, tenantId)
    if (!instrument) return reply.status(404).send({ error: 'Instrument not found' })

    const component = await prisma.masterInstrumentComponent.findFirst({
      where: { id: request.params.componentId, tenantId, instrumentId: instrument.instrumentId },
      select: { id: true },
    })
    if (!component) return reply.status(404).send({ error: 'Component not found' })

    const body = request.body ?? {}
    // An empty string means "this part shares the instrument's own", which is null, not "".
    const text = (v: unknown) => (typeof v === 'string' ? (v.trim() === '' ? null : v.trim()) : undefined)

    await prisma.masterInstrumentComponent.update({
      where: { id: component.id },
      data: { make: text(body.make), model: text(body.model), serialNumber: text(body.serialNumber) },
    })
    return { component: { id: component.id } }
  })

  fastify.delete<{ Params: { id: string; componentId: string } }>(
    '/instruments/:id/components/:componentId',
    { preHandler: [requireAdmin] },
    async (request, reply) => {
      const tenantId = request.tenantId
      const instrument = await resolveInstrument(request.params.id, tenantId)
      if (!instrument) return reply.status(404).send({ error: 'Instrument not found' })

      const component = await prisma.masterInstrumentComponent.findFirst({
        where: { id: request.params.componentId, tenantId, instrumentId: instrument.instrumentId },
        select: { id: true },
      })
      if (!component) return reply.status(404).send({ error: 'Component not found' })

      await prisma.masterInstrumentComponent.delete({ where: { id: component.id } })
      return { deleted: true }
    },
  )

  // -------------------------------------------------------------------------
  // Audit log
  // -------------------------------------------------------------------------

  fastify.get<{ Params: { id: string }; Querystring: { limit?: string; cursor?: string } }>(
    '/instruments/:id/capabilities/audit',
    { preHandler: [requireAdmin] },
    async (request, reply) => {
      const tenantId = request.tenantId
      const instrument = await resolveInstrument(request.params.id, tenantId)
      if (!instrument) return reply.status(404).send({ error: 'Instrument not found' })

      const limit = Math.min(Math.max(Number(request.query.limit) || 50, 1), 200)
      const entries = await prisma.masterCapabilityAudit.findMany({
        where: { tenantId, instrumentId: instrument.instrumentId },
        include: { actor: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: 'desc' },
        take: limit + 1,
        ...(request.query.cursor ? { cursor: { id: request.query.cursor }, skip: 1 } : {}),
      })

      const hasMore = entries.length > limit
      const page = hasMore ? entries.slice(0, limit) : entries

      return {
        entries: page.map((e) => ({
          id: e.id,
          action: e.action,
          profileKey: e.profileKey,
          subtypeKey: e.subtypeKey,
          bucketKey: e.bucketKey,
          bucketLabel: e.bucketLabel,
          field: e.field,
          before: e.beforeValue,
          after: e.afterValue,
          createdAt: e.createdAt,
          actor: e.actor ? { id: e.actor.id, name: e.actor.name || e.actor.email } : null,
        })),
        nextCursor: hasMore ? page[page.length - 1].id : null,
      }
    },
  )
}

export default capabilityRoutes
