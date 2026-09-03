// Dynamic field declarations for Section 05 (Calibration Results).
//
// Replaces the fixed three-column shape - one standardReading, one beforeAdjustment,
// one optional afterAdjustment - with a per-parameter column schema. Real certificates
// need variable columns: several fields per instrument, mixed types, and a
// user-chosen pair of fields to compute error from.
//
// See docs/todos/section05-dynamic-fields-revamp.md.
//
// This module is deliberately free of React and of the store: the model, the migration
// off the legacy shape, and the expression evaluator are all pure so they can be tested
// and reused by the PDF generator.

/**
 * The legacy fixed-column row, declared structurally rather than imported.
 *
 * certificate-store imports the helpers below, so importing its types back would make
 * the two modules mutually dependent. This shape is identical to the store's
 * CalibrationResult and assignable in both directions.
 */
export interface LegacyCalibrationResult {
  id: string
  pointNumber: number
  standardReading: string
  beforeAdjustment: string
  afterAdjustment: string
  errorObserved: number | null
  isOutOfLimit: boolean
}

export type FieldGroup = 'master' | 'uuc'
export type FieldType = 'numeric' | 'expression' | 'text'

export interface FieldDefinition {
  id: string
  /** Column heading, e.g. "Standard Meter Reading (Y)". */
  name: string
  group: FieldGroup
  type: FieldType
  /** Engineering unit; empty for text fields. */
  unit: string
  /** Formula for expression fields, referencing other fields as {fieldId}. */
  expression?: string
  /** Display order within the group. */
  order: number
}

export interface ErrorConfig {
  masterFieldId: string
  uucFieldId: string
  formula: 'A-B' | 'B-A'
  unit: string
}

export interface CalibrationResultRow {
  id: string
  pointNumber: number
  /** fieldDefinition.id -> entered value, held as text so partial input survives. */
  values: Record<string, string>
  errorObserved: number | null
  isOutOfLimit: boolean
}

let sequence = 0
function nextId(prefix: string): string {
  sequence += 1
  return `${prefix}-${Date.now().toString(36)}-${sequence}`
}

// ---------------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------------

/**
 * The schema a newly created parameter starts with: one master numeric field and one
 * UUC numeric field, both in the parameter's unit. That reproduces the old fixed
 * layout, so a user who never opens parameter setup sees what they saw before.
 */
export function createDefaultFieldDefinitions(unit: string): FieldDefinition[] {
  return [
    {
      id: nextId('fld'),
      name: 'Master Reading',
      group: 'master',
      type: 'numeric',
      unit,
      order: 0,
    },
    {
      id: nextId('fld'),
      name: 'UUC Reading',
      group: 'uuc',
      type: 'numeric',
      unit,
      order: 0,
    },
  ]
}

export function createDefaultErrorConfig(
  fields: FieldDefinition[],
  unit: string,
): ErrorConfig {
  const master = fields.find((f) => f.group === 'master' && f.type === 'numeric')
  const uuc = fields.find((f) => f.group === 'uuc' && f.type === 'numeric')
  return {
    masterFieldId: master?.id ?? '',
    uucFieldId: uuc?.id ?? '',
    formula: 'A-B',
    unit,
  }
}

export function createField(group: FieldGroup, fields: FieldDefinition[]): FieldDefinition {
  const siblings = fields.filter((f) => f.group === group)
  return {
    id: nextId('fld'),
    name: '',
    group,
    type: 'numeric',
    unit: '',
    order: siblings.length,
  }
}

/** Fields eligible for error computation: numeric only, and on the right side. */
export function errorFieldCandidates(
  fields: FieldDefinition[],
  group: FieldGroup,
): FieldDefinition[] {
  return fields.filter((f) => f.group === group && f.type === 'numeric')
}

/**
 * Remove a field, clearing any error-config reference to it.
 *
 * Returns a warning when the removal broke the error computation, so the UI can tell
 * the user to re-select rather than silently producing blank error columns.
 */
