import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'

const server = Fastify({
  logger: true,
})

// Security middleware
await server.register(helmet)
await server.register(cors, {
  origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true,
})

// Health check
server.get('/health', async () => {
  return { status: 'ok', timestamp: new Date().toISOString() }
})

// Routes will be registered here
// await server.register(authRoutes, { prefix: '/api/auth' })
// await server.register(certificateRoutes, { prefix: '/api/certificates' })
// await server.register(adminRoutes, { prefix: '/api/admin' })
// await server.register(customerRoutes, { prefix: '/api/customer' })

const start = async () => {
  try {
    const port = parseInt(process.env.PORT || '4000', 10)
    const host = process.env.HOST || '0.0.0.0'
    await server.listen({ port, host })
    console.log(`API server running on http://${host}:${port}`)
  } catch (err) {
    server.log.error(err)
    process.exit(1)
  }
}

start()
