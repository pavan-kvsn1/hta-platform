/**
 * What each master instrument can do, read out of the master instrument registry.
 *
 * The database cannot produce this from what it already holds. For the same instrument:
 *
 *   database  rangeData: [{ referencedoc: "Refer the Manual" }]
 *   registry  10 capability profiles, 4 of them with subtypes, each bucket carrying
 *             its own least count and accuracy
 *
 * So the registry is the only source for the first load. After that the database owns
 * capabilities and admins edit them in the app - see decision 1 of
 * docs/scope/master-instrument-model-decisions.md - which is why every profile records
 * where it came from.
 *
 * This module is pure: it reads the registry and returns rows to write. Nothing here
 * touches the database, so the mapping can be tested on its own.
 */

/** One end of a span, and whether the end itself is included. */
export interface Bound {
  min: number | null
  max: number | null
  minInclusive: boolean
  maxInclusive: boolean
}

export type AccuracyKind = 'SYMMETRIC' | 'FORMULA' | 'CLASS'
export type CapabilityKind = 'RANGE' | 'ARTIFACT'
export type CapabilityRole = 'MEASURING' | 'SOURCE'
export type ComponentRole = 'INDICATOR' | 'SENSOR'

export interface BucketRow extends Bound {
  bucketKey: string
  /** Null where the registry declares none. 121 of 1564 buckets declare none. */
  leastCountValue: number | null
  leastCountUnit: string | null
  /** Null where the registry declares no accuracy at all. 31 buckets. */
  accuracyKind: AccuracyKind | null
  accuracyValue: number | null
  accuracyUnit: string | null
  accuracyPolarity: string | null
  accuracyFormula: string | null
  /** The same accuracy as arithmetic, where the parts below cannot hold its shape. */
  accuracyExpression: string | null
  /** The parts behind a formula: what resolveAccuracy computes with. */
  accuracyPercentOf: string | null
  accuracyPercentValue: number | null
  accuracyDigits: number | null
  accuracyDigitsUnit: string | null
  accuracyClass: string | null
  sortOrder: number
}

export interface SubtypeRow extends Bound {
  subtypeKey: string
  sortOrder: number
  buckets: BucketRow[]
}

export interface ProfileRow extends Bound {
  profileKey: string
  parameter: string
  role: CapabilityRole
  unit: string
  kind: CapabilityKind
  subtypeKind: string | null
  /** "indicator" | "sensor" - which half of a two-part instrument this describes. */
  part: string | null
  /** How it measures where one instrument measures two ways: "height", "outside". */
  mode: string | null
  sopReferences: string[]
  sortOrder: number
  subtypes: SubtypeRow[]
  /** Buckets hanging straight off the profile, i.e. when it has no subtypes. */
  buckets: BucketRow[]
}

export interface ComponentRow {
  componentKey: string
  role: ComponentRole
  make: string | null
  model: string | null
  serialNumber: string | null
  sortOrder: number
}

/** Everything to write for one registry unit, keyed by the legacy id it joins on. */
export interface UnitCapabilities {
  legacyId: number
  assetNo: string
  description: string
  profiles: ProfileRow[]
  components: ComponentRow[]
}

// ---------------------------------------------------------------------------
// The registry's own shapes, only as far as this module reads them.
// ---------------------------------------------------------------------------

interface RawLeastCount {
  value?: number | null
  unit?: string | null
}

/**
 * As the registry file writes it.
 *
 * This declared `formula?: string` for a key the file has never had, so `a.formula`
 * read undefined and every one of the 120 formula accuracies seeded with a null
 * sentence. Nothing caught it: the interface is hand-written and the JSON is untyped,
 * so the two were free to disagree.
 *
 * The four parsed parts were in the file the whole time. There were no columns for
 * them, so they were dropped as well.
 */
interface RawAccuracy {
  type?: string | null
  value?: number | null
  unit?: string | null
  polarity?: string | null
  /** The sentence a certificate prints, e.g. "+/-(0.05% rdg + 1d)". */
  expression?: string | null
  /** The same accuracy as arithmetic over {reading} {full scale} {span} {least count}. */
  evaluable?: string | null
  /** What the percentage is of: "reading" | "full_scale" | "span" - and, in data
   *  predating the cleanup, "fsd" | "rh" | "hd", which nothing can compute with. */
  percent_of?: string | null
  /** As a fraction: 0.0005 for 0.05%. */
  percent_value?: number | null
  /** The trailing term. A count of the least count where digits_unit says so. */
  digits?: number | null
  digits_unit?: string | null
  class?: string | null
}

