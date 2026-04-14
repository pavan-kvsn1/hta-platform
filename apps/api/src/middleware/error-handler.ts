import { FastifyError, FastifyRequest, FastifyReply } from 'fastify'
import { ZodError } from 'zod'

/**
 * Global error handler for the API
 */
export function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply
) {
  const requestId = request.id

  // Zod validation errors
  if (error instanceof ZodError) {
    return reply.status(400).send({
      error: 'Validation Error',
      message: error.errors[0]?.message || 'Invalid request data',
      details: error.errors,
      requestId,
    })
  }

  // JWT errors
  if (error.code === 'FST_JWT_NO_AUTHORIZATION_IN_HEADER') {
    return reply.status(401).send({
      error: 'Unauthorized',
      message: 'Authorization header is required',
      requestId,
    })
  }

  if (error.code === 'FST_JWT_AUTHORIZATION_TOKEN_EXPIRED') {
    return reply.status(401).send({
      error: 'Token Expired',
      message: 'Access token has expired. Please refresh your token.',
      requestId,
    })
  }

  if (error.code === 'FST_JWT_AUTHORIZATION_TOKEN_INVALID') {
    return reply.status(401).send({
      error: 'Invalid Token',
      message: 'Access token is invalid',
      requestId,
    })
  }

  // Rate limit errors
  if (error.statusCode === 429) {
    return reply.status(429).send({
      error: 'Too Many Requests',
      message: 'Rate limit exceeded. Please try again later.',
      requestId,
    })
  }

  // Prisma errors
  if (error.name === 'PrismaClientKnownRequestError') {
    const prismaError = error as unknown as { code: string; meta?: { target?: string[] } }

    if (prismaError.code === 'P2002') {
      const fields = prismaError.meta?.target?.join(', ') || 'field'
      return reply.status(409).send({
        error: 'Conflict',
        message: `A record with this ${fields} already exists`,
        requestId,
      })
    }

    if (prismaError.code === 'P2025') {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'The requested resource was not found',
        requestId,
      })
    }
  }

  // Log unexpected errors
  request.log.error({
    err: error,
    requestId,
    url: request.url,
    method: request.method,
  }, 'Unhandled error')

  // Don't leak error details in production
  const message = process.env.NODE_ENV === 'production'
    ? 'An unexpected error occurred'
    : error.message

  return reply.status(error.statusCode || 500).send({
    error: 'Internal Server Error',
    message,
    requestId,
  })
}
