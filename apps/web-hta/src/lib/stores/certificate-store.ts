import { create } from 'zustand'
import { apiFetch } from '@/lib/api-client'
import { parameterIdFor } from '@/lib/master-entry/parameter-link'
import { masterSpecFor, type MasterBand } from '@/lib/master-entry/snapshot'
import { useMasterInstrumentStore } from '@/lib/stores/master-instrument-store'
import {
  errorPrecision,
  resolveCalibrationPrecision,
  roundToCalibrationPrecision,
} from '@/lib/utils/calibration-precision'
import {
  createDefaultErrorConfig,
  createDefaultFieldDefinitions,
  computeRowError,
  createRow,
  resultValues,
  migrateLegacyResults,
  resolveRowValues,
  toLegacyResults,
  type CalibrationResultRow,
  type ErrorConfig,
  type FieldDefinition,
} from '@/lib/certificate/fields'
/**
 * The lab's acceptance rule, shared.
 *
 * This file used to hold its own copy, so the rule that decides whether a point
 * passed was reachable only from the engineer's form. Every screen that only reads
 * a certificate printed the verdict without being able to name the figure behind
 * it. One implementation, read from both.
 */
import { calculateErrorLimit } from '@/lib/certificate/error-limit'

// Accuracy calculation types
export type AccuracyType = 'PERCENT_READING' | 'ABSOLUTE' | 'PERCENT_SCALE'

export const ACCURACY_TYPE_CONFIG: Record<AccuracyType, { label: string; shortLabel: string; description: string }> = {
  'PERCENT_READING': {
    label: '% of Reading',
    shortLabel: '%Rdg',
    description: '± Margin of Error (%) against master instrument reading',
  },
  'ABSOLUTE': {
    label: 'Absolute',
    shortLabel: 'Abs',
    description: '± Absolute Margin of Error in measurement units',
  },
  'PERCENT_SCALE': {
    label: '% of Scale',
    shortLabel: '%Scale',
    description: '± Margin of Error (%) × total UUC range',
  },
}

// Bin for parameter calibration ranges
export interface ParameterBin {
  id: string
  binMin: string
  binMax: string
  leastCount: string
  accuracy: string
}

// Types for the certificate form
/**
 * A master mapped to a parameter it does not itself measure.
 *
 * A temperature indicator can be calibrated with a millivolt source, the readings
 * converted through an expression. Nothing can derive that pairing - the relationship
 * is whatever the expression says - so it is declared, and what the master has to
 * achieve is stated in the master's own units rather than guessed from the unit under
 * test's.
 */
export interface MasterMapping {
  /** The master capability used, by the registry's name for it. */
  parameter: string
  /** The unit that capability is read in. */
  unit: string
  /**
   * What the master must achieve, in its own units.
   *
   * Stated by the engineer rather than converted from the unit under test's: a
   * millivolt figure for a half-degree limit comes off a thermocouple table they
   * already have, and deriving it here would be a worse version of a number they know.
   *
   * The conversion itself is not recorded here. Section 05 already owns expression
   * columns, and that is where the one turning these readings into the parameter's
   * unit lives - the same expression the error column subtracts with.
   */
  ranges: { from: number; to: number; leastCount: number; accuracy: number }[]
}

export interface Parameter {
  id: string
  parameterName: string
  parameterUnit: string
  /**
   * Which curve or type the unit under test is - Pt-100, Type K.
   *
   * The counterpart of masterSubtype: one says what was measured, the other what
   * measured it. Only meaningful where the parameter records curves at all, which is
   * four of the fifty-two.
   */
  parameterSubtype?: string
  /**
   * How a master measuring something else serves this parameter.
   *
   * Absent for the ordinary case, where the master measures the same thing and the
   * requirement is read from this parameter's own range, least count and accuracy.
   */
  masterMapping?: MasterMapping
  rangeMin: string
  rangeMax: string
  rangeUnit: string
  // Single operating range (when not using bins)
  operatingMin: string
  operatingMax: string
  operatingUnit: string
  /**
   * Where the unit under test declares no operating range of its own.
   *
   * Left blank the fields read as unfinished and the section can never be completed.
   * Marked, the measured range stands in for the operating one - and at least one
   * calibration point has to fall inside it, or the certificate covers a span nothing
   * was read at.
   */
  operatingRangeNotApplicable?: boolean
  leastCountValue: string
  leastCountUnit: string
  accuracyValue: string
  accuracyUnit: string
  accuracyType: AccuracyType
  // Binning support
  requiresBinning: boolean
  bins: ParameterBin[]
  // Other fields
  errorFormula: string
  /**
   * Which of the master's capabilities was used for this parameter, and which curve.
   *
   * Declared by the engineer, not inferred: an instrument can record the same
   * parameter as a source and as a measuring device with different accuracies, and a
   * thermocouple's Type K and Type S have different spans - none of which the readings
   * reveal. Absent on certificates written before this was asked for.
   */
  masterProfileId?: string
  masterSubtype?: string
  /**
   * Why a master whose accuracy ratio falls below the lab's threshold was accepted.
   * Empty where the ratio meets it - the field exists so an accepted shortfall is on
   * the certificate rather than only in someone's memory.
   */
  masterAcceptanceReason?: string
  results: CalibrationResult[]
  showAfterAdjustment: boolean

  // Section 05 dynamic field declarations.
  //
  // Added alongside `results` rather than replacing it: the legacy shape is still read
  // by ResultsSection, the PDF generator and the API mapping, so both must be valid
  // until those move over. `resultRows` is the source of truth once a parameter has
  // been migrated; `results` is kept in step via toLegacyResults for the old readers.
  // See docs/todos/section05-dynamic-fields-revamp.md.
  tableName: string
  fieldDefinitions: FieldDefinition[]
  errorConfig: ErrorConfig
  resultRows: CalibrationResultRow[]
  /**
   * The highest point number ever issued on this parameter in this editing session.
   *
   * Not sent to the server and not read back from it: it exists only to stop a number
   * being reused between deleting a row and saving, which is the one window in which
   * reuse would move a photograph onto a different reading. See issuePointNumber.
   */
  pointSequence?: number
  // Master instrument reference for this parameter
  masterInstrumentId: number | null
  // SOP reference for this parameter's calibration procedure
  sopReference: string
}