interface RawBucket {
  id?: string | null
  min?: number | null
  max?: number | null
  min_inclusive?: boolean | null
  max_inclusive?: boolean | null
  least_count?: RawLeastCount | null
  accuracy?: RawAccuracy | null
}

interface RawSubtype {
  id?: string | null
  min?: number | null
  max?: number | null
  min_inclusive?: boolean | null
  max_inclusive?: boolean | null
  buckets?: RawBucket[] | null
}

interface RawProfile {
  id?: string | null
  parameter?: string | null
  role?: string | null
  unit?: string | null
  kind?: string | null
  min?: number | null
  max?: number | null
  min_inclusive?: boolean | null
  max_inclusive?: boolean | null
  subtype_kind?: string | null
  component?: string | null
  mode?: string | null
  subtypes?: RawSubtype[] | null
  buckets?: RawBucket[] | null
}

interface RawParts {
  ind?: string | null
  sen?: string | null
}

interface RawUnit {
  legacy_id?: number | null
  instrument_desc?: string | null
  asset_type?: string | null
  make?: string | null
  make_parts?: RawParts | null
  model?: string | null
  model_parts?: RawParts | null
  serial_no?: string | null
  serial_parts?: RawParts | null
  sop_references?: string[] | null
  capability_profiles?: RawProfile[] | null
}

interface RawAsset {
  asset_no?: string | null
  units?: RawUnit[] | null
}

export interface CapabilityRegistry {
  assets?: RawAsset[] | null
}

// ---------------------------------------------------------------------------

function bound(x: {
  min?: number | null
  max?: number | null
  min_inclusive?: boolean | null
  max_inclusive?: boolean | null
}): Bound {
  return {
    min: x.min ?? null,
    max: x.max ?? null,
    // The registry omits these only where both ends are meant to be included.
    minInclusive: x.min_inclusive ?? true,
    maxInclusive: x.max_inclusive ?? true,
  }
}

/**
 * Accuracy comes in three shapes and they do not share fields. Reading them into one
 * nullable set of columns keeps the distinction the data makes: ±0.6 °C is a number,
 * "±(0.02% of reading + 2 counts)" is a sentence, and "Class 1" is neither.
 */
function accuracy(a: RawAccuracy | null | undefined): Pick<
  BucketRow,
  | 'accuracyKind'
  | 'accuracyValue'
  | 'accuracyUnit'
  | 'accuracyPolarity'
  | 'accuracyFormula'
  | 'accuracyExpression'
  | 'accuracyPercentOf'
  | 'accuracyPercentValue'
  | 'accuracyDigits'
  | 'accuracyDigitsUnit'
  | 'accuracyClass'
> {
  const none = {
    accuracyKind: null,
    accuracyValue: null,
    accuracyUnit: null,
    accuracyPolarity: null,
    accuracyFormula: null,
    accuracyExpression: null,
    accuracyPercentOf: null,
    accuracyPercentValue: null,
    accuracyDigits: null,
    accuracyDigitsUnit: null,
    accuracyClass: null,
  }
  if (!a || !a.type) return none

  switch (a.type) {
    case 'symmetric':
      return {
        ...none,
        accuracyKind: 'SYMMETRIC',
        accuracyValue: a.value ?? null,
        accuracyUnit: a.unit ?? null,
        accuracyPolarity: a.polarity ?? '±',
      }
    case 'formula':
      /**
       * The sentence and the numbers behind it - two jobs, and both are needed.
       *
       * The sentence is kept verbatim because the certificate reproduces it exactly;
       * re-wording what the calibrating lab wrote is not ours to do. The numbers are
       * taken as the registry already parsed them rather than parsed again here, so
       * there is one parse to keep right instead of two that can drift.
       *
       * A formula with no numbers still gets its sentence. A certificate can print
       * "+/-(0.004 x t)" perfectly well even where the app cannot compute with it.
       */
      return {
        ...none,
        accuracyKind: 'FORMULA',
        accuracyFormula: a.expression ?? null,
        accuracyExpression: a.evaluable ?? null,
        accuracyUnit: a.unit ?? null,
        accuracyPolarity: a.polarity ?? '±',
        accuracyPercentOf: a.percent_of ?? null,
        accuracyPercentValue: a.percent_value ?? null,
        accuracyDigits: a.digits ?? null,
        accuracyDigitsUnit: a.digits_unit ?? null,
      }
    case 'class':
      return { ...none, accuracyKind: 'CLASS', accuracyClass: a.class ?? null }
    default:
      // An unrecognised shape is left null rather than forced into one of the three.
      // Better an admin sees a blank and fills it in than a wrong number nobody checks.
      return none
  }
}