export function removeField(
  fields: FieldDefinition[],
  errorConfig: ErrorConfig,
  fieldId: string,
): { fields: FieldDefinition[]; errorConfig: ErrorConfig; warning: string | null } {
  const remaining = fields.filter((f) => f.id !== fieldId)
  let warning: string | null = null
  const next = { ...errorConfig }

  if (errorConfig.masterFieldId === fieldId) {
    next.masterFieldId = ''
    warning = 'Error computation used this field. Select a replacement Master field.'
  }
  if (errorConfig.uucFieldId === fieldId) {
    next.uucFieldId = ''
    warning = 'Error computation used this field. Select a replacement UUC field.'
  }

  const dependents = remaining.filter(
    (f) => f.type === 'expression' && expressionDependencies(f.expression).includes(fieldId),
  )
  if (dependents.length > 0) {
    const names = dependents.map((f) => f.name || f.id).join(', ')
    warning = `Removed field is still referenced by: ${names}`
  }

  return { fields: remaining, errorConfig: next, warning }
}

// ---------------------------------------------------------------------------------
// Expressions
// ---------------------------------------------------------------------------------

const REFERENCE = /\{([^}]+)\}/g

/** Field ids an expression refers to, in order of appearance. */
export function expressionDependencies(expression: string | undefined): string[] {
  if (!expression) return []
  const found: string[] = []
  for (const match of expression.matchAll(REFERENCE)) {
    const id = match[1].trim()
    if (id && !found.includes(id)) found.push(id)
  }
  return found
}

/**
 * Expression fields that depend on each other in a loop.
 *
 * Without this an expression referring to itself, directly or through another field,
 * would recurse until the stack blows during data entry.
 */
export function detectExpressionCycles(fields: FieldDefinition[]): string[][] {
  const byId = new Map(fields.map((f) => [f.id, f]))
  const cycles: string[][] = []
  const state = new Map<string, 'visiting' | 'done'>()

  function walk(id: string, path: string[]): void {
    const field = byId.get(id)
    if (!field || field.type !== 'expression') return

    const seen = state.get(id)
    if (seen === 'done') return
    if (seen === 'visiting') {
      const start = path.indexOf(id)
      cycles.push(path.slice(start === -1 ? 0 : start))
      return
    }

    state.set(id, 'visiting')
    for (const dep of expressionDependencies(field.expression)) {
      walk(dep, [...path, id])
    }
    state.set(id, 'done')
  }

  for (const field of fields) {
    if (field.type === 'expression') walk(field.id, [])
  }
  return cycles
}

export type ExpressionOperator = '+' | '-' | '*' | '/' | '^'

/**
 * An expression in the form the builder UI edits: one source column, one operator, and
 * either a literal or a second column.
 *
 * Most derived columns on a certificate are this shape - "sensor mV × 0.001", "reading
 * − offset". Asking an engineer to hand-write {fld-abc123} * 0.001 means knowing
 * internal field ids, so the UI composes the formula instead and only falls back to raw
 * text for anything more complex.
 */
/** Unary operations. They take the source column and nothing else. */
export type ExpressionFunction = 'log' | 'ln' | 'exp'

export function isExpressionFunction(
  operator: string,
): operator is ExpressionFunction {
  return operator === 'log' || operator === 'ln' || operator === 'exp'
}

export interface SimpleExpression {
  sourceId: string
  /** Binary (+ - * / ^) or unary (log ln exp); the operand is unused for unary. */
  operator: ExpressionOperator | ExpressionFunction
  /** A literal number, or another field's id. */
  operand: { kind: 'value'; value: string } | { kind: 'field'; fieldId: string }
}

export function buildSimpleExpression(expression: SimpleExpression): string {
  // An incomplete expression is stored as empty rather than as a broken formula, so
  // the cell renders blank. The builder keeps the half-finished state itself.
  if (!expression.sourceId) return ''

  if (isExpressionFunction(expression.operator)) {
    return `${expression.operator}({${expression.sourceId}})`
  }

  const right =
    expression.operand.kind === 'value'
      ? expression.operand.value.trim()
      : expression.operand.fieldId
        ? `{${expression.operand.fieldId}}`
        : ''
  if (right === '') return ''
  return `{${expression.sourceId}} ${expression.operator} ${right}`
}

const SIMPLE_FORM =
  /^\s*\{([^}]+)\}\s*([+\-*/^])\s*(?:\{([^}]+)\}|(-?\d*\.?\d+))\s*$/
const SIMPLE_UNARY_FORM = /^\s*(log|ln|exp)\s*\(\s*\{([^}]+)\}\s*\)\s*$/

