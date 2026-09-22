/**
 * Readings that no instrument could have shown.
 *
 * The step arithmetic itself is covered in least-count.test.ts. What is checked here is
 * which step each column is judged against - the column's own where it declared one,
 * its instrument's otherwise, and none at all where nobody stated one.
 */
import { describe, expect, it } from 'vitest'

import {
  masterBucketsFor,
  stepViolationSentence,
  stepViolations,
  type StepCheckParameter,
} from '@/lib/certificate/step-violations'
import type { CapabilityBucket } from '@/lib/master/registry'
import type { FieldDefinition } from '@/lib/certificate/fields'

const MASTER_COL: FieldDefinition = {
  id: 'm1', name: 'Master Reading', group: 'master', type: 'numeric', unit: 'degC', order: 0,
}
const UUC_COL: FieldDefinition = {
  id: 'u1', name: 'UUC Reading', group: 'uuc', type: 'numeric', unit: 'degC', order: 0,
}

const band = (leastCount: number | null): CapabilityBucket => ({
  id: 'b1',
  min: 0,
  max: 500,
  min_inclusive: true,
  max_inclusive: true,
  least_count: leastCount === null ? null : { value: leastCount, unit: 'degC' },
  accuracy: null,
})

function parameter(
  rows: Record<string, string>[],
  patch: Partial<StepCheckParameter> = {},
): StepCheckParameter {
  return {
    id: 'p1',
    leastCountValue: '0.05',
    fieldDefinitions: [MASTER_COL, UUC_COL],
    errorConfig: { masterFieldId: 'm1', uucFieldId: 'u1', formula: 'A-B', unit: 'degC' },
    resultRows: rows.map((values, i) => ({
      id: `r${i}`,
      pointNumber: i + 1,
      values,
      errorObserved: null,
      isOutOfLimit: false,
    })),
    ...patch,
  }
}

describe('a reading judged against its own instrument', () => {
  it('passes a reading that lands on the step', () => {
    const p = parameter([{ m1: '49.70', u1: '49.75' }])
    expect(stepViolations(p, [band(0.05)])).toEqual([])
  })

  it('catches one that falls between, and names both neighbours', () => {
    const p = parameter([{ m1: '49.70', u1: '49.72' }])
    const found = stepViolations(p, [band(0.05)])
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({
      pointNumber: 1,
      fieldName: 'UUC Reading',
      side: 'uuc',
      value: '49.72',
      leastCount: '0.05',
      below: '49.70',
      above: '49.75',
    })
  })

  it('judges each column by its own instrument, not by the other', () => {
    // The master steps in 0.001 and the UUC in 0.05. Judged together, the master's
    // third decimal was called imprecise for something its own instrument can show.
    const p = parameter([{ m1: '49.703', u1: '49.70' }])
    expect(stepViolations(p, [band(0.001)])).toEqual([])
  })

  it('catches the master when it is the master that is wrong', () => {
    const p = parameter([{ m1: '49.703', u1: '49.70' }], { leastCountValue: '0.01' })
    const found = stepViolations(p, [band(0.05)])
    expect(found.map((v) => v.side)).toEqual(['master'])
    expect(found[0]).toMatchObject({ below: '49.70', above: '49.75' })
  })
})

describe('what is not judged', () => {
  it('leaves an empty cell alone - a point not yet taken is not a wrong one', () => {
    const p = parameter([{ m1: '', u1: '   ' }])
    expect(stepViolations(p, [band(0.05)])).toEqual([])
  })

  it('leaves a column whose instrument states no step', () => {
    // 118 bands in the registry state an accuracy and no least count. Checking against
    // a number borrowed from the other instrument would be inventing a resolution.
    const p = parameter([{ m1: '49.703', u1: '49.70' }])
    expect(stepViolations(p, [band(null)]).map((v) => v.side)).toEqual([])
  })

  it('leaves a master with no declared capability at all', () => {
    const p = parameter([{ m1: '49.703', u1: '49.70' }])
    expect(stepViolations(p, []).map((v) => v.side)).toEqual([])
  })

  it('leaves text columns, because words do not step', () => {
    const remarks: FieldDefinition = {
      id: 'u2', name: 'Remarks', group: 'uuc', type: 'text', unit: '', order: 1,
    }
    const p = parameter([{ m1: '49.70', u1: '49.70', u2: 'drifting' }], {
      fieldDefinitions: [MASTER_COL, UUC_COL, remarks],
    })
    expect(stepViolations(p, [band(0.05)])).toEqual([])
  })
})

