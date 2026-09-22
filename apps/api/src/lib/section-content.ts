import crypto from 'crypto'

/**
 * What each section of a certificate is made of, and a hash of it.
 *
 * A reviewer's tick says "I read this". Held against a revision number, that claim was
 * wrong in both directions. A new revision cleared all seven sections even where the
 * engineer touched two, so a reviewer re-read five sections nobody had altered. And the
 * two that did change are not reliably the ones the revision request named: an engineer
 * sent back to fix the master instruments may correct a reading in the results while
 * they are in there, and nothing in the request says so.
 *
 * Hashing the content answers both. A tick stands while its section still reads as it
 * did, and lapses when it does not - whatever moved it, and whoever asked. It needs no
 * list of which edits matter, because anything that changes what a reviewer would see
 * changes the hash.
 *
 * The projections below are deliberately explicit rather than "everything on the row".
 * A section's hash should move when a reader would notice, and not when a timestamp is
 * touched: `updatedAt` changing must not un-tick seven sections.
 */

export const REVIEW_SECTIONS = [
  'summary',
  'uuc-details',
  'master-inst',
  'environment',
  'results',
  'remarks',
  'conclusion',
] as const

export type ReviewSection = (typeof REVIEW_SECTIONS)[number]

/** Anything JSON-shaped; the caller passes a certificate with its relations loaded. */
type Row = Record<string, unknown>

const val = (v: unknown): string => {
  if (v === null || v === undefined) return ''
  if (v instanceof Date) return v.toISOString()
  // A Decimal column reads back as an object, and JSON.stringify would wrap it in
  // quotes - so a least count of 0.05 would hash as "0.05" where it used to hash as
  // 0.05. That is a different string, and every section sign-off taken before the
  // column became a number would read as a section that had changed since it was
  // signed. Written plainly it is character for character what the text column held.
  if (isDecimal(v)) return String(v)
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

/**
 * A Prisma Decimal, without importing the client into a module that only formats.
 *
 * Decimal.js instances carry these three; no plain object or array this function is
 * given does.
 */
function isDecimal(v: unknown): boolean {
  if (typeof v !== 'object' || v === null) return false
  const candidate = v as Record<string, unknown>
  return (
    typeof candidate.toFixed === 'function' &&
    typeof candidate.toNumber === 'function' &&
    typeof candidate.isPositive === 'function'
  )
}

const pick = (row: Row | undefined, keys: string[]): string =>
  keys.map((k) => k + '=' + val(row?.[k])).join('|')

/**
 * One section's content as a stable string.
 *
 * Ordered by the certificate's own ordering - parameters by sortOrder, results by
 * point - so that reading the same certificate twice gives the same answer. Sorting the
 * master rows by id rather than trusting insertion order, since the update route
 * deletes and recreates them on every save and nothing guarantees the order comes back.
 */
export function sectionContent(certificate: Row, section: ReviewSection): string {
  const parameters = (certificate.parameters as Row[] | undefined) ?? []
  const masters = (certificate.masterInstruments as Row[] | undefined) ?? []

  switch (section) {
    case 'summary':
      return pick(certificate, [
        'certificateNumber',
        'srfNumber',
        'srfDate',
        'calibratedAt',
        'dateOfCalibration',
        'calibrationStartTime',
        'calibrationEndTime',
        'calibrationDueDate',
        'calibrationDueDateFormat',
        'dueDateNotApplicable',
        'customerName',
        'customerAddress',
        'customerContactName',
      ])

    case 'uuc-details':
      return [
        pick(certificate, [
          'uucDescription',
          'uucMake',
          'uucModel',
          'uucSerialNumber',
          'uucInstrumentId',
          'uucLocationName',
          'uucMachineName',
        ]),
        // The parameter specifications, which are read in this section even though the
        // readings taken against them are read in another.
        ...parameters.map((p) =>
          pick(p, [
            'parameterName',
            'parameterUnit',
            'rangeMin',
            'rangeMax',
            'rangeUnit',
            'operatingMin',
            'operatingMax',
            'leastCountValue',
            'leastCountUnit',
            'accuracyValue',
            'accuracyUnit',
            'accuracyType',
            'errorFormula',
            'requiresBinning',
            'bins',
            'sopReference',
          ]),
        ),
      ].join('\n')

    case 'master-inst':
      return [...masters]
        .sort((a, b) => val(a.id).localeCompare(val(b.id)))
        .map((m) =>
          pick(m, [
            'masterInstrumentId',
            'parameterId',
            'assetNo',
            'description',
            'make',
            'model',
            'serialNumber',
            'calibrationDueDate',
            'calibratedAt',
            'reportNo',
            'sopReference',
            'rangeFrom',
            'rangeTo',
            'masterProfileId',
            'masterSubtype',
            'masterLeastCount',
            'masterAccuracy',
            'masterBands',
            'masterAcceptanceReason',
          ]),
        )
        .join('\n')

    case 'environment':
      return pick(certificate, ['ambientTemperature', 'relativeHumidity'])

    case 'results':
      return parameters
        .map((p) => {
          const results = (p.results as Row[] | undefined) ?? []
          return [
            pick(p, ['parameterName', 'tableName', 'fieldSchema', 'showAfterAdjustment']),
            ...[...results]
              .sort((a, b) => Number(a.pointNumber ?? 0) - Number(b.pointNumber ?? 0))
              .map((r) =>
                pick(r, [
                  'pointNumber',
                  'standardReading',
                  'beforeAdjustment',
                  'afterAdjustment',
                  'errorObserved',
                  'isOutOfLimit',
                  'values',
                ]),
              ),
          ].join('\n')
        })
        .join('\n')

    case 'remarks':
      return pick(certificate, [
        'calibrationStatus',
        'stickerOldRemoved',
        'stickerNewAffixed',
        'statusNotes',
      ])

    case 'conclusion':
      return pick(certificate, [
        'selectedConclusionStatements',
        'additionalConclusionStatement',
      ])
  }
}

/** The hash a sign-off stores, and is later compared against. */
export function sectionHash(certificate: Row, section: ReviewSection): string {
  return crypto.createHash('sha256').update(sectionContent(certificate, section)).digest('hex').slice(0, 32)
}

/** Every section's hash, for answering "which of these has drifted" in one pass. */
export function sectionHashes(certificate: Row): Record<ReviewSection, string> {
  return Object.fromEntries(
    REVIEW_SECTIONS.map((s) => [s, sectionHash(certificate, s)]),
  ) as Record<ReviewSection, string>
}