export interface CalibrationResult {
  id: string
  pointNumber: number
  standardReading: string
  beforeAdjustment: string
  afterAdjustment: string
  errorObserved: number | null
  isOutOfLimit: boolean
  /** Raw per-column values, for columns the three fields above cannot represent. */
  values?: Record<string, string>
}

// Selected master instrument for the certificate (snapshot at time of selection)
export interface SelectedMasterInstrument {
  id: string
  /**
   * The parameter this master was declared for, by the parameter's own id.
   *
   * A parameter naming an instrument was enough while an instrument appeared once on a
   * certificate. It is not: the same thermometer can be the master for two temperature
   * spans, and then two entries carry the same instrument id and neither can say which
   * span it was declared against - so the second span could not be assigned at all, and
   * both entries reported the first one's parameter as their own.
   *
   * Absent on entries saved before this was recorded; those still resolve by instrument
   * id, which is right for every certificate that uses an instrument once.
   */
  parameterId?: string
  masterInstrumentId: number // Reference to the master list
  category: string // Instrument category (Electro-Technical, Thermal, Mechanical, etc.)
  /**
   * @deprecated Sub-category filter from the old master list. The registry has no such
   * field and the filter it drove has been removed, so nothing writes this any more.
   * Kept on the type because certificates saved before that still carry one.
   */
  parameterGroup?: string
  description: string
  make: string
  model: string
  assetNo: string
  serialNumber: string
  calibratedAt: string
  reportNo: string
  calibrationDueDate: string
  isExpired: boolean
  isExpiringSoon: boolean
  availableSopReferences?: string[] // NEW: SOP options from instrument's sop_references array
  /**
   * What the master's own certificate says, snapshotted when it was chosen.
   *
   * Written at save from the registry, and read from the certificate thereafter. The
   * registry is regenerated as instruments are recalibrated, so a reissue that looked
   * it up live would print figures the original never carried. Absent on certificates
   * written before this existed, which the PDF reports rather than filling in.
   */
  capabilityParameter?: string
  masterLeastCount?: string
  masterLeastCountUnit?: string
  masterAccuracy?: string
  masterAccuracyUnit?: string
  /**
   * Every band the used range touches, where the master declares more than one.
   *
   * The four above are one pair of figures, from the band the range resolved to. Half
   * this lab's capabilities carry several bands with a different resolution and
   * accuracy in each, and one pair cannot say what a calibration crossing two was done
   * with.
   */
  masterBands?: MasterBand[]

  /**
   * The part of the parameter's range this master was used over.
   *
   * A parameter can be served by more than one master. Sometimes both cover the whole
   * of it - an RTD thermometer reading while a calibrator sources the signal - and
   * sometimes they divide it, one pressure gauge to 20 bar and another beyond. One
   * field covers both: left at the parameter's own range it is the first, narrowed it
   * is the second.
   *
   * Each master is judged against this rather than against the parameter's full range,
   * so a gauge that reaches 20 of 100 bar is not marked short for a job it was never
   * asked to do. Gaps between them are allowed; the lab decides what it covered.
   *
   * Absent on entries saved before this existed, which means the parameter's range.
   */
  rangeFrom?: string
  rangeTo?: string

  /**
   * How this master was used, for the parameter it serves.
   *
   * These lived on the parameter, which had room for one master's answers and so for
   * one master. They belong to the pairing rather than to either side of it: two
   * masters on one parameter each have their own capability, their own curve and their
   * own reason for being accepted.
   *
   * The parameter keeps its copy of the first master's, which is what certificates
   * saved before this carry and what anything not yet moved across still reads.
   */
  masterProfileId?: string
  masterSubtype?: string
  masterAcceptanceReason?: string
  sopReference?: string
}

export interface CertificateFormData {
  // Meta
  certificateNumber: string
  status: 'DRAFT' | 'PENDING_REVIEW' | 'REVISION_REQUIRED' | 'PENDING_CUSTOMER_APPROVAL' | 'CUSTOMER_REVISION_REQUIRED' | 'PENDING_ADMIN_AUTHORIZATION' | 'AUTHORIZED' | 'APPROVED' | 'REJECTED'
  lastSaved: Date | null
  serverUpdatedAt: string | null  // ISO timestamp from server for optimistic concurrency control

  // Reviewer assignment (peer review model)
  reviewerId: string | null

  // Section 1: Summary
  calibratedAt: 'LAB' | 'SITE'
  srfNumber: string        // Only for In-House Lab
  srfDate: string          // Only for In-House Lab
  dateOfCalibration: string
  calibrationStartTime: string
  calibrationEndTime: string
  /**
   * How long the calibration holds, in months.
   *
   * Always months, whatever the engineer entered: the due date is one sum and every
   * certificate already written still adds up. Two years is stored as 24.
   */
  calibrationTenure: number
  /** Whether it was entered in months or years, so it reads back the way it was said. */
  calibrationTenureUnit: 'months' | 'years'
  /**
   * Days added to or taken off the due date the tenure works out to.
   *
   * Whole days, and either direction: a due date is sometimes pulled forward to land
   * before a shutdown, and sometimes pushed back to meet a site visit. The form offers
   * -15 to +15, which is the range the API accepts.
   */
  dueDateAdjustment: number
  calibrationDueDate: string
  dueDateNotApplicable: boolean  // If true, due date shows as "Not Applicable" on certificate
  /**
   * How the due date is written on the certificate.
   *
   * 02/09/2026 is September in Bangalore and February in Boston. The stored date does
   * not change; only how it is printed.
   */
  calibrationDueDateFormat: string
  customerName: string
  customerAddress: string
  customerAccountId: string
  customerContactName: string
  customerContactEmail: string

