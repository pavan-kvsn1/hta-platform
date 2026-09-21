/**
 * What the certificate's appendix prints, worked out from the certificate itself.
 *
 * Appendix A is the unit and the master instruments - photographs belonging to no
 * particular reading. Appendix B is one section per results table: the table's columns
 * stated once with their type and rule, then each photographed point with its own
 * figures and the photographs taken of it.
 *
 * Everything here is derived, never inferred from a value. A column is measured,
 * computed or recorded because its FieldDefinition says so; the rule for a computed
 * column comes from formulaBreakdown, which is the same call the results table makes
 * for its "how this point was computed" panel. Paper and screen cannot disagree.
 *
 * Pure, and deliberately so: the PDF component renders synchronously in Node and in the
 * browser, so the work of deciding what to print happens here, once, where it can be
 * tested.
 */
import {
  formulaBreakdown,
  type ErrorConfig,
  type FieldDefinition,
} from './fields'
import { formatToCalibrationPrecision, resolveCalibrationPrecision } from '@/lib/utils/calibration-precision'

// ---------------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------------

export type AppendixImageType = 'UUC' | 'MASTER_INSTRUMENT' | 'READING_UUC' | 'READING_MASTER'

export interface AppendixPhoto {
  id: string
  imageType: AppendixImageType
  parameterIndex: number | null
  pointNumber: number | null
  masterInstrumentIndex: number | null
  fileName: string
  /** Resolved before rendering. Empty means it could not be loaded. */
  dataUrl: string
}

/** How a column came to hold what it holds. The customer's words, not the schema's. */
export type ColumnKind = 'measured' | 'computed' | 'recorded'

export interface AppendixColumn {
  name: string
  kind: ColumnKind
  unit: string
  /** "read from the master instrument", or the formula in column names. */
  rule: string
}

export interface AppendixValue {
  name: string
  /** "-5.00 °C", or "-5.00 - (-5.10)   =   0.10 °C" for a computed column. */
  value: string
}

export interface AppendixPoint {
  pointNumber: number
  values: AppendixValue[]
  /** The master's photograph and the unit's. Either may be absent. */
  masterPhoto: AppendixPhoto | null
  uucPhoto: AppendixPhoto | null
}

export interface AppendixTable {
  /** tableName where the engineer set one, else the parameter name, as the body heads it. */
  heading: string
  /** "table 2 of 3" - parameters are keyed by position, never by name. */
  position: string
  /** "Points 1, 3 and 4 of 5 were photographed." */
  coverage: string
  columns: AppendixColumn[]
  points: AppendixPoint[]
}

export interface AppendixData {
  unitPhotos: AppendixPhoto[]
  masterPhotos: AppendixPhoto[]
  tables: AppendixTable[]
  /** Photographs whose reading is no longer on the certificate. Counted, not shown. */
  strandedCount: number
  /** Photograph id to its figure number, one sequence across the whole appendix. */
  figures: Record<string, number>
}

/** The parameter shape this reads. A subset of the form's, so tests need not build one. */
export interface AppendixParameter {
  parameterName?: string | null
  parameterUnit?: string | null
  tableName?: string | null
  fieldDefinitions?: FieldDefinition[] | null
  errorConfig?: ErrorConfig | null
  results?: Array<{
    pointNumber: number
    standardReading?: string | null
    beforeAdjustment?: string | null
    afterAdjustment?: string | null
    errorObserved?: number | null
    values?: Record<string, string> | null
  }> | null
  [key: string]: unknown
}

// ---------------------------------------------------------------------------------
// The four cases of "How it is worked out"
// ---------------------------------------------------------------------------------

/** Wording for a column nothing computes. Ours to choose; the rest comes from the schema. */
const READ_FROM_MASTER = 'read from the master instrument'
const READ_FROM_UNIT = 'read from the unit'
const ENTERED = 'entered by the engineer'
const UNREADABLE = 'this column’s formula could not be read'

export function columnKind(field: FieldDefinition): ColumnKind {
  if (field.type === 'expression') return 'computed'
  if (field.type === 'text') return 'recorded'
  return 'measured'
}

