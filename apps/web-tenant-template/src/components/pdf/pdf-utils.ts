// PDF Utility Functions for Calibration Certificate

/**
 * Format date from YYYY-MM-DD to DD/MM/YYYY
 */
export function formatDateDDMMYYYY(dateStr: string): string {
  if (!dateStr) return '-'

  // Handle YYYY-MM-DD format
  if (dateStr.includes('-')) {
    const parts = dateStr.split('-')
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`
    }
  }

  // Handle MM/DD/YYYY format (from master instruments)
  if (dateStr.includes('/')) {
    const parts = dateStr.split('/')
    if (parts.length === 3) {
      // Check if it's already DD/MM/YYYY or MM/DD/YYYY
      const first = parseInt(parts[0], 10)
      if (first > 12) {
        // Already DD/MM/YYYY
        return dateStr
      }
      // MM/DD/YYYY -> DD/MM/YYYY
      return `${parts[1]}/${parts[0]}/${parts[2]}`
    }
  }

  return dateStr
}

/**
 * Pad serial number with leading zero: 1 -> "01", 10 -> "10"
 */
export function padSerialNumber(num: number): string {
  return num.toString().padStart(2, '0')
}

/**
 * Format compound serial number (Ind/Sen format)
 * Handles both string and CompositeValue types
 */
export function formatCompoundSerial(serial: string | { ind?: string; sen?: string }): string {
  if (typeof serial === 'string') {
    return serial || '-'
  }

  const parts: string[] = []
  if (serial.ind) parts.push(`Ind: ${serial.ind}`)
  if (serial.sen) parts.push(`Sen: ${serial.sen}`)

  if (parts.length === 0) return '-'
  if (parts.length === 1) return parts[0]
  return `${parts[0]} &\n${parts[1]}`
}

/**
 * Get simple value from string or CompositeValue
 */
export function getSimpleValue(value: string | { ind?: string; sen?: string }): string {
  if (typeof value === 'string') {
    return value || '-'
  }
  return value.ind || value.sen || '-'
}

/**
 * Combine parameter values into comma-separated string
 * e.g., "0.1 °C, 1 %RH" for least count across multiple parameters
 */
export function combineParameterValues(
  parameters: Array<{ value: string; unit: string }>,
  prefix: string = ''
): string {
  const values = parameters
    .filter(p => p.value)
    .map(p => `${prefix}${p.value} ${p.unit}`)

  return values.length > 0 ? values.join(', ') : '-'
}

/**
 * Format operating range string
 * e.g., "15 to 25 °C, 0 to 60 %RH"
 */
export function formatOperatingRange(
  parameters: Array<{ min: string; max: string; unit: string }>
): string {
  const ranges = parameters
    .filter(p => p.min && p.max)
    .map(p => `${p.min} to ${p.max} ${p.unit}`)

  return ranges.length > 0 ? ranges.join(', ') : '-'
}

/**
 * Get precision from least count for number formatting
 */
export function getPrecisionFromLeastCount(leastCount: string): number {
  if (!leastCount) return 2
  const value = parseFloat(leastCount)
  if (isNaN(value) || value <= 0) return 2
  const decimalPlaces = leastCount.includes('.') ? leastCount.split('.')[1]?.length || 0 : 0
  return decimalPlaces
}

/**
 * Format number with specified precision
 */
export function formatWithPrecision(value: number | null | string, precision: number): string {
  if (value === null || value === undefined || value === '') return '-'
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return '-'
  return num.toFixed(precision)
}

/**
 * Company information constants
 */
export const COMPANY_INFO = {
  name: 'HTA INSTRUMENTATION (P) LTD.',
  certification: 'An ISO Certified Company and NABL Accredited Calibration Laboratory',
  address: '# 73, Ramachandra Agrahara, Near T.R. Mills, Chamarajpet, Bangalore - 560 018 India',
  contact: {
    phone: ['+91-80-26749750', '+91-80-26759253', '+91-80-26740681'],
    mobile: '+91-73537 53764',
    website: 'www.htaipl.com',
    email: ['calibration@htaipl.com', 'sitecalibration@htaipl.com'],
  },
  // Combined web and email for single line display
  webEmail: 'Web: www.htaipl.com | Email: calibration@htaipl.com, sitecalibration@htaipl.com',
}

/**
 * Signatory names (hardcoded as per spec)
 */
export const SIGNATORIES = {
  calibratedBy: 'THIYAGARAJAN',
  reportPreparedBy: 'CHANDRASHEKAR',
  checkedBy: 'KIRAN',
  approvedIssuedBy: 'HEMANTH KUMAR',
}

// Signing evidence metadata displayed in PDF
export interface SigningMetadata {
  signedAt: string        // ISO date string
  ipAddress?: string      // IP address at signing
  timezone?: string       // Timezone (e.g., "Asia/Kolkata")
  location?: string       // Derived location description
  deviceInfo?: string     // Simplified device/browser info
}

export interface PDFSignatureData {
  engineer?: {
    name: string      // Shown in CALIBRATED BY
    image?: string    // base64 data URI, rendered in signature box
    signatureId: string   // Signature record UUID
    metadata?: SigningMetadata  // Evidence metadata for display
  }
  hod?: {
    name: string      // Shown in CHECKED BY
    image?: string    // base64 data URI, rendered in signature box
    signatureId: string   // Signature record UUID
    metadata?: SigningMetadata  // Evidence metadata for display
  }
  admin?: {
    name: string      // Shown in APPROVED & ISSUED BY
    image?: string    // base64 data URI, rendered in signature box
    signatureId: string   // Signature record UUID
    metadata?: SigningMetadata  // Evidence metadata for display
  }
  customer?: {
    name: string
    companyName: string
    email: string
    image?: string
    signedAt: string      // ISO date string
    signatureId: string   // Signature record UUID
    metadata?: SigningMetadata  // Evidence metadata for display
  }
}

/**
 * Parse user agent to extract simplified device/browser info
 */
export function parseUserAgent(userAgent: string): string {
  if (!userAgent || userAgent === 'unknown') return ''

  // Extract browser
  let browser = ''
  if (userAgent.includes('Chrome') && !userAgent.includes('Edg')) {
    browser = 'Chrome'
  } else if (userAgent.includes('Firefox')) {
    browser = 'Firefox'
  } else if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) {
    browser = 'Safari'
  } else if (userAgent.includes('Edg')) {
    browser = 'Edge'
  }

  // Extract OS
  let os = ''
  if (userAgent.includes('Windows')) {
    os = 'Windows'
  } else if (userAgent.includes('Mac OS')) {
    os = 'macOS'
  } else if (userAgent.includes('Linux')) {
    os = 'Linux'
  } else if (userAgent.includes('Android')) {
    os = 'Android'
  } else if (userAgent.includes('iPhone') || userAgent.includes('iPad')) {
    os = 'iOS'
  }

  const parts = [browser, os].filter(Boolean)
  return parts.length > 0 ? parts.join(' / ') : ''
}

/**
 * Footer notes (mandatory legal statements)
 */
export const FOOTER_NOTES = [
  'This Reports refers only to the item calibrated and shall not be reproduced except in full, without written approval from Manager-Calibration, HTA, Bangalore.',
  'The Standards Used for calibration were calibrated by using reference which is Traceable to NABL Accredited / National / International Standards.',
  'Any error in this certificate should be brought to our knowledge within 7 days from the date of this certificate.',
]

/**
 * Validity statement
 */
export const VALIDITY_STATEMENT =
  'The results reported in this Certificate are valid at the time of & under the stipulated conditions of measurement.'

export const CUSTOMER_ACKNOWLEDGMENT_TEXT =
  'I, the undersigned, acknowledge receipt and acceptance of this calibration certificate and its reported results.'

/**
 * Calibration status options mapping (key -> label and type)
 */
export const CALIBRATION_STATUS_OPTIONS: Record<string, { label: string; type: 'success' | 'error' | 'warning' | 'info' }> = {
  'satisfied': { label: 'Satisfied - Results within accuracy limits', type: 'success' },
  'dissatisfied': { label: 'Dissatisfied - Results NOT within accuracy limits', type: 'error' },
  'not_working': { label: 'Not Working - Device non-functional', type: 'error' },
  'out_of_accuracy': { label: '(*) Indicated calibration points are out of accuracy', type: 'warning' },
  'physical_damage': { label: 'Not working due to physical damage', type: 'error' },
  'circuitry_problem': { label: 'Not working due to internal circuitry problem', type: 'error' },
  // Legacy status values
  'SATISFACTORY': { label: 'Satisfactory', type: 'success' },
  'UNSATISFACTORY': { label: 'Unsatisfactory', type: 'error' },
  'LIMITED': { label: 'Limited Use', type: 'warning' },
}

/**
 * Get calibration status label and type from key
 */
export function getCalibrationStatus(key: string): { label: string; type: 'success' | 'error' | 'warning' | 'info' } {
  return CALIBRATION_STATUS_OPTIONS[key] || { label: key.replace(/_/g, ' '), type: 'info' }
}

/**
 * Conclusion statements mapping (key -> full text)
 */
export const CONCLUSION_STATEMENTS: Record<string, string> = {
  'within_accuracy': 'Equipment performance is within specified accuracy limits.',
  'out_of_accuracy': '"*" Indicated readings are beyond specified accuracy limits.',
  'accuracy_not_given': '"#" Indicates accuracy details not furnished.',
  'all_cal_points_out': 'Cal Due date is not given as all the UUC readings are beyond specified accuracy limits.',
  'customer_no_due_date': 'Cal. Due date is left blank intentionally as per customer request.',
  'customer_due_date_beyond_1yr': 'Cal Due date is given as per customer request.',
  'facility_limitation': 'Due to limitation of facility, the instrument is calibrated only up to the above specified range.',
  'anemometer_vibration': 'Zero reading is taken after switching ON the instrument.',
  'no_serial_number': "As there's no Sl. No. on the UUC instrument, our label no. is made as it's Sl. No.",
  'specific_cal_points': 'Calibration points are given as per customer request.',
  'ph_meter': 'Since pH meters come under the classification "calibration before use" it is suggested to calibrate pH meters before each usage.',
  'tds_conductivity': 'Since TDS / Conductivity meters come under the classification "calibration before use" it is suggested to calibrate Conductivity meters before each usage.',
  'uuc_without_adjust': 'Since no adjustment has been carried out on UUC instrument, both before and after adjustment readings are same.',
  'uuc_with_adjust': 'Since adjustment has been carried out on UUC instrument, both before and after adjustment readings are different and after adjustment readings are only considered for error calculations.',
}

/**
 * Get conclusion statement text from key
 */
export function getConclusionText(key: string): string {
  return CONCLUSION_STATEMENTS[key] || key
}
