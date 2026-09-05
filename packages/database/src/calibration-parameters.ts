/**
 * The parameters a lab can calibrate, derived from the master instrument registry.
 *
 * These become CalibrationParameterStandard rows: one list, seeded once, shared by
 * every tenant, with each tenant free to rename them for its own engineers.
 *
 * Two things the scope document did not anticipate, both found by comparing the
 * registry against what this lab has actually been doing:
 *
 *  1. The registry holds 47 parameters, not 41, and it is not a superset of what
 *     certificates use. It records no pH, Inductance, Torque or Vibration, and
 *     certificates exist for pH and Inductance. Seeding from the registry alone would
 *     leave those certificates naming a parameter the system no longer knows.
 *
 *  2. The two vocabularies disagree on names for the same quantity. Certificates say
 *     "Voltage DC" where the registry says "DC Voltage"; "Humidity" against "Relative
 *     Humidity"; "Sound Level" against "Sound Pressure Level"; "Lux" against "Light
 *     Intensity". Matching a certificate's parameter to a master's capability by name
 *     would fail on every one of them, which is the failure this whole exercise exists
 *     to prevent.
 *
 * So each standard carries the names it is also known by. The registry name is the
 * standard one, because that is what the masters are recorded against, and the names
 * already written on certificates become aliases pointing at it.
 */

export interface RegistryLikeProfile {
  parameter: string
  unit?: string | null
  subtypes?: { id: string }[] | null
}

export interface RegistryLikeUnit {
  capability_profiles?: RegistryLikeProfile[] | null
}

export interface RegistryLikeAsset {
  units?: RegistryLikeUnit[] | null
}

export interface RegistryLike {
  assets?: RegistryLikeAsset[] | null
}

export interface ParameterStandard {
  standardName: string
  category: string
  units: string[]
  defaultUnit: string | null
  subtypes: string[]
  /** Other names the same quantity is known by, including ones already on certificates. */
  aliases: string[]
  /** Where this standard came from, so a later registry update can tell them apart. */
  source: 'registry' | 'certificates'
}

/**
 * Which group a parameter belongs to, for the grouped dropdown the UUC section shows.
 *
 * Keyed on the standard name. A parameter with no entry falls to "Other", which is
 * honest: an unclassified parameter is still usable, and guessing its category from
 * its name is how "Sound Pressure Level" ended up filed under pressure.
 */
const CATEGORIES: Record<string, string> = {
  Temperature: 'Temperature',
  Thermocouple: 'Temperature',
  RTD: 'Temperature',
  'Dew Point Temperature': 'Temperature',
  'Relative Humidity': 'Humidity',
  'Moisture Content': 'Humidity',
  Pressure: 'Pressure',
  'Differential Pressure': 'Pressure',
  'Gauge Pressure': 'Pressure',
  Vacuum: 'Pressure',
  'Ultra Vacuum': 'Pressure',
  'DC Voltage': 'Electrical',
  'AC Voltage': 'Electrical',
  'DC Current': 'Electrical',
  'AC Current': 'Electrical',
  Resistance: 'Electrical',
  Capacitance: 'Electrical',
  Inductance: 'Electrical',
  Frequency: 'Electrical',
  'Three-phase AC Power': 'Electrical',
  Mass: 'Mechanical',
  Length: 'Mechanical',
  Thickness: 'Mechanical',
  Displacement: 'Mechanical',
  Flatness: 'Mechanical',
  Parallelness: 'Mechanical',
  Angle: 'Mechanical',
  Hardness: 'Mechanical',
  'Force (Tension)': 'Mechanical',
  'Force (Compression)': 'Mechanical',
  Torque: 'Mechanical',
  'Speed (Contact)': 'Mechanical',
  'Speed (Non-Contact)': 'Mechanical',
  Speed: 'Mechanical',
  Velocity: 'Mechanical',
  Acceleration: 'Mechanical',
  Vibration: 'Mechanical',
  'Level / Inclination': 'Mechanical',
  Flow: 'Flow',
  'Air Flow': 'Flow',
  'Liquid Flow': 'Flow',
  'Compressed Air Flow': 'Flow',
  'Air Velocity': 'Flow',
  Time: 'Time',
  'Time Interval': 'Time',
  'Sound Pressure Level': 'Other',
  'Light Intensity': 'Other',
  Conductivity: 'Other',
  pH: 'Other',
  'Particle Count': 'Other',
  CO2: 'Other',
}

/**
 * Names already written on certificates, against the registry name for the same thing.
 *
 * Only where the two genuinely mean one quantity. "Speed" is left alone rather than
 * folded into "Speed (Contact)" or "Speed (Non-Contact)", because a certificate saying
 * "Speed" does not say which, and inventing the answer would be worse than leaving it
 * as its own parameter.
 */