function bucketRows(raw: RawBucket[] | null | undefined): BucketRow[] {
  return (raw ?? []).map((b, i) => ({
    bucketKey: b.id || `B${i + 1}`,
    ...bound(b),
    leastCountValue: b.least_count?.value ?? null,
    leastCountUnit: b.least_count?.unit ?? null,
    ...accuracy(b.accuracy),
    sortOrder: i,
  }))
}

function role(raw: string | null | undefined): CapabilityRole {
  return raw === 'source' ? 'SOURCE' : 'MEASURING'
}

function kind(raw: string | null | undefined): CapabilityKind {
  return raw === 'artifact' ? 'ARTIFACT' : 'RANGE'
}

function profileRows(unit: RawUnit): ProfileRow[] {
  return (unit.capability_profiles ?? []).map((p, i) => ({
    profileKey: p.id || `P${i + 1}`,
    parameter: (p.parameter || '').trim(),
    role: role(p.role),
    unit: (p.unit || '').trim(),
    kind: kind(p.kind),
    ...bound(p),
    subtypeKind: p.subtype_kind ?? null,
    // Which half of a two-part instrument, and how it measures. Both are what tells
    // two otherwise identical records against one instrument apart on screen.
    part: p.component ?? null,
    mode: p.mode ?? null,
    // Decision 2: every SOP the instrument holds goes onto every profile, and admins
    // prune. Of 209 instruments 92 hold more than one SOP and only 38 of those have as
    // many SOPs as capabilities, so there is no rule that splits them correctly.
    // Copying loses nothing and asserts nothing the data does not support.
    sopReferences: unit.sop_references ?? [],
    sortOrder: i,
    subtypes: (p.subtypes ?? []).map((s, j) => ({
      subtypeKey: s.id || `S${j + 1}`,
      ...bound(s),
      sortOrder: j,
      buckets: bucketRows(s.buckets),
    })),
    buckets: bucketRows(p.buckets),
  }))
}

/**
 * The indicator and its sensor, where the registry splits them.
 *
 * 33 of 212 units are composite. Of those, all 33 split the serial, 24 also split the
 * model and 1 splits the make - so a part's make or model being null means it shares the
 * instrument's own, not that it has none.
 */
function componentRows(unit: RawUnit): ComponentRow[] {
  const parts: Array<{ key: 'ind' | 'sen'; role: ComponentRole }> = [
    { key: 'ind', role: 'INDICATOR' },
    { key: 'sen', role: 'SENSOR' },
  ]
  const rows: ComponentRow[] = []
  for (const [i, part] of parts.entries()) {
    const make = unit.make_parts?.[part.key] ?? null
    const model = unit.model_parts?.[part.key] ?? null
    const serialNumber = unit.serial_parts?.[part.key] ?? null
    // Nothing was split for this part, so there is no component to record.
    if (make === null && model === null && serialNumber === null) continue
    rows.push({ componentKey: part.key, role: part.role, make, model, serialNumber, sortOrder: i })
  }
  return rows
}

/**
 * Read the registry into rows ready to write, one entry per unit that can be joined to
 * the database.
 *
 * Units with no `legacy_id` are skipped and reported: there is nothing to attach them
 * to. As of the 11 Sep 2026 cleanup every unit has one.
 */
export function deriveCapabilities(registry: CapabilityRegistry): {
  units: UnitCapabilities[]
  skippedNoLegacyId: string[]
  totals: { profiles: number; subtypes: number; buckets: number; components: number }
} {
  const units: UnitCapabilities[] = []
  const skippedNoLegacyId: string[] = []
  const totals = { profiles: 0, subtypes: 0, buckets: 0, components: 0 }

  for (const asset of registry.assets ?? []) {
    for (const unit of asset.units ?? []) {
      if (unit.legacy_id === null || unit.legacy_id === undefined) {
        skippedNoLegacyId.push(`${asset.asset_no ?? '?'} — ${unit.instrument_desc ?? '?'}`)
        continue
      }
      const profiles = profileRows(unit)
      const components = componentRows(unit)

      totals.profiles += profiles.length
      totals.components += components.length
      for (const p of profiles) {
        totals.subtypes += p.subtypes.length
        totals.buckets += p.buckets.length
        for (const s of p.subtypes) totals.buckets += s.buckets.length
      }

      units.push({
        legacyId: unit.legacy_id,
        assetNo: asset.asset_no ?? '',
        description: unit.instrument_desc ?? '',
        profiles,
        components,
      })
    }
  }

  return { units, skippedNoLegacyId, totals }
}