  // Section 2: UUC Details
  uucDescription: string
  uucMake: string
  uucModel: string
  uucSerialNumber: string
  /** A bare sensor has no serial of its own; marked rather than left blank. */
  uucSerialNumberNotApplicable?: boolean
  uucInstrumentId: string
  /** As above, for a fixture with no instrument id. */
  uucInstrumentIdNotApplicable?: boolean
  uucLocationName: string
  uucMachineName: string
  parameters: Parameter[]

  // Section 3: Master Instruments (selected for this certificate)
  masterInstruments: SelectedMasterInstrument[]

  // Section 4: Environmental Conditions
  ambientTemperature: string
  relativeHumidity: string

  // Section 6: Remarks
  calibrationStatus: string[]
  stickerOldRemoved: 'yes' | 'no' | 'na' | null
  stickerNewAffixed: 'yes' | 'no' | 'na' | null
  statusNotes: string  // Used for customer rejection feedback (read-only in engineer forms)

  // Section 7: Conclusion Statements
  selectedConclusionStatements: string[]
  additionalConclusionStatement: string // Custom user-entered conclusion statement

  // Engineer notes (for responding to reviewer feedback)
  engineerNotes: string

  // Section-specific responses to reviewer feedback (stored locally until submission)
  sectionResponses: Record<string, string>
}

interface CertificateStore {
  formData: CertificateFormData
  isDirty: boolean
  isSaving: boolean
  validationErrors: Record<string, string>
  isHydrated: boolean
  certificateId: string | null // Database ID for the certificate

  // Actions
  hydrate: () => void
  setFormField: <K extends keyof CertificateFormData>(field: K, value: CertificateFormData[K]) => void
  setParameter: (index: number, parameter: Parameter) => void
  addParameter: () => void
  removeParameter: (index: number) => void
  setResult: (parameterIndex: number, resultIndex: number, result: CalibrationResult) => void
  addResult: (parameterIndex: number) => void
  removeResult: (parameterIndex: number, resultIndex: number) => void
  setPointCount: (parameterIndex: number, count: number) => void
  addMasterInstrument: () => void
  removeMasterInstrument: (index: number) => void
  setMasterInstrument: (index: number, instrument: SelectedMasterInstrument) => void
  setParameterMasterInstrument: (parameterIndex: number, masterInstrumentId: number | null) => void
  calculateDueDate: () => void
  calculateError: (parameterIndex: number, resultIndex: number) => void
  recalculateAllErrors: (parameterIndex: number) => void

  // Section 05 dynamic fields
  setTableName: (parameterIndex: number, tableName: string) => void
  setParameterSchema: (
    parameterIndex: number,
    fieldDefinitions: FieldDefinition[],
    errorConfig: ErrorConfig,
  ) => void
  setResultRowValue: (
    parameterIndex: number,
    rowIndex: number,
    fieldId: string,
    value: string,
  ) => void
  addResultRow: (parameterIndex: number) => void
  removeResultRow: (parameterIndex: number, rowIndex: number) => void
  setResultRowCount: (parameterIndex: number, count: number) => void
  toggleCalibrationStatus: (status: string) => void
  setIsSaving: (saving: boolean) => void
  setLastSaved: (date: Date) => void
  resetForm: () => void
  loadForm: (data: Partial<CertificateFormData>) => void
  setCertificateId: (id: string | null) => void
  saveDraft: () => Promise<{ success: boolean; error?: string; serverTimestamp?: string }>
  setEngineerNotes: (notes: string) => void
  setSectionResponse: (sectionId: string, response: string) => void
  clearSectionResponses: () => void
}

const generateId = () => Math.random().toString(36).substring(2, 9)

/**
 * A parameter with its master forgotten.
 *
 * Everything here was read off that one instrument - which of its capabilities was
 * used, on which curve, under which procedure, what the reviewer was told, and how a
 * master measuring something else was mapped to the parameter. None of it means
 * anything about the next master, and left behind it is a certificate naming a master
 * it no longer carries.
 */
function withoutMaster(parameter: Parameter): Parameter {
  return {
    ...parameter,
    masterInstrumentId: null,
    masterProfileId: undefined,
    masterSubtype: undefined,
    masterAcceptanceReason: undefined,
    masterMapping: undefined,
    sopReference: '',
  }
}

const _createDefaultBin = (): ParameterBin => ({
  id: generateId(),
  binMin: '',
  binMax: '',
  leastCount: '',
  accuracy: '',
})

const createDefaultParameter = (): Parameter => {
  // A new parameter starts with one master and one UUC numeric field, which renders
  // exactly like the old fixed layout. Nothing changes for a user who never opens
  // parameter setup.
  const fieldDefinitions = createDefaultFieldDefinitions('')
  return {
  id: generateId(),
  parameterName: '',
  parameterUnit: '', // Selected via dropdown based on parameter type
  rangeMin: '',
  rangeMax: '',
  rangeUnit: '', // Deprecated - using parameterUnit instead
  operatingMin: '',
  operatingMax: '',
  operatingRangeNotApplicable: false,
  operatingUnit: '', // Deprecated - using parameterUnit instead
  leastCountValue: '',
  leastCountUnit: '', // Deprecated - using parameterUnit instead
  accuracyValue: '',
  accuracyUnit: '', // Deprecated - using parameterUnit instead
  accuracyType: 'ABSOLUTE', // Default to absolute accuracy
  requiresBinning: false,
  bins: [],
  errorFormula: 'A-B',
  results: [createDefaultResult(1)],
  showAfterAdjustment: false,
  masterInstrumentId: null,
  sopReference: '',
  tableName: '',
  fieldDefinitions,
  errorConfig: createDefaultErrorConfig(fieldDefinitions, ''),
  resultRows: [createRow(1)],
  }
}

/**
 * Fill in the dynamic-field shape for a parameter that arrived without one.
 *
 * Certificates saved before Section 05 was reworked have `results` but no
 * `fieldDefinitions`, so the edit page must derive them on load. Idempotent: a
 * parameter that already carries a schema is returned untouched, so re-running it over
 * an already-migrated form cannot clobber a user's column setup.
 */