/**
 * The rule, from the column's own declaration and nothing else.
 *
 * Three constants and one delegation: steps[0] of a formulaBreakdown is the stored
 * expression with every field id replaced by that column's name.
 */
export function columnRule(field: FieldDefinition, fields: FieldDefinition[]): string {
  if (field.type === 'text') return ENTERED
  if (field.type !== 'expression') {
    return field.group === 'master' ? READ_FROM_MASTER : READ_FROM_UNIT
  }
  // A formula that will not parse says so. A blank cell reads as "nothing to see".
  return formulaBreakdown(field.expression, { fields })?.steps[0] ?? UNREADABLE
}

/**
 * The error's rule, in the direction errorConfig declares.
 *
 * Error Observed is not a FieldDefinition - it is implied by errorConfig, which names
 * two field ids and a direction. A B-A certificate reads "UUC Reading - Standard Meter
 * Reading", which is what its numbers did.
 */
export function errorRule(fields: FieldDefinition[], errorConfig: ErrorConfig): string {
  const nameOf = (id: string) =>
    fields.find((f) => f.id === id)?.name || 'a column no longer on this certificate'
  const [first, second] =
    errorConfig.formula === 'B-A'
      ? [errorConfig.uucFieldId, errorConfig.masterFieldId]
      : [errorConfig.masterFieldId, errorConfig.uucFieldId]
  return `${nameOf(first)} − ${nameOf(second)}`
}

// ---------------------------------------------------------------------------------
// Building a table
// ---------------------------------------------------------------------------------

const ERROR_COLUMN = 'Error Observed'

/** Columns in the order the results table prints them, with the error last. */
export function tableColumns(param: AppendixParameter): AppendixColumn[] {
  const fields = [...(param.fieldDefinitions ?? [])].sort(
    (a, b) => (a.group === b.group ? a.order - b.order : a.group === 'master' ? -1 : 1),
  )

  const columns: AppendixColumn[] = fields.map((field) => ({
    name: field.name || 'Untitled',
    kind: columnKind(field),
    unit: field.unit || '—',
    rule: columnRule(field, fields),
  }))

  if (param.errorConfig) {
    columns.push({
      name: ERROR_COLUMN,
      kind: 'computed',
      unit: param.errorConfig.unit || param.parameterUnit || '—',
      rule: errorRule(fields, param.errorConfig),
    })
  }

  return columns
}

/** "Points 1, 3 and 4 of 5 were photographed." */
export function coverageLine(photographed: number[], total: number): string {
  if (photographed.length === 0) return `None of the ${total} points were photographed.`
  if (photographed.length === total) {
    return total === 1 ? 'The single point was photographed.' : `All ${total} points were photographed.`
  }
  const list =
    photographed.length === 1
      ? `Point ${photographed[0]}`
      : `Points ${photographed.slice(0, -1).join(', ')} and ${photographed[photographed.length - 1]}`
  return `${list} of ${total} ${photographed.length === 1 ? 'was' : 'were'} photographed.`
}

/**
 * One point's figures: every column, then the error with its arithmetic shown.
 *
 * A computed column prints its substituted working and its result, which is what makes
 * the photograph beside it checkable rather than decorative.
 */
