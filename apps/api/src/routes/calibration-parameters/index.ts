/**
 * The parameters this lab calibrates.
 *
 * Two layers, and the split matters. The standards are seeded from the master
 * instrument registry and shared by every tenant: they are what master capabilities are
 * recorded against, so renaming one would break the match between a certificate and the
 * instrument that served it. What a tenant owns is the name its own engineers read -
 * "Platinum RTD" for the standard called "RTD" - and, if it wants, a shorter list of
 * units than the standard offers.
 *
 * So the standard name travels with every response. The UI shows the custom name and
 * matches on the standard one, and nothing downstream has to know which is which.
 */

import { FastifyPluginAsync } from 'fastify'
import { prisma } from '@hta/database'
import { z } from 'zod'
import { requireStaff, requireAdmin } from '../../middleware/auth.js'

/** This lab's own. Nobody else sees a change to one of these. */
const updateSchema = z.object({
  customName: z.string().trim().min(1).max(255).optional(),
  units: z.array(z.string().trim().min(1)).optional(),
  defaultUnit: z.string().trim().min(1).nullable().optional(),
  subtypes: z.array(z.string().trim().min(1)).optional(),
  active: z.boolean().optional(),

  /**
   * The standard behind it, which every lab reads.
   *
   * `measures` and `kind` are the pairing key - two parameters serve each other
   * only where the first matches and the second agrees - so a change here moves
   * which instruments can serve a certificate. `category` is the dropdown's
   * heading and reads on nothing. `aliases` are the older names that still have
   * to resolve, which is how a certificate written "Current AC" finds AC Current.
   */
  shared: z
    .object({
      category: z.string().trim().min(1).max(100).optional(),
      measures: z.string().trim().min(1).max(100).optional(),
      kind: z.string().trim().min(1).max(100).optional(),
      aliases: z.array(z.string().trim().min(1)).optional(),
      subtypes: z.array(z.string().trim().min(1)).optional(),
    })
    .optional(),
})

/**
 * A parameter the registry has never heard of.
 *
 * Both rows at once: the standard every lab reads, and this lab's own against
 * it. A standard with no tenant row would be a parameter nobody could pick, and
 * the pair is written in one transaction so neither can exist without the other.
 */
const createSchema = z.object({
  standardName: z.string().trim().min(1).max(255),
  category: z.string().trim().min(1).max(100),
  measures: z.string().trim().min(1).max(100),
  /** "any" where the quantity does not split into sorts that differ. */
  kind: z.string().trim().min(1).max(100).default('any'),
  units: z.array(z.string().trim().min(1)).default([]),
  defaultUnit: z.string().trim().min(1).nullable().default(null),
  subtypes: z.array(z.string().trim().min(1)).default([]),
  aliases: z.array(z.string().trim().min(1)).default([]),
  /** What this lab calls it. Defaults to the standard name. */
  customName: z.string().trim().min(1).max(255).optional(),
})

/** One parameter as the app reads it: the lab's name, and the standard behind it. */
function present(row: {
  id: string
  standardId?: string
  customName: string
  units: string[]
  defaultUnit: string | null
  subtypes: string[]
  active: boolean
  standard: {
    standardName: string
    category: string
    measures: string
    kind: string
    units: string[]
    defaultUnit: string | null
    subtypes: string[]
    aliases: string[]
    source: string
  }
}) {
  return {
    id: row.id,
    standardName: row.standard.standardName,
    customName: row.customName,
    category: row.standard.category,
    /** What is measured, and which kind - what decides whether a master can serve it. */
    measures: row.standard.measures,
    kind: row.standard.kind,
    // A tenant's own list wins where it set one; otherwise the standard's.
    units: row.units.length > 0 ? row.units : row.standard.units,
    /**
     * What the standard offers, regardless of what this lab narrowed it to, and
     * whether it narrowed it at all. A form wants `units` and nothing else; the
     * register page has to show the difference and offer a way back.
     */
    standardUnits: row.standard.units,
    standardDefaultUnit: row.standard.defaultUnit,
    ownUnits: row.units.length > 0,
    defaultUnit: row.defaultUnit ?? row.standard.defaultUnit,
    subtypes: row.subtypes.length > 0 ? row.subtypes : row.standard.subtypes,
    /** Other names the same quantity is known by, so an old certificate still resolves. */
    aliases: row.standard.aliases,
    /** 'registry' where a master records it, 'certificates' where only a certificate does. */
    source: row.standard.source,
    active: row.active,
  }
}

const calibrationParameterRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/calibration-parameters — everything this tenant can calibrate.
  fastify.get('/', {
    preHandler: [requireStaff],
  }, async (request, reply) => {
    const tenantId = request.tenantId
    const { includeInactive, withUsage } = request.query as {
      includeInactive?: string
      withUsage?: string
    }

    const rows = await prisma.calibrationParameter.findMany({
      where: {
        tenantId,
        ...(includeInactive === 'true' ? {} : { active: true }),
      },
      include: { standard: true },
    })

    /**
     * How much is recorded against each parameter, for the page that can switch
     * one off or change what it pairs with.
     *
     * Two grains, because they answer two questions. The instrument count is
     * what an admin switching a parameter off needs - how many instruments stop
     * being offered - and it counts distinct instruments rather than profiles,
     * since one instrument can hold several for the same parameter. The per-unit
     * count is what decides whether a single unit can come off the list.
     */
    let usage: Record<string, { instruments: number; units: Record<string, number> }> = {}
    if (withUsage === 'true') {
      const profiles = await prisma.masterCapabilityProfile.findMany({
        where: { tenantId },
        select: { parameter: true, unit: true, instrumentId: true },
      })
      const seen: Record<string, { instruments: Set<string>; units: Record<string, number> }> = {}
      for (const profile of profiles) {
        const key = profile.parameter
        const bucket = (seen[key] ??= { instruments: new Set(), units: {} })
        bucket.instruments.add(profile.instrumentId)
        // A profile recorded without a unit still counts towards the instrument
        // but belongs to no unit, so it cannot hold one on the list.
        if (profile.unit) bucket.units[profile.unit] = (bucket.units[profile.unit] ?? 0) + 1
      }
      usage = Object.fromEntries(
        Object.entries(seen).map(([k, v]) => [k, { instruments: v.instruments.size, units: v.units }]),
      )
    }

    const parameters = rows
      .map((row) => {
        const base = present(row)
        if (withUsage !== 'true') return base
        // Matched on the name a capability was recorded under, which is the
        // standard's - a lab renaming a parameter does not rewrite its history.
        const got = usage[base.standardName] ?? usage[base.customName]
        return { ...base, instruments: got?.instruments ?? 0, unitUses: got?.units ?? {} }
      })
      // Grouped the way the dropdown reads, and alphabetical within a group.
      .sort(
        (a, b) =>
          a.category.localeCompare(b.category) || a.customName.localeCompare(b.customName),
      )

    // The list changes only when a deploy reseeds it or an admin renames one, and
    // every certificate form asks for it. The counts move whenever a capability
    // is recorded, and they are quoted in a warning about what an edit would
    // affect, so that call is not cached at all.
    reply.header(
      'Cache-Control',
      withUsage === 'true' ? 'no-store' : 'private, max-age=60, stale-while-revalidate=300',
    )
    return { parameters }
  })

  /**
   * POST /api/calibration-parameters — a parameter that was not seeded.
   *
   * The seed script runs at deploy and extracts what the master registry holds,
   * so anything a lab starts calibrating between deploys had no way in. This is
   * that way in, and it asks for `measures` and `kind` rather than a name alone:
   * a parameter with neither matches no master instrument, which looks like
   * nothing at all going wrong until a certificate cannot find a standard.
   */
  fastify.post('/', { preHandler: [requireAdmin] }, async (request, reply) => {
    const tenantId = request.tenantId

    const parsed = createSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Invalid request',
        message: 'A name, a group and what it measures are all needed.',
        details: parsed.error.flatten(),
      })
    }
    const data = parsed.data

    // The default has to be one of the units on offer, or it shows a unit
    // nobody can choose.
    if (data.defaultUnit && data.units.length > 0 && !data.units.includes(data.defaultUnit)) {
      return reply.status(400).send({
        error: 'Invalid default unit',
        message: `"${data.defaultUnit}" is not one of the units this parameter offers.`,
      })
    }

    // standardName is unique across every lab, so a clash is a clash with a row
    // this tenant may not even be able to see. Said plainly rather than as a
    // constraint violation.
    const clash = await prisma.calibrationParameterStandard.findFirst({
      where: { standardName: data.standardName },
      select: { id: true },
    })
    if (clash) {
      return reply.status(409).send({
        error: 'Name already used',
        message: `The register already holds a parameter called "${data.standardName}".`,
      })
    }

    const created = await prisma.$transaction(async (tx) => {
      const standard = await tx.calibrationParameterStandard.create({
        data: {
          standardName: data.standardName,
          category: data.category,
          measures: data.measures.toLowerCase(),
          kind: data.kind.toLowerCase(),
          units: data.units,
          defaultUnit: data.defaultUnit,
          subtypes: data.subtypes,
          aliases: data.aliases,
          // Not from the registry and not off a certificate: added by hand, and
          // the next seed run has to leave it alone.
          source: 'admin',
          seedVersion: 'manual',
        },
      })

      /**
       * Only this tenant gets a row today.
       *
       * Every lab can see the standard, but a lab that has never heard of the
       * parameter should not find it in its dropdowns tomorrow morning. The
       * others pick it up the same way they pick up anything else new - by
       * being seeded against it - which is a deliberate act rather than a
       * side effect of somebody else's afternoon.
       */
      return tx.calibrationParameter.create({
        data: {
          tenantId,
          standardId: standard.id,
          customName: data.customName ?? data.standardName,
          units: [],
          defaultUnit: null,
          subtypes: [],
          active: true,
        },
        include: { standard: true },
      })
    })

    return reply.status(201).send({ parameter: present(created) })
  })

  // PUT /api/calibration-parameters/:id — rename it, or narrow its units.
  fastify.put('/:id', {
    preHandler: [requireAdmin],
  }, async (request, reply) => {
    const tenantId = request.tenantId
    const { id } = request.params as { id: string }

    const parsed = updateSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Invalid request',
        message: 'Check the fields being changed.',
        details: parsed.error.flatten(),
      })
    }

    // Scoped to the tenant, so an id from another lab reads as not found rather than
    // as forbidden - which is also all it should be told.
    const existing = await prisma.calibrationParameter.findFirst({
      where: { id, tenantId },
      include: { standard: true },
    })
    if (!existing) {
      return reply.status(404).send({
        error: 'Not found',
        message: 'No such parameter for this lab.',
      })
    }

    const changes = parsed.data

    // A name shared with another parameter makes the dropdown ambiguous and the
    // certificate that stores it unreadable later.
    if (changes.customName && changes.customName !== existing.customName) {
      const clash = await prisma.calibrationParameter.findFirst({
        where: {
          tenantId,
          customName: changes.customName,
          NOT: { id },
        },
        select: { id: true },
      })
      if (clash) {
        return reply.status(409).send({
          error: 'Name already used',
          message: `Another parameter is already called "${changes.customName}".`,
        })
      }
    }

    // A default outside the offered units would show a unit nobody can choose.
    const units = changes.units ?? (existing.units.length ? existing.units : existing.standard.units)
    const defaultUnit =
      changes.defaultUnit !== undefined ? changes.defaultUnit : existing.defaultUnit
    if (defaultUnit && units.length > 0 && !units.includes(defaultUnit)) {
      return reply.status(400).send({
        error: 'Invalid default unit',
        message: `"${defaultUnit}" is not one of the units this parameter offers.`,
      })
    }

    const { shared, ...own } = changes

    // A standard seeded from the registry is what master capabilities were
    // recorded against, so a rename there would break the match between a
    // certificate and the instrument that served it. The other three are safe:
    // the category reads on nothing, and measures, kind and aliases decide what
    // pairs with what, which is exactly what an admin correcting a mis-seeded
    // parameter needs to change.
    const updated = await prisma.$transaction(async (tx) => {
      if (shared && Object.keys(shared).length > 0) {
        await tx.calibrationParameterStandard.update({
          where: { id: existing.standardId },
          data: {
            ...(shared.category !== undefined ? { category: shared.category } : {}),
            ...(shared.measures !== undefined ? { measures: shared.measures.toLowerCase() } : {}),
            ...(shared.kind !== undefined ? { kind: shared.kind.toLowerCase() } : {}),
            ...(shared.aliases !== undefined ? { aliases: shared.aliases } : {}),
            ...(shared.subtypes !== undefined ? { subtypes: shared.subtypes } : {}),
          },
        })
      }
      return tx.calibrationParameter.update({
        where: { id },
        data: own,
        include: { standard: true },
      })
    })

    return { parameter: present(updated) }
  })
}

export default calibrationParameterRoutes
