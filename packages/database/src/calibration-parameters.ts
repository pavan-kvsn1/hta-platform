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
  /**
   * What is actually measured. Two parameters with different measurands are never
   * interchangeable however alike their units look: Flatness is recorded in µm and
   * Length in mm, and a flatness master cannot calibrate a length gauge.
   */
  measures: string
  /**
   * Which kind of that measurand, where there is more than one: DC against AC, RTD
   * against thermocouple, gauge against absolute. "any" means the parameter does not
   * say - a certificate reading "Temperature" does not record whether the instrument
   * has an RTD or a thermocouple input, so any kind will serve and the engineer
   * declares which was used.
   */
  kind: string
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
/** The kind that means the quantity itself, not one of its named variants. */
export const DIRECT_KIND = 'absolute'

const FROM_CERTIFICATES: Omit<ParameterStandard, 'source' | 'measures' | 'kind'>[] = [
  { standardName: 'pH', category: 'Other', units: ['pH'], defaultUnit: 'pH', subtypes: [], aliases: [] },
  { standardName: 'Inductance', category: 'Electrical', units: ['H', 'mH', 'µH'], defaultUnit: 'mH', subtypes: [], aliases: [] },
  { standardName: 'Torque', category: 'Mechanical', units: ['Nm', 'kgf·m', 'lbf·ft'], defaultUnit: 'Nm', subtypes: [], aliases: [] },
  { standardName: 'Vibration', category: 'Mechanical', units: ['mm/s', 'm/s²', 'µm'], defaultUnit: 'mm/s', subtypes: [], aliases: [] },
  { standardName: 'Force', category: 'Mechanical', units: ['N', 'kgf', 'lbf'], defaultUnit: 'N', subtypes: [], aliases: [] },
]


/**
 * What each parameter measures, and which kind of it.
 *
 * This is the fact that decides whether a master can serve a parameter, and it was
 * never recorded anywhere: it lived inside the registry's parameter name, where nothing
 * could read it. Matching on the name under-reached ("Vacuum" never appeared for a
 * Pressure parameter) and matching on the unit over-reached (an AC source was offered
 * for a DC parameter, both being volts). Neither is the instrument's fault; the fact
 * simply was not written down. Here it is.
 *
 * The rule it feeds: a master serves a parameter when the measurand is the same and
 * the kinds agree, counting "any" as agreement with everything.
 */
const CLASSIFICATION: Record<string, { measures: string; kind: string }> = {
  // Temperature. The same degrees Celsius reached three different ways, and a
  // thermocouple simulator cannot drive an RTD input.
  Temperature: { measures: 'temperature', kind: 'any' },
  Thermocouple: { measures: 'temperature', kind: 'thermocouple' },
  RTD: { measures: 'temperature', kind: 'rtd' },
  'Dew Point Temperature': { measures: 'dew point', kind: 'any' },

  // Pressure. Gauge and absolute differ by atmospheric pressure, so they are different
  // kinds; a vacuum gauge is an absolute one reading low. Differential pressure is a
  // difference between two points, which is not the same measurand at all.
  Pressure: { measures: 'pressure', kind: 'any' },
  'Gauge Pressure': { measures: 'pressure', kind: 'gauge' },
  // Vacuum is its own measurement, not a kind of pressure: the instruments that
  // do it are their own, and a pressure gauge is not a master for it.
  Vacuum: { measures: 'vacuum', kind: 'any' },
  // Its own kind rather than another 'absolute': the picker keys on measurand and
  // kind, so two parameters sharing both could not be told apart.
  'Ultra Vacuum': { measures: 'vacuum', kind: 'ultra' },
  'Differential Pressure': { measures: 'differential pressure', kind: 'any' },

  // Electrical. Volts are volts, but a DC source will not calibrate an AC meter.
  'DC Voltage': { measures: 'voltage', kind: 'dc' },
  'AC Voltage': { measures: 'voltage', kind: 'ac' },
  'DC Current': { measures: 'current', kind: 'dc' },
  'AC Current': { measures: 'current', kind: 'ac' },
  Resistance: { measures: 'resistance', kind: 'any' },
  Capacitance: { measures: 'capacitance', kind: 'any' },
  Inductance: { measures: 'inductance', kind: 'any' },
  Frequency: { measures: 'frequency', kind: 'any' },
  'Three-phase AC Power': { measures: 'power', kind: 'three-phase ac' },

  // Dimensional. All in millimetres or microns, and none of them interchangeable:
  // flatness and parallelness are geometric tolerances, not lengths.
  Length: { measures: 'length', kind: 'any' },
  Thickness: { measures: 'thickness', kind: 'any' },
  Displacement: { measures: 'displacement', kind: 'any' },
  Flatness: { measures: 'flatness', kind: 'any' },
  Parallelness: { measures: 'parallelness', kind: 'any' },
  'Particle Count': { measures: 'particle count', kind: 'any' },
  Angle: { measures: 'angle', kind: 'any' },
  'Level / Inclination': { measures: 'inclination', kind: 'any' },

  // Force and torque. A tension-only load cell cannot push.
  Force: { measures: 'force', kind: 'any' },
  'Force (Tension)': { measures: 'force', kind: 'tension' },
  'Force (Compression)': { measures: 'force', kind: 'compression' },
  Torque: { measures: 'torque', kind: 'any' },
  Mass: { measures: 'mass', kind: 'any' },
  Hardness: { measures: 'hardness', kind: 'any' },

  // Motion. Contact and non-contact tachometers are read differently.
  Speed: { measures: 'rotational speed', kind: 'any' },
  'Speed (Contact)': { measures: 'rotational speed', kind: 'contact' },
  'Speed (Non-Contact)': { measures: 'rotational speed', kind: 'non-contact' },
  Velocity: { measures: 'velocity', kind: 'any' },
  'Air Velocity': { measures: 'velocity', kind: 'air' },
  Acceleration: { measures: 'acceleration', kind: 'any' },
  Vibration: { measures: 'vibration', kind: 'any' },

  // Flow. One measurand, distinguished by what is flowing. Whether standard flow
  // (SLPM, Nm3/hr, referred to a stated temperature and pressure) can be compared with
  // actual volumetric flow is a units question, handled where the numbers are compared.
  Flow: { measures: 'flow', kind: 'any' },
  'Air Flow': { measures: 'flow', kind: 'air' },
  'Liquid Flow': { measures: 'flow', kind: 'liquid' },
  'Compressed Air Flow': { measures: 'flow', kind: 'compressed air' },

  // Time.
  Time: { measures: 'time', kind: 'any' },
  'Time Interval': { measures: 'time', kind: 'interval' },

  // Everything else measures its own thing.
  'Relative Humidity': { measures: 'relative humidity', kind: 'any' },
  'Moisture Content': { measures: 'moisture content', kind: 'any' },
  'Sound Pressure Level': { measures: 'sound level', kind: 'any' },
  'Light Intensity': { measures: 'illuminance', kind: 'any' },
  Conductivity: { measures: 'conductivity', kind: 'any' },
  pH: { measures: 'ph', kind: 'any' },
  CO2: { measures: 'co2', kind: 'any' },
}