function pointValues(
  param: AppendixParameter,
  result: NonNullable<AppendixParameter['results']>[number],
  columns: AppendixColumn[],
): AppendixValue[] {
  const fields = [...(param.fieldDefinitions ?? [])]
  const errorConfig = param.errorConfig ?? null
  const values = withComputed(result, fields, errorConfig)
  const masterReading = errorConfig ? values[errorConfig.masterFieldId] : result.standardReading
  const { precision } = resolveCalibrationPrecision(param as never, masterReading ?? null)

  const out: AppendixValue[] = []

  for (const field of orderedFields(fields)) {
    const raw = values[field.id] ?? ''
    const unit = field.unit ? ` ${field.unit}` : ''

    if (field.type === 'text') {
      out.push({ name: field.name || 'Untitled', value: raw || '—' })
      continue
    }

    if (field.type === 'expression') {
      const broken = formulaBreakdown(field.expression, { fields, values })
      // steps[1] is the formula with the readings in it; steps[0] is it in names.
      const substituted = broken && broken.steps.length > 1 ? broken.steps[1] : null
      const computed = broken?.result
      out.push({
        name: field.name || 'Untitled',
        value:
          substituted && computed !== null && computed !== undefined
            ? `${substituted}   =   ${formatToCalibrationPrecision(computed, precision)}${unit}`
            : raw
              ? `${raw}${unit}`
              : '—',
      })
      continue
    }

    /**
     * A measured column prints what the engineer typed.
     *
     * Not rounded to the parameter's precision, which is derived from the readings the
     * error is taken in. A parameter reading °C to two places would have printed a
     * 1.002 mV source output as "1.00" - the same as 1.000 mV beside it, with the
     * difference between them being the entire reason there is an error at all.
     */
    out.push({ name: field.name || 'Untitled', value: raw ? `${raw}${unit}` : '—' })
  }

  if (errorConfig && columns.some((c) => c.name === ERROR_COLUMN)) {
    const unit = errorConfig.unit ? ` ${errorConfig.unit}` : ''
    const [a, b] =
      errorConfig.formula === 'B-A'
        ? [values[errorConfig.uucFieldId], values[errorConfig.masterFieldId]]
        : [values[errorConfig.masterFieldId], values[errorConfig.uucFieldId]]
    const shown = (v: string | undefined) => {
      const text = formatToCalibrationPrecision(v ?? '', precision, '—')
      // Brackets round a negative, so "15.00 - -0.20" never reaches a customer.
      return text.startsWith('−') || text.startsWith('-') ? `(${text})` : text
    }
    const error = result.errorObserved
    const bare =
      error !== null && error !== undefined
        ? `${formatToCalibrationPrecision(error, precision)}${unit}`
        : '—'

    /**
     * The working is shown only when it adds up on the page.
     *
     * The stored error is computed from the full readings, while the operands beside it
     * are rounded for printing, so in the last digit the two can disagree - the figures
     * would read "25.00 - 25.05 = -0.04". The stored error is the authoritative one and
     * is what the results table prints, so in that rare case the arithmetic is dropped
     * rather than printed wrong.
     */
    const reconciles = () => {
      if (a === undefined || b === undefined || error === null || error === undefined) return false
      const round = (v: string) => Number(formatToCalibrationPrecision(v, precision, ''))
      const [ra, rb] = [round(a), round(b)]
      if (!Number.isFinite(ra) || !Number.isFinite(rb)) return false
      const shownError = Number(formatToCalibrationPrecision(error, precision))
      return Math.abs(ra - rb - shownError) < Math.pow(10, -precision) / 2
    }

    out.push({
      name: ERROR_COLUMN,
      value: reconciles() ? `${shown(a)} − ${shown(b)}   =   ${bare}` : bare,
    })
  }

  return out
}

const orderedFields = (fields: FieldDefinition[]) =>
  [...fields].sort((a, b) => (a.group === b.group ? a.order - b.order : a.group === 'master' ? -1 : 1))

/**
 * The row's values, with every computed column worked out and put back in.
 *
 * The certificate stores readings, not computed figures - so a parameter whose error
 * reads two expression columns has nothing stored for either side of it. Without this,
 * the error printed its answer and no arithmetic, which is precisely the certificate
 * the appendix exists for.
 *
 * Repeated because one computed column may read another; it settles when a pass adds
 * nothing, and is bounded by the number of columns so a cycle cannot spin here. Cycles
 * are caught in the editor by detectExpressionCycles.
 */
