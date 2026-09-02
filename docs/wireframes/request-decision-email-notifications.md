# Request Decision Email Notifications

Status: Approved on 2026-08-31
Scope: Approval and rejection emails for four internal request types and four customer request types

## 1. Purpose

Send a clear email after an administrator approves or rejects a request, while preserving the existing in-app notifications. The email must tell the recipient what changed, what they need to do next, and where to continue safely.

This specification covers all eight request types together. It does not cover chat-message emails or request-submission emails to administrators.

## 2. Shared Email Design

All decision emails use the same email-safe layout:

```text
┌────────────────────────────────────────────────────────────┐
│  [HTA logo]  HTA Instrumentation Pvt. Ltd.                 │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  [APPROVED or REJECTED status badge]                       │
│                                                            │
│  Request-specific heading                                  │
│                                                            │
│  Hello {recipient name},                                   │
│                                                            │
│  Decision summary                                          │
│                                                            │
│  ┌──────────────── Request details ──────────────────────┐  │
│  │ Type, certificate/company, requested items, reason   │  │
│  │ and optional administrator note                      │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                            │
│                    [Contextual CTA]                        │
│                                                            │
├────────────────────────────────────────────────────────────┤
│ Calibration & Testing Services · Portal · Support          │
└────────────────────────────────────────────────────────────┘
```

### Branding

- Header: a square HTA logo at approximately 32 × 32 px followed by “HTA Instrumentation Pvt. Ltd.”
- The logo and title are vertically aligned and centered as one row.
- Approval badge: green.
- Rejection badge: red.
- Footer company name: “HTA Instrumentation Pvt. Ltd.”
- Existing blue divider and portal styling remain.

### Shared content rules

- Approval subject format: `{Request name} Approved{context suffix}`.
- Rejection subject format: `{Request name} Rejected{context suffix}`.
- Every rejection email includes the recorded reason.
- Optional administrator notes appear in the details panel.
- User-generated text is escaped before rendering.
- The acting administrator's personal name is not required; emails say “an HTA administrator.”
- Emails are sent only after the requested operation and database update succeed.
- Reprocessing an already-decided request must not send another email.
- Duplicate recipient addresses are collapsed case-insensitively.
- Existing in-app notifications remain unchanged.
- An email delivery failure is logged and retried through the delivery mechanism; it does not reverse an already-completed approval or rejection.

## 3. Recipient Summary

| Request type | Approved recipients | Rejected recipients |
|---|---|---|
| Section unlock | Requester | Requester |
| Field change | Requester | Requester |
| Offline code card | Requester | Requester |
| Desktop VPN access | Requester | Requester |
| User addition | Requester; invited user separately receives the existing activation email | Requester only |
| POC change | Requester, previous POC, new POC | Requester only |
| Account deletion | Requester at the original email address | Requester |
| Data export | Requester | Requester |

Administrators do not receive decision-result emails because they performed the decision. They continue to receive the existing in-app submission notifications.

## 4. Internal Request Emails

### 4.1 Section Unlock

#### Approved

- Recipient: certificate assignee who requested the unlock.
- Subject: `Section Unlock Request Approved — {certificateNumber}`
- Preview: `Selected sections are now available for editing.`
- Heading: `Section Unlock Approved`
- Body:
  - Confirm that the request was approved.
  - State that the selected sections are now editable.
- Details:
  - Certificate number.
  - Selected section names.
  - Original request reason.
  - Administrator note, when present.
- CTA: `Edit Certificate`
- Destination: `/dashboard/certificates/{certificateId}/edit`

#### Rejected

- Recipient: requester.
- Subject: `Section Unlock Request Rejected — {certificateNumber}`
- Preview: `Your section unlock request was not approved.`
- Heading: `Section Unlock Rejected`
- Body:
  - Confirm that the certificate remains unchanged.
  - Ask the requester to review the reason before submitting another request.
- Details:
  - Certificate number.
  - Requested sections.
  - Rejection reason.
- CTA: `View Certificate`
- Destination: `/dashboard/certificates/{certificateId}/view`

### 4.2 Field Change

#### Approved

- Recipient: reviewer who requested the field changes.
- Subject: `Field Change Request Approved — {certificateNumber}`
- Preview: `The requested certificate field changes were approved and applied.`
- Heading: `Field Change Request Approved`
- Body:
  - Confirm that the requested changes were approved and applied.
  - Ask the reviewer to verify the updated certificate.
- Details:
  - Certificate number.
  - Requested field names.
  - Original description.
  - Administrator note, when present.
- CTA: `Review Certificate`
- Destination: `/dashboard/reviewer/{certificateId}`

#### Rejected

- Recipient: requester.
- Subject: `Field Change Request Rejected — {certificateNumber}`
- Preview: `Your requested certificate field changes were not approved.`
- Heading: `Field Change Request Rejected`
- Body:
  - Confirm that the request was rejected.
  - State that the affected fields remain unchanged.
- Details:
  - Certificate number.
  - Requested fields.
  - Rejection reason.
- CTA: `Review Certificate`
- Destination: `/dashboard/reviewer/{certificateId}`

