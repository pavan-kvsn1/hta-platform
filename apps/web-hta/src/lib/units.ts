/**
 * What quantity a unit measures.
 *
 * Capabilities were matched to parameters by name alone, on a substring. That both
 * misses and over-reaches against this lab's own registry:
 *
 *   - "Vacuum", recorded in bar and in Pa, never appeared for a Pressure parameter,
 *     because the word "pressure" is not in its name. Seven such profiles exist.
 *   - "Sound Pressure Level", recorded in dB, appeared for every Pressure parameter,
 *     because the word is. An acoustics meter is not a candidate for calibrating a
 *     pressure gauge.
 *
 * The unit settles both: it is the one part of a capability that says what is being
 * measured rather than what somebody called it.
 *
 * This file answers only "are these the same quantity". It deliberately does not
 * convert between them - see the note on gauge pressure below.
 */

/**
 * Units by the quantity they measure. Written as they appear in the registry and on
 * certificates, and normalised before lookup.
 */
const FAMILIES: Record<string, string[]> = {
  pressure: [
    'pa', 'hpa', 'kpa', 'mpa', 'bar', 'mbar', 'ubar', 'psi', 'psig', 'torr', 'atm',
    'mmhg', 'mmwc', 'mmh2o', 'inh2o', 'kg/cm2', 'kgf/cm2',
    // Gauge pressure sits here for the purpose of asking "is this a pressure
    // instrument", which it plainly is. It is a different question from whether its
    // numbers can be compared with an absolute reading, which they cannot without
    // knowing the ambient pressure - and this file does not claim they can.
    'barg', 'mbarg', 'kpag',
  ],
  temperature: ['degc', 'degf', 'degk', 'c', 'k'],
  'volumetric flow': ['l/min', 'lpm', 'l/h', 'l/hr', 'ml/min', 'm3/h', 'm3/hr', 'cfm', 'lps'],
  // Standard and normal flows are referred to a stated temperature and pressure. They
  // are not interchangeable with an actual volumetric flow, so they answer only to
  // each other.
  'standard flow': ['slpm', 'nm3/h', 'nm3/hr', 'nl/min', 'sccm'],
  mass: ['kg', 'g', 'mg', 'ug', 't', 'lb'],
  force: ['n', 'kn', 'kgf', 'lbf'],
  length: ['m', 'cm', 'mm', 'um', 'nm', 'in', 'ft'],
  time: ['s', 'ms', 'min', 'h', 'hr'],
  voltage: ['v', 'mv', 'kv', 'uv'],
  current: ['a', 'ma', 'ua', 'ka'],
  resistance: ['ohm', 'kohm', 'mohm', 'gohm'],
  capacitance: ['f', 'uf', 'nf', 'pf'],
  inductance: ['h', 'mh', 'uh'],
  frequency: ['hz', 'khz', 'mhz', 'ghz'],
  'rotational speed': ['rpm', 'rps'],
  velocity: ['m/s', 'mm/s', 'km/h', 'ft/min'],
  acceleration: ['m/s2', 'g'],
  power: ['w', 'kw', 'mw'],
  'relative humidity': ['%rh', 'rh'],
  conductivity: ['us/cm', 'ms/cm', 's/m'],
  acidity: ['ph'],
  'sound level': ['db', 'dba', 'dbc'],
  illuminance: ['lux', 'lx', 'fc'],
  angle: ['deg', 'rad', 'mrad', 'arcmin', 'arcsec'],
  concentration: ['ppm', 'ppb', '%'],
}

/**
 * Symbols that mean different things depending on their case, resolved deliberately
 * rather than by whichever family happens to be declared first.
 *
 * Checked before the symbol is lowercased, and only against the whole unit: "mH" is
 * unambiguous and goes the ordinary way.
 */
const BY_CASE: Record<string, string> = {
  H: 'inductance', // henry
  h: 'time', // hour - four profiles record one
  F: 'capacitance', // farad
  G: 'acceleration', // g-force
  g: 'mass', // gram - six profiles record one
  C: 'temperature', // read as celsius here, not coulomb
}

/** Symbol to family, built once. */
const FAMILY_OF = new Map<string, string>()
for (const [family, symbols] of Object.entries(FAMILIES)) {
  for (const symbol of symbols) {
    // First definition wins, so an ambiguous symbol keeps the family declared first.
    if (!FAMILY_OF.has(symbol)) FAMILY_OF.set(symbol, family)
  }
}

/**
 * A unit reduced to a comparable key.
 *
 * The same quantity is written many ways across the registry and the certificates -
 * "°C" and "degC", "m³/h" and "m3/hr", "µS/cm" and "uS/cm", "bar g" and "barg" - and
 * none of those differences mean anything.
 */
export function normaliseUnit(unit?: string | null): string {
  return (unit ?? '')
    .trim()
    .replace(/µ/g, 'u')
    .replace(/Ω|ω/g, 'ohm')
    // Kept rather than stripped: a bare "°" is an angle, and stripping it made a unit
    // that exists read as one that was never recorded.
    .replace(/°/g, 'deg')
    .replace(/³/g, '3')
    .replace(/²/g, '2')
    .replace(/\s+/g, '')
    .toLowerCase()
}

/** The quantity a unit measures, or null where the unit is unknown to us. */
export function unitFamily(unit?: string | null): string | null {
  const raw = (unit ?? '').trim()
  if (!raw) return null
  const byCase = BY_CASE[raw]
  if (byCase) return byCase
  const key = normaliseUnit(raw)
  if (!key) return null
  return FAMILY_OF.get(key) ?? null
}

/**
 * Whether two units measure the same quantity.
 *
 * Two unrecognised units count as the same only if they are written the same way: an
 * exact match is evidence, a shared ignorance is not.
 */
export function sameQuantity(a?: string | null, b?: string | null): boolean {
  const left = normaliseUnit(a)
  const right = normaliseUnit(b)
  if (!left || !right) return false
  if (left === right) return true

  const leftFamily = unitFamily(a)
  const rightFamily = unitFamily(b)
  return leftFamily !== null && leftFamily === rightFamily
}

/**
 * Whether two units are known well enough to say they measure *different* things.
 *
 * Used to overrule a name that matched: "Sound Pressure Level" contains the word
 * pressure, but dB and Pa are both units we recognise and they are not the same
 * quantity, so the name is wrong. Where either unit is unrecognised nothing is claimed,
 * and the name stands.
 */
export function knownToDiffer(a?: string | null, b?: string | null): boolean {
  const leftFamily = unitFamily(a)
  const rightFamily = unitFamily(b)
  if (!leftFamily || !rightFamily) return false
  return leftFamily !== rightFamily
}
