/**
 * HTA Worker Service
 *
 * Background job processor using BullMQ and Redis.
 * Handles email sending, notifications, and cleanup tasks.
 */

import { Worker, Queue } from 'bullmq'
import {
  processEmailJob,
  processNotificationJob,
  processCleanupJob,
  runScheduledCleanup,
} from './jobs/index.js'
import type { EmailJobData, NotificationJobData, CleanupJobData } from './types.js'

// =============================================================================
// CONFIGURATION
// =============================================================================

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'
const CLEANUP_INTERVAL_MS = parseInt(process.env.CLEANUP_INTERVAL_MS || '3600000', 10) // 1 hour
const DATABASE_URL = process.env.DATABASE_URL || '(not set)'

// Debug: Log database URL (masked)
console.log('[Worker] DATABASE_URL:', DATABASE_URL.replace(/:[^:@]+@/, ':***@'))

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  // Dynamic import for ioredis
  const ioredis = await import('ioredis')
  const Redis = ioredis.Redis

  // Redis connection for BullMQ
  // TLS config needed for Google Cloud Memorystore with transit encryption
  const isTls = REDIS_URL.startsWith('rediss://')
  const connection = new Redis(REDIS_URL, {
    maxRetriesPerRequest: null,
    ...(isTls && {
      tls: {
        rejectUnauthorized: false, // Memorystore uses Google-managed certs
      },
    }),
  })

  console.log(`
╔═══════════════════════════════════════════════════════════╗
║           HTA Platform Worker Service                     ║
╠═══════════════════════════════════════════════════════════╣
║  Status:  Starting...                                     ║
║  Redis:   ${REDIS_URL.substring(0, 40).padEnd(40)}     ║
╚═══════════════════════════════════════════════════════════╝
`)

  // ===========================================================================
  // QUEUES (for adding jobs programmatically)
  // ===========================================================================

  const emailQueue = new Queue<EmailJobData>('email', { connection })
  const notificationQueue = new Queue<NotificationJobData>('notifications', { connection })
  const cleanupQueue = new Queue<CleanupJobData>('cleanup', { connection })

  // ===========================================================================
  // WORKERS
  // ===========================================================================

  // Email Worker
  const emailWorker = new Worker<EmailJobData>(
    'email',
    processEmailJob,
    {
      connection,
      concurrency: 5,
      limiter: {
        max: 10,
        duration: 1000, // Max 10 emails per second
      },
    }
  )

  emailWorker.on('completed', (job) => {
    console.log(`[Email] Job ${job.id} completed`)
  })

  emailWorker.on('failed', (job, err) => {
    console.error(`[Email] Job ${job?.id} failed:`, err.message)
  })

  // Notification Worker
  const notificationWorker = new Worker<NotificationJobData>(
    'notifications',
    processNotificationJob,
    {
      connection,
      concurrency: 10,
    }
  )

  notificationWorker.on('completed', (job) => {
    console.log(`[Notification] Job ${job.id} completed`)
  })

  notificationWorker.on('failed', (job, err) => {
    console.error(`[Notification] Job ${job?.id} failed:`, err.message)
  })

  // Cleanup Worker
  const cleanupWorker = new Worker<CleanupJobData>(
    'cleanup',
    processCleanupJob,
    {
      connection,
      concurrency: 1, // Run cleanup jobs sequentially
    }
  )

  cleanupWorker.on('completed', (job) => {
    console.log(`[Cleanup] Job ${job.id} completed`)
  })

  cleanupWorker.on('failed', (job, err) => {
    console.error(`[Cleanup] Job ${job?.id} failed:`, err.message)
  })

  // ===========================================================================
  // SCHEDULED TASKS
  // ===========================================================================

  let cleanupIntervalId: NodeJS.Timeout | null = null

  function startScheduledTasks(): void {
    // Run cleanup immediately on startup
    runScheduledCleanup().catch(console.error)

    // Then run periodically
    cleanupIntervalId = setInterval(() => {
      runScheduledCleanup().catch(console.error)
    }, CLEANUP_INTERVAL_MS)

    console.log(`[Scheduler] Cleanup task scheduled every ${CLEANUP_INTERVAL_MS / 1000 / 60} minutes`)
  }

  // ===========================================================================
  // GRACEFUL SHUTDOWN
  // ===========================================================================

  async function shutdown(signal: string): Promise<void> {
    console.log(`\n[Worker] Received ${signal}, shutting down gracefully...`)

    // Stop scheduled tasks
    if (cleanupIntervalId) {
      clearInterval(cleanupIntervalId)
    }

    // Close workers (wait for current jobs to complete)
    await Promise.all([
      emailWorker.close(),
      notificationWorker.close(),
      cleanupWorker.close(),
    ])

    // Close queues
    await Promise.all([
      emailQueue.close(),
      notificationQueue.close(),
      cleanupQueue.close(),
    ])

    // Close Redis connection
    await connection.quit()

    console.log('[Worker] Shutdown complete')
    process.exit(0)
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))

  // ===========================================================================
  // START
  // ===========================================================================

  startScheduledTasks()

  console.log(`
╔═══════════════════════════════════════════════════════════╗
║  Workers:                                                 ║
║    - email       (concurrency: 5, rate: 10/s)             ║
║    - notifications (concurrency: 10)                      ║
║    - cleanup     (concurrency: 1)                         ║
║                                                           ║
║  Status:  Running. Waiting for jobs...                    ║
╚═══════════════════════════════════════════════════════════╝
`)
}

// Start the worker
main().catch((err) => {
  console.error('[Worker] Failed to start:', err)
  process.exit(1)
})
