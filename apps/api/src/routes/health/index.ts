import { FastifyPluginAsync } from 'fastify'
import { prisma } from '@hta/database'

const healthRoutes: FastifyPluginAsync = async (fastify) => {
  // Basic health check
  fastify.get('/', async () => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'hta-api',
    }
  })

  // Detailed health check (includes DB)
  fastify.get('/ready', async (_request, reply) => {
    const checks: Record<string, { status: string; latency?: number; error?: string }> = {}

    // Database check
    const dbStart = Date.now()
    try {
      await prisma.$queryRaw`SELECT 1`
      checks.database = {
        status: 'ok',
        latency: Date.now() - dbStart,
      }
    } catch (err) {
      checks.database = {
        status: 'error',
        error: err instanceof Error ? err.message : 'Unknown error',
      }
    }

    // Overall status
    const isHealthy = Object.values(checks).every((c) => c.status === 'ok')

    return reply.status(isHealthy ? 200 : 503).send({
      status: isHealthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      checks,
    })
  })

  // Liveness probe (for K8s)
  fastify.get('/live', async () => {
    return { status: 'ok' }
  })
}

export default healthRoutes