/**
 * The kind a unit gives away on its own.
 *
 * "bar g" says gauge in the unit itself, so there is no need to write it down twice or
 * to remember it for a parameter that arrives with the next registry update.
 */
function kindFromUnit(units: string[]): string | null {
  const gauge = units.some((u) => /g\s*$/i.test(u.trim()) && /bar|pa/i.test(u))
  return gauge ? 'gauge' : null
}

/**
 * What a parameter measures and which kind it is.
 *
 * A parameter nobody has classified measures itself and accepts any kind: it will match
 * its own name and nothing else, which is the safe answer for something that arrives
 * with new master data before anyone has looked at it.
 */
export function classify(
  standardName: string,
  units: string[],
): { measures: string; kind: string } {
  const known = CLASSIFICATION[standardName]
  if (known) return known
  return { measures: standardName.trim().toLowerCase(), kind: kindFromUnit(units) ?? 'any' }
}

/**
 * Whether a master recorded against one parameter can serve another.
 *
 * The same measurand, and kinds that agree - where "any" agrees with everything,
 * because a parameter that does not say which kind it needs can be served by any of
 * them, and the engineer declares which was used.
 */
export function servesSameThing(
  a: { measures: string; kind: string },
  b: { measures: string; kind: string },
): boolean {
  if (a.measures !== b.measures) return false
  return a.kind === 'any' || b.kind === 'any' || a.kind === b.kind
}

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
/**
 * The "just this, plainly" kind, for measurands whose only unspecific option is `any`.
 *
 * `any` means the engineer did not say which kind, so any master serves - a Temperature
 * parameter matches an RTD calibrator and a thermocouple simulator as readily as a
 * plain thermometer. That is right when nothing was said, and wrong when the engineer
 * means the quantity itself and no variant of it: there was no way to say so, because
 * every kind on offer was a variant.
 *
 * So each blanket measurand gains one. Pressure already has it - "absolute" there is
 * Vacuum, a real and different measurement - and measurands with no variants at all
 * need nothing, since `any` and "plainly" say the same thing when there is nothing
 * else to be.
 *
 * The new standard inherits its units, category and subtypes from the `any` row it
 * accompanies: it is the same quantity, said more exactly.
 */
function directKinds(standards: ParameterStandard[]): ParameterStandard[] {
  const byMeasurand = new Map<string, ParameterStandard[]>()
  for (const standard of standards) {
    const list = byMeasurand.get(standard.measures) ?? []
    list.push(standard)
    byMeasurand.set(standard.measures, list)
  }

  const added: ParameterStandard[] = []
  for (const [, group] of byMeasurand) {
    const blanket = group.find((s) => s.kind === 'any')
    const variants = group.filter((s) => s.kind !== 'any')
    if (!blanket || variants.length === 0) continue
    if (variants.some((s) => s.kind === DIRECT_KIND)) continue
    added.push({
      ...blanket,
      standardName: `${blanket.standardName} (Absolute)`,
      kind: DIRECT_KIND,
      aliases: [],
    })
  }
  return added
}

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
    const offered = [...new Set(recorded)].sort()
    return {
      standardName,
      category: CATEGORIES[standardName] ?? 'Other',
      ...classify(standardName, offered),
      units: offered,
      defaultUnit: commonest(recorded),
      subtypes: [...(subtypes.get(standardName) ?? [])].sort(),
      aliases: (aliasesFor.get(standardName) ?? []).sort(),
      source: 'registry',
    }
  })

  const known = new Set(fromRegistry.map((s) => s.standardName))
  const extra: ParameterStandard[] = FROM_CERTIFICATES.filter(
    (s) => !known.has(s.standardName),
  ).map((s) => ({ ...s, ...classify(s.standardName, s.units), source: 'certificates' }))

  return [...fromRegistry, ...extra, ...directKinds([...fromRegistry, ...extra])].sort(
    (a, b) => a.category.localeCompare(b.category) || a.standardName.localeCompare(b.standardName),
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
