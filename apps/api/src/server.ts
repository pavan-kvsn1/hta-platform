import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import jwt from '@fastify/jwt'
import multipart from '@fastify/multipart'

// Import routes
import authRoutes from './routes/auth/index.js'
import healthRoutes from './routes/health/index.js'
import certificateRoutes from './routes/certificates/index.js'
import instrumentRoutes from './routes/instruments/index.js'
import userRoutes from './routes/users/index.js'
import adminRoutes from './routes/admin/index.js'
import customerRoutes from './routes/customer/index.js'
import notificationRoutes from './routes/notifications/index.js'
import internalRequestRoutes from './routes/internal-requests/index.js'
import customersRoutes from './routes/customers/index.js'
import chatRoutes from './routes/chat/index.js'

// Import middleware
import { tenantMiddleware } from './middleware/tenant.js'
import { errorHandler } from './middleware/error-handler.js'

const server = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    transport: process.env.NODE_ENV === 'development'
      ? { target: 'pino-pretty' }
      : undefined,
  },
})

// =============================================================================
// PLUGINS
// =============================================================================

// Security headers
await server.register(helmet, {
  contentSecurityPolicy: process.env.NODE_ENV === 'production',
})

// CORS
await server.register(cors, {
  origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-ID'],
})

// Rate limiting
await server.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute',
  keyGenerator: (request) => {
    return request.headers['x-forwarded-for'] as string || request.ip
  },
})

// JWT
await server.register(jwt, {
  secret: process.env.JWT_SECRET || process.env.AUTH_SECRET || 'dev-secret-change-in-production',
  sign: {
    expiresIn: '15m', // Access token expires in 15 minutes
  },
})

// Multipart (file uploads)
await server.register(multipart, {
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max file size
    files: 10, // Max 10 files per request
  },
})

// =============================================================================
// MIDDLEWARE
// =============================================================================

// Tenant identification for all routes except health and CORS preflight
server.addHook('preHandler', async (request, reply) => {
  // Skip tenant check for health endpoints
  if (request.url.startsWith('/health')) {
    return
  }
  // Skip tenant check for CORS preflight requests (OPTIONS)
  // Preflight requests don't include custom headers like X-Tenant-ID
  if (request.method === 'OPTIONS') {
    return
  }
  await tenantMiddleware(request, reply)
})

// Error handler
server.setErrorHandler(errorHandler)

// =============================================================================
// ROUTES
// =============================================================================

// Health check (no auth required)
await server.register(healthRoutes, { prefix: '/health' })

// Auth routes
await server.register(authRoutes, { prefix: '/api/auth' })

// Certificate routes
await server.register(certificateRoutes, { prefix: '/api/certificates' })

// Instrument routes
await server.register(instrumentRoutes, { prefix: '/api/instruments' })

// User routes
await server.register(userRoutes, { prefix: '/api/users' })

// Admin routes
await server.register(adminRoutes, { prefix: '/api/admin' })

// Customer routes
await server.register(customerRoutes, { prefix: '/api/customer' })

// Notification routes
await server.register(notificationRoutes, { prefix: '/api/notifications' })

// Internal requests routes
await server.register(internalRequestRoutes, { prefix: '/api/internal-requests' })

// Customers routes (for staff to search customers)
await server.register(customersRoutes, { prefix: '/api/customers' })

// Chat routes
await server.register(chatRoutes, { prefix: '/api/chat' })

// =============================================================================
// START SERVER
// =============================================================================

const start = async () => {
  try {
    const port = parseInt(process.env.PORT || '4000', 10)
    const host = process.env.HOST || '0.0.0.0'
    await server.listen({ port, host })
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║           HTA Platform API Server                         ║
╠═══════════════════════════════════════════════════════════╣
║  Status:  Running                                         ║
║  URL:     http://${host}:${port}                             ║
║  Env:     ${process.env.NODE_ENV || 'development'}                                    ║
╚═══════════════════════════════════════════════════════════╝
    `)
  } catch (err) {
    server.log.error(err)
    process.exit(1)
  }
}

start()

export default server
