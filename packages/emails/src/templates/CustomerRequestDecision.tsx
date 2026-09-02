import {
  RequestDecisionEmail,
  type DecisionDetail,
  type RequestDecision,
} from './RequestDecisionEmail.js'

export type CustomerRequestType =
  | 'USER_ADDITION'
  | 'POC_CHANGE'
  | 'ACCOUNT_DELETION'
  | 'DATA_EXPORT'

export type PocAudience = 'REQUESTER' | 'PREVIOUS_POC' | 'NEW_POC'

interface CustomerRequestDecisionBase {
  recipientName: string
  companyName: string
  requestDate: string
  newUserName?: string
  newUserEmail?: string
  previousPocName?: string
  newPocName?: string
  wasPoc?: boolean
  portalUrl: string
}

type ApprovedDecision = { decision: 'APPROVED'; adminNote?: string }
type RejectedDecision = { decision: 'REJECTED'; rejectionReason: string }
type NonPocRequestType = Exclude<CustomerRequestType, 'POC_CHANGE'>

export type CustomerRequestDecisionProps =
  | (CustomerRequestDecisionBase & { requestType: NonPocRequestType; audience?: never } & (ApprovedDecision | RejectedDecision))
  | (CustomerRequestDecisionBase & { requestType: 'POC_CHANGE'; audience: PocAudience } & ApprovedDecision)
  | (CustomerRequestDecisionBase & { requestType: 'POC_CHANGE'; audience?: never } & RejectedDecision)

export interface CustomerRequestDecisionSubjectInput {
  requestType: CustomerRequestType
  decision: RequestDecision
  companyName: string
  audience?: PocAudience
}

export function getCustomerRequestDecisionSubject({
  requestType,
  decision,
  companyName,
  audience,
}: CustomerRequestDecisionSubjectInput): string {
  const suffix = companyName ? ` — ${companyName}` : ''
  switch (requestType) {
    case 'USER_ADDITION':
      return `User Addition Request ${decision === 'APPROVED' ? 'Approved' : 'Rejected'}${suffix}`
    case 'POC_CHANGE':
      if (decision === 'REJECTED') return `POC Change Request Rejected${suffix}`
      if (audience === 'PREVIOUS_POC') return `Primary Point of Contact Updated${suffix}`
      if (audience === 'NEW_POC') return `You Are Now the Primary Point of Contact${suffix}`
      return `POC Change Request Approved${suffix}`
    case 'ACCOUNT_DELETION':
      return `Account Deletion Request ${decision === 'APPROVED' ? 'Approved' : 'Rejected'}`
    case 'DATA_EXPORT':
      return `Data Export Request ${decision === 'APPROVED' ? 'Approved' : 'Rejected'}${suffix}`
  }
}

