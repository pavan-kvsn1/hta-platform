/**
 * Moving between the name an engineer reads and the name the masters are recorded
 * against.
 *
 * A lab may call the standard "RTD" whatever it likes - "Platinum RTD", "Temp Ref" -
 * and its certificates are written with that name. The master registry knows only
 * "RTD". So every comparison against a master goes through here first, and everything
 * shown to a person comes back through it.
 *
 * Three things this has to survive, all of them real:
 *
 *   - A lab renaming a parameter after certificates were written with the old name.
 *   - The registry and the certificates disagreeing from the start: "Voltage DC"
 *     against "DC Voltage", "Humidity" against "Relative Humidity".
 *   - A parameter that is on a certificate and in no list at all, because it was typed
 *     before any of this existed.
 *
 * The last one decides the shape of the answer: nothing here throws or substitutes. An
 * unknown name is returned as it was written, because a certificate that says
 * "Blancmange" is a certificate about blancmange, and silently turning it into
 * something else would be worse than not knowing.
 */

export interface CalibrationParameter {
  id: string
  /** What the master registry calls it. */
  standardName: string
  /** What this lab calls it. */
  customName: string
  category: string
  /** What is measured - temperature, voltage, pressure. */
  measures: string
  /** Which kind of it - dc, ac, rtd, thermocouple, gauge; "any" where unspecified. */
  kind: string
  units: string[]
  defaultUnit: string | null
  subtypes: string[]
  /** Other names for the same quantity, from the registry and from older certificates. */
  aliases: string[]
  /** 'registry' where a master records it; 'certificates' where none does. */
  source: string
  active: boolean
}

const key = (name: string) => name.trim().toLowerCase()

/**
 * The standard name behind a written one, matching the lab's own name, the standard
 * itself, or any alias. Returns what it was given when nothing claims it.
 */
export function toStandardName(
  written: string,
  parameters: CalibrationParameter[],
): string {
  const wanted = key(written)
  if (!wanted) return written

  for (const parameter of parameters) {
    if (key(parameter.customName) === wanted) return parameter.standardName
    if (key(parameter.standardName) === wanted) return parameter.standardName
    if (parameter.aliases.some((alias) => key(alias) === wanted)) return parameter.standardName
  }
  return written
}

/** The name this lab reads, given a standard one. Unchanged when nothing claims it. */
export function toCustomName(
  standardName: string,
  parameters: CalibrationParameter[],
): string {
  const wanted = key(standardName)
  if (!wanted) return standardName

  const match = parameters.find(
    (p) =>
      key(p.standardName) === wanted ||
      p.aliases.some((alias) => key(alias) === wanted),
  )
  return match ? match.customName : standardName
}

/** The whole parameter behind a written name, for its units and subtypes. */
export function findParameter(
  written: string,
  parameters: CalibrationParameter[],
): CalibrationParameter | null {
  const wanted = key(written)
  if (!wanted) return null

  return (
    parameters.find(
      (p) =>
        key(p.customName) === wanted ||
        key(p.standardName) === wanted ||
        p.aliases.some((alias) => key(alias) === wanted),
    ) ?? null
  )
}

/**
 * The list grouped for a dropdown, in the order the groups were given.
 *
 * A flat list of 52 is not something anyone reads; grouped by what is being measured,
 * it is.
 */
export function groupByCategory(
  parameters: CalibrationParameter[],
): { category: string; parameters: CalibrationParameter[] }[] {
  const groups = new Map<string, CalibrationParameter[]>()
  for (const parameter of parameters) {
    if (!groups.has(parameter.category)) groups.set(parameter.category, [])
    groups.get(parameter.category)!.push(parameter)
  }
  return [...groups.entries()].map(([category, list]) => ({ category, parameters: list }))
}

/**
 * The units on offer for a parameter as it is written on a certificate.
 *
 * Three sources, in order, and the order is the point:
 *
 *   1. The lab's list, matched through its own name, the standard, or an alias - so a
 *      certificate saved as "Voltage DC" finds the units of "DC Voltage".
 *   2. The table the form shipped with, for when the list has not loaded. A slow fetch
 *      must not cost an engineer the ability to fill in a certificate.
 *   3. The unit already saved. For a parameter nobody recognises this is the only
 *      record of what was measured; dropping it because the name is unfamiliar would
 *      throw away the reading.
 */
