/**
 * Which parameter a master entry was declared for.
 *
 * One thermometer used over two temperature spans is on the certificate twice, and
 * "which parameter names this instrument" answers with both. The entry records its own
 * parameter - but the API rewrites the parameter rows on every save, so the link
 * travels as a position and a save that drops it leaves the entry with nothing.
 */
import { describe, it, expect } from 'vitest'
import { parameterIdFor } from '@/lib/master-entry/parameter-link'

const entry = (masterInstrumentId: number, parameterId?: string) => ({
  masterInstrumentId,
  parameterId,
})
const param = (id: string, masterInstrumentId: number | null) => ({ id, masterInstrumentId })

describe('linking a master entry to its parameter', () => {
  it('takes the link where the entry has one', () => {
    const entries = [entry(67, 'p3'), entry(67, 'p1')]
    const params = [param('p1', 67), param('p3', 67)]
    expect(parameterIdFor(entries[0], entries, params)).toBe('p3')
    expect(parameterIdFor(entries[1], entries, params)).toBe('p1')
  })

  it('gives two entries on one instrument a parameter each, in order', () => {
    // The state a lost link leaves behind. Matching on the instrument would hand both
    // parameters to both entries; this hands one to each.
    const entries = [entry(67), entry(67)]
    const params = [param('p1', 67), param('p3', 67)]
    expect(parameterIdFor(entries[0], entries, params)).toBe('p1')
    expect(parameterIdFor(entries[1], entries, params)).toBe('p3')
  })

  it('leaves alone a parameter another entry named outright', () => {
    // One entry kept its link through the save and the other did not. The one that
    // kept it keeps its parameter, and the other takes what is left.
    const entries = [entry(67, 'p3'), entry(67)]
    const params = [param('p1', 67), param('p3', 67)]
    expect(parameterIdFor(entries[0], entries, params)).toBe('p3')
    expect(parameterIdFor(entries[1], entries, params)).toBe('p1')
  })

  it('ignores a link to a parameter that is no longer there', () => {
    // Parameter rows are recreated on every save, so a stale id points at nothing.
    const entries = [entry(67, 'gone')]
    const params = [param('p1', 67)]
    expect(parameterIdFor(entries[0], entries, params)).toBe('p1')
  })

  it('answers plainly where an instrument is used once', () => {
    const entries = [entry(67), entry(158)]
    const params = [param('p1', 67), param('p2', 158)]
    expect(parameterIdFor(entries[0], entries, params)).toBe('p1')
    expect(parameterIdFor(entries[1], entries, params)).toBe('p2')
  })

  it('has nothing to say about an entry whose parameter is unassigned', () => {
    const entries = [entry(67)]
    expect(parameterIdFor(entries[0], entries, [param('p1', null)])).toBeNull()
  })
})
