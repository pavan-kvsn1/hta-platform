/**
 * How a date is written on a certificate.
 *
 * 02/09/2026 is September in Bangalore and February in Boston. A certificate that
 * leaves the lab has to be read the way its reader reads, so the lab says which way it
 * is written. Nothing about the date itself changes - only how it is printed.
 *
 * Free of React and of the PDF renderer, so the selector's preview and the certificate
 * cannot disagree about what a choice looks like.
 */

export const DATE_FORMATS = [
  'DD/MM/YYYY',
  'DD-MM-YYYY',
  'MM/DD/YYYY',
  'DD MonthName YYYY',
  'MonthName DD, YYYY',
  'YYYY-MM-DD',
  'MM/YYYY',
] as const

export type DateFormat = (typeof DATE_FORMATS)[number]

export const DEFAULT_DATE_FORMAT: DateFormat = 'DD/MM/YYYY'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/**
 * The parts of a stored date, or null where it is not one.
 *
 * Dates reach this from two places and in two shapes: the form's own inputs, which are
 * ISO, and the master list, which is American. Parsed by hand rather than through
 * `new Date`, which reads a bare "2026-09-02" as midnight UTC and can hand back the
 * day before in a western timezone - a certificate is not the place to lose a day.
 */
function parts(value: string): { year: number; month: number; day: number } | null {
  const text = (value ?? '').trim()
  if (!text) return null

  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(text)
  if (iso) {
    return { year: +iso[1], month: +iso[2], day: +iso[3] }
  }

  const slashed = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text)
  if (slashed) {
    const first = +slashed[1]
    const second = +slashed[2]
    // A first part above twelve can only be a day, so the pair is unambiguous. Below
    // it, the master list's American order is what these strings are written in.
    return first > 12
      ? { year: +slashed[3], month: second, day: first }
      : { year: +slashed[3], month: first, day: second }
  }

  return null
}

const pad = (n: number) => String(n).padStart(2, '0')

/**
 * Write a date the way the certificate asks for.
 *
 * A date it cannot read comes back unchanged rather than as a dash or today: a
 * certificate showing an odd string invites someone to look at it, and one showing a
 * plausible wrong date does not.
 */
export function formatCertificateDate(value: string, format: string): string {
  const p = parts(value)
  if (!p) return value ?? ''

  const { year, month, day } = p
  const monthName = MONTHS[month - 1] ?? String(month)

  switch (format) {
    case 'DD-MM-YYYY':
      return `${pad(day)}-${pad(month)}-${year}`
    case 'MM/DD/YYYY':
      return `${pad(month)}/${pad(day)}/${year}`
    case 'DD MonthName YYYY':
      return `${pad(day)} ${monthName} ${year}`
    case 'MonthName DD, YYYY':
      return `${monthName} ${pad(day)}, ${year}`
    case 'YYYY-MM-DD':
      return `${year}-${pad(month)}-${pad(day)}`
    case 'MM/YYYY':
      return `${pad(month)}/${year}`
    case 'DD/MM/YYYY':
    default:
      return `${pad(day)}/${pad(month)}/${year}`
  }
}