/**
 * Read an expression back into builder form, or null when it is more complex.
 *
 * Round-tripping matters because a formula saved before the builder existed, or typed
 * into the raw fallback, still has to open in a sensible editor rather than being
 * silently rewritten.
 */
export function parseSimpleExpression(
  expression: string | undefined,
): SimpleExpression | null {
  if (!expression) return null

  const unary = SIMPLE_UNARY_FORM.exec(expression)
  if (unary) {
    const [, operator, sourceId] = unary
    return {
      sourceId,
      operator: operator as ExpressionFunction,
      // Carried so switching back to a binary operator has somewhere to start.
      operand: { kind: 'value', value: '' },
    }
  }

  const match = SIMPLE_FORM.exec(expression)
  if (!match) return null
  const [, sourceId, operator, fieldOperand, literalOperand] = match
  return {
    sourceId,
    operator: operator as ExpressionOperator,
    operand: fieldOperand
      ? { kind: 'field', fieldId: fieldOperand }
      : { kind: 'value', value: literalOperand },
  }
}

/**
 * Render a computed value at the resolution of the instrument that produced it.
 *
 * A calculated column is still a measurement, so it cannot carry more resolution than
 * the instrument it derives from: {reading} / 3 is not known to sixteen decimals just
 * because binary floating point produces sixteen. Rounding here also disposes of the
 * 0.1 + 0.2 = 0.30000000000000004 artefacts, which otherwise reach the certificate.
 */
export function formatToPrecision(value: number, precision: number): string {
  if (!Number.isFinite(value)) return ''
  return value.toFixed(Math.max(0, Math.min(20, precision)))
}

class ExpressionError extends Error {}

/**
 * log is base 10, which is what a calibration certificate means by "log" - decibels,
 * pH and sensor characterisations are all decadic. ln is spelled out separately so
 * neither has to be guessed at.
 */
const FUNCTIONS: Record<string, (x: number) => number> = {
  log: (x) => {
    if (x <= 0) throw new ExpressionError('log of a non-positive number')
    return Math.log10(x)
  },
  ln: (x) => {
    if (x <= 0) throw new ExpressionError('ln of a non-positive number')
    return Math.log(x)
  },
  /** e to the power x. */
  exp: (x) => Math.exp(x),
}

/** Function names, longest first, so a prefix never shadows a longer name. */
const FUNCTION_NAMES = Object.keys(FUNCTIONS).sort((a, b) => b.length - a.length)

/**
 * Evaluate an arithmetic expression over the row's values.
 *
 * Supports + - * / ^ parentheses, unary minus, decimal literals, {fieldId} references
 * and the functions log (base 10), ln and exp (e to the power x). Deliberately a small
 * recursive-descent parser rather than eval() or `new Function()`: expressions are
 * authored in the UI and stored on the certificate, so they are untrusted input that
 * must never reach a JavaScript interpreter.
 *
 * ^ is right-associative and binds tighter than unary minus, so -2^2 is -4 and
 * 2^3^2 is 512 - the conventions from written arithmetic rather than from JS.
 *
 * Returns null when the expression is malformed, references a missing or non-numeric
 * field, divides by zero, or leaves a function's domain (log or ln of a non-positive
 * number) - the cell renders blank rather than NaN.
 */
