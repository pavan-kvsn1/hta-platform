import { FastifyRequest, FastifyReply } from 'fastify'

/**
 * JWT payload structure
 */
export interface JWTPayload {
  sub: string              // User ID
  email: string
  name: string
  role: 'ADMIN' | 'ENGINEER' | 'CUSTOMER'
  userType: 'STAFF' | 'CUSTOMER'
  tenantId: string
  isAdmin?: boolean
  adminType?: 'MASTER' | 'WORKER' | null
  iat: number
  exp: number
}

/**
 * Require valid JWT authentication
 * Use as preHandler: [requireAuth]
 */
export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const decoded = await request.jwtVerify<JWTPayload>()

  // Verify tenant matches
  if (decoded.tenantId !== request.tenantId) {
    return reply.status(403).send({
      error: 'Forbidden',
      message: 'Token tenant does not match request tenant',
    })
  }

  // Attach user to request
  request.user = decoded
}

/**
 * Require staff (non-customer) authentication
 */
export async function requireStaff(
  request: FastifyRequest,
  reply: FastifyReply
) {
  await requireAuth(request, reply)

  if (request.user?.userType !== 'STAFF') {
    return reply.status(403).send({
      error: 'Forbidden',
      message: 'Staff access required',
    })
  }
}

/**
 * Require admin authentication
 */
export async function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply
) {
  await requireStaff(request, reply)

  if (!request.user?.isAdmin && request.user?.role !== 'ADMIN') {
    return reply.status(403).send({
      error: 'Forbidden',
      message: 'Admin access required',
    })
  }
}

/**
 * Require master admin authentication
 */
export async function requireMasterAdmin(
  request: FastifyRequest,
  reply: FastifyReply
) {
  await requireAdmin(request, reply)

  if (request.user?.adminType !== 'MASTER') {
    return reply.status(403).send({
      error: 'Forbidden',
      message: 'Master admin access required',
    })
  }
}

/**
 * Require customer authentication
 */
export async function requireCustomer(
  request: FastifyRequest,
  reply: FastifyReply
) {
  await requireAuth(request, reply)

  if (request.user?.userType !== 'CUSTOMER' && request.user?.role !== 'CUSTOMER') {
    return reply.status(403).send({
      error: 'Forbidden',
      message: 'Customer access required',
    })
  }
}

/**
 * Optional authentication - doesn't fail if no token
 */
export async function optionalAuth(
  request: FastifyRequest,
  _reply: FastifyReply
) {
  try {
    const authHeader = request.headers.authorization
    if (authHeader) {
      const decoded = await request.jwtVerify<JWTPayload>()
      request.user = decoded
    }
  } catch {
    // Ignore auth errors for optional auth
  }
}

// Type for signing (without iat/exp)
export type JWTSignPayload = Omit<JWTPayload, 'iat' | 'exp'>

// Type augmentation for @fastify/jwt
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JWTSignPayload
    user: JWTPayload
  }
}
