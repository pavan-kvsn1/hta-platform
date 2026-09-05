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

const updateSchema = z.object({
  customName: z.string().trim().min(1).max(255).optional(),
  units: z.array(z.string().trim().min(1)).optional(),
  defaultUnit: z.string().trim().min(1).nullable().optional(),
  subtypes: z.array(z.string().trim().min(1)).optional(),
  active: z.boolean().optional(),
})

/** One parameter as the app reads it: the lab's name, and the standard behind it. */
function present(row: {
  id: string
  customName: string
  units: string[]
  defaultUnit: string | null
  subtypes: string[]
  active: boolean
  standard: {
    standardName: string
    category: string
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
    // A tenant's own list wins where it set one; otherwise the standard's.
    units: row.units.length > 0 ? row.units : row.standard.units,
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
    const { includeInactive } = request.query as { includeInactive?: string }

    const rows = await prisma.calibrationParameter.findMany({
      where: {
        tenantId,
        ...(includeInactive === 'true' ? {} : { active: true }),
      },
      include: { standard: true },
    })

    const parameters = rows
      .map(present)
      // Grouped the way the dropdown reads, and alphabetical within a group.
      .sort(
        (a, b) =>
          a.category.localeCompare(b.category) || a.customName.localeCompare(b.customName),
      )

    // The list changes only when a deploy reseeds it or an admin renames one, and
    // every certificate form asks for it.
    reply.header('Cache-Control', 'private, max-age=60, stale-while-revalidate=300')
    return { parameters }
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

    const updated = await prisma.calibrationParameter.update({
      where: { id },
      data: changes,
      include: { standard: true },
    })

    return { parameter: present(updated) }
  })
}

export default calibrationParameterRoutes