export function evaluateExpression(
  expression: string | undefined,
  values: Record<string, string>,
  options: { maxDepth?: number } = {},
): number | null {
  if (!expression || !expression.trim()) return null

  const tokens = tokenize(expression)
  if (!tokens) return null

  let position = 0
  const peek = () => tokens[position]
  const take = () => tokens[position++]

  function parseExpression(depth: number): number {
    if (depth > (options.maxDepth ?? 32)) throw new ExpressionError('too deep')
    let left = parseTerm(depth)
    while (peek() === '+' || peek() === '-') {
      const operator = take()
      const right = parseTerm(depth)
      left = operator === '+' ? left + right : left - right
    }
    return left
  }

  function parseTerm(depth: number): number {
    let left = parsePower(depth)
    while (peek() === '*' || peek() === '/') {
      const operator = take()
      const right = parsePower(depth)
      if (operator === '/') {
        if (right === 0) throw new ExpressionError('divide by zero')
        left = left / right
      } else {
        left = left * right
      }
    }
    return left
  }

  /**
   * Right-associative, and its right operand is a power in turn so 2^-1 parses. Unary
   * minus is handled in parseFactor and therefore binds looser: -2^2 is -(2^2).
   */
  function parsePower(depth: number): number {
    const base = parseFactor(depth)
    if (peek() !== '^') return base
    take()
    const exponent = parsePower(depth)
    const result = Math.pow(base, exponent)
    // e.g. (-8) ^ 0.5 - real-valued only, so a complex result is an error.
    if (Number.isNaN(result)) throw new ExpressionError('undefined power')
    return result
  }

  function parseFactor(depth: number): number {
    const token = peek()
    if (token === undefined) throw new ExpressionError('unexpected end')

    if (token === '-') {
      take()
      return -parsePower(depth)
    }
    if (token === '+') {
      take()
      return parsePower(depth)
    }
    if (FUNCTIONS[token]) {
      take()
      if (take() !== '(') throw new ExpressionError('function needs parentheses')
      const argument = parseExpression(depth + 1)
      if (take() !== ')') throw new ExpressionError('unbalanced parentheses')
      return FUNCTIONS[token](argument)
    }
    if (token === '(') {
      take()
      const value = parseExpression(depth + 1)
      if (take() !== ')') throw new ExpressionError('unbalanced parentheses')
      return value
    }
    if (token.startsWith('{')) {
      take()
      const id = token.slice(1, -1).trim()
      const raw = values[id]
      if (raw === undefined || raw.trim() === '') throw new ExpressionError('missing value')
      const parsed = Number(raw)
      if (!Number.isFinite(parsed)) throw new ExpressionError('non-numeric value')
      return parsed
    }

    const literal = Number(take())
    if (!Number.isFinite(literal)) throw new ExpressionError('bad literal')
    return literal
  }

  try {
    const result = parseExpression(0)
    if (position !== tokens.length) return null
    return Number.isFinite(result) ? result : null
  } catch {
    return null
  }
}

function tokenize(input: string): string[] | null {
  const tokens: string[] = []
  let index = 0

  while (index < input.length) {
    const char = input[index]

    if (/\s/.test(char)) {
      index += 1
      continue
    }
    if ('+-*/^()'.includes(char)) {
      tokens.push(char)
      index += 1
      continue
    }
    if (char === '{') {
      const close = input.indexOf('}', index)
      if (close === -1) return null
      tokens.push(input.slice(index, close + 1))
      index = close + 1
      continue
    }
    const name = FUNCTION_NAMES.find((fn) => input.startsWith(fn, index))
    if (name) {
      tokens.push(name)
      index += name.length
      continue
    }
    const number = /^\d*\.?\d+(?:[eE][-+]?\d+)?/.exec(input.slice(index))
    if (number) {
      tokens.push(number[0])
      index += number[0].length
      continue
    }
    return null
  }

  return tokens
}

// ---------------------------------------------------------------------------------
// Row computation
// ---------------------------------------------------------------------------------

/** Values for a row with every expression field resolved. */
export function resolveRowValues(
  row: CalibrationResultRow,
  fields: FieldDefinition[],
): Record<string, string> {
  const resolved = { ...row.values }
  // Expression fields may depend on other expression fields; a bounded number of
  // passes settles the chain without needing a topological sort. Cycles are caught
  // separately by detectExpressionCycles.
  for (let pass = 0; pass < fields.length + 1; pass += 1) {
    let changed = false
    for (const field of fields) {
      if (field.type !== 'expression') continue
      const value = evaluateExpression(field.expression, resolved)
      const text = value == null ? '' : String(value)
      if (resolved[field.id] !== text) {
        resolved[field.id] = text
        changed = true
      }
    }
    if (!changed) break
  }
  return resolved
}

/** Error for a row, or null when either referenced field is missing or non-numeric. */
export function computeRowError(
  row: CalibrationResultRow,
  fields: FieldDefinition[],
  errorConfig: ErrorConfig,
): number | null {
  if (!errorConfig.masterFieldId || !errorConfig.uucFieldId) return null

  const values = resolveRowValues(row, fields)
  const a = Number(values[errorConfig.masterFieldId])
  const b = Number(values[errorConfig.uucFieldId])

  if (
    values[errorConfig.masterFieldId] === undefined ||
    values[errorConfig.uucFieldId] === undefined ||
    values[errorConfig.masterFieldId].trim() === '' ||
    values[errorConfig.uucFieldId].trim() === '' ||
    !Number.isFinite(a) ||
    !Number.isFinite(b)
  ) {
    return null
  }

  return errorConfig.formula === 'A-B' ? a - b : b - a
}

