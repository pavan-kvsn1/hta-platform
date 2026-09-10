/**
 * How a date is written on a certificate.
 *
 * 02/09/2026 is September in Bangalore and February in Boston, so the lab says which
 * way its certificates are written. Nothing about the stored date changes.
 */
import { describe, it, expect } from 'vitest'
import {
  DATE_FORMATS,
  DEFAULT_DATE_FORMAT,
  formatCertificateDate,
} from '@/lib/certificate-date-format'

describe('writing a date the certificate’s way', () => {
  const iso = '2026-09-02'

  it.each([
    ['DD/MM/YYYY', '02/09/2026'],
    ['DD-MM-YYYY', '02-09-2026'],
    ['MM/DD/YYYY', '09/02/2026'],
    ['DD MonthName YYYY', '02 September 2026'],
    ['MonthName DD, YYYY', 'September 02, 2026'],
    ['YYYY-MM-DD', '2026-09-02'],
    ['MM/YYYY', '09/2026'],
  ])('writes %s as %s', (format, expected) => {
    expect(formatCertificateDate(iso, format)).toBe(expected)
  })

  it('offers every format it can write', () => {
    // A selector listing a format the writer does not know would fall back silently.
    for (const format of DATE_FORMATS) {
      expect(formatCertificateDate(iso, format)).not.toBe(iso === format ? '' : '')
    }
    expect(DATE_FORMATS).toContain(DEFAULT_DATE_FORMAT)
  })

  it('keeps the day a certificate was written on', () => {
    // new Date('2026-09-02') is midnight UTC, which is the 1st in the Americas. A
    // certificate is not the place to lose a day to a timezone.
    expect(formatCertificateDate('2026-01-01', 'DD MonthName YYYY')).toBe('01 January 2026')
    expect(formatCertificateDate('2026-12-31', 'DD/MM/YYYY')).toBe('31/12/2026')
  })

  it('reads the master list’s American dates', () => {
    // The registry writes 12/31/2026; the first part above twelve can only be a day.
    expect(formatCertificateDate('12/31/2026', 'DD/MM/YYYY')).toBe('31/12/2026')
    expect(formatCertificateDate('09/02/2026', 'DD MonthName YYYY')).toBe('02 September 2026')
    expect(formatCertificateDate('31/12/2026', 'YYYY-MM-DD')).toBe('2026-12-31')
  })

  it('hands back what it cannot read, rather than a guess', () => {
    // An odd string invites someone to look at it. A plausible wrong date does not.
    expect(formatCertificateDate('not a date', 'DD/MM/YYYY')).toBe('not a date')
    expect(formatCertificateDate('', 'DD/MM/YYYY')).toBe('')
  })

  it('falls back to the lab’s usual way for a format it does not know', () => {
    expect(formatCertificateDate(iso, 'whatever')).toBe('02/09/2026')
  })
})
