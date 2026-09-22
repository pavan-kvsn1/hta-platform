/**
 * What changes when the least count stops being text.
 *
 * The column now reads back as a Decimal object rather than a string, and three things
 * downstream compared or printed that string. None of them is a type error, because a
 * Decimal is still an object TypeScript is happy to pass around, so each is checked
 * here against the values production actually holds.
 */
import { Prisma } from '@hta/database'
import { describe, expect, it } from 'vitest'

import { detectCertificateChanges } from '../../src/lib/change-detection.js'
import { leastCountInput } from '../../src/lib/least-count.js'

const decimal = (v: string) => new Prisma.Decimal(v)

/** Every distinct least count on the 59 parameters in production. */
const PRODUCTION_VALUES = [
  '0.1', '0.01', '1', '0.05', '10', '0.0001', '0.001', '0.2', '0.5', '2', '5',
]

describe('a least count arriving from the form', () => {
  it('keeps every quantity, as typed', () => {
    for (const value of PRODUCTION_VALUES) {
      expect(leastCountInput.parse(value), value).toBe(value)
    }
  })

  it('reads the three ways of saying "not recorded" as nothing', () => {
    for (const value of [null, undefined, '', '   ', 'NA', 'na', ' Na ']) {
      expect(leastCountInput.parse(value), JSON.stringify(value)).toBeNull()
    }
  })

  it('trims what was typed, so a stray space is not a refusal', () => {
    // One parameter in production holds "1 ".
    expect(leastCountInput.parse('1 ')).toBe('1')
  })

  it('refuses what is not a quantity, naming it', () => {
    // One parameter holds three least counts typed into a field that holds one.
    const result = leastCountInput.safeParse('0.1,  0.01, 0.001')
    expect(result.success).toBe(false)
    expect(result.error?.issues[0].message).toContain('is not a least count')
    expect(result.error?.issues[0].message).toContain('0.1,  0.01, 0.001')
  })

  it('refuses a step that is not a size', () => {
    for (const value of ['0', '0.0', '-0.05']) {
      expect(leastCountInput.safeParse(value).success, value).toBe(false)
    }
  })

  it('hands Prisma the text, not a float', () => {
    // 0.1 through a float is 0.1000000000000000055511151231257827.
    expect(leastCountInput.parse('0.1')).toBe('0.1')
    expect(typeof leastCountInput.parse('0.1')).toBe('string')
  })
})

/** The fields a save reports as changed on parameter p1. */
function changedFields(before: Record<string, unknown>, after: Record<string, unknown>) {
  const changes = detectCertificateChanges(
    { parameters: [{ id: 'p1', parameterName: 'Temperature', ...before }] },
    { parameters: [{ id: 'p1', parameterName: 'Temperature', ...after }] },
  )
  return changes.parameters[0]?.changes ?? []
}

describe('what a revision reports', () => {
  it('does not report a least count that did not change', () => {
    // Two Decimals holding the same number are still two objects. Compared as they
    // arrive, every save would report 0.05 changing to 0.05.
    const fields = changedFields(
      { leastCountValue: decimal('0.05') },
      { leastCountValue: '0.05' },
    )
    expect(fields.map((c) => c.field)).not.toContain('leastCountValue')
  })

  it('does not report the same least count written with a trailing zero', () => {
    const fields = changedFields(
      { leastCountValue: decimal('0.05') },
      { leastCountValue: '0.050' },
    )
    expect(fields.map((c) => c.field)).not.toContain('leastCountValue')
  })

  it('still reports one that did change, printed as a number', () => {
    const fields = changedFields(
      { leastCountValue: decimal('0.05') },
      { leastCountValue: '0.01' },
    )
    const change = fields.find((c) => c.field === 'leastCountValue')
    expect(change).toBeDefined()
    expect(change?.previousValue).toBe('0.05')
    expect(change?.newValue).toBe('0.01')
  })

  it('reports one being recorded for the first time, and one being cleared', () => {
    expect(
      changedFields({ leastCountValue: null }, { leastCountValue: '0.05' }).map((c) => c.field),
    ).toContain('leastCountValue')

    expect(
      changedFields({ leastCountValue: decimal('0.05') }, { leastCountValue: null }).map(
        (c) => c.field,
      ),
    ).toContain('leastCountValue')
  })

  it('leaves text fields comparing as text, where 0 and 0.0 are different', () => {
    // The numeric comparison is only for the Decimal columns. A range typed as "0.0"
    // is still a different thing to type than "0".
    expect(changedFields({ rangeMin: '0' }, { rangeMin: '0.0' }).map((c) => c.field)).toContain(
      'rangeMin',
    )
  })
})
