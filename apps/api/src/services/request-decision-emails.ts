import {
  queueCustomerRequestDecisionEmail,
  queueInternalRequestDecisionEmail,
  type QueueCustomerRequestDecisionEmailOptions,
  type QueueInternalRequestDecisionEmailOptions,
} from './queue.js'
import type { PocAudience } from '@hta/emails'

const EMAIL_WARNING = 'The request was processed, but one or more notification emails could not be queued.'

export interface DecisionEmailLogger {
  error(bindings: Record<string, unknown>, message: string): void
}

export interface DecisionRecipient {
  email: string
  recipientName: string
  audience: PocAudience
  priority: 1 | 2 | 3
}

export interface DecisionEmailResult {
  emailWarning?: string
}

export type SendInternalDecisionEmailOptions = QueueInternalRequestDecisionEmailOptions & {
  requestId: string
  logger?: DecisionEmailLogger
}

export interface SendCustomerDecisionEmailsOptions {
  requestId: string
  jobs: QueueCustomerRequestDecisionEmailOptions[]
  logger?: DecisionEmailLogger
}

export function dedupeDecisionRecipients(recipients: DecisionRecipient[]): DecisionRecipient[] {
  const byEmail = new Map<string, DecisionRecipient>()
  for (const candidate of recipients) {
    const key = candidate.email.trim().toLowerCase()
    const current = byEmail.get(key)
    if (key && (!current || candidate.priority > current.priority)) {
      byEmail.set(key, candidate)
    }
  }
  return [...byEmail.values()]
}

export async function sendInternalDecisionEmail(
  options: SendInternalDecisionEmailOptions,
): Promise<DecisionEmailResult> {
  const { requestId, logger, ...job } = options
  try {
    await queueInternalRequestDecisionEmail(job as QueueInternalRequestDecisionEmailOptions)
    return {}
  } catch (error) {
    logQueueFailure(logger, {
      error,
      requestId,
      requestType: job.requestType,
      decision: job.decision,
      recipient: job.to,
    })
    return { emailWarning: EMAIL_WARNING }
  }
}

export async function sendCustomerDecisionEmails(
  options: SendCustomerDecisionEmailsOptions,
): Promise<DecisionEmailResult> {
  const selectedJobs = dedupeCustomerJobs(options.jobs)
  const results = await Promise.allSettled(
    selectedJobs.map(job => queueCustomerRequestDecisionEmail(job)),
  )

  let failed = false
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') return
    failed = true
    const job = selectedJobs.at(index)!
    logQueueFailure(options.logger, {
      error: result.reason,
      requestId: options.requestId,
      requestType: job.requestType,
      decision: job.decision,
      recipient: job.to,
    })
  })

  return failed ? { emailWarning: EMAIL_WARNING } : {}
}

function dedupeCustomerJobs(
  jobs: QueueCustomerRequestDecisionEmailOptions[],
): QueueCustomerRequestDecisionEmailOptions[] {
  const byEmail = new Map<string, QueueCustomerRequestDecisionEmailOptions>()
  for (const job of jobs) {
    const key = job.to.trim().toLowerCase()
    const current = byEmail.get(key)
    if (key && (!current || audiencePriority(job.audience) > audiencePriority(current.audience))) {
      byEmail.set(key, job)
    }
  }
  return [...byEmail.values()]
}

function audiencePriority(audience: PocAudience | undefined): 1 | 2 | 3 {
  if (audience === 'NEW_POC') return 3
  if (audience === 'PREVIOUS_POC') return 2
  return 1
}

function logQueueFailure(
  logger: DecisionEmailLogger | undefined,
  bindings: Record<string, unknown>,
): void {
  if (logger) {
    logger.error(bindings, 'Failed to queue request decision email')
    return
  }
  console.error('Failed to queue request decision email', bindings)
}
