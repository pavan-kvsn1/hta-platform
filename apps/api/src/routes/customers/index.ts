import { FastifyPluginAsync } from 'fastify'
import { prisma } from '@hta/database'
import { requireStaff } from '../../middleware/auth.js'

const customersRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/customers/search - Search customer accounts for autocomplete
  fastify.get('/search', {
    preHandler: [requireStaff],
  }, async (request) => {
    const tenantId = request.tenantId
    const query = request.query as { q?: string; limit?: string }
    const searchQuery = query.q || ''
    const limit = Math.min(parseInt(query.limit || '10'), 20)

    if (searchQuery.length < 2) {
      return { customers: [] }
    }

    const customers = await prisma.customerAccount.findMany({
      where: {
        tenantId,
        isActive: true,
        companyName: {
          contains: searchQuery,
          mode: 'insensitive',
        },
      },
      select: {
        id: true,
        companyName: true,
        address: true,
        contactEmail: true,
        contactPhone: true,
      },
      orderBy: { companyName: 'asc' },
      take: limit,
    })

    return { customers }
  })

  // GET /api/customers/all - List all active customer accounts (for desktop sync/cache)
  fastify.get('/all', {
    preHandler: [requireStaff],
  }, async (request) => {
    const tenantId = request.tenantId

    const customers = await prisma.customerAccount.findMany({
      where: { tenantId, isActive: true },
      select: {
        id: true,
        companyName: true,
        address: true,
        contactEmail: true,
        contactPhone: true,
      },
      orderBy: { companyName: 'asc' },
    })

    return { customers }
  })

  // GET /api/customers/users - Search customer users (contacts) for a given company
  fastify.get('/users', {
    preHandler: [requireStaff],
  }, async (request) => {
    const tenantId = request.tenantId
    const query = request.query as {
      company?: string
      q?: string
      limit?: string
    }

    const company = query.company || ''
    const searchQuery = query.q || ''
    const limit = Math.min(parseInt(query.limit || '5'), 10)

    if (company.length < 2) {
      return { users: [] }
    }

    // Find customer accounts matching the company name
    const customerAccounts = await prisma.customerAccount.findMany({
      where: {
        tenantId,
        isActive: true,
        companyName: {
          contains: company,
          mode: 'insensitive',
        },
      },
      select: { id: true },
      take: 5,
    })

    if (customerAccounts.length === 0) {
      return { users: [] }
    }

    const accountIds = customerAccounts.map((a: (typeof customerAccounts)[number]) => a.id)

    // Build where clause for users
    const userWhere: Record<string, unknown> = {
      tenantId,
      customerAccountId: { in: accountIds },
      isActive: true,
    }

    if (searchQuery.length > 0) {
      userWhere.name = {
        contains: searchQuery,
        mode: 'insensitive',
      }
    }

    // Find users for these customer accounts
    const users = await prisma.customerUser.findMany({
      where: userWhere,
      select: {
        id: true,
        name: true,
        email: true,
        isPoc: true,
      },
      orderBy: [
        { isPoc: 'desc' }, // POC users first
        { name: 'asc' },
      ],
      take: limit,
    })

    return { users }
  })
}

export default customersRoutes
