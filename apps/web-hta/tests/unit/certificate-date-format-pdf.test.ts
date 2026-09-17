/**
 * Which dates on a certificate follow the format the lab chose.
 *
 * The due date always did. The date of calibration did not - it was written
 * day/month/year whatever the certificate said elsewhere, so a certificate set to
 * MM/DD/YYYY for a customer abroad gave them one date their way and one ours, on the
 * same page, a row apart.
 *
 * The dates further down are deliberately left alone: a master's own due date and a
 * signature's timestamp are records of when something happened in the lab, not dates
 * anyone reads against their own calendar.
 */
import { describe, expect, it } from 'vitest'

import { DEFAULT_DATE_FORMAT, formatCertificateDate } from '@/lib/certificate/date-format'
import { formatDateDDMMYYYY } from '@/components/pdf/pdf-utils'

/** As the certificate head writes both of its dates. */
const headDate = (value: string | null | undefined, format: string | undefined, empty: string) =>
  formatCertificateDate(value, format || DEFAULT_DATE_FORMAT, empty)

describe('the two dates in the certificate head', () => {
  const ON = '2026-09-17'

  it('writes both in the format the certificate was set to', () => {
    for (const [format, expected] of [
      ['DD/MM/YYYY', '17/09/2026'],
      ['MM/DD/YYYY', '09/17/2026'],
      ['DD-MM-YYYY', '17-09-2026'],
    ] as const) {
      expect(headDate(ON, format, '-')).toBe(expected)
    }
  })

  it('no longer disagrees with itself across the two rows', () => {
    // The date of calibration used to be fixed to day/month/year. On a certificate set
    // to MM/DD/YYYY that put 17/09/2026 above 09/17/2026 - the same day, twice, two
    // ways, and no way for a reader to tell which convention either one was in.
    const calibration = headDate(ON, 'MM/DD/YYYY', '-')
    const due = headDate('2027-09-17', 'MM/DD/YYYY', '')
    expect(calibration).toBe('09/17/2026')
    expect(due).toBe('09/17/2027')
    expect(calibration).not.toBe(formatDateDDMMYYYY(ON))
  })

  it('keeps what each cell printed for a date that is not set', () => {
    // The calibration date's cell has always shown a dash; the due date's shows
    // nothing. That difference belongs to the cells, not to the formatter.
    expect(headDate('', 'DD/MM/YYYY', '-')).toBe('-')
    expect(headDate(undefined, 'DD/MM/YYYY', '-')).toBe('-')
    expect(headDate('', 'DD/MM/YYYY', '')).toBe('')
  })

  it('falls back to the lab default where a certificate names no format', () => {
    expect(headDate(ON, undefined, '-')).toBe(formatCertificateDate(ON, DEFAULT_DATE_FORMAT))
  })

  it('leaves a date it cannot read exactly as written', () => {
    // Better an unfamiliar string than a confident wrong date.
    expect(headDate('not a date', 'MM/DD/YYYY', '-')).toBe('not a date')
  })
})