describe('a column that declared a step of its own', () => {
  const percent: FieldDefinition = {
    id: 'u3',
    name: 'Error %',
    group: 'uuc',
    type: 'expression',
    unit: '%',
    order: 1,
    expression: '{u1} * 100',
    resolution: { source: 'custom', leastCount: '0.1' },
  }

  it('is judged against that step and not the instrument it sits under', () => {
    // The UUC steps in 0.05, which 0.25 satisfies. The column steps in 0.1, which it
    // does not - and it is the column's own declaration that decides.
    const p = parameter([{ m1: '49.70', u1: '49.70', u3: '0.25' }], {
      fieldDefinitions: [MASTER_COL, UUC_COL, percent],
    })
    const found = stepViolations(p, [band(0.05)])
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ fieldName: 'Error %', below: '0.2', above: '0.3' })
  })

  it('passes when it lands on its own step', () => {
    const p = parameter([{ m1: '49.70', u1: '49.70', u3: '0.3' }], {
      fieldDefinitions: [MASTER_COL, UUC_COL, percent],
    })
    expect(stepViolations(p, [band(0.05)])).toEqual([])
  })

  it('is not judged while its declared step is unusable', () => {
    const blank = { ...percent, resolution: { source: 'custom' as const, leastCount: '' } }
    const p = parameter([{ m1: '49.70', u1: '49.70', u3: '0.25' }], {
      fieldDefinitions: [MASTER_COL, UUC_COL, blank],
    })
    expect(stepViolations(p, [band(0.05)])).toEqual([])
  })
})

describe('a step coarser than one', () => {
  it('is checked like any other, which a decimal count could not do', () => {
    const p = parameter([{ m1: '150', u1: '152' }], { leastCountValue: '5' })
    const found = stepViolations(p, [band(5)])
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ value: '152', below: '150', above: '155' })
  })
})

describe('bins', () => {
  it('judge a UUC reading by the bin the point falls in', () => {
    const p = parameter([{ m1: '10', u1: '10.02' }, { m1: '400', u1: '402.5' }], {
      requiresBinning: true,
      bins: [
        { binMin: '0', binMax: '100', leastCount: '0.01' },
        { binMin: '100', binMax: '500', leastCount: '5' },
      ],
    })
    const found = stepViolations(p, [band(0.01)])
    // 10.02 steps in 0.01 and is fine. 402.5 does not step in 5.
    expect(found.map((v) => v.value)).toEqual(['402.5'])
    expect(found[0]).toMatchObject({ below: '400', above: '405' })
  })
})

describe('what the engineer is told', () => {
  it('names the column, the reading, the step and both neighbours', () => {
    const p = parameter([{ m1: '49.70', u1: '49.72' }])
    expect(stepViolationSentence(stepViolations(p, [band(0.05)]))).toBe(
      'UUC Reading reads 49.72, which is not a multiple of 0.05 (nearest: 49.70 or 49.75).',
    )
  })

  it('says nothing when there is nothing to say', () => {
    expect(stepViolationSentence([])).toBeNull()
  })
})

describe('pooling the bands of every master on a parameter', () => {
  const lookup = (profiles: Record<number, CapabilityBucket[]>) => (legacyId: number) =>
    profiles[legacyId]
      ? {
          capability_profiles: [
            {
              id: `prof-${legacyId}`,
              kind: 'range' as const,
              buckets: profiles[legacyId],
            } as never,
          ],
        }
      : undefined

  it('includes the parameter\'s own master even when no entry names it', () => {
    // What certificates written before a parameter could hold several carry.
    const p = parameter([], { masterInstrumentId: 7, masterProfileId: 'prof-7' })
    expect(masterBucketsFor(p, [], lookup({ 7: [band(0.05)] }))).toHaveLength(1)
  })

  it('skips an entry pinned to a different parameter', () => {
    const p = parameter([], { id: 'p1' })
    const entries = [{ masterInstrumentId: 7, masterProfileId: 'prof-7', parameterId: 'p2' }]
    expect(masterBucketsFor(p, entries, lookup({ 7: [band(0.05)] }))).toEqual([])
  })

  it('takes an entry pinned to this parameter', () => {
    const p = parameter([], { id: 'p1' })
    const entries = [{ masterInstrumentId: 7, masterProfileId: 'prof-7', parameterId: 'p1' }]
    expect(masterBucketsFor(p, entries, lookup({ 7: [band(0.05)] }))).toHaveLength(1)
  })

  it('does not list the same master twice', () => {
    const p = parameter([], { id: 'p1', masterInstrumentId: 7, masterProfileId: 'prof-7' })
    const entries = [{ masterInstrumentId: 7, masterProfileId: 'prof-7', parameterId: 'p1' }]
    expect(masterBucketsFor(p, entries, lookup({ 7: [band(0.05)] }))).toHaveLength(1)
  })
})
