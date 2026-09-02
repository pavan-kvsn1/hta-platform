import type { CertificateEmailType, EmailDeliverySummary } from '@hta/shared'
import { apiFetch } from '@/lib/api-client'

export type { CertificateEmailType, EmailDeliverySummary }

export async function getCertificateEmailDeliveries(
  certificateId: string,
): Promise<EmailDeliverySummary[]> {
  const response = await apiFetch(`/api/certificates/${certificateId}/email-deliveries`)
  if (!response.ok) throw new Error('Unable to load email delivery status')
  const body = await response.json() as { deliveries: EmailDeliverySummary[] }
  return body.deliveries
}
