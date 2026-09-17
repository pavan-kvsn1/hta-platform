/**
 * An accuracy that states a percentage of full scale, or a term in digits, needs the
 * span and the least count to become a number.
 *
 * Both were in scope at the two call sites that judge a master and neither was being
 * passed, so `resolveAccuracy` returned null and the instrument read as one with
 * nothing to rate it by - which stops the engineer and asks for a written
 * justification. The figures were right there the whole time.
 *
 * This measures it over the real register rather than a fixture, because the point is
 * not that the arithmetic works - it always did - but how many of the lab's actual
 * masters it was being denied to.
 */
import { describe, expect, it } from 'vitest'

import { resolveAccuracy } from '@/lib/master/capability'
import type { Accuracy, CapabilityBucket, MasterInstrumentRegistry } from '@/lib/master/registry'
import registryData from '@/data/master-instrument-registry.json'

const registry = registryData as unknown as MasterInstrumentRegistry

/** Every band in the register, with the span it sits under. */
const bands: { bucket: CapabilityBucket; fullScale: number | null }[] = []
for (const asset of registry.assets) {
  for (const unit of asset.units) {
    for (const profile of unit.capability_profiles ?? []) {
      for (const bucket of profile.buckets ?? []) {
        bands.push({ bucket, fullScale: profile.max })
      }
      for (const subtype of profile.subtypes ?? []) {
        for (const bucket of subtype.buckets ?? []) {
          bands.push({ bucket, fullScale: subtype.max })
        }
      }
    }
  }
}

const formulas = bands.filter((b) => b.bucket.accuracy?.type === 'formula')

/** What the two call sites used to pass, and what they pass now. */
const withoutContext = (b: (typeof bands)[number]) =>
  resolveAccuracy(b.bucket.accuracy, { reading: b.bucket.max ?? 1 })
const withContext = (b: (typeof bands)[number]) =>
  resolveAccuracy(b.bucket.accuracy, {
    reading: b.bucket.max ?? 1,
    fullScale: b.fullScale,
    leastCount: b.bucket.least_count?.value ?? null,
  })

describe('an accuracy needs the span and the least count to become a number', () => {
  it('finds the register it is measuring', () => {
    // 104 since the standardisation: the 16 humidity bands that read "+/-2.0 %RH" were
    // never formulas - that is two percentage points, an absolute figure - and are now
    // symmetric like the other 1,427.
    expect(formulas.length).toBe(104)
  })

  it('reduces far more of the register once the context is supplied', () => {
    const before = formulas.filter((b) => withoutContext(b) !== null).length
    const after = formulas.filter((b) => withContext(b) !== null).length

    // Only a plain "% of reading" needs nothing else, which is why so few resolve
    // without. Everything else wants the span, the least count, or both.
    expect(before).toBe(15)
    expect(after).toBe(104)
  })

  it('leaves nothing in the register it cannot reduce', () => {
    // This was 38 - a basis the engine did not know (fsd, rh, hd), a percentage of
    // nothing stated, a digits term in ohms. Every one of those was a data problem,
    // and every one has been settled at source rather than papered over here.
    const stillNull = formulas.filter((b) => withContext(b) === null)
    expect(stillNull).toHaveLength(0)
  })

  it('needs the span for a percentage of full scale', () => {
    const accuracy: Accuracy = {
      type: 'formula',
      expression: '+/-0.1% FS',
      percent_of: 'full_scale',
      percent_value: 0.001,
      digits: null,
      digits_unit: null,
      polarity: '±',
    }
    expect(resolveAccuracy(accuracy, { reading: 20 })).toBeNull()
    expect(resolveAccuracy(accuracy, { reading: 20, fullScale: 700 })?.value).toBeCloseTo(0.7, 9)
  })

  it('refuses a term that is already in engineering units, rather than scaling it', () => {
    /**
     * 1018 HTAIPL/L, the Masibus TC 12+, states "+/- 0.02% of reading +/- 0.01 ohm".
     * That 0.01 is an absolute figure in ohms, not a count of the least count - but
     * the parse put it in `digits`, where the engine multiplies it by the resolution.
     *
     * The band records no least count, so it resolves to null, and that is the right
     * answer for the wrong reason: scaling an absolute figure would state an accuracy
     * nobody wrote. `digits_unit` is what tells the two apart, and nothing reads it.
     */
    const accuracy: Accuracy = {
      type: 'formula',
      expression: '+/- 0.02% of reading +/- 0.01 ohm',
      percent_of: 'reading',
      percent_value: 0.0002,
      digits: 0.01,
      digits_unit: 'ohm',
      polarity: '±',
    }
    expect(resolveAccuracy(accuracy, { reading: 400, fullScale: 400 })).toBeNull()
  })

  it('needs the least count for a term in digits', () => {
    const accuracy: Accuracy = {
      type: 'formula',
      expression: '+/-(0.05% rdg + 1d)',
      percent_of: 'reading',
      percent_value: 0.0005,
      digits: 1,
      digits_unit: 'd',
      polarity: '±',
    }
    expect(resolveAccuracy(accuracy, { reading: 1000 })).toBeNull()
    expect(resolveAccuracy(accuracy, { reading: 1000, leastCount: 0.1 })).toEqual({
      value: 0.6, // 0.5 from the reading, 0.1 from the one digit
      unit: null,
    })
  })

  it('still refuses a basis it does not recognise, however much context it is given', () => {
    const accuracy: Accuracy = {
      type: 'formula',
      expression: '+/-2.0 %RH',
      // Not one of reading / full_scale / span. Outside the declared PercentBasis type.
      percent_of: 'rh' as never,
      percent_value: 0.02,
      digits: null,
      digits_unit: null,
      polarity: '±',
    }
    expect(resolveAccuracy(accuracy, { reading: 50, fullScale: 100, leastCount: 0.1 })).toBeNull()
  })
})
