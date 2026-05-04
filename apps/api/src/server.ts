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
import securityRoutes from './routes/security/index.js'
import deviceRoutes from './routes/devices/index.js'
import offlineCodesRoutes from './routes/devices/codes.js'

// Import middleware
import { tenantMiddleware } from './middleware/tenant.js'
import { errorHandler } from './middleware/error-handler.js'
import { closeQueues } from './services/queue.js'

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
  max: 250,
  timeWindow: '1 minute',
  keyGenerator: (request) => {
    // Prefer user ID from JWT for per-user limits; fall back to IP for unauthenticated requests
    try {
      const auth = request.headers.authorization
      if (auth?.startsWith('Bearer ')) {
        const payload = JSON.parse(Buffer.from(auth.split('.')[1], 'base64').toString())
        if (payload.sub) return payload.sub
      }
    } catch { /* fall through to IP */ }
    return request.headers['x-forwarded-for'] as string || request.ip
  },
})

// JWT
await server.register(jwt, {
  secret: process.env.JWT_SECRET || process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || 'dev-secret-change-in-production',
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

// Tenant identification for all routes except health, security, and CORS preflight
server.addHook('preHandler', async (request, reply) => {
  // Skip tenant check for health endpoints
  if (request.url.startsWith('/health')) {
    return
  }
  // Skip tenant check for internal security alerts (from web service)
  if (request.url.startsWith('/api/security/csp-alert')) {
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

// Security routes (CSP alerts, security dashboard)
await server.register(securityRoutes, { prefix: '/api/security' })

// Device management routes (Electron desktop)
await server.register(deviceRoutes, { prefix: '/api/devices' })

// Offline codes routes
await server.register(offlineCodesRoutes, { prefix: '/api/offline-codes' })

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
║  Queue:   ${process.env.REDIS_URL ? 'Connected' : 'Disabled (no REDIS_URL)'}                              ║
╚═══════════════════════════════════════════════════════════╝
    `)
  } catch (err) {
    server.log.error(err)
    process.exit(1)
  }
}

// Graceful shutdown
async function shutdown(signal: string) {
  console.log(`\n[API] Received ${signal}, shutting down...`)
  await closeQueues()
  await server.close()
  process.exit(0)
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

start()

export default server