export const ensureParameterFields = (parameter: Parameter): Parameter => {
  if (parameter.fieldDefinitions?.length) {
    // A stored schema comes back without its rows - those live in the results - so
    // rebuild them here rather than rendering an empty table. Prefer each result's own
    // values; fall back to the legacy three for results written before they existed.
    if (parameter.resultRows?.length) return parameter

    const config = parameter.errorConfig
    const rows: CalibrationResultRow[] = (parameter.results ?? []).map((result, index) => ({
      id: result.id || generateId(),
      pointNumber: result.pointNumber || index + 1,
      // Same mapping the renderers use, so a row rebuilt on load lands on the columns
      // it was entered into - including when the error is configured against a formula
      // column, which cannot hold an entered reading.
      values: resultValues(result, parameter.fieldDefinitions ?? [], config),
      errorObserved: result.errorObserved,
      isOutOfLimit: result.isOutOfLimit,
    }))

    return { ...parameter, resultRows: rows.length > 0 ? rows : [createRow(1)] }
  }

  const { fieldDefinitions, errorConfig, rows } = migrateLegacyResults(
    parameter.results ?? [],
    {
      unit: parameter.parameterUnit || '',
      showAfterAdjustment: parameter.showAfterAdjustment,
    },
  )

  return {
    ...parameter,
    tableName: parameter.tableName || '',
    fieldDefinitions,
    errorConfig: { ...errorConfig, formula: parameter.errorFormula === 'B-A' ? 'B-A' : 'A-B' },
    resultRows: rows.length > 0 ? rows : [createRow(1)],
  }
}

/**
 * Recompute a row's error and out-of-limit flag from the current field schema.
 *
 * Uses the same accuracy limit and precision rules as the legacy calculateError, so a
 * migrated parameter flags the same points as before. The reading the limit is
 * evaluated at is the master field's value, matching the legacy standardReading.
 */
export const recomputeResultRow = (
  parameter: Parameter,
  row: CalibrationResultRow,
): CalibrationResultRow => {
  const error = computeRowError(row, parameter.fieldDefinitions ?? [], parameter.errorConfig)
  if (error === null) {
    return { ...row, errorObserved: null, isOutOfLimit: false }
  }

  const masterRaw = resolveRowValues(row, parameter.fieldDefinitions ?? [])[
    parameter.errorConfig.masterFieldId
  ]
  const masterValue = parseFloat(masterRaw)
  const { limit } = calculateErrorLimit(parameter, masterValue)

  // Rounded to what the readings were written to, not to the instrument's least count.
  // The least count is the smallest division the instrument can show, so it governs
  // what can be read; the error is a difference of two readings and is good to whatever
  // they were good to. Rounding it to the least count threw the finding away - on a bin
  // resolving to 1 degree, an error of -0.41 became 0 and the certificate reported no
  // error where there was one.
  //
  // The verdict never used the rounded figure and does not now: it is the true error
  // that either exceeds the limit or does not.
  const uucRaw = resolveRowValues(row, parameter.fieldDefinitions ?? [])[
    parameter.errorConfig.uucFieldId
  ]

  return {
    ...row,
    errorObserved: roundToCalibrationPrecision(error, errorPrecision(masterRaw, uucRaw)),
    isOutOfLimit: limit !== null && Math.abs(error) > limit,
  }
}

/**
 * Project the dynamic rows back onto `results` so the PDF generator and the API
 * mapping, which still read the legacy shape, stay correct.
 *
 * Lossy by nature - only the two error-config fields and one extra UUC field survive -
 * so this is a compatibility bridge, not a save format.
 */
export const syncLegacyResults = (parameter: Parameter): Parameter => {
  if (!parameter.fieldDefinitions?.length) return parameter
  return {
    ...parameter,
    results: toLegacyResults(
      parameter.resultRows ?? [],
      parameter.fieldDefinitions,
      parameter.errorConfig,
    ),
  }
}

/**
 * The next point number to hand out on a parameter, and the parameter that remembers it.
 *
 * pointNumber is the only thing about a reading that survives a save. The certificate
 * rewrites every parameter and every row on each save, and both get fresh database ids,
 * so a photograph taken of a reading can only say "parameter 0, point 3" and hope that
 * still means the same reading.
 *
 * It used not to. Deleting a row renumbered the ones below it, so deleting point 3
 * turned point 4 into point 3 - and the photographs of point 4 stayed on 4, which was
 * now a different reading, or nothing at all. Silently, on a document whose whole
 * purpose is to say what was measured.
 *
 * So numbers are permanent: delete point 3 of five and the rows left are 1, 2, 4, 5.
 * The certificate still prints 1, 2, 3, 4, because the printed serial is the row's
 * position and always was a presentation detail.
 *
 * One past the highest row is not enough on its own. Delete the highest row and that
 * number is free again, so the next row takes it - and any photograph of the row just
 * deleted lands on the new one. pointSequence is the high-water mark: it only ever goes
 * up, so a number issued in this session is never issued twice.
 *
 * It is deliberately not persisted. On the next load the rows come back without it, and
 * the mark resets to one past the highest - which is safe by then, because saving is
 * what archives the photographs of a deleted reading. The mark only has to cover the
 * window between deleting a row and saving, which is exactly the window it survives.
 */
const issuePointNumber = <T extends { results?: unknown[]; pointSequence?: number }>(
  param: T,
  rows: Array<{ pointNumber: number }>,
): { pointNumber: number; pointSequence: number } => {
  const highestPresent = rows.reduce((highest, row) => Math.max(highest, row.pointNumber || 0), 0)
  const pointNumber = Math.max(highestPresent, param.pointSequence ?? 0) + 1
  return { pointNumber, pointSequence: pointNumber }
}