export function unitsForParameter(
  parameterName: string,
  savedUnit: string | undefined,
  parameters: CalibrationParameter[],
  fallback: Record<string, { units: string[] }>,
): string[] {
  const known = findParameter(parameterName, parameters)
  if (known && known.units.length > 0) return known.units

  const shipped = fallback[parameterName]?.units
  if (shipped && shipped.length > 0) return shipped

  return savedUnit ? [savedUnit] : []
}

/** The unit to select when a parameter is chosen: the lab's default, else the old one. */
export function defaultUnitForParameter(
  parameterName: string,
  parameters: CalibrationParameter[],
  fallback: Record<string, { defaultUnit?: string }>,
): string {
  const known = findParameter(parameterName, parameters)
  return known?.defaultUnit ?? fallback[parameterName]?.defaultUnit ?? ''
}

/**
 * What a name measures and which kind it is, for deciding whether a master serves it.
 *
 * Both sides of that question go through here - the parameter written on the
 * certificate, and the capability recorded against the master - because the standards
 * were seeded from the registry's own names, so a capability called "AC Voltage" finds
 * the same row an engineer sees. Null for a name in neither, which is the caller's cue
 * to fall back on the older, rougher rule rather than to refuse.
 */
export function classificationOf(
  written: string,
  parameters: CalibrationParameter[],
): { measures: string; kind: string } | null {
  const found = findParameter(written, parameters)
  if (!found || !found.measures) return null
  return { measures: found.measures, kind: found.kind || 'any' }
}

/**
 * Whether a master recorded against one parameter can serve another: the same thing
 * measured, and kinds that agree - "any" agreeing with everything, because a
 * certificate that does not say which kind it needs can be served by any of them.
 */
export function servesSameThing(
  a: { measures: string; kind: string },
  b: { measures: string; kind: string },
): boolean {
  if (a.measures !== b.measures) return false
  return a.kind === 'any' || b.kind === 'any' || a.kind === b.kind
}

/** One thing this lab measures, for the first question the UUC section asks. */
export interface Measurand {
  /** The key parameters share - 'temperature', 'voltage'. */
  measures: string
  /** What to call it on screen. */
  label: string
  category: string
}

/** Title case for a measurand key that has no parameter named after it. */
function titleCase(key: string): string {
  return key
    .split(' ')
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word))
    .join(' ')
}

/**
 * The distinct things this lab measures.
 *
 * Fewer than the parameters: temperature is one thing measured three ways, pressure one
 * thing in four kinds. Asking what is measured before asking which kind turns a flat
 * list of near-twins into two short questions, and makes the second one - which decides
 * what masters are offered - something the engineer is actually asked rather than
 * something they fall into.
 *
 * The label prefers the parameter that names the measurand outright, so temperature
 * reads "Temperature" rather than a manufactured word; where no parameter does - there
 * is no plain "Voltage", only DC and AC - the key is used.
 */
export function measurandsOf(parameters: CalibrationParameter[]): Measurand[] {
  const seen = new Map<string, Measurand>()
  for (const parameter of parameters) {
    const measures = parameter.measures || parameter.standardName.toLowerCase()
    const existing = seen.get(measures)
    // The one that does not specify a kind is the one that names the measurand.
    if (!existing) {
      seen.set(measures, {
        measures,
        label: parameter.kind === 'any' ? parameter.customName : titleCase(measures),
        category: parameter.category,
      })
    } else if (parameter.kind === 'any') {
      existing.label = parameter.customName
    }
  }
  return [...seen.values()]
}

/**
 * The kinds of one measurand, in the order they should be offered.
 *
 * One entry means there is nothing to ask: the caller shows no second question, exactly
 * as the master declaration does not ask a question with one answer.
 */
export function kindsFor(
  measures: string,
  parameters: CalibrationParameter[],
): CalibrationParameter[] {
  return parameters.filter(
    (p) => (p.measures || p.standardName.toLowerCase()) === measures,
  )
}

/** The parameter a measurand and kind resolve to - what the certificate stores. */
export function standardFor(
  measures: string,
  kind: string,
  parameters: CalibrationParameter[],
): CalibrationParameter | null {
  return (
    kindsFor(measures, parameters).find((p) => (p.kind || 'any') === kind) ?? null
  )
}

/**
 * The kind to start on when a measurand is chosen.
 *
 * The one that does not specify, where there is one - a certificate should not claim
 * the instrument is a thermocouple because thermocouple happened to sort first.
 */
export function defaultKindFor(
  measures: string,
  parameters: CalibrationParameter[],
): CalibrationParameter | null {
  const kinds = kindsFor(measures, parameters)
  return kinds.find((p) => (p.kind || 'any') === 'any') ?? kinds[0] ?? null
}
