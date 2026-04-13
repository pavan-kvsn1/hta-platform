// Master Instrument Types and Data Management

export type InstrumentCategory =
  | 'Electro-Technical'
  | 'Thermal'
  | 'Mechanical'
  | 'Dimensions'
  | 'Others'
  | 'Source'

export type InstrumentUsage = 'For Lab' | 'For On Site' | 'For Onsite' | ''

export type InstrumentStatus =
  | 'VALID'
  | 'EXPIRING_SOON'
  | 'EXPIRED'
  | 'UNDER_RECAL'
  | 'SERVICE_PENDING'

export interface ParameterCapability {
  parameter: string
  min: string
  max: string
  unit: string
}

export interface ReferenceDoc {
  referencedoc: string
}

export type RangeItem = ParameterCapability | ReferenceDoc

export interface CompositeValue {
  ind?: string
  sen?: string
}

// NEW: Structured parameter metadata from Mar 2026 JSON format
export interface ParameterMetadata {
  role: ParameterRole[]
  capabilities: string[]
}

// NEW: Parameter roles - what the instrument does
export type ParameterRole = 'source' | 'measuring'

export interface MasterInstrument {
  id: number
  type: InstrumentCategory
  instrument_desc: string
  make: string | CompositeValue
  model: string | CompositeValue
  asset_no: string
  instrument_sl_no: string | CompositeValue
  usage: InstrumentUsage
  calibrated_at: string
  report_no: string
  next_due_on: string // MM/DD/YYYY format
  range: RangeItem[]
  remarks: string

  // NEW: Parameter group - sub-category filter (e.g., "Electrical (multi-function)")
  parameter_group?: string

  // NEW: Structured parameter metadata
  parameter?: ParameterMetadata

  // NEW: Array of available SOP references for this instrument
  sop_references?: string[]

  // Computed fields (added at runtime)
  status?: InstrumentStatus
  daysUntilExpiry?: number
  parsedDueDate?: Date
  capabilities?: ParameterCapability[]
}

// Helper to check if range item is a parameter capability
export function isParameterCapability(item: RangeItem): item is ParameterCapability {
  return 'parameter' in item && 'min' in item && 'max' in item && 'unit' in item
}

// Helper to check if range item is a reference doc
export function isReferenceDoc(item: RangeItem): item is ReferenceDoc {
  return 'referencedoc' in item
}

// Helper to get display string for make/model/serial
export function getDisplayValue(value: string | CompositeValue): string {
  if (typeof value === 'string') {
    return value
  }
  const parts: string[] = []
  if (value.ind) parts.push(`Ind: ${value.ind}`)
  if (value.sen) parts.push(`Sen: ${value.sen}`)
  return parts.join(' / ')
}

// Helper to get simple value (for filtering)
export function getSimpleValue(value: string | CompositeValue): string {
  if (typeof value === 'string') {
    return value
  }
  return value.ind || value.sen || ''
}

// Parse date from MM/DD/YYYY format
export function parseDueDate(dateStr: string): Date | null {
  if (!dateStr) return null

  // Handle MM/DD/YYYY format
  const parts = dateStr.split('/')
  if (parts.length === 3) {
    const month = parseInt(parts[0], 10) - 1 // JS months are 0-indexed
    const day = parseInt(parts[1], 10)
    const year = parseInt(parts[2], 10)
    return new Date(year, month, day)
  }

  // Try parsing as-is
  const date = new Date(dateStr)
  return isNaN(date.getTime()) ? null : date
}

// Calculate instrument status based on due date and remarks
export function calculateInstrumentStatus(instrument: MasterInstrument): {
  status: InstrumentStatus
  daysUntilExpiry: number
} {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const dueDate = parseDueDate(instrument.next_due_on)

  // Check remarks for special statuses
  const remarksLower = (instrument.remarks || '').toLowerCase()
  if (remarksLower.includes('under recal')) {
    return { status: 'UNDER_RECAL', daysUntilExpiry: 0 }
  }
  if (remarksLower.includes('service request') || remarksLower.includes('srf raised')) {
    return { status: 'SERVICE_PENDING', daysUntilExpiry: 0 }
  }

  if (!dueDate) {
    return { status: 'VALID', daysUntilExpiry: 999 }
  }

  const diffTime = dueDate.getTime() - today.getTime()
  const daysUntilExpiry = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

  if (daysUntilExpiry < 0) {
    return { status: 'EXPIRED', daysUntilExpiry }
  }

  if (daysUntilExpiry <= 14) {
    return { status: 'EXPIRING_SOON', daysUntilExpiry }
  }

  return { status: 'VALID', daysUntilExpiry }
}

// Extract parameter capabilities from range array
export function extractCapabilities(range: RangeItem[]): ParameterCapability[] {
  return range.filter(isParameterCapability)
}

// Check if instrument can measure a specific parameter type
export function canMeasureParameter(
  instrument: MasterInstrument,
  parameterType: string
): boolean {
  const capabilities = extractCapabilities(instrument.range)
  if (capabilities.length === 0) {
    // If no structured capabilities, assume it can measure based on description
    return true
  }

  const paramLower = parameterType.toLowerCase()
  return capabilities.some(cap =>
    cap.parameter.toLowerCase().includes(paramLower) ||
    paramLower.includes(cap.parameter.toLowerCase())
  )
}

