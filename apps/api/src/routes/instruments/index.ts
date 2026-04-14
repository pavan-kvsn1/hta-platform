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
    }))

    // Set cache headers
    reply.header('Cache-Control', 'public, max-age=300, stale-while-revalidate=60')

    return transformedInstruments
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
