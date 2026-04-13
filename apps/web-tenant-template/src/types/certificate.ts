/**
 * Centralized type definitions for certificate review flows
 *
 * Used by:
 * - Admin Certificate Review (src/app/admin/certificates/[id]/)
 * - Admin Authorization Review (src/app/admin/authorization/[id]/)
 * - Reviewer Certificate Review (src/app/(dashboard)/dashboard/reviewer/[id]/)
 * - Customer Certificate Review (src/app/customer/review/[token]/ and cert/[id]/)
 */

// ============================================================================
// Parameter & Results Types
// ============================================================================

/**
 * Individual calibration reading/result for a parameter
 */
export interface ParameterResult {
  id: string
  pointNumber: number
  standardReading: string | null
  beforeAdjustment: string | null
  afterAdjustment: string | null
  errorObserved: number | null
  isOutOfLimit: boolean
}

/**
 * Calibration parameter with specifications and results
 */
export interface Parameter {
  id: string
  parameterName: string
  parameterUnit: string | null
  rangeMin: string | null
  rangeMax: string | null
  rangeUnit: string | null
  operatingMin: string | null
  operatingMax: string | null
  operatingUnit: string | null
  leastCountValue: string | null
  leastCountUnit: string | null
  accuracyValue: string | null
  accuracyUnit: string | null
  accuracyType: string
  errorFormula: string
  showAfterAdjustment: boolean
  requiresBinning: boolean
  bins: string | null
  sopReference: string | null
  results: ParameterResult[]
}

// ============================================================================
// Master Instrument Types
// ============================================================================

/**
 * Master/reference instrument used in calibration
 */
export interface MasterInstrument {
  id: string
  description: string | null
  make: string | null
  model: string | null
  serialNumber: string | null
  calibrationDueDate: string | null
}

// ============================================================================
// Certificate Data Types
// ============================================================================

/**
 * Core certificate data structure used across all review flows
 */
export interface CertificateData {
  id: string
  certificateNumber: string
  status: string
  customerName: string | null
  customerAddress: string | null
  customerContactName: string | null
  customerContactEmail: string | null
  calibratedAt: string | null
  srfNumber: string | null
  srfDate: string | null
  dateOfCalibration: string | null
  calibrationDueDate: string | null
  dueDateNotApplicable: boolean
  uucDescription: string | null
  uucMake: string | null
  uucModel: string | null
  uucSerialNumber: string | null
  uucLocationName: string | null
  ambientTemperature: string | null
  relativeHumidity: string | null
  calibrationStatus: string[]
  conclusionStatements: string[]
  additionalConclusionStatement: string | null
  currentRevision: number
  parameters: Parameter[]
  masterInstruments: MasterInstrument[]
  // Optional fields - present in admin views
  createdAt?: string
  updatedAt?: string
}

// ============================================================================
// Signature Types
// ============================================================================

/**
 * Signature record for certificate approval workflow
 */
export interface CertificateSignature {
  id: string
  signerType: string
  signerName: string
  signedAt: string | null
}

// ============================================================================
// User & Role Types
// ============================================================================

/**
 * Certificate assignee (engineer who created the certificate)
 */
export interface Assignee {
  id: string
  name: string
  email: string
}

/**
 * Certificate reviewer (peer reviewer)
 */
export interface Reviewer {
  id: string
  name: string
  email: string
}

/**
 * Customer data for review flows
 */
export interface CustomerData {
  id: string
  name: string
  email: string
  companyName: string
}

// ============================================================================
// Feedback Types
// ============================================================================

/**
 * Review feedback item (revision requests, responses, approvals)
 */
export interface Feedback {
  id: string
  feedbackType: string
  comment: string | null
  createdAt: string
  revisionNumber: number
  targetSection: string | null
  user: {
    name: string | null
    role: string
  }
}

// ============================================================================
// Event Types
// ============================================================================

/**
 * Certificate event for audit trail
 */
export interface CertificateEvent {
  id: string
  sequenceNumber: number
  revision: number
  eventType: string
  eventData: string
  userRole: string
  createdAt: string
  user: {
    id: string
    name: string | null
    role: string
  } | null
  customer: {
    id: string
    name: string | null
    email: string
  } | null
}

// ============================================================================
// Header Data Types
// ============================================================================

/**
 * TAT (Turn Around Time) status
 */
export interface TATStatus {
  hours: number
  status: 'ok' | 'warning' | 'overdue'
}

/**
 * Header data for admin/reviewer views (with TAT)
 */
export interface AdminHeaderData {
  certificateNumber: string
  status: string
  statusLabel: string
  statusClassName: string
  tat: TATStatus
  assigneeName: string
  customerName: string
  calibratedAt: string | null
  currentRevision: number
}

/**
 * Header data for customer views (no TAT)
 */
export interface CustomerHeaderData {
  certificateNumber: string
  status: string
  statusLabel: string
  statusClassName: string
  customerName: string
  currentRevision: number
  dateOfCalibration: string | null
}

/**
 * Union type for header data (use specific types where possible)
 */
export type HeaderData = AdminHeaderData | CustomerHeaderData

// ============================================================================
// Utility type guards
// ============================================================================

/**
 * Check if header data includes TAT information (admin/reviewer view)
 */
export function isAdminHeaderData(header: HeaderData): header is AdminHeaderData {
  return 'tat' in header && 'assigneeName' in header
}

/**
 * Check if header data is for customer view
 */
export function isCustomerHeaderData(header: HeaderData): header is CustomerHeaderData {
  return 'dateOfCalibration' in header && !('tat' in header)
}

// ============================================================================
// Authorization-Specific Types
// ============================================================================

/**
 * Simplified certificate data for authorization view
 */
export interface AuthorizationCertificateData {
  id: string
  certificateNumber: string
  status: string
  currentRevision: number
  customerName: string | null
  dateOfCalibration: string | null
  createdBy: { id: string; name: string; email: string } | null
}

/**
 * Header data for authorization view (no TAT, includes dateOfCalibration)
 */
export interface AuthorizationHeaderData {
  certificateNumber: string
  status: string
  statusLabel: string
  statusClassName: string
  assigneeName: string
  customerName: string
  calibratedAt: string | null
  currentRevision: number
  dateOfCalibration: string | null
}
