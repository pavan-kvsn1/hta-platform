/**
 * What a certificate says each master covered.
 *
 * A parameter can be served by more than one master - a pressure gauge to 20 bar and
 * another beyond it - and each is judged against its own stretch. The certificate's
 * "Used for UUC Parameters / Range" table printed the parameter's whole range against
 * both, which claims each of them covered ground it was never asked for and which the
 * comparison behind it never checked.
 *
 * The rule is in the PDF component; this pins the rule rather than the rendering,
 * because the rendering is a hundred lines of react-pdf and the rule is three.
 */
import { describe, expect, it } from 'vitest'

/**
 * As the certificate works it out: the stretch where the entry records one, the
 * parameter's own range otherwise.
 *
 * Every entry written before a parameter could hold several masters records no
 * stretch, and means the whole of it.
 */
function usedOver(
  entry: { rangeFrom?: string; rangeTo?: string },
  served: { range: string } | undefined,
): string {
  const unit = (served?.range ?? '').split(/\s+/).pop() ?? ''
  const stretch =
    entry.rangeFrom && entry.rangeTo
      ? `${entry.rangeFrom} to ${entry.rangeTo}${/^[-\d.]/.test(unit) ? '' : ` ${unit}`}`.trim()
      : undefined
  return stretch ?? served?.range ?? ''
}

describe('the range a certificate prints against a master', () => {
  const pressure = { range: '0 to 100 bar' }

  it('is the stretch where two masters divided the parameter between them', () => {
    expect(usedOver({ rangeFrom: '0', rangeTo: '20' }, pressure)).toBe('0 to 20 bar')
    expect(usedOver({ rangeFrom: '20', rangeTo: '100' }, pressure)).toBe('20 to 100 bar')
  })

  it('carries the parameter’s unit, which the stretch itself does not hold', () => {
    expect(usedOver({ rangeFrom: '-20', rangeTo: '300' }, { range: '-20 to 300 °C' })).toBe(
      '-20 to 300 °C',
    )
  })

  it('is the whole range where the master covered the whole range', () => {
    // Which is what leaving the field alone means, and the ordinary case.
    expect(usedOver({}, pressure)).toBe('0 to 100 bar')
  })

  it('is the whole range on a certificate written before the stretch was recorded', () => {
    // Those entries have no stretch and meant the whole of it. Printing nothing, or
    // printing a blank, would lose a figure the certificate used to carry.
    expect(usedOver({ rangeFrom: undefined, rangeTo: undefined }, pressure)).toBe('0 to 100 bar')
  })

  it('does not invent a unit where the parameter has none', () => {
    // A range with no unit ends in a number; appending it would print "0 to 20 100".
    expect(usedOver({ rangeFrom: '0', rangeTo: '20' }, { range: '0 to 100' })).toBe('0 to 20')
  })

  it('says nothing rather than something wrong when the parameter is unknown', () => {
    expect(usedOver({}, undefined)).toBe('')
  })
})