function withComputed(
  result: NonNullable<AppendixParameter['results']>[number],
  fields: FieldDefinition[],
  errorConfig: ErrorConfig | null,
): Record<string, string> {
  const values = { ...resolvedValues(result, fields, errorConfig) }
  const expressions = fields.filter((f) => f.type === 'expression')

  for (let pass = 0; pass < expressions.length; pass += 1) {
    let added = false
    for (const field of expressions) {
      if (values[field.id] !== undefined && values[field.id] !== '') continue
      const computed = formulaBreakdown(field.expression, { fields, values })?.result
      if (computed === null || computed === undefined) continue
      values[field.id] = String(computed)
      added = true
    }
    if (!added) break
  }

  return values
}

/** Legacy parameters store readings on the row itself rather than keyed by field id. */
function resolvedValues(
  result: NonNullable<AppendixParameter['results']>[number],
  fields: FieldDefinition[],
  errorConfig: ErrorConfig | null,
): Record<string, string> {
  if (result.values && Object.keys(result.values).length > 0) return result.values
  if (!errorConfig) return {}
  const out: Record<string, string> = {}
  const master = fields.find((f) => f.id === errorConfig.masterFieldId)
  const uuc = fields.find((f) => f.id === errorConfig.uucFieldId)
  if (master) out[master.id] = result.standardReading ?? ''
  if (uuc) out[uuc.id] = result.beforeAdjustment ?? ''
  return out
}

// ---------------------------------------------------------------------------------
// The whole appendix
// ---------------------------------------------------------------------------------

export function buildAppendixData(
  parameters: AppendixParameter[],
  photos: AppendixPhoto[],
): AppendixData {
  const unitPhotos = photos.filter((p) => p.imageType === 'UUC')
  const masterPhotos = photos
    .filter((p) => p.imageType === 'MASTER_INSTRUMENT')
    .sort((a, b) => (a.masterInstrumentIndex ?? 0) - (b.masterInstrumentIndex ?? 0))

  const readingPhotos = photos.filter(
    (p) => p.imageType === 'READING_UUC' || p.imageType === 'READING_MASTER',
  )

  let stranded = 0
  const tables: AppendixTable[] = []

  parameters.forEach((param, index) => {
    const columns = tableColumns(param)
    const results = [...(param.results ?? [])].sort((a, b) => a.pointNumber - b.pointNumber)
    const mine = readingPhotos.filter((p) => (p.parameterIndex ?? -1) === index)

    // A photograph pointing at a point this parameter no longer has. Counted here so
    // the reader is told, rather than finding a gap in the figure numbers.
    const livePoints = new Set(results.map((r) => r.pointNumber))
    stranded += mine.filter((p) => !livePoints.has(p.pointNumber ?? -1)).length

    const points: AppendixPoint[] = []
    for (const result of results) {
      const forPoint = mine.filter((p) => p.pointNumber === result.pointNumber)
      if (forPoint.length === 0) continue // photographed points only
      points.push({
        pointNumber: result.pointNumber,
        values: pointValues(param, result, columns),
        masterPhoto: forPoint.find((p) => p.imageType === 'READING_MASTER') ?? null,
        uucPhoto: forPoint.find((p) => p.imageType === 'READING_UUC') ?? null,
      })
    }

    if (points.length === 0) return

    tables.push({
      heading: (param.tableName?.trim() || param.parameterName?.toUpperCase() || 'READINGS') as string,
      position: '',
      coverage: coverageLine(points.map((p) => p.pointNumber), results.length),
      columns,
      points,
    })
  })

  // "table 2 of 3" is only meaningful once we know how many there are.
  tables.forEach((t, i) => {
    t.position = tables.length > 1 ? `table ${i + 1} of ${tables.length}` : ''
  })

  /** One sequence, in the order the appendix prints: unit, masters, then readings. */
  const figures: Record<string, number> = {}
  let next = 1
  for (const photo of unitPhotos) figures[photo.id] = next++
  for (const photo of masterPhotos) figures[photo.id] = next++
  for (const table of tables) {
    for (const point of table.points) {
      if (point.masterPhoto) figures[point.masterPhoto.id] = next++
      if (point.uucPhoto) figures[point.uucPhoto.id] = next++
    }
  }

  return { unitPhotos, masterPhotos, tables, strandedCount: stranded, figures }
}
