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