// Check if instrument range covers the required range
export function coversRange(
  instrument: MasterInstrument,
  parameterType: string,
  requiredMin: number,
  requiredMax: number
): boolean {
  const capabilities = extractCapabilities(instrument.range)
  const matchingCap = capabilities.find(cap =>
    cap.parameter.toLowerCase().includes(parameterType.toLowerCase())
  )

  if (!matchingCap) return true // If no specific capability, assume it covers

  const capMin = parseFloat(matchingCap.min)
  const capMax = parseFloat(matchingCap.max)

  if (isNaN(capMin) || isNaN(capMax)) return true

  return capMin <= requiredMin && capMax >= requiredMax
}

// Enrich instrument with computed fields
export function enrichInstrument(instrument: MasterInstrument): MasterInstrument {
  const { status, daysUntilExpiry } = calculateInstrumentStatus(instrument)
  const capabilities = extractCapabilities(instrument.range)
  const parsedDueDate = parseDueDate(instrument.next_due_on) || undefined

  return {
    ...instrument,
    status,
    daysUntilExpiry,
    parsedDueDate,
    capabilities: capabilities.length > 0 ? capabilities : undefined
  }
}

// Standard parameter types for filtering
export const PARAMETER_TYPES = [
  'Temperature',
  'Humidity',
  'Pressure',
  'Voltage',
  'Current',
  'Resistance',
  'Frequency',
  'Time',
  'Force',
  'Sound Level',
  'Vibration',
  'Speed',
  'Flow',
  'Conductivity',
  'Length',
  'Mass',
  'Lux',
] as const

export type ParameterType = typeof PARAMETER_TYPES[number]

// Category display names
export const CATEGORY_LABELS: Record<InstrumentCategory, string> = {
  'Electro-Technical': 'Electro-Technical',
  'Thermal': 'Thermal',
  'Mechanical': 'Mechanical',
  'Dimensions': 'Dimensions',
  'Others': 'Others',
  'Source': 'Source Instruments',
}

// Status display config
export const STATUS_CONFIG: Record<InstrumentStatus, { label: string; color: string; bgColor: string }> = {
  'VALID': { label: 'Valid', color: 'text-green-700', bgColor: 'bg-green-50' },
  'EXPIRING_SOON': { label: 'Expiring Soon', color: 'text-amber-700', bgColor: 'bg-amber-50' },
  'EXPIRED': { label: 'Expired', color: 'text-red-700', bgColor: 'bg-red-50' },
  'UNDER_RECAL': { label: 'Under Recalibration', color: 'text-blue-700', bgColor: 'bg-blue-50' },
  'SERVICE_PENDING': { label: 'Service Pending', color: 'text-purple-700', bgColor: 'bg-purple-50' },
}

// =====================================
// NEW: Parameter Group Functions
// =====================================

/**
 * Extract unique parameter groups from a list of instruments
 */
export function getParameterGroups(instruments: MasterInstrument[]): string[] {
  const groups = new Set<string>()
  for (const inst of instruments) {
    if (inst.parameter_group) {
      groups.add(inst.parameter_group)
    }
  }
  return Array.from(groups).sort()
}

/**
 * Get parameter groups for a specific category
 */
export function getParameterGroupsForCategory(
  instruments: MasterInstrument[],
  category: InstrumentCategory
): string[] {
  const groups = new Set<string>()
  for (const inst of instruments) {
    if (inst.type === category && inst.parameter_group) {
      groups.add(inst.parameter_group)
    }
  }
  return Array.from(groups).sort()
}

/**
 * Filter instruments by category and optionally by parameter group
 */
export function filterByParameterGroup(
  instruments: MasterInstrument[],
  category: InstrumentCategory,
  parameterGroup?: string
): MasterInstrument[] {
  return instruments.filter(inst => {
    if (inst.type !== category) return false
    if (parameterGroup && inst.parameter_group !== parameterGroup) return false
    return true
  })
}

/**
 * Check if instrument has a specific capability
 */
export function hasCapability(
  instrument: MasterInstrument,
  capability: string
): boolean {
  if (!instrument.parameter?.capabilities) return false
  const capLower = capability.toLowerCase()
  return instrument.parameter.capabilities.some(
    cap => cap.toLowerCase() === capLower || cap.toLowerCase().includes(capLower)
  )
}

/**
 * Check if instrument has a specific role (source or measuring)
 */
export function hasRole(
  instrument: MasterInstrument,
  role: ParameterRole
): boolean {
  if (!instrument.parameter?.role) return false
  return instrument.parameter.role.includes(role)
}

/**
 * Get all unique capabilities across instruments
 */
export function getAllCapabilities(instruments: MasterInstrument[]): string[] {
  const caps = new Set<string>()
  for (const inst of instruments) {
    if (inst.parameter?.capabilities) {
      for (const cap of inst.parameter.capabilities) {
        caps.add(cap)
      }
    }
  }
  return Array.from(caps).sort()
}

/**
 * Get SOP references for an instrument (with fallback to empty array)
 */
export function getSopReferences(instrument: MasterInstrument): string[] {
  return instrument.sop_references || []
}
