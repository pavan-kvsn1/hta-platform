export type CertificateTatStatus =
  | 'DRAFT'
  | 'PENDING_REVIEW'
  | 'REVISION_REQUIRED'
  | 'PENDING_CUSTOMER_APPROVAL'
  | 'CUSTOMER_REVISION_REQUIRED'
  | 'APPROVED'
  | 'PENDING_ADMIN_AUTHORIZATION'
  | 'AUTHORIZED'
  | 'REJECTED'
  | 'CUSTOMER_REVIEW_EXPIRED'
  | string

export interface CertificateTatEvent {
  eventType: string
  createdAt: string | Date
}

export interface CertificateTatPhase {
  startedAt: string | null
  owner: 'engineer' | 'reviewer' | 'customer' | 'admin' | null
  label: string | null
  targetHours: number
}

export interface CertificateTatTotal {
  startedAt: string
  endedAt: string | null
  targetHours: number
}

export interface CertificateTatState {
  phase: CertificateTatPhase
  certificate: CertificateTatTotal
}

interface ResolveCertificateTatInput {
  status: CertificateTatStatus
  events?: CertificateTatEvent[] | null
  createdAt: string | Date
  authorizedAt?: string | Date | null
}

function toIso(value: string | Date | null | undefined): string | null {
  if (!value) return null
  return value instanceof Date ? value.toISOString() : value
}

function latestEvent(events: CertificateTatEvent[], eventTypes: string[]): CertificateTatEvent | null {
  return events
    .filter((event) => eventTypes.includes(event.eventType))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0] || null
}

export function resolveCertificateTat({
  status,
  events = [],
  createdAt,
  authorizedAt = null,
}: ResolveCertificateTatInput): CertificateTatState {
  const eventList = events || []
  const createdEvent = latestEvent(eventList, ['CERTIFICATE_CREATED'])
  const certificateStartedAt = toIso(createdEvent?.createdAt) || toIso(createdAt)!
  const adminAuthorizedEvent = latestEvent(eventList, ['ADMIN_AUTHORIZED'])
  const certificateEndedAt = status === 'AUTHORIZED'
    ? toIso(authorizedAt) || toIso(adminAuthorizedEvent?.createdAt)
    : null

  const phase: CertificateTatPhase = {
    startedAt: null,
    owner: null,
    label: null,
    targetHours: 12,
  }

  switch (status) {
    case 'DRAFT':
      phase.startedAt = certificateStartedAt
      phase.owner = 'engineer'
      phase.label = 'Engineer drafting'
      break
    case 'PENDING_REVIEW':
      phase.startedAt = toIso(latestEvent(eventList, ['SUBMITTED_FOR_REVIEW', 'RESUBMITTED_FOR_REVIEW'])?.createdAt)
      phase.owner = 'reviewer'
      phase.label = 'Awaiting reviewer'
      break
    case 'REVISION_REQUIRED':
      phase.startedAt = toIso(latestEvent(eventList, ['REVISION_REQUESTED', 'CUSTOMER_REVISION_FORWARDED'])?.createdAt)
      phase.owner = 'engineer'
      phase.label = 'Engineer revising'
      break
    case 'PENDING_CUSTOMER_APPROVAL':
      phase.startedAt = toIso(latestEvent(eventList, ['REVIEWER_APPROVED_SENT_TO_CUSTOMER', 'SENT_TO_CUSTOMER', 'RESENT_TO_CUSTOMER'])?.createdAt)
      phase.owner = 'customer'
      phase.label = 'Awaiting customer'
      break
    case 'CUSTOMER_REVISION_REQUIRED':
      phase.startedAt = toIso(latestEvent(eventList, ['CUSTOMER_REVISION_REQUESTED'])?.createdAt)
      phase.owner = 'reviewer'
      phase.label = 'Customer revision requested'
      break
    case 'PENDING_ADMIN_AUTHORIZATION':
      phase.startedAt = toIso(latestEvent(eventList, ['SUBMITTED_FOR_AUTHORIZATION', 'CUSTOMER_APPROVED'])?.createdAt)
      phase.owner = 'admin'
      phase.label = 'Awaiting authorization'
      break
    case 'CUSTOMER_REVIEW_EXPIRED':
      phase.startedAt = toIso(latestEvent(eventList, ['CUSTOMER_REVIEW_EXPIRED'])?.createdAt)
      phase.owner = 'reviewer'
      phase.label = 'Customer review expired'
      break
  }

  return {
    phase,
    certificate: {
      startedAt: certificateStartedAt,
      endedAt: certificateEndedAt,
      targetHours: 48,
    },
  }
}
