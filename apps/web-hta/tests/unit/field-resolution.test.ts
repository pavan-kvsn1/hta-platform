/**
 * What a column says about its step.
 *
 * A column holding a conversion or a percentage is a figure this system produced, and
 * its step is a choice - not something to borrow from whichever instrument the column
 * happens to sit under.
 */
import { describe, expect, it } from 'vitest'

import {
  fieldLeastCount,
  fieldResolution,
  fieldResolutionProblem,
  fieldsWithResolutionProblems,
  needsResolution,
  type FieldDefinition,
} from '@/lib/certificate/fields'

const column = (patch: Partial<FieldDefinition> = {}): FieldDefinition => ({
  id: 'fld-1',
  name: 'Corrected Reading',
  group: 'uuc',
  type: 'numeric',
  unit: 'degC',
  order: 0,
  ...patch,
})

describe('a column declared before this was asked for', () => {
  it('reads as inheriting, which is what every column did until now', () => {
    expect(fieldResolution(column())).toEqual({ source: 'instrument' })
  })

  it('is not a reason to refuse the certificate', () => {
    expect(fieldResolutionProblem(column())).toBeNull()
  })
})

describe('a column that steps with its instrument', () => {
  it('takes the step it is given', () => {
    const field = column({ resolution: { source: 'instrument' } })
    expect(fieldLeastCount(field, 0.05)).toBe(0.05)
  })

  it('has no step where the instrument never stated one', () => {
    // 118 buckets in the registry record no least count. Filling that gap with a
    // number from somewhere else would put a resolution on the certificate that
    // nobody measured to.
    const field = column({ resolution: { source: 'instrument' } })
    expect(fieldLeastCount(field, null)).toBeNull()
  })
})

describe('a column that steps in a size of its own', () => {
  it('uses that size and ignores the instrument', () => {
    const field = column({ resolution: { source: 'custom', leastCount: '0.025' } })
    expect(fieldLeastCount(field, 0.5)).toBe(0.025)
    expect(fieldResolutionProblem(field)).toBeNull()
  })

  it('accepts a step coarser than one, which a decimal count could not express', () => {
    const field = column({ resolution: { source: 'custom', leastCount: '5' } })
    expect(fieldLeastCount(field, 0.1)).toBe(5)
    expect(fieldResolutionProblem(field)).toBeNull()
  })
})

describe('a column that was asked and did not answer', () => {
  it('names itself and says what is missing', () => {
    const field = column({ resolution: { source: 'custom', leastCount: '' } })
    expect(fieldResolutionProblem(field)).toBe(
      'Corrected Reading does not say what its least count is. Either it steps with its instrument, or type the step it uses.',
    )
  })

  it('still says something useful when the column has no name yet', () => {
    const field = column({ name: '  ', resolution: { source: 'custom', leastCount: '' } })
    expect(fieldResolutionProblem(field)).toMatch(/^This column does not say/)
  })

  it('refuses a step that is not a size', () => {
    for (const leastCount of ['0', '-0.05', 'NA', 'abc']) {
      const field = column({ resolution: { source: 'custom', leastCount } })
      expect(fieldResolutionProblem(field), leastCount).toMatch(/is not a step/)
      expect(fieldLeastCount(field, 0.1), leastCount).toBeNull()
    }
  })
})

describe('a text column', () => {
  it('is never asked, because words do not step', () => {
    const field = column({ type: 'text', unit: '' })
    expect(needsResolution(field)).toBe(false)
    expect(fieldResolutionProblem(field)).toBeNull()
    expect(fieldLeastCount(field, 0.05)).toBeNull()
  })

  it('is not asked even if a step was somehow stored against it', () => {
    const field = column({ type: 'text', resolution: { source: 'custom', leastCount: '' } })
    expect(fieldResolutionProblem(field)).toBeNull()
  })
})

describe('a formula column', () => {
  it('is asked like any other figure', () => {
    const field = column({ type: 'expression', expression: '{fld-1} * 100' })
    expect(needsResolution(field)).toBe(true)
  })
})

describe('what the certificate is told', () => {
  it('lists only the columns that cannot be used, with their reasons', () => {
    const fields = [
      column({ id: 'a', name: 'Master Reading' }),
      column({ id: 'b', name: 'Converted', resolution: { source: 'custom', leastCount: '' } }),
      column({ id: 'c', name: 'Remarks', type: 'text' }),
      column({ id: 'd', name: 'Percent', resolution: { source: 'custom', leastCount: '0.1' } }),
      column({ id: 'e', name: 'Drift', resolution: { source: 'custom', leastCount: '0' } }),
    ]
    const problems = fieldsWithResolutionProblems(fields)
    expect(problems.map((p) => p.field.id)).toEqual(['b', 'e'])
    expect(problems[0].problem).toContain('Converted')
  })

  it('says nothing when every column has answered', () => {
    expect(fieldsWithResolutionProblems([column(), column({ id: 'b', type: 'text' })])).toEqual([])
  })
})