const ALIASES: Record<string, string> = {
  'Voltage DC': 'DC Voltage',
  'Voltage AC': 'AC Voltage',
  'Current DC': 'DC Current',
  'Current AC': 'AC Current',
  Humidity: 'Relative Humidity',
  'Sound Level': 'Sound Pressure Level',
  Lux: 'Light Intensity',
}

/**
 * Parameters certificates use that the registry does not record.
 *
 * No master in this lab records them, so nothing can be checked against a master - but
 * a certificate that names one still has to open, and an engineer still has to be able
 * to choose it. Kept, and marked as coming from the certificates rather than the
 * registry, so it is clear which are backed by a master and which are not.
 */
const FROM_CERTIFICATES: Omit<ParameterStandard, 'source'>[] = [
  { standardName: 'pH', category: 'Other', units: ['pH'], defaultUnit: 'pH', subtypes: [], aliases: [] },
  { standardName: 'Inductance', category: 'Electrical', units: ['H', 'mH', 'µH'], defaultUnit: 'mH', subtypes: [], aliases: [] },
  { standardName: 'Torque', category: 'Mechanical', units: ['Nm', 'kgf·m', 'lbf·ft'], defaultUnit: 'Nm', subtypes: [], aliases: [] },
  { standardName: 'Vibration', category: 'Mechanical', units: ['mm/s', 'm/s²', 'µm'], defaultUnit: 'mm/s', subtypes: [], aliases: [] },
  { standardName: 'Force', category: 'Mechanical', units: ['N', 'kgf', 'lbf'], defaultUnit: 'N', subtypes: [], aliases: [] },
]

/** The unit a parameter is most often recorded in, which makes the better default. */
function commonest(values: string[]): string | null {
  if (values.length === 0) return null
  const counts = new Map<string, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0]
}

/**
 * Every parameter a lab can calibrate: those the registry records, plus those only the
 * certificates know about.
 */
export function deriveParameterStandards(registry: RegistryLike): ParameterStandard[] {
  const units = new Map<string, string[]>()
  const subtypes = new Map<string, Set<string>>()

  for (const asset of registry.assets ?? []) {
    for (const unit of asset.units ?? []) {
      for (const profile of unit.capability_profiles ?? []) {
        const name = profile.parameter?.trim()
        if (!name) continue
        if (!units.has(name)) units.set(name, [])
        if (!subtypes.has(name)) subtypes.set(name, new Set())
        // Every occurrence counts, so the commonest unit wins the default.
        if (profile.unit?.trim()) units.get(name)!.push(profile.unit.trim())
        for (const subtype of profile.subtypes ?? []) {
          if (subtype?.id) subtypes.get(name)!.add(subtype.id)
        }
      }
    }
  }

  const aliasesFor = new Map<string, string[]>()
  for (const [alias, standard] of Object.entries(ALIASES)) {
    if (!aliasesFor.has(standard)) aliasesFor.set(standard, [])
    aliasesFor.get(standard)!.push(alias)
  }

  const fromRegistry: ParameterStandard[] = [...units.keys()].map((standardName) => {
    const recorded = units.get(standardName) ?? []
    return {
      standardName,
      category: CATEGORIES[standardName] ?? 'Other',
      units: [...new Set(recorded)].sort(),
      defaultUnit: commonest(recorded),
      subtypes: [...(subtypes.get(standardName) ?? [])].sort(),
      aliases: (aliasesFor.get(standardName) ?? []).sort(),
      source: 'registry',
    }
  })

  const known = new Set(fromRegistry.map((s) => s.standardName))
  const extra: ParameterStandard[] = FROM_CERTIFICATES.filter(
    (s) => !known.has(s.standardName),
  ).map((s) => ({ ...s, source: 'certificates' }))

  return [...fromRegistry, ...extra].sort((a, b) =>
    a.category.localeCompare(b.category) || a.standardName.localeCompare(b.standardName),
  )
}

/**
 * The standard name a written name refers to, matching however it was capitalised or
 * spaced. Returns null when nothing claims it, which the caller should treat as "leave
 * it as the engineer wrote it" rather than as an error.
 */
export function resolveStandardName(
  written: string,
  standards: Pick<ParameterStandard, 'standardName' | 'aliases'>[],
): string | null {
  const key = written.trim().toLowerCase()
  if (!key) return null
  for (const standard of standards) {
    if (standard.standardName.toLowerCase() === key) return standard.standardName
    if (standard.aliases.some((alias) => alias.toLowerCase() === key)) return standard.standardName
  }
  return null
}
