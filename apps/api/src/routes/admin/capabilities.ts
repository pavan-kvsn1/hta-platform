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

type AccuracyKind = 'SYMMETRIC' | 'ASYMMETRIC' | 'FORMULA' | 'CLASS'
type CapabilityKind = 'RANGE' | 'ARTIFACT'
type CapabilityRole = 'MEASURING' | 'SOURCE'

const ACCURACY_KINDS: AccuracyKind[] = ['SYMMETRIC', 'ASYMMETRIC', 'FORMULA', 'CLASS']
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
  accuracyUpper?: unknown
  accuracyLower?: unknown
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
  accuracyExpression?: unknown
  accuracyPercentOf?: unknown
  accuracyPercentValue?: unknown
  accuracyDigits?: unknown
  accuracyDigitsUnit?: unknown
  accuracyClass?: unknown
  sortOrder?: unknown
}

/**
 * What a percentage may be a percentage of.
 *
 * Three, and anything else is refused rather than stored. The register used to carry
 * "fsd", "rh" and "hd" as well - synonyms and mistakes that nothing could compute
 * with, so 29 bands recorded an accuracy and could not be rated by it.
 */
const PERCENT_BASES = ['reading', 'full_scale', 'span'] as const

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
    accuracyExpression: null as string | null,
    accuracyPercentOf: null as string | null,
    accuracyPercentValue: null as number | null,
    accuracyDigits: null as number | null,
    accuracyDigitsUnit: null as string | null,
    accuracyClass: null as string | null,
    accuracyUpper: null as number | null,
    accuracyLower: null as number | null,
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
  if (kind === 'ASYMMETRIC')
    // The two bounds are kept apart on purpose. Collapsing them to the larger of
    // the two would say the instrument is worse than it is on one side and
    // better on the other, and nothing downstream could tell.
    return {
      ...blank,
      accuracyKind: kind,
      accuracyUpper: readNumber(body.accuracyUpper),
      accuracyLower: readNumber(body.accuracyLower),
      accuracyUnit: typeof body.accuracyUnit === 'string' ? body.accuracyUnit : null,
    }
  if (kind === 'FORMULA') {
    /**
     * Two jobs, and both are stored.
     *
     * accuracyFormula is what the certificate prints - the calibrating lab's own
     * wording, which is never re-written here. The rest is what the app computes
     * with: either a percentage and an optional digits term, or, where no
     * arrangement of those holds the shape, an expression.
     *
     * A percentage of something unnamed is refused. Storing 1% with no basis reads
     * as an accuracy and rates as nothing, which is the worst of both.
     */
    const percentOf = PERCENT_BASES.find((b) => b === body.accuracyPercentOf) ?? null
    const percentValue = readNumber(body.accuracyPercentValue)
    const expression =
      typeof body.accuracyExpression === 'string' && body.accuracyExpression.trim()
        ? body.accuracyExpression.trim()
        : null

    return {
      ...blank,
      accuracyKind: kind,
      accuracyFormula: typeof body.accuracyFormula === 'string' ? body.accuracyFormula : null,
      accuracyUnit: typeof body.accuracyUnit === 'string' ? body.accuracyUnit : null,
      accuracyExpression: expression,
      // An expression states the whole accuracy, so the fields are left clear rather
      // than holding half of it - a reader taking the fields alone would understate
      // the instrument by whatever the expression's other terms add.
      accuracyPercentOf: expression ? null : percentOf,
      accuracyPercentValue: expression || percentOf === null ? null : percentValue,
      accuracyDigits: expression ? null : readNumber(body.accuracyDigits),
      accuracyDigitsUnit:
        expression || typeof body.accuracyDigitsUnit !== 'string'
          ? null
          : body.accuracyDigitsUnit,
    }
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

  /**
   * The component id to store, having checked it is this instrument's. Returns undefined
   * to mean "not mentioned, leave alone" and null to mean "the instrument as a whole".
   */
  async function resolveComponent(
    value: unknown,
    tenantId: string,
    instrumentId: string,
  ): Promise<string | null | undefined | false> {
    if (value === undefined) return undefined
    if (value === null || value === '') return null
    if (typeof value !== 'string') return false
    const c = await prisma.masterInstrumentComponent.findFirst({
      where: { id: value, tenantId, instrumentId },
      select: { id: true },
    })
    return c ? c.id : false
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
        accuracyExpression: b.accuracyExpression,
        accuracyPercentOf: b.accuracyPercentOf,
        accuracyPercentValue: b.accuracyPercentValue,
        accuracyDigits: b.accuracyDigits,
        accuracyDigitsUnit: b.accuracyDigitsUnit,
        accuracyClass: b.accuracyClass,
        accuracyUpper: num(b.accuracyUpper),
        accuracyLower: num(b.accuracyLower),
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
          // Null means the capability belongs to the instrument as a whole.
          componentId: p.componentId,
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
          name: c.name,
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
      componentId?: unknown
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

    const componentId = await resolveComponent(body.componentId, tenantId, instrument.instrumentId)
    if (componentId === false)
      return reply.status(400).send({ error: 'That component does not belong to this instrument' })

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
          componentId: componentId ?? null,
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
    if ('componentId' in body) {
      const next = await resolveComponent(body.componentId, tenantId, instrument.instrumentId)
      if (next === false)
        return reply.status(400).send({ error: 'That component does not belong to this instrument' })
      if (next !== undefined && next !== profile.componentId) {
        data.component = next ? { connect: { id: next } } : { disconnect: true }
        note('component', profile.componentId, next)
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
        accuracyExpression: bucket.accuracyExpression,
        accuracyPercentOf: bucket.accuracyPercentOf,
        accuracyPercentValue: bucket.accuracyPercentValue,
        accuracyDigits: bucket.accuracyDigits,
        accuracyDigitsUnit: bucket.accuracyDigitsUnit,
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
        accuracyExpression: next.accuracyExpression,
        accuracyPercentOf: next.accuracyPercentOf,
        accuracyPercentValue: next.accuracyPercentValue,
        accuracyDigits: next.accuracyDigits,
        accuracyDigitsUnit: next.accuracyDigitsUnit,
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
    Body: { name?: unknown; make?: unknown; model?: unknown; serialNumber?: unknown }
  }>('/instruments/:id/components', { preHandler: [requireAdmin] }, async (request, reply) => {
    const tenantId = request.tenantId
    const instrument = await resolveInstrument(request.params.id, tenantId)
    if (!instrument) return reply.status(404).send({ error: 'Instrument not found' })

    const body = request.body ?? {}
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name) return reply.status(400).send({ error: 'A component needs a name' })

    const existing = await prisma.masterInstrumentComponent.findMany({
      where: { tenantId, instrumentId: instrument.instrumentId },
      select: { componentKey: true, sortOrder: true },
    })
    // A slug of the name, numbered if that slug is taken. The key never changes and is
    // never reused, so a rename leaves the audit trail pointing at the same part.
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'part'
    const taken = new Set(existing.map((e) => e.componentKey))
    let componentKey = slug
    let n = 1
    while (taken.has(componentKey)) componentKey = `${slug}-${++n}`

    const created = await prisma.masterInstrumentComponent.create({
      data: {
        tenantId,
        instrumentId: instrument.instrumentId,
        componentKey,
        name,
        make: typeof body.make === 'string' && body.make.trim() ? body.make.trim() : null,
        model: typeof body.model === 'string' && body.model.trim() ? body.model.trim() : null,
        serialNumber:
          typeof body.serialNumber === 'string' && body.serialNumber.trim() ? body.serialNumber.trim() : null,
        sortOrder: existing.reduce((m, e) => Math.max(m, e.sortOrder + 1), 0),
      },
    })
    return reply.status(201).send({ component: { id: created.id, componentKey: created.componentKey, name: created.name } })
  })

  fastify.patch<{
    Params: { id: string; componentId: string }
    Body: { name?: unknown; make?: unknown; model?: unknown; serialNumber?: unknown }
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

    // A name is required, so an empty one is ignored rather than blanking it.
    const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : undefined

    await prisma.masterInstrumentComponent.update({
      where: { id: component.id },
      data: { name, make: text(body.make), model: text(body.model), serialNumber: text(body.serialNumber) },
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
/**
   * GET /api/admin/instruments/:id/history - everything that has happened to it.
   *
   * The capability audit is one table of four. An instrument at version 8 with
   * seven certificates and no capability edits had an empty Audit Log, which is
   * not the same as nothing having happened - it is the log looking in one
   * place.
   *
   * The other three are not audit tables; they are the records themselves,
   * carrying who made them and when. That is enough to say what happened, and
   * it needs no second copy of the same fact to drift out of step.
   */
  fastify.get<{ Params: { id: string } }>(
    '/instruments/:id/history',
    { preHandler: [requireAdmin] },
    async (request, reply) => {
      const tenantId = request.tenantId
      const instrument = await resolveInstrument(request.params.id, tenantId)
      if (!instrument) return reply.status(404).send({ error: 'Instrument not found' })

      const who = { select: { id: true, name: true, email: true } }

      const [versions, audit, certificates, trainings] = await Promise.all([
        prisma.masterInstrument.findMany({
          where: { tenantId, instrumentId: instrument.instrumentId },
          select: { id: true, version: true, createdAt: true, createdBy: who },
          orderBy: { version: 'asc' },
        }),
        prisma.masterCapabilityAudit.findMany({
          where: { tenantId, instrumentId: instrument.instrumentId },
          include: { actor: who },
          orderBy: { createdAt: 'desc' },
          take: 500,
        }),
        prisma.masterInstrumentCertificate.findMany({
          where: { masterInstrument: { tenantId, instrumentId: instrument.instrumentId } },
          select: {
            id: true,
            reportNo: true,
            fileName: true,
            isActive: true,
            uploadedAt: true,
            uploadedBy: who,
            capabilityProfile: { select: { profileKey: true, parameter: true, role: true } },
          },
        }),
        prisma.masterInstrumentTraining.findMany({
          where: { tenantId, instrumentId: instrument.instrumentId },
          select: {
            id: true,
            uploadedAt: true,
            uploadedBy: who,
            engineer: { select: { name: true, email: true } },
            expiresAt: true,
          },
        }),
      ])

      const name = (u: { name: string | null; email: string } | null) =>
        u ? { id: '', name: u.name || u.email } : null

      type Entry = {
        id: string
        at: string
        verb: string
        subject: string
        what: string
        where: string
        before: string | null
        after: string | null
        actor: { id: string; name: string } | null
      }

      const entries: Entry[] = []

      // Version 1 is the instrument arriving; every one after it is an edit.
      for (const v of versions) {
        entries.push({
          id: `v-${v.id}`,
          at: v.createdAt.toISOString(),
          verb: v.version === 1 ? 'created' : 'changed',
          subject: 'Details',
          what: v.version === 1 ? 'Instrument' : 'Instrument details',
          where: `version ${v.version}`,
          before: v.version === 1 ? null : `version ${v.version - 1}`,
          after: `version ${v.version}`,
          actor: v.createdBy ? { id: v.createdBy.id, name: v.createdBy.name || v.createdBy.email } : null,
        })
      }

      for (const c of certificates) {
        const covers = c.capabilityProfile
          ? `covers ${c.capabilityProfile.profileKey} ${c.capabilityProfile.parameter}`
          : 'no capability assigned'
        entries.push({
          id: `c-${c.id}`,
          at: c.uploadedAt.toISOString(),
          verb: 'uploaded',
          subject: 'Certificates',
          what: 'Certificate',
          where: covers,
          before: null,
          after: c.reportNo || c.fileName,
          actor: c.uploadedBy ? { id: c.uploadedBy.id, name: c.uploadedBy.name || c.uploadedBy.email } : null,
        })
      }

      for (const g of trainings) {
        entries.push({
          id: `t-${g.id}`,
          at: g.uploadedAt.toISOString(),
          verb: 'added',
          subject: 'Training',
          what: 'Training record',
          where: g.engineer ? g.engineer.name || g.engineer.email : 'an engineer who has since been removed',
          before: null,
          after: g.expiresAt ? `expires ${g.expiresAt.toISOString().slice(0, 10)}` : 'no expiry',
          actor: g.uploadedBy ? { id: g.uploadedBy.id, name: g.uploadedBy.name || g.uploadedBy.email } : null,
        })
      }

      for (const e of audit) {
        entries.push({
          id: `a-${e.id}`,
          at: e.createdAt.toISOString(),
          verb: e.action.toLowerCase(),
          subject: 'Capabilities',
          what: e.field || 'Capability',
          where: [e.profileKey, e.subtypeKey, e.bucketLabel || e.bucketKey].filter(Boolean).join(' \u203a '),
          before: e.beforeValue,
          after: e.afterValue,
          actor: e.actor ? { id: e.actor.id, name: e.actor.name || e.actor.email } : null,
        })
      }

      entries.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
      void name

      return { entries, total: entries.length }
    },
  )
}

export default capabilityRoutes
