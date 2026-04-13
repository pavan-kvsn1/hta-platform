import { Worker } from 'bullmq'
import IORedis from 'ioredis'

const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
})

console.log('Worker starting...')

// Email worker
const emailWorker = new Worker(
  'email',
  async (job) => {
    console.log(`Processing email job ${job.id}:`, job.name)
    // Email processing logic will go here
    // await sendEmail(job.data)
  },
  { connection }
)

// Notification worker
const notificationWorker = new Worker(
  'notifications',
  async (job) => {
    console.log(`Processing notification job ${job.id}:`, job.name)
    // Notification processing logic will go here
  },
  { connection }
)

// Cleanup worker
const cleanupWorker = new Worker(
  'cleanup',
  async (job) => {
    console.log(`Processing cleanup job ${job.id}:`, job.name)
    // Cleanup processing logic will go here
  },
  { connection }
)

// Graceful shutdown
const shutdown = async () => {
  console.log('Shutting down workers...')
  await emailWorker.close()
  await notificationWorker.close()
  await cleanupWorker.close()
  await connection.quit()
  process.exit(0)
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

console.log('Worker running. Waiting for jobs...')
