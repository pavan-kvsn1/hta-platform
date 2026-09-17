import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { deriveCapabilities, type CapabilityRegistry } from '../src/master-capabilities'

const REGISTRY = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../apps/web-hta/src/data/master-instrument-registry.json',
)
const registry = JSON.parse(readFileSync(REGISTRY, 'utf8')) as CapabilityRegistry
const derived = deriveCapabilities(registry)

describe('deriving capabilities from the registry', () => {
  it('reads every unit, because every one has a legacy id to join on', () => {
    expect(derived.units).toHaveLength(212)
    expect(derived.skippedNoLegacyId).toEqual([])
  })

  it('produces the same counts the registry holds', () => {
    expect(derived.totals).toEqual({
      profiles: 369,
      subtypes: 231,
      buckets: 1564,
      // 33 composite units, an indicator and a sensor each
      components: 66,
    })
  })

  it('keeps the three accuracy shapes apart, and the buckets that declare none', () => {
    const seen: Record<string, number> = {}
    for (const u of derived.units)
      for (const p of u.profiles)
        for (const b of [...p.buckets, ...p.subtypes.flatMap((s) => s.buckets)])
          seen[b.accuracyKind ?? 'none'] = (seen[b.accuracyKind ?? 'none'] || 0) + 1

    expect(seen).toEqual({ SYMMETRIC: 1427, FORMULA: 104, CLASS: 2, none: 31 })
  })

  it('carries a formula accuracy whole - the sentence and the numbers behind it', () => {
    /**
     * This read `a.formula` from a file whose key is `expression`, so every one of the
     * 120 formula accuracies seeded with a null sentence, and the four parsed parts had
     * no columns to go to. A certificate then printed a blank where the master's
     * accuracy belongs, and the app could not rate the instrument at all.
     */
    const formulas = derived.units
      .flatMap((u) => u.profiles)
      .flatMap((p) => [...p.buckets, ...p.subtypes.flatMap((s) => s.buckets)])
      .filter((b) => b.accuracyKind === 'FORMULA')

    expect(formulas).toHaveLength(104)
    expect(formulas.filter((b) => b.accuracyFormula === null)).toHaveLength(0)

    // Every one now carries something to compute with: 97 in the parsed fields, and 7
    // as arithmetic, for the shapes one percentage and one digits term cannot hold.
    const inFields = formulas.filter(
      (b) => b.accuracyPercentValue !== null || b.accuracyDigits !== null,
    )
    const asArithmetic = formulas.filter((b) => b.accuracyExpression !== null)
    expect(inFields).toHaveLength(97)
    expect(asArithmetic).toHaveLength(7)
    expect(inFields.length + asArithmetic.length).toBe(formulas.length)
  })

  it('reads a formula bucket exactly as the registry wrote it', () => {
    // 1017 HTAIPL/L, the Masibus UC 12: "+/-0.02% of reading +/-2 count".
    const bucket = derived.units
      .find((u) => u.legacyId === 9)!
      .profiles.find((p) => p.parameter === 'DC Voltage')!.buckets[0]

    expect(bucket.accuracyKind).toBe('FORMULA')
    expect(bucket.accuracyFormula).toBe('+/-0.02% of reading +/-2 count')
    expect(bucket.accuracyPercentOf).toBe('reading')
    expect(bucket.accuracyPercentValue).toBe(0.0002)
    expect(bucket.accuracyDigits).toBe(2)
    expect(bucket.accuracyDigitsUnit).toBe('count')
  })

  it('leaves least count null where none is declared, rather than calling it zero', () => {
    let declared = 0
    let none = 0
    for (const u of derived.units)
      for (const p of u.profiles)
        for (const b of [...p.buckets, ...p.subtypes.flatMap((s) => s.buckets)])
          b.leastCountValue === null ? none++ : declared++

    expect({ declared, none }).toEqual({ declared: 1443, none: 121 })
  })

  it('never assigns a legacy id to two units', () => {
    const ids = derived.units.map((u) => u.legacyId)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('a profile with subtypes', () => {
  const p1 = derived.units.find((u) => u.assetNo.startsWith('708'))!.profiles[0]

  it('carries its span and its subtype kind', () => {
    expect(p1).toMatchObject({
      profileKey: 'P1',
      parameter: 'Thermocouple',
      role: 'MEASURING',
      unit: '°C',
      kind: 'RANGE',
      min: -210,
      max: 1820,
      subtypeKind: 'thermocouple_type',
    })
  })

  it('hangs its buckets off the subtypes, not off itself', () => {
    expect(p1.buckets).toEqual([])
    expect(p1.subtypes.length).toBeGreaterThan(1)
    expect(p1.subtypes.every((s) => s.buckets.length > 0)).toBe(true)
  })

  it('gives each subtype its own span, because Type J stops before Type K', () => {
    const j = p1.subtypes.find((s) => s.subtypeKey === 'Type J')!
    expect(j.max).toBe(1200)
    expect(j.max).toBeLessThan(p1.max!)
  })

  it('reads a bucket whole', () => {
    const b1 = p1.subtypes.find((s) => s.subtypeKey === 'Type J')!.buckets[0]
    expect(b1).toEqual({
      bucketKey: 'B1',
      min: -210,
      max: -200,
      minInclusive: true,
      maxInclusive: true,
      leastCountValue: 0.1,
      leastCountUnit: '°C',
      accuracyKind: 'SYMMETRIC',
      accuracyValue: 0.6,
      accuracyUnit: '°C',
      accuracyPolarity: '±',
      accuracyFormula: null,
      accuracyExpression: null,
      // A symmetric accuracy has no parts to carry; the four stay null.
      accuracyPercentOf: null,
      accuracyPercentValue: null,
      accuracyDigits: null,
      accuracyDigitsUnit: null,
      accuracyClass: null,
      sortOrder: 0,
    })
  })

  it('preserves an exclusive lower bound, so two buckets do not both claim the boundary', () => {
    const buckets = p1.subtypes.find((s) => s.subtypeKey === 'Type J')!.buckets
    const b2 = buckets.find((b) => b.bucketKey === 'B2')!
    expect(b2.min).toBe(-200)
    expect(b2.minInclusive).toBe(false)
    expect(buckets[0].max).toBe(b2.min)
  })
})

describe('components', () => {
  it('splits an indicator from its sensor', () => {
    const u = derived.units.find((x) => x.assetNo.startsWith('1014'))!
    expect(u.components).toEqual([
      { componentKey: 'ind', role: 'INDICATOR', make: null, model: 'HP 32', serialNumber: '5250062', sortOrder: 0 },
      { componentKey: 'sen', role: 'SENSOR', make: null, model: 'HC2A-S4', serialNumber: '25005083', sortOrder: 1 },
    ])
  })

  it('records a split make where there is one, and only 1 unit has one', () => {
    const withMake = derived.units.filter((u) => u.components.some((c) => c.make !== null))
    expect(withMake).toHaveLength(1)
    expect(withMake[0].assetNo).toBe('189 HTAIPL/L')
    expect(withMake[0].components.map((c) => c.make)).toEqual(['Delta Ohm', 'Emko'])
  })

  it('gives a simple instrument no components at all', () => {
    const u = derived.units.find((x) => x.assetNo.startsWith('708'))!
    expect(u.components).toEqual([])
  })
})

describe('the weights split on 11 Sep 2026', () => {
  it('gives each of the five its own nominal mass', () => {
    const masses = ['904', '905', '906', '907', '908'].map((n) => {
      const u = derived.units.find((x) => x.assetNo.startsWith(n))!
      const b = u.profiles[0].buckets[0]
      return { asset: n, legacyId: u.legacyId, min: b.min, max: b.max }
    })
    expect(masses).toEqual([
      { asset: '904', legacyId: 191, min: 2, max: 2 },
      { asset: '905', legacyId: 210, min: 2, max: 2 },
      { asset: '906', legacyId: 211, min: 1, max: 1 },
      { asset: '907', legacyId: 190, min: 5, max: 5 },
      { asset: '908', legacyId: 212, min: 10, max: 10 },
    ])
  })
})

describe('SOP references', () => {
  it('copies every SOP onto every profile, because nothing says which belongs where', () => {
    // 667 HTAIPL/L holds 3 SOPs against 1 capability. There is no rule that splits them,
    // so all three go on the profile and an admin prunes. See decision 2.
    const u = derived.units.find((x) => x.assetNo.startsWith('667'))!
    expect(u.profiles).toHaveLength(1)
    expect(u.profiles[0].sopReferences.length).toBeGreaterThan(1)
  })

  it('gives each profile the same list when an instrument has several', () => {
    const u = derived.units.find((x) => x.profiles.length > 1 && x.profiles[0].sopReferences.length > 0)!
    const first = u.profiles[0].sopReferences
    expect(u.profiles.every((p) => p.sopReferences.join('|') === first.join('|'))).toBe(true)
  })
})

describe('shapes the registry does not use are still handled', () => {
  it('treats an unrecognised accuracy type as undeclared rather than guessing', () => {
    const out = deriveCapabilities({
      assets: [
        {
          asset_no: '1 X',
          units: [
            {
              legacy_id: 1,
              capability_profiles: [
                {
                  id: 'P1',
                  parameter: 'Pressure',
                  role: 'measuring',
                  unit: 'bar',
                  buckets: [{ id: 'B1', accuracy: { type: 'something-new', value: 5 } }],
                },
              ],
            },
          ],
        },
      ],
    })
    expect(out.units[0].profiles[0].buckets[0].accuracyKind).toBeNull()
    expect(out.units[0].profiles[0].buckets[0].accuracyValue).toBeNull()
  })

  it('reports a unit with no legacy id instead of dropping it silently', () => {
    const out = deriveCapabilities({
      assets: [{ asset_no: '2 X', units: [{ instrument_desc: 'Orphan' }] }],
    })
    expect(out.units).toEqual([])
    expect(out.skippedNoLegacyId).toEqual(['2 X — Orphan'])
  })
})
