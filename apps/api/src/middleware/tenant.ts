import { FastifyRequest, FastifyReply } from 'fastify'
import { prisma } from '@hta/database'

/**
 * Tenant identification middleware
 *
 * Extracts tenant from:
 * 1. X-Tenant-ID header (for API clients)
 * 2. Subdomain (e.g., hta.api.calibr8s.com -> "hta")
 * 3. Default tenant for development
 */
export async function tenantMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
) {
  let tenantSlug: string | null = null

  // 1. Check X-Tenant-ID header first (explicit tenant selection)
  const headerTenant = request.headers['x-tenant-id']
  if (headerTenant && typeof headerTenant === 'string') {
    tenantSlug = headerTenant
  }

  // 2. Extract from subdomain if not in header
  if (!tenantSlug) {
    const host = request.headers.host || ''
    const parts = host.split('.')

    // Expect format: {tenant}.api.domain.com or {tenant}.localhost
    if (parts.length >= 2 && parts[0] !== 'api' && parts[0] !== 'www') {
      tenantSlug = parts[0]
    }
  }

  // 3. Default to 'hta-calibration' in development
  if (!tenantSlug && process.env.NODE_ENV === 'development') {
    tenantSlug = 'hta-calibration'
  }

  if (!tenantSlug) {
    return reply.status(400).send({
      error: 'Tenant identification required',
      message: 'Provide X-Tenant-ID header or use tenant subdomain',
    })
  }

  // Lookup tenant in database
  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
    select: {
      id: true,
      slug: true,
      name: true,
      isActive: true,
      settings: true,
    },
  })

  if (!tenant) {
    return reply.status(404).send({
      error: 'Tenant not found',
      message: `No tenant found with slug: ${tenantSlug}`,
    })
  }

  if (!tenant.isActive) {
    return reply.status(403).send({
      error: 'Tenant inactive',
      message: 'This tenant account has been deactivated',
    })
  }

  // Attach tenant to request
  request.tenant = tenant
  request.tenantId = tenant.id
}

// Type augmentation for Fastify
declare module 'fastify' {
  interface FastifyRequest {
    tenant: {
      id: string
      slug: string
      name: string
      isActive: boolean
      settings: unknown
    }
    tenantId: string
  }
}
