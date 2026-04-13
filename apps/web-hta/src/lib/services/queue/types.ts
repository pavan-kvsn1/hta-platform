/**
 * Queue Service Types
 *
 * Defines the interface for background job processing.
 * Implementations: DatabaseQueueProvider (local), CloudTasksProvider (GCP)
 */

// Job types supported by the queue
export type JobType =
  | 'chat:message:deliver'
  | 'chat:message:notify'
  | 'notification:send'
  | 'notification:batch'
  | 'email:send'
  | 'email:batch'
  | 'realtime:publish'

// Job payloads for each job type
export interface JobPayloads {
  'chat:message:deliver': {
    threadId: string
    messageId: string
    recipientIds: string[]
    recipientType: 'USER' | 'CUSTOMER'
  }
  'chat:message:notify': {
    threadId: string
    messageId: string
    senderId: string
    senderName: string
    senderType: 'ASSIGNEE' | 'REVIEWER' | 'CUSTOMER' | 'ADMIN'
    recipientId: string
    certificateId: string
    certificateNumber: string
  }
  'notification:send': {
    userId?: string
    customerId?: string
    type: string
    title: string
    message: string
    certificateId?: string
    data?: Record<string, string>
  }
  'notification:batch': {
    notifications: Array<{
      userId?: string
      customerId?: string
      type: string
      title: string
      message: string
      certificateId?: string
      data?: Record<string, string>
    }>
  }
  'email:send': {
    to: string | string[]
    subject?: string  // Optional when template is provided (subject comes from template)
    template?: string
    templateData?: Record<string, unknown>
    text?: string
    html?: string
  }
  'email:batch': {
    emails: Array<{
      to: string
      subject: string
      template?: string
      templateData?: Record<string, unknown>
    }>
  }
  'realtime:publish': {
    channel: string
    event: {
      type: string
      data: Record<string, unknown>
    }
    recipientIds?: string[]
  }
}

// Job status
export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled'

// Job options
export interface JobOptions {
  delay?: number       // Delay in milliseconds before processing
  priority?: number    // Higher number = higher priority (default: 0)
  retries?: number     // Max retry attempts (default: 3)
  timeout?: number     // Job timeout in milliseconds (default: 30000)
}

// Job record (as stored in database/queue)
export interface Job<T extends JobType = JobType> {
  id: string
  type: T
  payload: JobPayloads[T]
  status: JobStatus
  priority: number
  attempts: number
  maxRetries: number
  error?: string
  scheduledFor: Date
  createdAt: Date
  processedAt?: Date
}

// Queue service interface
export interface QueueService {
  /**
   * Add a job to the queue
   * @returns Job ID
   */
  enqueue<T extends JobType>(
    type: T,
    payload: JobPayloads[T],
    options?: JobOptions
  ): Promise<string>

  /**
   * Add multiple jobs to the queue
   * @returns Array of Job IDs
   */
  enqueueBatch<T extends JobType>(
    jobs: Array<{ type: T; payload: JobPayloads[T]; options?: JobOptions }>
  ): Promise<string[]>

  /**
   * Get a job by ID
   */
  getJob(jobId: string): Promise<Job | null>

  /**
   * Cancel a pending job
   * @returns true if cancelled, false if not found or already processed
   */
  cancelJob(jobId: string): Promise<boolean>

  /**
   * Get jobs by status
   */
  getJobsByStatus(status: JobStatus, limit?: number): Promise<Job[]>

  /**
   * Get job counts by status
   */
  getJobCounts(): Promise<Record<JobStatus, number>>
}

// Worker function type
export type JobWorker<T extends JobType> = (
  job: Job<T>
) => Promise<void>

// Worker registry
export type WorkerRegistry = {
  [K in JobType]?: JobWorker<K>
}
