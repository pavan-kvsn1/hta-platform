import { FastifyPluginAsync } from 'fastify'
import { prisma, type MasterInstrument } from '@hta/database'
import { requireStaff } from '../../middleware/auth.js'

// Helper to safely handle JSON values
function safeJsonValue<T>(value: unknown, fallback: T): T {
  if (!value) return fallback
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T
    } catch {
      return fallback
    }
  }
  return value as T
}

// Helper to format date as MM/DD/YYYY
function formatDateMMDDYYYY(date: Date): string {
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  const day = date.getDate().toString().padStart(2, '0')
  const year = date.getFullYear()
  return `${month}/${day}/${year}`
}

const instrumentRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/instruments - Get all active instruments for certificate forms
  fastify.get('/', {
    preHandler: [requireStaff],
  }, async (request, reply) => {
    const tenantId = request.tenantId
    const { category } = request.query as { category?: string }

    const where: Record<string, unknown> = {
      tenantId,
      isActive: true,
      isLatest: true,
    }
    if (category) {
      where.category = category
    }

    const instruments = await prisma.masterInstrument.findMany({
      where,
      orderBy: [
        { category: 'asc' },
        { description: 'asc' },
      ],
    })

    /**
     * The two halves of a composite instrument, where it has them.
     *
     * 33 of this lab's masters are a readout and a probe with a model and a serial
     * each, and a certificate names both - "HD 2107.1 · 17013097 and TP 472 I ·
     * 19012265". One combined string cannot be split back apart afterwards, so the
     * pieces are sent as pieces.
     *
     * Until now this only existed in the bundled registry file, which is the last
     * thing the app still needed that file for.
     */
    const components = await prisma.masterInstrumentComponent.findMany({
      where: { tenantId, instrumentId: { in: instruments.map((i) => i.instrumentId) } },
      select: { instrumentId: true, componentKey: true, make: true, model: true, serialNumber: true },
    })

    type Parts = { ind?: string; sen?: string }
    const partsOf = new Map<string, { make: Parts; model: Parts; serial: Parts }>()
    for (const c of components) {
      const side = c.componentKey === 'ind' ? 'ind' : c.componentKey === 'sen' ? 'sen' : null
      if (!side) continue
      const entry = partsOf.get(c.instrumentId) ?? { make: {}, model: {}, serial: {} }
      if (c.make) entry.make[side] = c.make
      if (c.model) entry.model[side] = c.model
      if (c.serialNumber) entry.serial[side] = c.serialNumber
      partsOf.set(c.instrumentId, entry)
    }
    /** Absent rather than empty, so "has parts" stays a question with a yes or no. */
    const orUndefined = (parts: Parts) => (parts.ind || parts.sen ? parts : undefined)

    // Transform to match the expected format
    const transformedInstruments = instruments.map((inst: MasterInstrument) => ({
      id: inst.legacyId || parseInt(inst.id.substring(0, 8), 16),
      dbId: inst.id,
      type: inst.category,
      parameter_group: inst.parameterGroup || '',
      parameter: {
        role: inst.parameterRoles || [],
        capabilities: inst.parameterCapabilities || [],
      },
      sop_references: inst.sopReferences || [],
      instrument_desc: inst.description,
      make: inst.make,
      model: inst.model,
      asset_no: inst.assetNumber,
      instrument_sl_no: inst.serialNumber,
      usage: inst.usage || '',
      calibrated_at: inst.calibratedAtLocation || '',
      report_no: inst.reportNo || '',
      next_due_on: inst.calibrationDueDate
        ? formatDateMMDDYYYY(inst.calibrationDueDate)
        : '',
      range: safeJsonValue<unknown[]>(inst.rangeData, []),
      remarks: inst.remarks || '',
      make_parts: orUndefined(partsOf.get(inst.instrumentId)?.make ?? {}),
      model_parts: orUndefined(partsOf.get(inst.instrumentId)?.model ?? {}),
      serial_parts: orUndefined(partsOf.get(inst.instrumentId)?.serial ?? {}),
    }))

    // Set cache headers
    reply.header('Cache-Control', 'public, max-age=300, stale-while-revalidate=60')

    return transformedInstruments
  })

  /**
   * GET /api/instruments/capabilities - what every master can actually do.
   *
   * The certificate's master selection needs a parameter, a unit, a span and an
   * accuracy per master to judge whether one can serve a reading. Until now it
   * read all of that out of a 1.3 MB registry file bundled into the web app,
   * which meant an instrument edited on the admin pages did not change what a
   * certificate would accept until someone rebuilt and redeployed.
   *
   * Shaped as the client already holds it - snake_case, Decimals as numbers,
   * the enums lowercased - so the store can drop it straight in where the file
   * used to go and nothing downstream has to learn a second shape.
   *
   * Keyed by legacyId, because that is the key the other side already holds: a
   * saved certificate's masterInstrumentId is a legacy id, and so is the
   * argument to getCapabilityProfiles. Capabilities hang off instrumentId in the
   * database - the stable identity, not MasterInstrument.id, which changes with
   * every version of a row - so the two are bridged here rather than leaving the
   * client to look up a key it has no way to resolve.
   */
  fastify.get('/capabilities', {
    preHandler: [requireStaff],
  }, async (request, reply) => {
    const tenantId = request.tenantId

    // instrumentId -> legacyId, for the instruments this tenant still has.
    const instruments = await prisma.masterInstrument.findMany({
      where: { tenantId, isActive: true, isLatest: true },
      select: { instrumentId: true, legacyId: true },
    })
    const legacyOf = new Map<string, number>()
    for (const i of instruments) {
      if (i.legacyId !== null) legacyOf.set(i.instrumentId, i.legacyId)
    }

    const profiles = await prisma.masterCapabilityProfile.findMany({
      where: { tenantId },
      orderBy: [{ instrumentId: 'asc' }, { sortOrder: 'asc' }],
      include: {
        buckets: { orderBy: { sortOrder: 'asc' } },
        subtypes: {
          orderBy: { sortOrder: 'asc' },
          include: { buckets: { orderBy: { sortOrder: 'asc' } } },
        },
      },
    })

    /** Prisma hands Decimals back as objects; the client wants numbers or null. */
    const num = (value: unknown): number | null =>
      value === null || value === undefined ? null : Number(value)

    /**
     * The four shapes an accuracy comes in, as the registry file wrote them.
     *
     * A bucket with no accuracyKind states none - uncertainty only, or nothing -
     * and that is different from an accuracy of zero, so it stays null.
     */
    const accuracyOf = (b: {
      accuracyKind: string | null
      accuracyValue: unknown
      accuracyUnit: string | null
      accuracyPolarity: string | null
      accuracyFormula: string | null
      accuracyExpression: string | null
      accuracyClass: string | null
      accuracyUpper: unknown
      accuracyLower: unknown
      accuracyPercentOf: string | null
      accuracyPercentValue: unknown
      accuracyDigits: unknown
      accuracyDigitsUnit: string | null
    }) => {
      switch (b.accuracyKind) {
        case 'SYMMETRIC':
          return {
            type: 'symmetric',
            value: num(b.accuracyValue),
            unit: b.accuracyUnit ?? '',
            polarity: b.accuracyPolarity ?? '\u00b1',
          }
        case 'ASYMMETRIC':
          return {
            type: 'asymmetric',
            upper: num(b.accuracyUpper),
            lower: num(b.accuracyLower),
            unit: b.accuracyUnit ?? '',
          }
        case 'FORMULA':
          /**
           * The sentence and the numbers behind it.
           *
           * The expression is what a certificate prints; percent_of, percent_value
           * and digits are what resolveAccuracy computes with. Without the numbers
           * it returns null, the master reads as unrated, and the engineer is asked
           * to justify an instrument the app was rating a moment ago.
           */
          return {
            type: 'formula',
            expression: b.accuracyFormula ?? '',
            // The arithmetic behind the sentence, where the sentence is a shape the
            // three fields below cannot hold. Null on every row until one is written.
            evaluable: b.accuracyExpression,
            percent_of: b.accuracyPercentOf,
            percent_value: num(b.accuracyPercentValue),
            digits: num(b.accuracyDigits),
            digits_unit: b.accuracyDigitsUnit,
            polarity: b.accuracyPolarity ?? '±',
          }
        case 'CLASS':
          return { type: 'class', class: b.accuracyClass ?? '', polarity: b.accuracyPolarity }
        default:
          return null
      }
    }

    const bucketOf = (b: (typeof profiles)[number]['buckets'][number]) => ({
      id: b.bucketKey,
      min: num(b.minValue),
      max: num(b.maxValue),
      min_inclusive: b.minInclusive,
      max_inclusive: b.maxInclusive,
      least_count:
        b.leastCountValue === null
          ? null
          : { value: num(b.leastCountValue), unit: b.leastCountUnit ?? '' },
      accuracy: accuracyOf(b),
    })

    const byInstrument: Record<string, unknown[]> = {}
    let orphaned = 0
    for (const profile of profiles) {
      const capability: Record<string, unknown> = {
        id: profile.profileKey,
        parameter: profile.parameter,
        role: profile.role.toLowerCase(),
        unit: profile.unit || null,
        kind: profile.kind.toLowerCase(),
        min: num(profile.minValue),
        max: num(profile.maxValue),
        min_inclusive: profile.minInclusive,
        max_inclusive: profile.maxInclusive,
        // Buckets hang off the subtype where there is one, and off the profile
        // where there is not; never both.
        buckets: profile.subtypes.length ? [] : profile.buckets.map(bucketOf),
      }
      if (profile.subtypes.length) {
        capability.subtype_kind = profile.subtypeKind
        capability.subtypes = profile.subtypes.map((s) => ({
          id: s.subtypeKey,
          min: num(s.minValue),
          max: num(s.maxValue),
          min_inclusive: s.minInclusive,
          max_inclusive: s.maxInclusive,
          buckets: s.buckets.map(bucketOf),
        }))
      }
      /**
       * Which half of a two-part instrument this is, and how it measures.
       *
       * Six masters are a readout and a probe with an accuracy each. Without these the
       * client sees two Temperature records against one instrument, identical in every
       * field it can read, and can only offer them by a range they both share.
       */
      if (profile.part) capability.component = profile.part
      if (profile.mode) capability.mode = profile.mode
      if (profile.sopReferences.length) capability.sop_references = profile.sopReferences
      if (profile.componentId) capability.component_id = profile.componentId

      // A capability whose instrument has no legacy id cannot be addressed by
      // anything holding one, so it is left out rather than keyed by something
      // the caller cannot ask for.
      const legacy = legacyOf.get(profile.instrumentId)
      if (legacy === undefined) {
        orphaned++
        continue
      }
      ;(byInstrument[String(legacy)] ??= []).push(capability)
    }

    // Capabilities change when an admin edits one, which is rarer than a page
    // load and more urgent than a stale list: a short window, revalidated.
    reply.header('Cache-Control', 'private, max-age=30, stale-while-revalidate=120')
    return {
      capabilities: byInstrument,
      instruments: Object.keys(byInstrument).length,
      /** Profiles on instruments with no legacy id; nothing can reach these. */
      unreachable: orphaned,
    }
  })

  // GET /api/instruments/:id - Get single instrument
  fastify.get<{ Params: { id: string } }>('/:id', {
    preHandler: [requireStaff],
  }, async (request, reply) => {
    const tenantId = request.tenantId
    const { id } = request.params

    const instrument = await prisma.masterInstrument.findFirst({
      where: {
        tenantId,
        id,
        isActive: true,
      },
    })

    if (!instrument) {
      return reply.status(404).send({ error: 'Instrument not found' })
    }

    return {
      id: instrument.legacyId || parseInt(instrument.id.substring(0, 8), 16),
      dbId: instrument.id,
      type: instrument.category,
      instrument_desc: instrument.description,
      make: instrument.make,
      model: instrument.model,
      asset_no: instrument.assetNumber,
      instrument_sl_no: instrument.serialNumber,
      usage: instrument.usage || '',
      calibrated_at: instrument.calibratedAtLocation || '',
      report_no: instrument.reportNo || '',
      next_due_on: instrument.calibrationDueDate
        ? formatDateMMDDYYYY(instrument.calibrationDueDate)
        : '',
      range: safeJsonValue<unknown[]>(instrument.rangeData, []),
      remarks: instrument.remarks || '',
    }
  })
}

export default instrumentRoutes