const createDefaultResult = (pointNumber: number): CalibrationResult => ({
  id: generateId(),
  pointNumber,
  standardReading: '',
  beforeAdjustment: '',
  afterAdjustment: '',
  errorObserved: null,
  isOutOfLimit: false,
})

const createDefaultSelectedMasterInstrument = (): SelectedMasterInstrument => ({
  id: generateId(),
  masterInstrumentId: 0,
  category: '',
  description: '',
  make: '',
  model: '',
  assetNo: '',
  serialNumber: '',
  calibratedAt: '',
  reportNo: '',
  calibrationDueDate: '',
  isExpired: false,
  isExpiringSoon: false,
})

// Generate certificate number
const generateCertificateNumber = (): string => {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const year = String(now.getFullYear()).slice(-2)
  const sequence = Math.floor(50000 + Math.random() * 1000).toString().padStart(5, '0')
  return `HTA/C${sequence}/${month}/${year}`
}

// Calculate due date based on calibration date, tenure, and adjustment
const calculateDueDateString = (dateOfCalibration: string, tenure: number, adjustment: number = 0): string => {
  if (!dateOfCalibration) return ''
  const date = new Date(dateOfCalibration)
  date.setMonth(date.getMonth() + tenure)
  date.setDate(date.getDate() + adjustment)
  return date.toISOString().split('T')[0]
}

const initialFormData: CertificateFormData = {
  // Meta
  certificateNumber: '', // Generated on client side to avoid hydration mismatch
  status: 'DRAFT',
  lastSaved: null,
  serverUpdatedAt: null,  // Tracks server timestamp for optimistic concurrency control

  // Reviewer assignment
  reviewerId: null,

  // Section 1: Summary
  calibratedAt: 'LAB',
  srfNumber: '',
  srfDate: '',
  dateOfCalibration: '', // Generated on client side to avoid hydration mismatch
  calibrationStartTime: '',
  calibrationEndTime: '',
  calibrationTenure: 12,
  calibrationTenureUnit: 'months',
  dueDateAdjustment: 0,
  calibrationDueDate: '', // Generated on client side to avoid hydration mismatch
  dueDateNotApplicable: false,
  calibrationDueDateFormat: 'DD/MM/YYYY',
  customerName: '',
  customerAddress: '',
  customerAccountId: '',
  customerContactName: '',
  customerContactEmail: '',

  // Section 2: UUC Details
  uucDescription: '',
  uucMake: '',
  uucModel: '',
  uucSerialNumber: '',
  uucSerialNumberNotApplicable: false,
  uucInstrumentId: '',
  uucInstrumentIdNotApplicable: false,
  uucLocationName: '',
  uucMachineName: '',
  parameters: [createDefaultParameter()],

  // Section 3: Master Instruments
  masterInstruments: [createDefaultSelectedMasterInstrument()],

  // Section 4: Environmental Conditions
  ambientTemperature: '',
  relativeHumidity: '',

  // Section 6: Remarks
  calibrationStatus: [],
  stickerOldRemoved: null,
  stickerNewAffixed: null,
  statusNotes: '',

  // Section 7: Conclusion Statements
  selectedConclusionStatements: [],
  additionalConclusionStatement: '',

  // Engineer notes (for responding to reviewer feedback)
  engineerNotes: '',

  // Section-specific responses to reviewer feedback
  sectionResponses: {},
}

// Certificate store - manages certificate form data and state
/**
 * The master's own least count and accuracy, taken from the registry at save time.
 *
 * Copied onto the certificate rather than looked up when it is printed: the registry
 * is regenerated as instruments are recalibrated, and a certificate reissued next year
 * must carry the figures it was issued with.
 *
 * The span is the master's own - the mapped one where it measures something else, the
 * parameter's otherwise - because a master's resolution changes across its range.
 */
function masterSpecSnapshot(
  entry: SelectedMasterInstrument,
  parameter: Parameter | undefined,
) {
  /** What the entry already carries, so a failed lookup cannot erase a recorded one. */
  const held = {
    capabilityParameter: entry.capabilityParameter ?? '',
    masterLeastCount: entry.masterLeastCount ?? '',
    masterLeastCountUnit: entry.masterLeastCountUnit ?? '',
    masterAccuracy: entry.masterAccuracy ?? '',
    masterAccuracyUnit: entry.masterAccuracyUnit ?? '',
    masterBands: entry.masterBands ?? [],
  }
  if (!parameter) return held

  const unit = useMasterInstrumentStore.getState().getUnitByLegacyId(entry.masterInstrumentId)
  const mapped = parameter.masterMapping?.ranges?.[0]
  const from = mapped ? mapped.from : Number(parameter.rangeMin)
  const to = mapped ? mapped.to : Number(parameter.rangeMax)
  const range = Number.isFinite(from) && Number.isFinite(to) ? { from, to } : null

  const resolved = masterSpecFor(
    unit,
    parameter.masterProfileId,
    parameter.masterSubtype,
    range,
  )
  // A save made before the registry finished loading resolves to nothing. Writing that
  // would replace a snapshot the certificate already had with a blank one, and the
  // certificate would quietly lose figures it was issued with.
  return resolved.capabilityParameter || resolved.masterLeastCount || resolved.masterAccuracy
    ? resolved
    : held
}