### 4.3 Offline Code Card

#### Approved

- Recipient: staff member who requested the card.
- Subject: `Offline Code Card Request Approved`
- Preview: `Your new offline code card is ready in the portal.`
- Heading: `Offline Code Card Approved`
- Body:
  - Confirm approval.
  - State that the new code card has been generated and is available securely in the portal.
- Details:
  - Request date.
  - Administrator note, when present.
- CTA: `View Offline Codes`
- Destination: `/dashboard/offline-codes`
- Security rule: never include offline codes, challenge responses, or a code-card attachment in the email.

#### Rejected

- Recipient: requester.
- Subject: `Offline Code Card Request Rejected`
- Preview: `Your offline code card request was not approved.`
- Heading: `Offline Code Card Request Rejected`
- Body:
  - Confirm rejection.
  - Explain that the requester may submit another request after addressing the reason.
- Details:
  - Request date.
  - Original request reason, when present.
  - Rejection reason.
- CTA: `View Offline Code Requests`
- Destination: `/dashboard/offline-codes`

### 4.4 Desktop VPN Access

#### Approved

- Recipient: staff member who requested VPN access.
- Subject: `Desktop VPN Access Request Approved`
- Preview: `Your VPN provisioning access is ready in the portal.`
- Heading: `Desktop VPN Access Approved`
- Body:
  - Confirm approval.
  - State that the provisioning token is available securely on the Offline Codes page.
  - Direct the requester to complete setup from their desktop application.
- Details:
  - Request date.
  - Administrator note, when present.
- CTA: `View VPN Setup Details`
- Destination: `/dashboard/offline-codes`
- Security rule: never include the VPN provisioning token, private keys, configuration files, or network details in the email.

#### Rejected

- Recipient: requester.
- Subject: `Desktop VPN Access Request Rejected`
- Preview: `Your desktop VPN access request was not approved.`
- Heading: `Desktop VPN Access Request Rejected`
- Body:
  - Confirm rejection.
  - Explain that another request may be submitted after addressing the reason.
- Details:
  - Request date.
  - Original request reason, when present.
  - Rejection reason.
- CTA: `View VPN Access Request`
- Destination: `/dashboard/offline-codes`

## 5. Customer Request Emails

### 5.1 User Addition

#### Approved — requester confirmation

- Recipient: customer user who submitted the request.
- Subject: `User Addition Request Approved — {companyName}`
- Preview: `{newUserName} was approved and has been invited to activate their account.`
- Heading: `User Addition Approved`
- Body:
  - Confirm approval.
  - State that the new user has been created.
  - State that a separate activation email was sent to the new user.
- Details:
  - Company name.
  - New user's name.
  - New user's email address.
- CTA: `Manage Team`
- Destination: `/customer/settings`

#### Approved — invited user activation

- Recipient: newly approved user.
- Template: the existing `customer-activation` email.
- Purpose: set a password and activate the account.
- This recipient does not also receive the requester confirmation email unless their address is the requester address.

#### Rejected

- Recipient: requester only.
- Subject: `User Addition Request Rejected — {companyName}`
- Preview: `The request to add {newUserName} was not approved.`
- Heading: `User Addition Request Rejected`
- Body:
  - Confirm rejection.
  - State that no user account was created and no activation email was sent.
- Details:
  - Company name.
  - Proposed user's name and email.
  - Rejection reason.
- CTA: `Manage Team`
- Destination: `/customer/settings`

### 5.2 Primary Point of Contact Change

#### Approved — requester

- Recipient: user who submitted the request.
- Subject: `POC Change Request Approved — {companyName}`
- Preview: `{newPocName} is now the Primary Point of Contact.`
- Heading: `POC Change Approved`
- Body:
  - Confirm approval.
  - State that the new POC assignment is active.
- Details:
  - Company name.
  - Previous POC.
  - New POC.
- CTA: `View Team Settings`
- Destination: `/customer/settings`

#### Approved — previous POC

- Recipient: previous POC.
- Subject: `Primary Point of Contact Updated — {companyName}`
- Preview: `{newPocName} is now the Primary Point of Contact.`
- Heading: `Your POC Role Has Changed`
- Body:
  - State that the recipient is no longer the Primary Point of Contact.
  - State that ordinary account access remains unchanged unless separately modified.
  - Identify the new POC.
- CTA: `View Team Settings`
- Destination: `/customer/settings`

#### Approved — new POC

- Recipient: new POC.
- Subject: `You Are Now the Primary Point of Contact — {companyName}`
- Preview: `Your Primary Point of Contact assignment is now active.`
- Heading: `You Are Now the Primary Point of Contact`
- Body:
  - Confirm the new role.
  - State that the recipient can now manage POC-related account responsibilities.
- CTA: `Open Customer Portal`
- Destination: `/customer/settings`

#### Recipient deduplication

If the requester is also the old or new POC, send one email using this priority:

1. New POC version.
2. Previous POC version.
3. Requester version.

#### Rejected

