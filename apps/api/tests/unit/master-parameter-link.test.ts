import { describe, it, expect } from 'vitest'
import { resolveParameterIndexes } from '../../src/lib/master-parameter-link.js'

describe('healing a master entry that names no parameter', () => {
  it('keeps the position the client sent', () => {
    const entries = [{ masterInstrumentId: 67, parameterIndex: 2 }]
    expect(resolveParameterIndexes(entries, [{}, {}, { masterInstrumentId: 67 }])).toEqual([2])
  })

  it('gives one instrument used twice a parameter each', () => {
    // The case that lost the link: one thermometer against two spans, saved before
    // the link existed, so both entries arrive naming nothing.
    const entries = [
      { masterInstrumentId: 67, parameterIndex: -1 },
      { masterInstrumentId: 158, parameterIndex: -1 },
      { masterInstrumentId: 67, parameterIndex: -1 },
    ]
    const parameters = [
      { masterInstrumentId: 67 },
      { masterInstrumentId: 158 },
      { masterInstrumentId: 67 },
    ]
    expect(resolveParameterIndexes(entries, parameters)).toEqual([0, 1, 2])
  })

  it('does not take a parameter another entry already names', () => {
    const entries = [
      { masterInstrumentId: 67, parameterIndex: 2 },
      { masterInstrumentId: 67, parameterIndex: -1 },
    ]
    const parameters = [{ masterInstrumentId: 67 }, {}, { masterInstrumentId: 67 }]
    expect(resolveParameterIndexes(entries, parameters)).toEqual([2, 0])
  })

  it('leaves an entry unlinked where no parameter names its instrument', () => {
    expect(
      resolveParameterIndexes([{ masterInstrumentId: 99 }], [{ masterInstrumentId: 67 }]),
    ).toEqual([-1])
  })

  it('matches an id sent as text against one held as a number', () => {
    expect(
      resolveParameterIndexes([{ masterInstrumentId: '67' }], [{ masterInstrumentId: 67 }]),
    ).toEqual([0])
  })

  it('ignores a position that points past the parameters', () => {
    // A stale index from a save that dropped a parameter - healed, not written as null.
    expect(
      resolveParameterIndexes([{ masterInstrumentId: 67, parameterIndex: 9 }], [{ masterInstrumentId: 67 }]),
    ).toEqual([0])
  })
})