export const useCertificateStore = create<CertificateStore>((set, get) => ({
  formData: initialFormData,
  isDirty: false,
  isSaving: false,
  validationErrors: {},
  isHydrated: false,
  certificateId: null,

  // Hydrate store with client-side generated values to avoid hydration mismatch
  hydrate: () => {
    const state = get()
    if (state.isHydrated) return

    // Generate client-side values to avoid hydration mismatch
    const certificateNumber = state.formData.certificateNumber || generateCertificateNumber()
    const today = new Date().toISOString().split('T')[0]
    const dateOfCalibration = state.formData.dateOfCalibration || today
    const calibrationDueDate = state.formData.calibrationDueDate || calculateDueDateString(dateOfCalibration, state.formData.calibrationTenure, state.formData.dueDateAdjustment)

    // Update form data with client-side generated values
    set({
      isHydrated: true,
      formData: {
        ...state.formData,
        certificateNumber,
        dateOfCalibration,
        calibrationDueDate,
      },
    })
  },

  // Set form field - updates form data and marks as dirty
  setFormField: (field, value) => {
    set((state) => ({
      formData: { ...state.formData, [field]: value },
      isDirty: true,
    }))

    // Auto-calculate due date when date, tenure, or adjustment changes
    if (field === 'dateOfCalibration' || field === 'calibrationTenure' || field === 'dueDateAdjustment') {
      get().calculateDueDate()
    }
  },

  // Set parameter - updates parameter at index and marks as dirty
  setParameter: (index, parameter) => {
    const oldParameter = get().formData.parameters[index]

    set((state) => {
      const newParameters = [...state.formData.parameters]
      newParameters[index] = parameter
      return {
        formData: { ...state.formData, parameters: newParameters },
        isDirty: true,
      }
    })

    // Check if accuracy-related fields changed that require recalculation
    const accuracyFieldsChanged =
      oldParameter.accuracyType !== parameter.accuracyType ||
      oldParameter.accuracyValue !== parameter.accuracyValue ||
      oldParameter.rangeMin !== parameter.rangeMin ||
      oldParameter.rangeMax !== parameter.rangeMax ||
      oldParameter.errorFormula !== parameter.errorFormula ||
      oldParameter.requiresBinning !== parameter.requiresBinning ||
      JSON.stringify(oldParameter.bins) !== JSON.stringify(parameter.bins)

    if (accuracyFieldsChanged) {
      // Trigger recalculation of all errors for this parameter
      get().recalculateAllErrors(index)
    }
  },

  // Add parameter - adds new parameter and marks as dirty
  addParameter: () => {
    set((state) => ({
      formData: {
        ...state.formData,
        parameters: [...state.formData.parameters, createDefaultParameter()],
      },
      isDirty: true,
    }))
  },

  // Remove parameter - removes parameter at index and marks as dirty
  removeParameter: (index) => {
    set((state) => {
      if (state.formData.parameters.length <= 1) return state
      const newParameters = state.formData.parameters.filter((_, i) => i !== index)
      return {
        formData: { ...state.formData, parameters: newParameters },
        isDirty: true,
      }
    })
  },

  // Set result - updates result at parameter and result index and marks as dirty
  setResult: (parameterIndex, resultIndex, result) => {
    set((state) => {
      const newParameters = [...state.formData.parameters]
      const newResults = [...newParameters[parameterIndex].results]
      newResults[resultIndex] = result
      newParameters[parameterIndex] = { ...newParameters[parameterIndex], results: newResults }
      return {
        formData: { ...state.formData, parameters: newParameters },
        isDirty: true,
      }
    })
    get().calculateError(parameterIndex, resultIndex)
  },

  // Add result - adds new result to parameter and marks as dirty
  addResult: (parameterIndex) => {
    set((state) => {
      const newParameters = [...state.formData.parameters]
      const currentResults = newParameters[parameterIndex].results
      // One past the highest ever issued, not one past the count: with a gap left by a
      // deleted row, counting would hand out a number a photograph already points at.
      const issued = issuePointNumber(newParameters[parameterIndex], currentResults)
      newParameters[parameterIndex] = {
        ...newParameters[parameterIndex],
        pointSequence: issued.pointSequence,
        results: [...currentResults, createDefaultResult(issued.pointNumber)],
      }
      return {
        formData: { ...state.formData, parameters: newParameters },
        isDirty: true,
      }
    })
  },

  // Remove result - removes result at parameter and result index and marks as dirty
  removeResult: (parameterIndex, resultIndex) => {
    set((state) => {
      const newParameters = [...state.formData.parameters]
      if (newParameters[parameterIndex].results.length <= 1) return state
      // The rows that remain keep the numbers they had. See nextPointNumber.
      const newResults = newParameters[parameterIndex].results.filter((_, i) => i !== resultIndex)
      newParameters[parameterIndex] = { ...newParameters[parameterIndex], results: newResults }
      return {
        formData: { ...state.formData, parameters: newParameters },
        isDirty: true,
      }
    })
  },

  // Set point count - adjusts number of results for parameter and marks as dirty
  setPointCount: (parameterIndex, count) => {
    set((state) => {
      const newParameters = [...state.formData.parameters]
      const currentResults = newParameters[parameterIndex].results
      const currentCount = currentResults.length

      if (count > currentCount) {
        // Add more results
        const newResults = [...currentResults]
        for (let i = currentCount + 1; i <= count; i++) {
          newResults.push(createDefaultResult(i))
        }
        newParameters[parameterIndex] = { ...newParameters[parameterIndex], results: newResults }
      } else if (count < currentCount) {
        // Remove results
        newParameters[parameterIndex] = {
          ...newParameters[parameterIndex],
          results: currentResults.slice(0, count),
        }
      }

      return {
        formData: { ...state.formData, parameters: newParameters },
        isDirty: true,
      }
    })
  },

  // Add master instrument - adds new master instrument and marks as dirty
  addMasterInstrument: () => {
    set((state) => ({
      formData: {
        ...state.formData,
        masterInstruments: [...state.formData.masterInstruments, createDefaultSelectedMasterInstrument()],
      },
      isDirty: true,
    }))
  },

  // Remove master instrument - removes master instrument at index and marks as dirty
  removeMasterInstrument: (index) => {
    set((state) => {
      const removed = state.formData.masterInstruments[index]
      if (!removed) return state

      // The last one is removable too. Keeping an empty card on the certificate to
      // stand in for "none" only made the section look finished when it was not;
      // Parameter Coverage is what says whether the section is done.
      const masterInstruments = state.formData.masterInstruments.filter((_, i) => i !== index)

      // A parameter can point at the master being removed. Leaving that pointer behind
      // is how a certificate ends up naming a master it no longer carries - the
      // assignment row can never be ticked and nothing on screen says why. Only clear
      // it when no remaining master carries the same id.
      // The entry names its parameter, so removing one of two entries holding the same
      // instrument releases only its own. Entries saved before that was recorded fall
      // back to the instrument, and then only where no remaining entry carries it.
      const parameters = removed.parameterId
        ? state.formData.parameters.map((p) =>
            p.id === removed.parameterId ? withoutMaster(p) : p,
          )
        : removed.masterInstrumentId > 0 &&
            !masterInstruments.some((m) => m.masterInstrumentId === removed.masterInstrumentId)
          ? state.formData.parameters.map((p) =>
              p.masterInstrumentId === removed.masterInstrumentId ? withoutMaster(p) : p,
            )
          : state.formData.parameters

      return {
        formData: { ...state.formData, masterInstruments, parameters },
        isDirty: true,
      }
    })
  },

  // Set master instrument - updates master instrument at index and marks as dirty
  setMasterInstrument: (index, instrument) => {
    set((state) => {
      const newInstruments = [...state.formData.masterInstruments]
      newInstruments[index] = instrument
      return {
        formData: { ...state.formData, masterInstruments: newInstruments },
        isDirty: true,
      }
    })
  },

  // Set parameter master instrument - updates parameter's master instrument ID and marks as dirty
  setParameterMasterInstrument: (parameterIndex, masterInstrumentId) => {
    set((state) => {
      const newParameters = [...state.formData.parameters]
      newParameters[parameterIndex] = {
        ...newParameters[parameterIndex],
        masterInstrumentId,
      }
      return {
        formData: { ...state.formData, parameters: newParameters },
        isDirty: true,
      }
    })
  },

  // Calculate due date - recalculates due date based on date, tenure, and adjustment and updates form data
  calculateDueDate: () => {
    set((state) => {
      const dueDate = calculateDueDateString(
        state.formData.dateOfCalibration,
        state.formData.calibrationTenure,
        state.formData.dueDateAdjustment
      )
      return {
        formData: { ...state.formData, calibrationDueDate: dueDate },
      }
    })
  },

  // Calculate error - recalculates error for result and updates form data
  calculateError: (parameterIndex, resultIndex) => {
    set((state) => {
      const newParameters = [...state.formData.parameters]
      const parameter = newParameters[parameterIndex]
      const result = parameter.results[resultIndex]

      const standardReading = parseFloat(result.standardReading)
      const beforeAdjustment = parseFloat(result.beforeAdjustment)

      if (isNaN(standardReading) || isNaN(beforeAdjustment)) {
        return state
      }

      // Calculate error based on formula
      let errorObserved: number
      switch (parameter.errorFormula) {
        case 'B-A':
          errorObserved = beforeAdjustment - standardReading
          break
        case 'A-B':
        default:
          errorObserved = standardReading - beforeAdjustment
          break
      }

      // Calculate limit based on accuracy type
      const { limit } = calculateErrorLimit(parameter, standardReading)
      const isOutOfLimit = limit !== null && Math.abs(errorObserved) > limit

      const newResults = [...parameter.results]
      newResults[resultIndex] = {
        ...result,
        // As above: the readings' precision, not the instrument's least count.
        errorObserved: roundToCalibrationPrecision(
          errorObserved,
          errorPrecision(result.standardReading, result.beforeAdjustment),
        ),
        isOutOfLimit,
      }
      newParameters[parameterIndex] = { ...parameter, results: newResults }

      return {
        formData: { ...state.formData, parameters: newParameters },
      }
    })
  },

  // Recalculate all errors - recalculates errors for all results in parameter and updates form data
  recalculateAllErrors: (parameterIndex) => {
    const state = get()
    const parameter = state.formData.parameters[parameterIndex]

    // Recalculate errors for all results in this parameter
    parameter.results.forEach((_, resultIndex) => {
      get().calculateError(parameterIndex, resultIndex)
    })
  },

  setTableName: (parameterIndex, tableName) => {
    set((state) => {
      const parameters = [...state.formData.parameters]
      parameters[parameterIndex] = { ...parameters[parameterIndex], tableName }
      return { formData: { ...state.formData, parameters }, isDirty: true }
    })
  },

  setParameterSchema: (parameterIndex, fieldDefinitions, errorConfig) => {
    set((state) => {
      const parameters = [...state.formData.parameters]
      const parameter = { ...parameters[parameterIndex], fieldDefinitions, errorConfig }
      // Changing which fields feed the error, or removing a field an expression used,
      // invalidates every previously computed error on this parameter.
      parameter.resultRows = (parameter.resultRows ?? []).map((row) =>
        recomputeResultRow(parameter, row),
      )
      parameters[parameterIndex] = syncLegacyResults(parameter)
      return { formData: { ...state.formData, parameters }, isDirty: true }
    })
  },

  setResultRowValue: (parameterIndex, rowIndex, fieldId, value) => {
    set((state) => {
      const parameters = [...state.formData.parameters]
      const parameter = { ...parameters[parameterIndex] }
      const rows = [...(parameter.resultRows ?? [])]
      const row = rows[rowIndex]
      if (!row) return state

      rows[rowIndex] = recomputeResultRow(parameter, {
        ...row,
        values: { ...row.values, [fieldId]: value },
      })
      parameter.resultRows = rows
      parameters[parameterIndex] = syncLegacyResults(parameter)
      return { formData: { ...state.formData, parameters }, isDirty: true }
    })
  },

  addResultRow: (parameterIndex) => {
    set((state) => {
      const parameters = [...state.formData.parameters]
      const parameter = { ...parameters[parameterIndex] }
      const rows = parameter.resultRows ?? []
      const issued = issuePointNumber(parameter, rows)
      parameter.pointSequence = issued.pointSequence
      parameter.resultRows = [...rows, createRow(issued.pointNumber)]
      parameters[parameterIndex] = syncLegacyResults(parameter)
      return { formData: { ...state.formData, parameters }, isDirty: true }
    })
  },

  removeResultRow: (parameterIndex, rowIndex) => {
    set((state) => {
      const parameters = [...state.formData.parameters]
      const parameter = { ...parameters[parameterIndex] }
      const rows = parameter.resultRows ?? []
      // Always leave one row: an empty table has nowhere to type.
      if (rows.length <= 1) return state
      // The rows that remain keep the numbers they had. See nextPointNumber.
      parameter.resultRows = rows.filter((_, i) => i !== rowIndex)
      parameters[parameterIndex] = syncLegacyResults(parameter)
      return { formData: { ...state.formData, parameters }, isDirty: true }
    })
  },

  setResultRowCount: (parameterIndex, count) => {
    set((state) => {
      const parameters = [...state.formData.parameters]
      const parameter = { ...parameters[parameterIndex] }
      const rows = [...(parameter.resultRows ?? [])]

      if (count < rows.length) {
        // Trimming discards entered data, so only ever drop from the end.
        parameter.resultRows = rows.slice(0, count)
      } else {
        for (let i = rows.length; i < count; i += 1) rows.push(createRow(i + 1))
        parameter.resultRows = rows
      }

      parameters[parameterIndex] = syncLegacyResults(parameter)
      return { formData: { ...state.formData, parameters }, isDirty: true }
    })
  },

  // Toggle calibration status - adds or removes status from calibration status array and marks as dirty
  toggleCalibrationStatus: (status) => {
    set((state) => {
      const currentStatuses = state.formData.calibrationStatus
      const newStatuses = currentStatuses.includes(status)
        ? currentStatuses.filter((s) => s !== status)
        : [...currentStatuses, status]
      return {
        formData: { ...state.formData, calibrationStatus: newStatuses },
        isDirty: true,
      }
    })
  },

  // Set is saving - sets saving state
  setIsSaving: (saving) => set({ isSaving: saving }),

  // Set last saved - sets last saved date and marks as not dirty
  setLastSaved: (date) => set((state) => ({
    formData: { ...state.formData, lastSaved: date },
    isDirty: false,
  })),

  // Reset form - resets form data to initial state and marks as not dirty
  resetForm: () => set({ formData: initialFormData, isDirty: false, validationErrors: {}, certificateId: null }),

  // Load form - loads form data and marks as not dirty
  /**
   * Load a certificate, letting go of any master it does not actually carry.
   *
   * A parameter can arrive naming a master that is not on the certificate - removed
   * before the removal cleared these fields, or edited elsewhere. The row can then
   * never be ticked and nothing on screen says why. The reference is already broken
   * when it arrives; dropping it is repair, not a change of the engineer's answer.
   */
  loadForm: (data) => set((state) => {
    const formData = { ...state.formData, ...data }
    const carried = new Set(formData.masterInstruments.map((m) => m.masterInstrumentId))
    return {
      formData: {
        ...formData,
        parameters: formData.parameters.map((p) =>
          p.masterInstrumentId !== null && !carried.has(p.masterInstrumentId)
            ? withoutMaster(p)
            : p,
        ),
      },
      isDirty: false,
    }
  }),

  // Set certificate ID - sets certificate ID
  setCertificateId: (id) => set({ certificateId: id }),

  // Save draft - saves form data as draft
  saveDraft: async () => {
    const state = get()
    const { formData, certificateId } = state

    set({ isSaving: true })

    try {
      const url = certificateId
        ? `/api/certificates/${certificateId}`
        : '/api/certificates'

      const method = certificateId ? 'PUT' : 'POST'

      // Include clientUpdatedAt for optimistic concurrency control
      // The form links a master to its parameter by the parameter's own id; the API
      // takes a position, because it rewrites the parameter rows on every save and
      // their ids do not survive it.
      const requestBody = {
        ...formData,
        masterInstruments: formData.masterInstruments.map((m) => {
          // Resolved, not read straight off the entry, so what is saved is the
          // parameter the card showed on this entry - including where the link was
          // lost in an earlier save and the card worked it out by position.
          const linked = parameterIdFor(m, formData.masterInstruments, formData.parameters)
          return {
            ...m,
            parameterIndex: linked
              ? formData.parameters.findIndex((p) => p.id === linked)
              : undefined,
          }
        }),
        clientUpdatedAt: formData.serverUpdatedAt,
      }

      const response = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })

      // Handle 409 Conflict - certificate was modified by another user
      if (response.status === 409) {
        const data = await response.json()
        set({ isSaving: false })
        return {
          success: false,
          error: 'CONFLICT',
          serverTimestamp: data.serverUpdatedAt,
        }
      }

      if (!response.ok) {
        const data = await response.json()
        set({ isSaving: false })
        return { success: false, error: data.error || 'Failed to save' }
      }

      const data = await response.json()

      // If this was a new certificate, save the ID
      if (!certificateId && data.certificate?.id) {
        set({ certificateId: data.certificate.id })
      }

      // Track server timestamp for optimistic concurrency control
      set({
        isSaving: false,
        isDirty: false,
        formData: {
          ...state.formData,
          lastSaved: new Date(),
          serverUpdatedAt: data.certificate?.updatedAt || null,
        },
      })

      return { success: true }
    } catch (error) {
      console.error('Error saving draft:', error)
      set({ isSaving: false })
      return { success: false, error: 'Network error' }
    }
  },

  // Set engineer notes - updates engineer notes and marks as dirty
  setEngineerNotes: (notes) => set((state) => ({
    formData: { ...state.formData, engineerNotes: notes },
    isDirty: true,
  })),

  // Set section response - updates section response and marks as dirty
  setSectionResponse: (sectionId, response) => set((state) => ({
    formData: {
      ...state.formData,
      sectionResponses: {
        ...state.formData.sectionResponses,
        [sectionId]: response,
      },
    },
    isDirty: true,
  })),

  // Clear section responses - clears all section responses and marks as dirty
  clearSectionResponses: () => set((state) => ({
    formData: {
      ...state.formData,
      sectionResponses: {},
    },
    isDirty: true,
  })),
}))