- Recipient: requester only.
- Subject: `POC Change Request Rejected — {companyName}`
- Preview: `The requested Primary Point of Contact change was not approved.`
- Heading: `POC Change Request Rejected`
- Body:
  - Confirm rejection.
  - State that the current POC remains unchanged.
- Details:
  - Company name.
  - Current POC.
  - Proposed new POC.
  - Rejection reason.
- CTA: `View Team Settings`
- Destination: `/customer/settings`

### 5.3 Account Deletion

#### Approved

- Recipient: requester, using the original email address captured before anonymization.
- Subject: `Account Deletion Request Approved`
- Preview: `Your HTA Calibration Portal account has been deactivated.`
- Heading: `Account Deletion Completed`
- Body:
  - Confirm that the account was deactivated and personal account information was anonymized.
  - State that the recipient can no longer sign in.
  - State that calibration records are retained according to regulatory and company retention requirements.
  - If the requester was the POC, state that the company POC position is now vacant and must be reassigned by an authorized company user or HTA administrator.
- CTA: none, because the account can no longer sign in.
- Support link: email support only.

#### Rejected

- Recipient: requester.
- Subject: `Account Deletion Request Rejected`
- Preview: `Your account deletion request was not approved.`
- Heading: `Account Deletion Request Rejected`
- Body:
  - Confirm rejection.
  - State that the account remains active and unchanged.
- Details:
  - Company name.
  - Rejection reason.
- CTA: `Open Account Settings`
- Destination: `/customer/settings`

### 5.4 Data Export

#### Approved

- Recipient: requester.
- Subject: `Data Export Request Approved — {companyName}`
- Preview: `Your data export request has been approved for preparation.`
- Heading: `Data Export Request Approved`
- Body:
  - Confirm approval.
  - State that the export will be prepared and delivered separately through an approved secure method.
  - Do not say that a file is ready or attached.
- Details:
  - Company name.
  - Request date.
  - Administrator note, when present.
- CTA: `View Requests`
- Destination: `/customer/settings`
- Current-system warning: the API currently marks the request approved but does not generate or deliver an export. The email must not claim completion until an export-delivery workflow exists.

#### Rejected

- Recipient: requester.
- Subject: `Data Export Request Rejected — {companyName}`
- Preview: `Your data export request was not approved.`
- Heading: `Data Export Request Rejected`
- Body:
  - Confirm rejection.
  - Explain that no data export will be prepared for this request.
- Details:
  - Company name.
  - Request date.
  - Rejection reason.
- CTA: `View Requests`
- Destination: `/customer/settings`

## 6. Recommended Template Architecture

Do not create sixteen mostly duplicated React components. Use:

1. A shared `RequestDecisionEmail` presentation component for layout, status badge, details, CTA, and footer.
2. An `InternalRequestDecisionEmail` adapter that supports the four internal request types.
3. A `CustomerRequestDecisionEmail` adapter that supports the four customer request types and POC audience variants.
4. Existing `CustomerActivation` remains separate because it performs account activation rather than communicating a decision.

Suggested registered template identifiers:

- `internal-request-decision`
- `customer-request-decision`
- `customer-activation` (already implemented)

Each decision template receives a typed request type and `APPROVED` or `REJECTED` outcome. Unsupported combinations fail before delivery rather than falling back to incorrect generic wording.

## 7. Delivery and Failure Handling

- Resolve recipients from persisted request records, not client-provided email addresses.
- Capture the original account email before account-deletion anonymization.
- Queue or send only after the approval/rejection transaction and type-specific action succeed.
- Record template type, request ID, outcome, recipients, and delivery result in logs without recording tokens, offline codes, or sensitive request contents.
- Retry transient email-provider failures.
- Surface a warning to the administrator if queuing fails, while preserving the completed decision.
- Never expose VPN tokens, offline codes, password tokens, private keys, or raw export data in logs or email.

## 8. Acceptance Coverage

Automated tests should verify:

- All eight request types render correct approved and rejected content.
- Subjects, status badges, details, CTAs, and destinations match this specification.
- Rejection reasons appear in rejection emails.
- Internal emails go only to the requester.
- User-addition approval sends requester confirmation plus the existing activation email.
- POC approval resolves and deduplicates requester, previous POC, and new POC recipients.
- POC rejection goes only to the requester.
- Account-deletion approval uses the pre-anonymization address and has no portal CTA.
- Data-export approval never claims a file is ready or attached.
- Offline-code and VPN emails contain no secrets.
- Email failure does not roll back a completed request decision.
- Repeated review attempts do not send duplicate emails.

## 9. Approved Decision Record

The following rules were approved with this specification:

1. POC approval notifies requester, previous POC, and new POC, with deduplication.
2. POC rejection notifies only the requester.
3. User-addition approval sends a requester confirmation in addition to the invited user's activation email.
4. Account-deletion approval is emailed to the original address after the account is anonymized and contains no portal CTA.
5. Data-export approval says “approved for preparation,” because export generation/delivery is not implemented.
6. Internal rejection requires a meaningful administrator reason before the rejection email is sent.
7. Offline-code and VPN secrets are available only inside the authenticated portal and never in email.
8. Administrators receive submission notifications but no redundant outcome emails for decisions they performed.