export function createRow(pointNumber: number): CalibrationResultRow {
  return {
    id: nextId('row'),
    pointNumber,
    values: {},
    errorObserved: null,
    isOutOfLimit: false,
  }
}

// ---------------------------------------------------------------------------------
// Migration off the legacy shape
// ---------------------------------------------------------------------------------

export interface MigratedParameterFields {
  fieldDefinitions: FieldDefinition[]
  errorConfig: ErrorConfig
  rows: CalibrationResultRow[]
}

/**
 * Convert a parameter's legacy fixed columns into a field schema plus rows.
 *
 * standardReading becomes the master numeric field; beforeAdjustment the UUC field;
 * afterAdjustment a second UUC field, but only when the parameter actually used it -
 * adding an always-blank column to every migrated certificate would be worse than the
 * shape we are leaving.
 */
export function migrateLegacyResults(
  legacy: LegacyCalibrationResult[],
  options: { unit: string; showAfterAdjustment?: boolean },
): MigratedParameterFields {
  const usesAfter =
    options.showAfterAdjustment ??
    legacy.some((r) => (r.afterAdjustment ?? '').trim() !== '')

  const master: FieldDefinition = {
    id: nextId('fld'),
    name: 'Master Reading',
    group: 'master',
    type: 'numeric',
    unit: options.unit,
    order: 0,
  }
  const before: FieldDefinition = {
    id: nextId('fld'),
    name: usesAfter ? 'UUC Before Adjustment' : 'UUC Reading',
    group: 'uuc',
    type: 'numeric',
    unit: options.unit,
    order: 0,
  }
  const fieldDefinitions = [master, before]

  if (usesAfter) {
    fieldDefinitions.push({
      id: nextId('fld'),
      name: 'UUC After Adjustment',
      group: 'uuc',
      type: 'numeric',
      unit: options.unit,
      order: 1,
    })
  }

  const errorConfig: ErrorConfig = {
    masterFieldId: master.id,
    uucFieldId: before.id,
    formula: 'A-B',
    unit: options.unit,
  }

  const after = fieldDefinitions[2]
  const rows = legacy.map((result) => {
    const values: Record<string, string> = {
      [master.id]: result.standardReading ?? '',
      [before.id]: result.beforeAdjustment ?? '',
    }
    if (after) values[after.id] = result.afterAdjustment ?? ''
    return {
      id: result.id,
      pointNumber: result.pointNumber,
      values,
      errorObserved: result.errorObserved,
      isOutOfLimit: result.isOutOfLimit,
    }
  })

  return { fieldDefinitions, errorConfig, rows }
}

/**
 * Convert back to the legacy shape, for the API and PDF paths that still expect it.
 *
 * Only the two error-config fields and an "after adjustment" field can be represented;
 * anything else the user configured is dropped, so callers must not treat this as
 * lossless. It exists to keep the old write path working during the migration.
 */
export function toLegacyResults(
  rows: CalibrationResultRow[],
  fields: FieldDefinition[],
  errorConfig: ErrorConfig,
): LegacyCalibrationResult[] {
  const afterField = fields.find(
    (f) =>
      f.group === 'uuc' &&
      f.type === 'numeric' &&
      f.id !== errorConfig.uucFieldId,
  )

  return rows.map((row) => {
    const values = resolveRowValues(row, fields)
    return {
      id: row.id,
      pointNumber: row.pointNumber,
      standardReading: values[errorConfig.masterFieldId] ?? '',
      beforeAdjustment: values[errorConfig.uucFieldId] ?? '',
      afterAdjustment: afterField ? (values[afterField.id] ?? '') : '',
      errorObserved: row.errorObserved,
      isOutOfLimit: row.isOutOfLimit,
      // The three fields above are a projection for consumers that predate the dynamic
      // table; they cannot represent a fourth column. The raw values ride along so a
      // round trip through storage does not quietly drop one.
      values: row.values,
    }
  })
}
