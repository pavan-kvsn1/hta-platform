import {
  RequestDecisionEmail,
  type DecisionDetail,
  type RequestDecision,
} from './RequestDecisionEmail.js'

export type InternalRequestType =
  | 'SECTION_UNLOCK'
  | 'FIELD_CHANGE'
  | 'OFFLINE_CODE_REQUEST'
  | 'DESKTOP_VPN_REQUEST'

interface InternalRequestDecisionBase {
  recipientName: string
  requestType: InternalRequestType
  requestDate: string
  certificateId?: string
  certificateNumber?: string
  requestedItems?: readonly string[]
  originalReason?: string
  portalUrl: string
}

type InternalDecision =
  | { decision: 'APPROVED'; adminNote?: string }
  | { decision: 'REJECTED'; adminNote: string }

export type InternalRequestDecisionProps = InternalRequestDecisionBase & InternalDecision

export interface InternalRequestDecisionSubjectInput {
  requestType: InternalRequestType
  decision: RequestDecision
  certificateNumber?: string
}

export function getInternalRequestDecisionSubject({
  requestType,
  decision,
  certificateNumber,
}: InternalRequestDecisionSubjectInput): string {
  const suffix = certificateNumber ? ` — ${certificateNumber}` : ''
  switch (requestType) {
    case 'SECTION_UNLOCK':
      return `Section Unlock Request ${decision === 'APPROVED' ? 'Approved' : 'Rejected'}${suffix}`
    case 'FIELD_CHANGE':
      return `Field Change Request ${decision === 'APPROVED' ? 'Approved' : 'Rejected'}${suffix}`
    case 'OFFLINE_CODE_REQUEST':
      return `Offline Code Card Request ${decision === 'APPROVED' ? 'Approved' : 'Rejected'}`
    case 'DESKTOP_VPN_REQUEST':
      return `Desktop VPN Access Request ${decision === 'APPROVED' ? 'Approved' : 'Rejected'}`
  }
}

export function InternalRequestDecision(props: InternalRequestDecisionProps) {
  const approved = props.decision === 'APPROVED'
  const baseUrl = props.portalUrl.replace(/\/$/, '')
  const rejectionReason = props.decision === 'REJECTED'
    ? required(props.adminNote, 'rejection reason')
    : ''
  let preview: string
  let heading: string
  let summary: string
  let details: DecisionDetail[]
  let cta: { label: string; href: string }

  switch (props.requestType) {
    case 'SECTION_UNLOCK': {
      const certificateId = required(props.certificateId, 'certificate ID')
      const certificateNumber = required(props.certificateNumber, 'certificate number')
      const items = requiredItems(props.requestedItems, 'requested sections')
      preview = approved
        ? 'Selected sections are now available for editing.'
        : 'Your section unlock request was not approved.'
      heading = approved ? 'Section Unlock Approved' : 'Section Unlock Rejected'
      summary = approved
        ? 'An HTA administrator approved your request. The selected certificate sections are now editable.'
        : 'The certificate remains unchanged. Review the rejection reason before submitting another request.'
      details = [
        { label: 'Certificate Number', value: certificateNumber },
        { label: approved ? 'Selected Sections' : 'Requested Sections', value: items.join(', ') },
        ...(approved
          ? optionalDetails(['Original Request Reason', props.originalReason], ['Administrator Note', props.adminNote])
          : [{ label: 'Rejection Reason', value: rejectionReason }]),
      ]
      cta = {
        label: approved ? 'Edit Certificate' : 'View Certificate',
        href: `${baseUrl}/dashboard/certificates/${certificateId}/${approved ? 'edit' : 'view'}`,
      }
      break
    }
    case 'FIELD_CHANGE': {
      const certificateId = required(props.certificateId, 'certificate ID')
      const certificateNumber = required(props.certificateNumber, 'certificate number')
      const items = requiredItems(props.requestedItems, 'requested fields')
      preview = approved
        ? 'The requested certificate field changes were approved and applied.'
        : 'Your requested certificate field changes were not approved.'
      heading = approved ? 'Field Change Request Approved' : 'Field Change Request Rejected'
      summary = approved
        ? 'The requested certificate field changes were approved and applied. Please verify the updated certificate.'
        : 'The request was rejected and the affected certificate fields remain unchanged.'
      details = [
        { label: 'Certificate Number', value: certificateNumber },
        { label: 'Requested Fields', value: items.join(', ') },
        ...(approved
          ? optionalDetails(['Original Description', props.originalReason], ['Administrator Note', props.adminNote])
          : [{ label: 'Rejection Reason', value: rejectionReason }]),
      ]
      cta = { label: 'Review Certificate', href: `${baseUrl}/dashboard/reviewer/${certificateId}` }
      break
    }
    case 'OFFLINE_CODE_REQUEST':
      preview = approved
        ? 'Your new offline code card is ready in the portal.'
        : 'Your offline code card request was not approved.'
      heading = approved ? 'Offline Code Card Approved' : 'Offline Code Card Request Rejected'
      summary = approved
        ? 'Your request was approved. A new offline code card has been generated and is available securely in the portal.'
        : 'Your request was rejected. You may submit another request after addressing the rejection reason.'
      details = [
        { label: 'Request Date', value: props.requestDate },
        ...(approved
          ? optionalDetails(['Administrator Note', props.adminNote])
          : optionalDetails(['Original Request Reason', props.originalReason], ['Rejection Reason', rejectionReason])),
      ]
      cta = {
        label: approved ? 'View Offline Codes' : 'View Offline Code Requests',
        href: `${baseUrl}/dashboard/offline-codes`,
      }
      break
    case 'DESKTOP_VPN_REQUEST':
      preview = approved
        ? 'Your VPN provisioning access is ready in the portal.'
        : 'Your desktop VPN access request was not approved.'
      heading = approved ? 'Desktop VPN Access Approved' : 'Desktop VPN Access Request Rejected'
      summary = approved
        ? 'Your request was approved. Provisioning access is available securely on the Offline Codes page; complete setup from the desktop application.'
        : 'Your request was rejected. You may submit another request after addressing the rejection reason.'
      details = [
        { label: 'Request Date', value: props.requestDate },
        ...(approved
          ? optionalDetails(['Administrator Note', props.adminNote])
          : optionalDetails(['Original Request Reason', props.originalReason], ['Rejection Reason', rejectionReason])),
      ]
      cta = {
        label: approved ? 'View VPN Setup Details' : 'View VPN Access Request',
        href: `${baseUrl}/dashboard/offline-codes`,
      }
      break
  }

  return (
    <RequestDecisionEmail
      preview={preview}
      heading={heading}
      decision={props.decision}
      recipientName={props.recipientName}
      summary={summary}
      details={details}
      cta={cta}
    />
  )
}

function required(value: string | undefined, label: string): string {
  if (!value?.trim()) throw new Error(`Internal request decision requires ${label}`)
  return value.trim()
}

function requiredItems(value: readonly string[] | undefined, label: string): readonly string[] {
  if (!value?.length) throw new Error(`Internal request decision requires ${label}`)
  return value
}

function optionalDetails(...entries: Array<readonly [string, string | undefined]>): DecisionDetail[] {
  return entries.flatMap(([label, value]) => value?.trim() ? [{ label, value: value.trim() }] : [])
}

export default InternalRequestDecision