export function CustomerRequestDecision(props: CustomerRequestDecisionProps) {
  const approved = props.decision === 'APPROVED'
  const baseUrl = props.portalUrl.replace(/\/$/, '')
  const rejectionReason = props.decision === 'REJECTED'
    ? required(props.rejectionReason, 'rejection reason')
    : ''
  let preview: string
  let heading: string
  let summary: string
  let details: DecisionDetail[]
  let cta: { label: string; href: string } | undefined

  switch (props.requestType) {
    case 'USER_ADDITION': {
      const newUserName = required(props.newUserName, 'new user name')
      const newUserEmail = required(props.newUserEmail, 'new user email')
      preview = approved
        ? `${newUserName} was approved and has been invited to activate their account.`
        : `The request to add ${newUserName} was not approved.`
      heading = approved ? 'User Addition Approved' : 'User Addition Request Rejected'
      summary = approved
        ? 'The request was approved and the new user was created. A separate activation email was sent to the new user.'
        : 'The request was rejected. No user account was created and no activation email was sent.'
      details = [
        { label: 'Company', value: props.companyName },
        { label: 'Proposed User', value: newUserName },
        { label: 'Email', value: newUserEmail },
        ...(!approved ? [{ label: 'Rejection Reason', value: rejectionReason }] : []),
      ]
      cta = { label: 'Manage Team', href: `${baseUrl}/customer/settings` }
      break
    }
    case 'POC_CHANGE': {
      const previousPocName = required(props.previousPocName, 'previous POC name')
      const newPocName = required(props.newPocName, 'new POC name')
      if (!approved) {
        preview = 'The requested Primary Point of Contact change was not approved.'
        heading = 'POC Change Request Rejected'
        summary = 'The request was rejected and the current Primary Point of Contact remains unchanged.'
        details = [
          { label: 'Company', value: props.companyName },
          { label: 'Current POC', value: previousPocName },
          { label: 'Proposed New POC', value: newPocName },
          { label: 'Rejection Reason', value: rejectionReason },
        ]
        cta = { label: 'View Team Settings', href: `${baseUrl}/customer/settings` }
        break
      }
      switch (props.audience) {
        case 'REQUESTER':
          preview = `${newPocName} is now the Primary Point of Contact.`
          heading = 'POC Change Approved'
          summary = 'The request was approved and the new Primary Point of Contact assignment is active.'
          cta = { label: 'View Team Settings', href: `${baseUrl}/customer/settings` }
          break
        case 'PREVIOUS_POC':
          preview = `${newPocName} is now the Primary Point of Contact.`
          heading = 'Your POC Role Has Changed'
          summary = `You are no longer the Primary Point of Contact. Your ordinary account access remains unchanged unless separately modified. ${newPocName} is now the Primary Point of Contact.`
          cta = { label: 'View Team Settings', href: `${baseUrl}/customer/settings` }
          break
        case 'NEW_POC':
          preview = 'Your Primary Point of Contact assignment is now active.'
          heading = 'You Are Now the Primary Point of Contact'
          summary = 'Your new role is active. You can now manage Primary Point of Contact-related account responsibilities.'
          cta = { label: 'Open Customer Portal', href: `${baseUrl}/customer/settings` }
          break
        default:
          throw new Error('Approved POC change requires a valid audience')
      }
      details = [
        { label: 'Company', value: props.companyName },
        { label: 'Previous POC', value: previousPocName },
        { label: 'New POC', value: newPocName },
      ]
      break
    }
    case 'ACCOUNT_DELETION':
      preview = approved
        ? 'Your HTA Calibration Portal account has been deactivated.'
        : 'Your account deletion request was not approved.'
      heading = approved ? 'Account Deletion Completed' : 'Account Deletion Request Rejected'
      summary = approved
        ? `Your account was deactivated and your personal account information was anonymized. You can no longer sign in. Calibration records are retained according to regulatory and company retention requirements.${props.wasPoc ? ' The company POC position is now vacant and must be reassigned by an authorized company user or HTA administrator.' : ''}`
        : 'The request was rejected. Your account remains active and unchanged.'
      details = approved
        ? []
        : [
            { label: 'Company', value: props.companyName },
            { label: 'Rejection Reason', value: rejectionReason },
          ]
      cta = approved ? undefined : { label: 'Open Account Settings', href: `${baseUrl}/customer/settings` }
      break
    case 'DATA_EXPORT':
      preview = approved
        ? 'Your data export request has been approved for preparation.'
        : 'Your data export request was not approved.'
      heading = approved ? 'Data Export Request Approved' : 'Data Export Request Rejected'
      summary = approved
        ? 'Your request has been approved for preparation. The export will be prepared and delivered separately through an approved secure method.'
        : 'The request was rejected. No data export will be prepared for this request.'
      details = [
        { label: 'Company', value: props.companyName },
        { label: 'Request Date', value: props.requestDate },
        ...(approved
          ? optionalDetails(['Administrator Note', props.adminNote])
          : [{ label: 'Rejection Reason', value: rejectionReason }]),
      ]
      cta = { label: 'View Requests', href: `${baseUrl}/customer/settings` }
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
  if (!value?.trim()) throw new Error(`Customer request decision requires ${label}`)
  return value.trim()
}

function optionalDetails(...entries: Array<readonly [string, string | undefined]>): DecisionDetail[] {
  return entries.flatMap(([label, value]) => value?.trim() ? [{ label, value: value.trim() }] : [])
}

export default CustomerRequestDecision
