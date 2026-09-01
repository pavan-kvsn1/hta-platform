export type EmailDeliveryStatusValue =
  | 'QUEUED'
  | 'SENT'
  | 'DELIVERED'
  | 'DELAYED'
  | 'BOUNCED'
  | 'FAILED'
  | 'SUPPRESSED'
  | 'COMPLAINED'

export type CertificateEmailType =
  | 'CERTIFICATE_SUBMITTED'
  | 'CERTIFICATE_REVIEWED'
  | 'CUSTOMER_REVIEW'
  | 'CUSTOMER_REVIEW_REGISTERED'
  | 'CUSTOMER_AUTHORIZED_REGISTERED'
  | 'CUSTOMER_AUTHORIZED_TOKEN'
  | 'CUSTOMER_APPROVAL'
  | 'CUSTOMER_REVIEW_EXPIRED'

export type ResendDeliveryEventType =
  | 'email.sent'
  | 'email.delivered'
  | 'email.delivery_delayed'
  | 'email.bounced'
  | 'email.failed'
  | 'email.suppressed'
  | 'email.complained'

export interface TrackedEmailJobFields {
  deliveryId: string
  certificateId: string
  idempotencyKey: string
}

export interface EmailDeliveryEventSummary {
  id: string
  eventType: ResendDeliveryEventType
  occurredAt: string
  details: Record<string, unknown> | null
}

export interface EmailDeliverySummary {
  id: string
  emailType: CertificateEmailType
  recipientEmail: string
  recipientName: string | null
  status: EmailDeliveryStatusValue
  queuedAt: string
  sentAt: string | null
  deliveredAt: string | null
  lastEventAt: string | null
  failureReason: string | null
  events: EmailDeliveryEventSummary[]
}
