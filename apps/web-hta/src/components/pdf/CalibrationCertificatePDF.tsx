import React from 'react'
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
  Font,
} from '@react-pdf/renderer'

// ============================================================================
// FONT REGISTRATION - Using Roboto from unpkg (fontsource)
// ============================================================================
Font.register({
  family: 'Roboto',
  fonts: [
    {
      src: 'https://unpkg.com/@fontsource/roboto@5.0.8/files/roboto-latin-400-normal.woff',
      fontWeight: 'normal',
    },
    {
      src: 'https://unpkg.com/@fontsource/roboto@5.0.8/files/roboto-latin-400-italic.woff',
      fontWeight: 'normal',
      fontStyle: 'italic',
    },
    {
      src: 'https://unpkg.com/@fontsource/roboto@5.0.8/files/roboto-latin-700-normal.woff',
      fontWeight: 'bold',
    },
  ],
})

// Medium, for the accreditation line under the company name.
Font.register({
  family: 'RobotoMedium',
  fonts: [
    { src: 'https://unpkg.com/@fontsource/roboto@5.0.8/files/roboto-latin-500-normal.woff', fontWeight: 'normal' },
  ],
})

/**
 * Impact, for the company name on the letterhead.
 *
 * Embedded rather than fetched. The certificate renders on the server for the real PDF
 * and in the browser for the preview, so a font has to load in both; Impact is licensed
 * with Windows and is on no CDN that could serve it. A file path would not do either -
 * process.cwd() is apps/web-hta in development and /app in the image, and the browser
 * has no filesystem - so it travels as a data URL, the way the logo and watermark do.
 */
Font.register({
  family: 'Impact',
  fonts: [{ src: IMPACT_BASE64, fontWeight: 'normal' }],
})

// Disable hyphenation to prevent word breaks
Font.registerHyphenationCallback((word) => [word])

// HTA Brand Blue Color
import { HTA_BLUE } from './brand'

// Re-exported so nothing that already imports the certificate has to move.
export { HTA_BLUE }

/**
 * A tint that keeps its printed colour but stops hiding what is under it.
 *
 * Over white, `alpha x colour + (1 - alpha) x white` has to come out at the
 * opaque value the row used to be, so the colour is solved for rather than
 * guessed: a lower alpha needs a stronger colour to land in the same place.
 * The result is indistinguishable on paper and see-through over the watermark.
 *
 * Alpha is a floor, not a preference - push it much below a third and the
 * colour needed to compensate runs out of range.
 */
function seeThrough(hex: string, alpha: number): string {
  const solid = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  const mixed = solid.map((c) => Math.round(Math.min(255, Math.max(0, (c - (1 - alpha) * 255) / alpha))))
  return `rgba(${mixed.join(', ')}, ${alpha})`
}

/** Low enough to read the watermark through, high enough that the tint survives. */
const TINT_ALPHA = 0.35

/* ── the letterhead, option B ──────────────────────────────────────────────
   Measured off rendered pages; see docs/wireframes/certificate-letterhead-options.md.
   Nothing below the rule may move: the body has to start where it starts. */
const LH = {
  /**
   * The company name.
   *
   * The proof set it in near-black against the blue rule; it is the brand blue
   * now, which puts the name, the title and the footer on the one colour and
   * leaves black to the certificate's own data.
   */
  INK: HTA_BLUE,
  /** Contact detail. */
  SLATE: '#64748B',
  /** The page folio. */
  FAINT: '#94A3B8',

  /** 0 -> 84.7 pt, with the rule on the lower edge. */
  RULE_Y: 84.7,
  /** Where the first table starts on a page that does not open with a heading. */
  CONTENT_Y: 115.0,

  /** Centred on 48 with the other two blocks, filling the band it sits in. */
  LOGO: { x: 40, y: 16, size: 64 },
  /** The name and the accreditation both hang off the logo's right edge. */
  TEXT_X: 112,
  /** Right-aligned to x 555, which is the content edge. */
  RIGHT_X: 555,

  /** 20 pt, the size the letterhead was proofed at in Impact. 19.5 was an Oswald fit. */
  NAME_SIZE: 20,
  NAME_BASELINE: 50.7,
  /** +0.10 em, opened at the word spaces rather than tracked across the letters. */
  NAME_WORD_SPACING: 0.1,

  ACCRED_SIZE: 7.5,
  ACCRED_BASELINE: 63.7,
  ACCRED_TRACKING: 0.8,

  CONTACT_SIZE: 7.5,
  CONTACT_FIRST_BASELINE: 27,
  CONTACT_LEADING: 11.8,

  /**
   * 9.56 pt, which is 9.33 pt of Oswald re-fitted to Impact.
   *
   * The proofed 9.33 was the size whose ink read as a 12 pt title in Oswald, so it does
   * not survive a change of face. Impact's cap is 0.7905 of the em against Oswald's
   * 0.8100, and 9.56 pt is the size that puts the same 7.56 pt of cap height on the
   * page - the title looks exactly as big as it did, set in a different face.
   */
  TITLE_SIZE: 9.56,
  TITLE_TRACKING: 0.8,
  FOLIO_SIZE: 8,
} as const

/**
 * The baseline that sits a line optically centred in the title band.
 *
 * The band's midpoint is not the baseline, because a line's ink is not centred
 * in its em box. k is measured per face, off rendered pages: 0.400 for Impact, which is
 * what the title and the company name are now set in; 0.452 for Oswald, which the title
 * used to be.
 */
const centredBaseline = (size: number, k: number) => (LH.CONTENT_Y + LH.RULE_Y) / 2 + k * size

/**
 * Where to put a line's box so its baseline lands where it was measured.
 *
 * The proofs give baselines, because that is what a typesetter measures and
 * what stays true when a size changes. react-pdf positions the top of the line
 * box, which sits one ascent above it - so every placement below converts.
 */
const ROBOTO_ASCENT = 1900 / 2048
const baselineTop = (baseline: number, size: number, ascent: number) => baseline - size * ascent

/** The contact block, in order, right-aligned. */
const CONTACT_LINES = [
  '# 73, Ramachandra Agrahara, Near T.R. Mills,',
  'Chamarajpet, Bangalore 560 018',
  'Tel +91 80 2674 9750  \u00b7  2675 9253  \u00b7  2674 0681',
  'Mob +91 73537 53764',
  'www.htaipl.com  \u00b7  calibration@htaipl.com',
]
import { CertificateFormData, ACCURACY_TYPE_CONFIG } from '@/lib/stores/certificate-store'
import { CertificateAppendix } from './certificate-appendix'
import type { AppendixData } from '@/lib/certificate/appendix-data'
import { IMPACT_ASCENT, IMPACT_BASE64 } from './impact-base64'
import { HTA_LOGO_BASE64 } from './logo-base64'
import { HTA_WATERMARK_BASE64 } from './watermark-base64'
import {
  formatDateDDMMYYYY,
  padSerialNumber,
  formatWithPrecision,
  getConclusionText,
  COMPANY_INFO,
  SIGNATORIES,
  FOOTER_NOTES,
  VALIDITY_STATEMENT,
  CUSTOMER_ACKNOWLEDGMENT_TEXT,
  PDFSignatureData,
} from './pdf-utils'
import {
  DEFAULT_DATE_FORMAT,
  formatCertificateDate,
} from '@/lib/certificate/date-format'
import { formatCalibrationHours, formatCalibrationTimeRange } from '@/lib/utils/calibration-time'
import { resolveCalibrationPrecision } from '@/lib/utils/calibration-precision'
import { parameterIdFor } from '@/lib/master-entry/parameter-link'
import {
  errorResolution,
  precisionOf,
  recordedResolution,
  uucResolution,
} from '@/lib/utils/reading-resolution'
import {
  errorFormulaLabel,
  columnLabel,
  resolveRowValues,
  resultValues,
} from '@/lib/certificate/fields'

// Format ISO date string to readable format: "09 Feb 2026, 14:30 IST"
function formatSigningDateTime(isoString: string | undefined, timezone?: string): string {
  if (!isoString) return ''
  try {
    const date = new Date(isoString)
    const day = date.getDate().toString().padStart(2, '0')
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const month = months[date.getMonth()]
    const year = date.getFullYear()
    const hours = date.getHours().toString().padStart(2, '0')
    const minutes = date.getMinutes().toString().padStart(2, '0')

    // Extract timezone abbreviation if available
    let tzAbbr = ''
    if (timezone) {
      // Convert timezone to abbreviation (e.g., "Asia/Kolkata" -> "IST")
      const tzMap: Record<string, string> = {
        'Asia/Kolkata': 'IST',
        'America/New_York': 'EST',
        'America/Los_Angeles': 'PST',
        'Europe/London': 'GMT',
        'UTC': 'UTC',
      }
      tzAbbr = tzMap[timezone] || timezone.split('/').pop() || ''
    }

    return `${day} ${month} ${year}, ${hours}:${minutes}${tzAbbr ? ' ' + tzAbbr : ''}`
  } catch {
    return ''
  }
}
import {
  planLayout,
  getParameterRenderOrder,
  isSinglePage,
  shouldBreakBefore,
} from './pdf-layout'

// ============================================================================
// STYLES - Balanced layout with proper spacing and alignment
// ============================================================================
const styles = StyleSheet.create({
  // Page
  page: {
    paddingTop: LH.CONTENT_Y, // the rule at 84.7 plus the title band under it
    paddingBottom: 60, // Space for fixed footer only (~45pt + buffer)
    paddingHorizontal: 40,
    fontSize: 11,
    fontFamily: 'Helvetica',
    lineHeight: 1.15,
  },

  // Watermark - centered on every page (A4: 595.28 x 841.89 points)
  watermark: {
    position: 'absolute',
    top: 270, // (841.89 - 300) / 2 ≈ 270
    left: 148, // (595.28 - 300) / 2 ≈ 148
    width: 300,
    height: 300,
    opacity: 0.15,
  },

  /* ── Section A: the letterhead, option B ────────────────────────────────
     Left-anchored: the name reads off the logo and every piece of contact
     detail sits in one right-aligned block. Each element is placed absolutely
     against a measured baseline rather than stacked, because the three blocks
     have to share one optical centre and flow would give them three. */
  letterhead: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: LH.RULE_Y,
  },
  logo: {
    position: 'absolute',
    left: LH.LOGO.x,
    top: LH.LOGO.y,
    width: LH.LOGO.size,
    height: LH.LOGO.size,
  },

  /* The name is set as separate words so the spaces can be opened without
     tracking the letters apart - the printed letterhead opens the word spaces
     by about a tenth of an em and leaves Impact's own letter fit alone. */
  nameRow: {
    position: 'absolute',
    left: LH.TEXT_X,
    top: 0,
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  nameWord: {
    // Impact has one weight. Asking for a bold would make react-pdf look for a face
    // that does not exist; the letterhead's weight is the face itself.
    fontFamily: 'Impact',
    fontSize: LH.NAME_SIZE,
    color: LH.INK,
  },
  accreditation: {
    position: 'absolute',
    left: LH.TEXT_X,
    fontFamily: 'RobotoMedium',
    fontSize: LH.ACCRED_SIZE,
    letterSpacing: LH.ACCRED_TRACKING,
    color: HTA_BLUE,
  },

  contactBlock: {
    position: 'absolute',
    right: 595.28 - LH.RIGHT_X,
    top: 0,
    alignItems: 'flex-end',
  },
  contactLine: {
    fontFamily: 'Roboto',
    fontSize: LH.CONTACT_SIZE,
    color: LH.SLATE,
    textAlign: 'right',
  },

  /** 1 pt, brand, the full content width, on the lower edge of the band. */
  headRule: {
    position: 'absolute',
    left: 40,
    right: 40,
    top: LH.RULE_Y,
    height: 1,
    backgroundColor: HTA_BLUE,
  },

  /* ── Section B: the title and the folio ─────────────────────────────────
     Both are centred in the band between the rule and the first table edge,
     the title on the page rather than on the letterhead's text block - the
     old header centred itself between unequal flanks and put the title, and
     every table under it, 16 pt to the right of the page centre. */
  titleSection: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: LH.CONTENT_Y,
  },
  title: {
    position: 'absolute',
    left: 0,
    right: 0,
    // The same face as the company name above it. Impact has one weight, so there is
    // no fontWeight to ask for.
    fontFamily: 'Impact',
    fontSize: LH.TITLE_SIZE,
    letterSpacing: LH.TITLE_TRACKING,
    // Transformed rather than written in capitals, so documentTitle stays readable and
    // both states of the title are capitalised by one decision instead of two.
    textTransform: 'uppercase',
    textAlign: 'center',
    color: HTA_BLUE,
  },
  /**
   * The unauthorised state reads "Data Sheet Calibration".
   *
   * It used to print black to mark it as not yet a certificate. The state is
   * carried by the words themselves, so the colour is free to match the rest of
   * the letterhead - and a black title under a blue rule read as a mistake.
   */
  titleReview: {
    position: 'absolute',
    left: 0,
    right: 0,
    fontFamily: 'Impact',
    fontSize: LH.TITLE_SIZE,
    letterSpacing: LH.TITLE_TRACKING,
    textTransform: 'uppercase',
    textAlign: 'center',
    color: HTA_BLUE,
  },
  pageNumber: {
    position: 'absolute',
    right: 595.28 - LH.RIGHT_X,
    fontFamily: 'Roboto',
    fontSize: LH.FOLIO_SIZE,
    color: LH.FAINT,
  },

  // Section C: Customer Info Table (4-column paired: label-value-label-value)
  customerTable: {
    borderWidth: 1,
    borderColor: '#000',
    marginBottom: 10,
  },
  customerRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderBottomWidth: 0.5,
    borderBottomColor: '#000',
    minHeight: 18,
  },
  customerRowLast: {
    flexDirection: 'row',
    alignItems: 'stretch',
    minHeight: 18,
  },
  customerLabelCell: {
    width: '20%',
    paddingTop: 5,
    paddingBottom: 1,
    paddingLeft: 3,
    paddingRight: 3,
    borderRightWidth: 0.5,
    borderRightColor: '#000',
    justifyContent: 'center',
  },
  customerValueCell: {
    width: '30%',
    paddingTop: 5,
    paddingBottom: 1,
    paddingLeft: 3,
    paddingRight: 3,
    borderRightWidth: 0.5,
    borderRightColor: '#000',
    justifyContent: 'center',
  },
  customerLabelCellRight: {
    width: '18%',
    paddingTop: 5,
    paddingBottom: 1,
    paddingLeft: 3,
    paddingRight: 3,
    borderRightWidth: 0.5,
    borderRightColor: '#000',
    justifyContent: 'center',
  },
  customerValueCellRight: {
    width: '32%',
    paddingTop: 5,
    paddingBottom: 1,
    paddingLeft: 3,
    paddingRight: 3,
    justifyContent: 'center',
  },
  /**
   * Cells put two more points of padding above the text than below.
   *
   * Every cell centres its text and every row stretches its cells, which is why
   * reading this file said the layout was fine. Measuring a rendered certificate said
   * otherwise: 2.0pt of space above the text and 6.3pt below, in every table on every
   * page. react-pdf centres the line box, not the ink, and the box reserves the font's
   * full descender - which almost nothing in these tables has.
   *
   * Shifting the text down by the difference costs nothing: the padding still sums to
   * the same total, so no row grows, and the leading is untouched. Setting a tighter
   * lineHeight also centres it, but closes up two-line labels like "Customer Name /
   * & Address" - measured, that trade was 3.3pt of leading for 0.15pt of centring.
   *
   * Measured on the same certificate:  -2.19pt off-centre  ->  -0.19pt.
   */
  customerLabel: {
    fontSize: 8.5,
    fontFamily: 'Helvetica-Bold',
  },
  customerValue: {
    fontSize: 8.5,
  },

  // Section D: UUC Details Table (4-column paired)
  uucTable: {
    borderWidth: 1,
    borderColor: '#000',
    marginBottom: 10,
  },
  uucRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderBottomWidth: 0.5,
    borderBottomColor: '#000',
    minHeight: 14,
  },
  uucRowLast: {
    flexDirection: 'row',
    alignItems: 'stretch',
    minHeight: 14,
  },
  /* The UUC and master tables share the customer table's columns - 20/30/18/32 -
     so the three stack down the page on the same four verticals. */
  uucLabelCell: {
    width: '20%',
    paddingTop: 5,
    paddingBottom: 1,
    paddingLeft: 3,
    paddingRight: 3,
    borderRightWidth: 0.5,
    borderRightColor: '#000',
    justifyContent: 'center',
  },
  uucValueCell: {
    width: '30%',
    paddingTop: 5,
    paddingBottom: 1,
    paddingLeft: 3,
    paddingRight: 3,
    borderRightWidth: 0.5,
    borderRightColor: '#000',
    justifyContent: 'center',
  },
  uucLabelCellRight: {
    width: '18%',
    paddingTop: 5,
    paddingBottom: 1,
    paddingLeft: 3,
    paddingRight: 3,
    borderRightWidth: 0.5,
    borderRightColor: '#000',
    justifyContent: 'center',
  },
  uucValueCellRight: {
    width: '32%',
    paddingTop: 5,
    paddingBottom: 1,
    paddingLeft: 3,
    paddingRight: 3,
    justifyContent: 'center',
  },
  uucLabel: {
    fontSize: 8.5,
    fontFamily: 'Helvetica-Bold',
  },
  /**
   * A banner introducing a block, and a column header. Flat fills rather than
   * gradients: react-pdf has no gradient, and a solid tint survives the photocopier
   * and the fax machine a calibration certificate ends up going through.
   */
  bannerRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderBottomWidth: 0.5,
    borderBottomColor: '#000',
    // Was a flat #eef2f7, which blanked the watermark on every banner row.
    backgroundColor: seeThrough('#eef2f7', TINT_ALPHA),
    minHeight: 14,
  },
  bannerCell: {
    width: '100%',
    paddingTop: 5,
    paddingBottom: 1,
    paddingLeft: 3,
    paddingRight: 3,
    justifyContent: 'center',
  },
  bannerText: {
    fontSize: 8.5,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 0.3,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderBottomWidth: 0.5,
    borderBottomColor: '#000',
    // Was a flat #dde5ee, for the same reason.
    backgroundColor: seeThrough('#dde5ee', TINT_ALPHA),
    minHeight: 14,
  },
  /** The label and value halves of a two-column block - the SOP and used-for tables. */
  halfLabelCell: {
    width: '45%',
    paddingTop: 5,
    paddingBottom: 1,
    paddingLeft: 3,
    paddingRight: 3,
    borderRightWidth: 0.5,
    borderRightColor: '#000',
    justifyContent: 'center',
  },
  halfValueCell: {
    width: '55%',
    paddingTop: 5,
    paddingBottom: 1,
    paddingLeft: 3,
    paddingRight: 3,
    justifyContent: 'center',
  },
  /** A value that runs to the table's edge, with no cell to its right. */
  uucValueCellWide: {
    width: '80%',
    paddingTop: 5,
    paddingBottom: 1,
    paddingLeft: 3,
    paddingRight: 3,
    justifyContent: 'center',
  },
  uucValue: {
    fontSize: 8.5,
  },

  // Section E & F: Environmental & SOP Reference
  infoLine: {
    flexDirection: 'row',
    marginBottom: 5,
    paddingVertical: 3,
  },
  infoLabel: {
    fontSize: 9.5,
    fontFamily: 'Helvetica-Bold',
    width: 180,
  },
  infoValue: {
    fontSize: 9.5,
    flex: 1,
  },

  // Section G: Calibration Data Table
  calibrationSection: {
    marginBottom: 12,
  },
  calibrationHeader: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 4,
    padding: 4,
  },
  calibrationTable: {
    borderWidth: 1,
    borderColor: '#000',
  },
  calibrationHeaderRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderBottomWidth: 0.5,
    borderBottomColor: '#000',
  },
  calibrationSubHeaderRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderBottomWidth: 0.5,
    borderBottomColor: '#000',
  },
  calibrationDataRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderBottomWidth: 0.5,
    borderBottomColor: '#000',
    minHeight: 14,
  },
  calibrationDataRowLast: {
    flexDirection: 'row',
    alignItems: 'stretch',
    minHeight: 14,
  },
  calCell: {
    paddingTop: 4,
    paddingBottom: 0,
    paddingLeft: 2,
    paddingRight: 2,
    borderRightWidth: 0.5,
    borderRightColor: '#000',
    justifyContent: 'center',
  },
  calCellLast: {
    paddingTop: 4,
    paddingBottom: 0,
    paddingLeft: 2,
    paddingRight: 2,
    justifyContent: 'center',
  },
  // For merged cell appearance (no bottom border)
  calCellMerged: {
    paddingTop: 4,
    paddingBottom: 0,
    paddingLeft: 2,
    paddingRight: 2,
    borderRightWidth: 0.5,
    borderRightColor: '#000',
    justifyContent: 'center',
    borderBottomWidth: 0,
  },
  calHeaderText: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
  },
  calSubHeaderText: {
    fontSize: 8,
    textAlign: 'center',
  },
  calCellText: {
    fontSize: 8,
    textAlign: 'center',
  },
  failedCalCellText: {
    color: '#dc2626',
    fontFamily: 'Helvetica-Bold',
  },
  calCellTextLeft: {
    fontSize: 8,
    textAlign: 'left',
  },

  // Section H: Master Instruments Table (4-column paired like UUC)
  masterSection: {
    marginBottom: 8,
  },
  masterHeader: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 4,
  },
  masterTable: {
    borderWidth: 1,
    borderColor: '#000',
    marginBottom: 4,
  },
  masterRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderBottomWidth: 0.5,
    borderBottomColor: '#000',
    minHeight: 14,
  },
  masterRowLast: {
    flexDirection: 'row',
    alignItems: 'stretch',
    minHeight: 14,
  },
  masterLabelCell: {
    width: '20%',
    paddingTop: 4,
    paddingBottom: 0,
    paddingLeft: 2,
    paddingRight: 2,
    borderRightWidth: 0.5,
    borderRightColor: '#000',
    justifyContent: 'center',
  },
  masterValueCell: {
    width: '30%',
    paddingTop: 4,
    paddingBottom: 0,
    paddingLeft: 2,
    paddingRight: 2,
    borderRightWidth: 0.5,
    borderRightColor: '#000',
    justifyContent: 'center',
  },
  masterLabelCellRight: {
    width: '18%',
    paddingTop: 4,
    paddingBottom: 0,
    paddingLeft: 2,
    paddingRight: 2,
    borderRightWidth: 0.5,
    borderRightColor: '#000',
    justifyContent: 'center',
  },
  masterValueCellRight: {
    width: '32%',
    paddingTop: 4,
    paddingBottom: 0,
    paddingLeft: 2,
    paddingRight: 2,
    justifyContent: 'center',
  },
  masterLabel: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
  },
  masterValue: {
    fontSize: 8,
  },

  // Section I: Conclusion
  conclusionSection: {
    marginBottom: 8,
  },
  conclusionHeader: {
    flexDirection: 'row',
  },
  conclusionLabel: {
    fontSize: 9.5,
    fontFamily: 'Helvetica-Bold',
    width: 70,
  },
  conclusionColon: {
    fontSize: 9.5,
    width: 10,
  },
  conclusionStatements: {
    flex: 1,
  },
  conclusionItem: {
    flexDirection: 'row',
    marginBottom: 2,
  },
  conclusionNumber: {
    fontSize: 9.5,
    width: 18,
  },
  conclusionText: {
    fontSize: 9.5,
    flex: 1,
  },
  conclusionMarker: {
    color: '#dc2626',
    fontFamily: 'Helvetica-Bold',
  },

  // Section J: Validity Statement
  validitySection: {
    marginBottom: 2,
    paddingVertical: 2,
  },
  validityText: {
    fontSize: 9.5,
    fontStyle: 'italic',
  },

  // Section K: Signature Block (3-column)
  signatureSection: {
    marginTop: 4,
    borderTopWidth: 0.5,
    borderTopColor: '#000',
    paddingTop: 4,
  },
  signatureRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  signatureColumn: {
    width: '32%',
  },
  signatureLabel: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 2,
  },
  signatureName: {
    fontSize: 9,
    marginBottom: 20,
  },
  signatureBox: {
    height: 22,
    borderBottomWidth: 0.5,
    borderBottomColor: '#999',
    borderBottomStyle: 'dashed',
    marginBottom: 3,
  },
  signatureImage: {
    height: 42,
    width: 100,
    objectFit: 'contain' as const,
    marginBottom: 3,
  },
  // Signing metadata (Layer 2 evidence)
  signatureMetadata: {
    marginTop: 1,
    paddingTop: 1,
    borderTopWidth: 0.5,
    borderTopColor: '#ddd',
    borderTopStyle: 'dotted' as const,
  },
  signatureMetadataLine: {
    fontSize: 6,
    color: '#666',
    marginBottom: 1,
  },
  signatureId: {
    fontSize: 6,
    color: '#888',
    marginTop: 3,
  },
  signatureMetadataLabel: {
    fontFamily: 'Helvetica-Bold',
  },

  // Section M: Customer Acknowledgment (conditional)
  customerAckSection: {
    marginTop: 8,
    borderTopWidth: 0.5,
    borderTopColor: '#000',
    borderBottomWidth: 0.5,
    borderBottomColor: '#000',
    paddingTop: 6,
    paddingBottom: 6,
  },
  customerAckTitle: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 4,
  },
  customerAckText: {
    fontSize: 8.5,
    marginBottom: 6,
    lineHeight: 1.3,
  },
  customerAckBody: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
  },
  customerAckSigBox: {
    width: 100,
    height: 50,
    borderWidth: 0.5,
    borderColor: '#999',
    marginRight: 12,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  customerAckSigImage: {
    width: 90,
    height: 44,
    objectFit: 'contain' as const,
  },
  customerAckDetails: {
    flex: 1,
    justifyContent: 'center' as const,
  },
  customerAckDetailLine: {
    fontSize: 8.5,
    marginBottom: 2,
  },
  customerAckDetailLabel: {
    fontFamily: 'Helvetica-Bold',
  },
  customerAckSignatureId: {
    fontSize: 7,
    color: '#666',
    marginTop: 4,
  },

  // Section L: Footer Notes - fixed at bottom
  footerSection: {
    position: 'absolute',
    bottom: 12,
    left: 40,
    right: 40,
    borderTopWidth: 0.5,
    // The rule over the notes picks up the brand too, at the weight the foot of
    // a page can carry - a full-strength line down there competes with the
    // signatures above it.
    borderTopColor: HTA_BLUE,
    paddingTop: 3,
  },
  footerNote: {
    fontSize: 7,
    marginBottom: 3,
    lineHeight: 1.3,
    color: HTA_BLUE,
  },

  // Page continuation indicator
  continuedText: {
    fontSize: 10,
    fontStyle: 'italic',
    textAlign: 'right',
    color: '#666',
    marginTop: 5,
  },
})

// ============================================================================
// COMPONENT PROPS
// ============================================================================
interface CalibrationCertificatePDFProps {
  data: CertificateFormData
  spacingMultiplier?: number // Override from two-pass system (1.0 = default, >1 = expand, <1 = compress)
  signatures?: PDFSignatureData
  /**
   * The photographs and their workings, already resolved.
   *
   * Absent on a certificate with no photographs, and on any render that could not
   * reach them - the certificate is worth more than the appendix.
   */
  appendix?: AppendixData | null
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export function CalibrationCertificatePDF({ data, spacingMultiplier: externalMultiplier, signatures, appendix }: CalibrationCertificatePDFProps) {
  // ========================================================================
  // LAYOUT PLANNING
  // ========================================================================
  const layoutPlan = planLayout(data)
  const parameterRenderOrder = getParameterRenderOrder(layoutPlan)
  const singlePage = isSinglePage(layoutPlan)

  // Reorder parameters based on layout plan (smallest tables first for better packing)
  const orderedParameters = parameterRenderOrder
    .map(id => data.parameters.find(p => p.id === id))
    .filter(Boolean) as typeof data.parameters

  // If no reordering happened (no IDs matched), use original order
  const parametersToRender = orderedParameters.length > 0 ? orderedParameters : data.parameters

  // Use external multiplier if provided (from two-pass system), otherwise use layout plan
  const spacingMultiplier = externalMultiplier ?? (singlePage
    ? layoutPlan.pages[0]?.spacingMultiplier || 1
    : 1)

  console.log('=== PDF RENDER ===')
  console.log('External multiplier:', externalMultiplier)
  console.log('Final spacingMultiplier:', spacingMultiplier)
  console.log('Layout strategy:', layoutPlan.strategy)
  console.log('Total pages planned:', layoutPlan.totalPages)

  // Dynamic margin calculator (for margins between sections)
  const dynamicMargin = (base: number) => {
    const result = Math.round(base * spacingMultiplier)
    // Log first few calls to see values
    if (base === 10 || base === 8) {
      console.log(`dynamicMargin(${base}) = ${result}`)
    }
    return result
  }

  // Dynamic height calculator (for row minHeight - compress when needed)
  const dynamicHeight = (base: number) => {
    const result = Math.round(base * spacingMultiplier)
    if (base === 14 || base === 18) {
      console.log(`dynamicHeight(${base}) = ${result}`)
    }
    return result
  }

  // ========================================================================
  // HELPER FUNCTIONS
  // ========================================================================

  // Helper to get least count from parameter (handles binning with range context)
  const getLeastCount = (p: typeof data.parameters[0]): string[] => {
    if (p.requiresBinning && p.bins.length > 0) {
      // Return array of "range: value" strings for each bin (using "to" to avoid confusion with negatives)
      return p.bins
        .filter(b => b.leastCount)
        .map(b => `${b.binMin} to ${b.binMax} ${p.parameterUnit}: ${b.leastCount} ${p.parameterUnit}`)
    }
    return p.leastCountValue ? [`${p.leastCountValue} ${p.parameterUnit}`] : []
  }

  // Helper to get accuracy from parameter (handles binning with range context)
  const getAccuracy = (p: typeof data.parameters[0]): string[] => {
    const accuracyTypeLabel = ACCURACY_TYPE_CONFIG[p.accuracyType]?.shortLabel || ''
    const unit = p.accuracyType === 'ABSOLUTE' ? p.parameterUnit : accuracyTypeLabel

    if (p.requiresBinning && p.bins.length > 0) {
      // Return array of "range: value" strings for each bin (using "to" to avoid confusion with negatives)
      return p.bins
        .filter(b => b.accuracy)
        .map(b => `${b.binMin} to ${b.binMax} ${p.parameterUnit}: ± ${b.accuracy} ${unit}`)
    }
    return p.accuracyValue ? [`± ${p.accuracyValue} ${unit}`] : []
  }

  /**
   * Each parameter's own specification.
   *
   * These used to be flattened across every parameter into two stacked lists, so a
   * certificate covering temperature and pressure printed four least-count lines and
   * four accuracy lines with nothing saying which belonged to which - the reader
   * inferred it from the unit, and a binned parameter broke even that by contributing
   * four lines where its neighbour contributed one.
   */
  const parameterSpecs = data.parameters.map((p) => ({
    id: p.id,
    name: p.parameterName || '',
    range:
      p.rangeMin && p.rangeMax ? `${p.rangeMin} to ${p.rangeMax} ${p.parameterUnit}` : '-',
    operatingRange: p.operatingRangeNotApplicable
      ? 'Not Applicable'
      : p.operatingMin && p.operatingMax
        ? `${p.operatingMin} to ${p.operatingMax} ${p.parameterUnit}`
        : '-',
    leastCountLines: getLeastCount(p),
    accuracyLines: getAccuracy(p),
    sopReference: p.sopReference || '',
  }))

  /**
   * A heading that can only have one answer is not a heading, so a certificate with a
   * single parameter prints no banners and the SOP stays one sentence.
   */
  const oneParameter = parameterSpecs.length <= 1

  /**
   * The masters, one table per physical instrument.
   *
   * An entry is one instrument used for one parameter, so a thermometer covering two
   * spans arrives as two entries. Printing a table each would repeat its make, model
   * and certificate number; grouping prints the instrument once and lists what it was
   * used for underneath.
   */
  /**
   * The master's own least count, for the parameter it was used for.
   *
   * An instrument used over two spans arrives as two entries, so this is per parameter
   * rather than per instrument. parameterIdFor is the link the rest of the certificate
   * uses, fallback and all - an entry records its parameter, and where that has been
   * lost the entries holding one instrument take the parameters naming it in order.
   */
  const masterLeastCountFor = (() => {
    const byParameter = new Map<string, string>()
    for (const entry of data.masterInstruments) {
      if (!entry.masterInstrumentId) continue
      const linked = parameterIdFor(entry, data.masterInstruments, data.parameters)
      if (linked && entry.masterLeastCount) byParameter.set(linked, entry.masterLeastCount)
    }
    return (parameterId: string) => byParameter.get(parameterId)
  })()

  const masterGroups = (() => {
    const byInstrument = new Map<string, {
      entry: typeof data.masterInstruments[0]
      /** Distinct capabilities, in the order they were used. */
      capabilities: { parameter: string; leastCount: string; accuracy: string }[]
      uses: { parameter: string; range: string }[]
    }>()

    data.masterInstruments
      .filter((m) => m.masterInstrumentId)
      .forEach((entry) => {
        const key = String(entry.masterInstrumentId)
        const group = byInstrument.get(key) ?? { entry, capabilities: [], uses: [] }

        // "Not recorded" rather than a dash: a dash reads as a field nobody filled in,
        // and this is a master whose own certificate states no resolution - or one
        // chosen before the certificate kept a copy.
        const leastCount = entry.masterLeastCount
          ? `${entry.masterLeastCount} ${entry.masterLeastCountUnit ?? ''}`.trim()
          : 'Not recorded'
        // A plain figure gets the sign; a formula ("+/- 0.1%FS") or a class ("F2
        // Class") carries its own and would otherwise print as "± +/- 0.1%FS".
        const accuracyIsNumber =
          entry.masterAccuracy !== undefined &&
          entry.masterAccuracy !== '' &&
          Number.isFinite(Number(entry.masterAccuracy))
        const accuracy = entry.masterAccuracy
          ? `${accuracyIsNumber ? '± ' : ''}${entry.masterAccuracy} ${entry.masterAccuracyUnit ?? ''}`.trim()
          : 'Not recorded'
        const capability = entry.capabilityParameter || ''

        if (!group.capabilities.some((c) => c.parameter === capability)) {
          group.capabilities.push({ parameter: capability, leastCount, accuracy })
        }

        // Which parameter this entry served. The id where the payload carries one;
        // the position otherwise, since the form's own shape is positional and both
        // reach this component depending on which path built the data.
        const byId = entry.parameterId
          ? parameterSpecs.find((spec) => spec.id === entry.parameterId)
          : undefined
        const index = (entry as { parameterIndex?: number }).parameterIndex
        const served =
          byId ?? (index !== undefined && index >= 0 ? parameterSpecs[index] : undefined)
        /**
         * The stretch this master was used over, where it served only part of one.
         *
         * A parameter can be covered by more than one master - a pressure gauge to 20
         * bar and another beyond it - and each is judged against its own stretch. The
         * certificate said the parameter's whole range against both, which claims each
         * of them covered ground it was never asked for.
         *
         * Falls back to the parameter's range, which is what every entry written
         * before this recorded and what a single master covering all of it means.
         */
        // The unit comes off the end of the parameter's own range - "0 to 100 bar" -
        // rather than from a field, which the spec here does not carry.
        const unit = (served?.range ?? '').split(/\s+/).pop() ?? ''
        const stretch =
          entry.rangeFrom && entry.rangeTo
            ? `${entry.rangeFrom} to ${entry.rangeTo}${/^[-\d.]/.test(unit) ? '' : ` ${unit}`}`.trim()
            : undefined
        const usedOver = stretch ?? served?.range ?? ''

        // One entry, one use - and the same parameter twice would print twice.
        if (served && !group.uses.some((use) => use.parameter === served.name && use.range === usedOver)) {
          group.uses.push({ parameter: served.name, range: usedOver })
        }

        byInstrument.set(key, group)
      })

    return [...byInstrument.values()]
  })()

  // Check if any calibration point has failed (isOutOfLimit)
  // If any point fails, due date should be "Not Applicable"
  const hasFailedCalibrationPoints = data.parameters.some(p =>
    p.results.some(r => r.isOutOfLimit === true)
  )

  // Determine document title based on authorization status
  // Only show "Calibration Certificate" (blue) when fully authorized
  // Otherwise show "Data Sheet Calibration" (black) for review
  const isAuthorized = data.status === 'AUTHORIZED'
  const documentTitle = isAuthorized ? 'Calibration Certificate' : 'Data Sheet Calibration'

  return (
    <Document>
      <Page size="A4" style={styles.page} wrap>
        {/* ================================================================ */}
        {/* WATERMARK - centered background logo on every page */}
        {/* ================================================================ */}
        <Image style={styles.watermark} src={HTA_WATERMARK_BASE64} fixed />

        {/* ================================================================ */}
        {/* SECTION A: LETTERHEAD - option B, left anchor (repeats on each page) */}
        {/* Logo and name on the left, all contact detail right-aligned in one  */}
        {/* block, a brand rule across the foot of the band.                    */}
        {/* ================================================================ */}
        <View style={styles.letterhead} fixed>
          {/* The mark in its own colours. The watermark behind the page is the cyan
              one; the letterhead is where the brand is stated, so it is stated as it
              is drawn. */}
          <Image style={styles.logo} src={HTA_LOGO_BASE64} />

          {/* Set word by word: the spaces open by a tenth of an em while the
              letters keep the face's own fit. A tracked line would space the
              letters too, which is not what the printed letterhead does. */}
          <View style={[styles.nameRow, { top: baselineTop(LH.NAME_BASELINE, LH.NAME_SIZE, IMPACT_ASCENT) }]}>
            {COMPANY_INFO.name.split(' ').map((word, i, all) => (
              <Text
                key={i}
                style={[
                  styles.nameWord,
                  i < all.length - 1 ? { marginRight: LH.NAME_SIZE * LH.NAME_WORD_SPACING } : {},
                ]}
              >
                {word}
                {i < all.length - 1 ? ' ' : ''}
              </Text>
            ))}
          </View>

          <Text
            style={[
              styles.accreditation,
              { top: baselineTop(LH.ACCRED_BASELINE, LH.ACCRED_SIZE, ROBOTO_ASCENT) },
            ]}
          >
            ISO CERTIFIED · NABL ACCREDITED LABORATORY
          </Text>

          <View
            style={[
              styles.contactBlock,
              { top: baselineTop(LH.CONTACT_FIRST_BASELINE, LH.CONTACT_SIZE, ROBOTO_ASCENT) },
            ]}
          >
            {CONTACT_LINES.map((line, i) => (
              <Text key={i} style={[styles.contactLine, { lineHeight: LH.CONTACT_LEADING / LH.CONTACT_SIZE }]}>
                {line}
              </Text>
            ))}
          </View>

          <View style={styles.headRule} />
        </View>

        {/* ================================================================ */}
        {/* SECTION B: DOCUMENT TITLE AND FOLIO (repeats on each page)       */}
        {/* Both optically centred in the band between the rule and the body. */}
        {/* ================================================================ */}
        <View style={styles.titleSection} fixed>
          <Text
            style={[
              isAuthorized ? styles.title : styles.titleReview,
              // 0.400 is the doc's measured k for Impact, against 0.452 for Oswald.
              { top: baselineTop(centredBaseline(LH.TITLE_SIZE, 0.4), LH.TITLE_SIZE, IMPACT_ASCENT) },
            ]}
          >
            {documentTitle}
          </Text>
          <Text
            style={[
              styles.pageNumber,
              { top: baselineTop(centredBaseline(LH.FOLIO_SIZE, 0.343), LH.FOLIO_SIZE, ROBOTO_ASCENT) },
            ]}
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          />
        </View>

        {/* ================================================================ */}
        {/* SECTION C: CUSTOMER INFO TABLE (4-column paired) */}
        {/* ================================================================ */}
        <View style={[styles.customerTable, { marginBottom: dynamicMargin(10) }]} wrap={false}>
          {/* Row 1: Customer Name & Address / Date of Calibration */}
          <View style={[styles.customerRow, { minHeight: dynamicHeight(18) }]}>
            <View style={styles.customerLabelCell}>
              <Text style={styles.customerLabel}>Customer Name{'\n'}& Address</Text>
            </View>
            <View style={styles.customerValueCell}>
              <Text style={styles.customerValue}>{data.customerName || '-'}</Text>
              {data.customerAddress && (
                <Text style={styles.customerValue}>{data.customerAddress}</Text>
              )}
            </View>
            <View style={styles.customerLabelCellRight}>
              <Text style={styles.customerLabel}>Date of{'\n'}Calibration</Text>
            </View>
            <View style={styles.customerValueCellRight}>
              <Text style={styles.customerValue}>
                {/* Written the way the lab asked, as the due date is. Both are dates a
                    customer reads against their own calendar, and a certificate that
                    gave one of them in the chosen format and the other in day/month
                    was answering the same question two ways on one page.

                    '-' where there is no date, which is what this cell has always
                    printed - the due date's cell prints nothing, and that difference
                    is the cells', not the formatter's. */}
                {formatCertificateDate(
                  data.dateOfCalibration,
                  data.calibrationDueDateFormat || DEFAULT_DATE_FORMAT,
                  '-',
                )}
                {data.calibrationStartTime && data.calibrationEndTime
                  ? `\nTime: ${formatCalibrationTimeRange(data.calibrationStartTime, data.calibrationEndTime)}\nHours: ${formatCalibrationHours(data.calibrationStartTime, data.calibrationEndTime)}`
                  : ''}
              </Text>
            </View>
          </View>
          {/* Row 2: Certificate No. / Recommended Cal Due */}
          <View style={[styles.customerRowLast, { minHeight: dynamicHeight(18) }]}>
            <View style={styles.customerLabelCell}>
              <Text style={styles.customerLabel}>Certificate No.</Text>
            </View>
            <View style={styles.customerValueCell}>
              <Text style={styles.customerValue}>{data.certificateNumber || '-'}</Text>
            </View>
            <View style={styles.customerLabelCellRight}>
              <Text style={styles.customerLabel}>Recommended{'\n'}Cal Due</Text>
            </View>
            <View style={styles.customerValueCellRight}>
              <Text style={styles.customerValue}>
                {(hasFailedCalibrationPoints || data.dueDateNotApplicable)
                  ? 'Not Applicable'
                  /* The due date and the date of calibration are written the way the
                     lab asked. The dates further down are not - a master's own due date
                     and a signature's timestamp are records of when something happened
                     here, not dates a customer reads against their calendar. */
                  : formatCertificateDate(
                      data.calibrationDueDate,
                      data.calibrationDueDateFormat || DEFAULT_DATE_FORMAT,
                    )}
              </Text>
            </View>
          </View>
        </View>

        {/* ================================================================ */}
        {/* SECTION D: UUC DETAILS TABLE (4-column paired) */}
        {/* ================================================================ */}
        <View style={[styles.uucTable, { marginBottom: dynamicMargin(10) }]} wrap={false}>
          {/* Row 1: UUC / Make */}
          <View style={[styles.uucRow, { minHeight: dynamicHeight(14) }]}>
            <View style={styles.uucLabelCell}>
              <Text style={styles.uucLabel}>Unit Under{'\n'}Calibration [UUC]</Text>
            </View>
            <View style={styles.uucValueCell}>
              <Text style={styles.uucValue}>{data.uucDescription || '-'}</Text>
            </View>
            <View style={styles.uucLabelCellRight}>
              <Text style={styles.uucLabel}>Make</Text>
            </View>
            <View style={styles.uucValueCellRight}>
              <Text style={styles.uucValue}>{data.uucMake || '-'}</Text>
            </View>
          </View>

          {/* Row 2: Location Name / Model */}
          <View style={[styles.uucRow, { minHeight: dynamicHeight(14) }]}>
            <View style={styles.uucLabelCell}>
              <Text style={styles.uucLabel}>Location Name</Text>
            </View>
            <View style={styles.uucValueCell}>
              <Text style={styles.uucValue}>{data.uucLocationName || '-'}</Text>
            </View>
            <View style={styles.uucLabelCellRight}>
              <Text style={styles.uucLabel}>Model</Text>
            </View>
            <View style={styles.uucValueCellRight}>
              <Text style={styles.uucValue}>{data.uucModel || '-'}</Text>
            </View>
          </View>

          {/* Row 3: Machine Name / Id. No. */}
          <View style={[styles.uucRow, { minHeight: dynamicHeight(14) }]}>
            <View style={styles.uucLabelCell}>
              <Text style={styles.uucLabel}>Machine Name</Text>
            </View>
            <View style={styles.uucValueCell}>
              <Text style={styles.uucValue}>{data.uucMachineName || '-'}</Text>
            </View>
            <View style={styles.uucLabelCellRight}>
              <Text style={styles.uucLabel}>Id. No.</Text>
            </View>
            <View style={styles.uucValueCellRight}>
              {/* A dash reads as "we did not fill this in". Where the engineer has
                  said the unit has no number of its own, the certificate says so. */}
              <Text style={styles.uucValue}>
                {data.uucSerialNumber ||
                  data.uucInstrumentId ||
                  (data.uucSerialNumberNotApplicable && data.uucInstrumentIdNotApplicable
                    ? 'Not Applicable'
                    : '-')}
              </Text>
            </View>
          </View>

          {/* Row 4: Calibrated at, running the width of the table */}
          <View style={[styles.uucRow, { minHeight: dynamicHeight(14) }]}>
            <View style={styles.uucLabelCell}>
              <Text style={styles.uucLabel}>Calibrated at</Text>
            </View>
            <View style={styles.uucValueCellWide}>
              <Text style={styles.uucValue}>{data.calibratedAt === 'LAB' ? 'Lab' : 'Site'}</Text>
            </View>
          </View>

          {/* One block per parameter: what it is, over what span, to what resolution.
              A single-parameter certificate skips the banner - there is nothing to
              tell apart - and reads as two more rows of the table above. */}
          {parameterSpecs.map((spec, specIdx) => {
            const isLast = specIdx === parameterSpecs.length - 1
            return (
              <React.Fragment key={spec.id}>
                {!oneParameter && (
                  <View style={[styles.bannerRow, { minHeight: dynamicHeight(14) }]}>
                    <View style={styles.bannerCell}>
                      <Text style={styles.bannerText}>
                        PARAMETER UNDER CALIBRATION ASSESSMENT : {spec.name}
                      </Text>
                    </View>
                  </View>
                )}
                <View style={[styles.uucRow, { minHeight: dynamicHeight(14) }]}>
                  <View style={styles.uucLabelCell}>
                    <Text style={styles.uucLabel}>Range</Text>
                  </View>
                  <View style={styles.uucValueCell}>
                    <Text style={styles.uucValue}>{spec.range}</Text>
                  </View>
                  <View style={styles.uucLabelCellRight}>
                    <Text style={styles.uucLabel}>Operating Range</Text>
                  </View>
                  <View style={styles.uucValueCellRight}>
                    <Text style={styles.uucValue}>{spec.operatingRange}</Text>
                  </View>
                </View>
                <View
                  style={[
                    isLast ? styles.uucRowLast : styles.uucRow,
                    { minHeight: dynamicHeight(14) },
                  ]}
                >
                  <View style={styles.uucLabelCell}>
                    <Text style={styles.uucLabel}>Least Count</Text>
                  </View>
                  <View style={styles.uucValueCell}>
                    {spec.leastCountLines.length > 0 ? (
                      spec.leastCountLines.map((line, idx) => (
                        <Text key={idx} style={styles.uucValue}>{line}</Text>
                      ))
                    ) : (
                      <Text style={styles.uucValue}>-</Text>
                    )}
                  </View>
                  <View style={styles.uucLabelCellRight}>
                    <Text style={styles.uucLabel}>Accuracy</Text>
                  </View>
                  <View style={styles.uucValueCellRight}>
                    {spec.accuracyLines.length > 0 ? (
                      spec.accuracyLines.map((line, idx) => (
                        <Text key={idx} style={styles.uucValue}>{line}</Text>
                      ))
                    ) : (
                      <Text style={styles.uucValue}>-</Text>
                    )}
                  </View>
                </View>
              </React.Fragment>
            )
          })}
        </View>

        {/* ================================================================ */}
        {/* SECTION E: ENVIRONMENTAL CONDITION */}
        {/* ================================================================ */}
        <View style={[styles.infoLine, { marginBottom: dynamicMargin(5) }]} wrap={false}>
          <Text style={styles.infoLabel}>Environmental Condition :</Text>
          <Text style={styles.infoValue}>
            {data.ambientTemperature ? `${data.ambientTemperature} °C` : '-'}
            {data.relativeHumidity ? `, ${data.relativeHumidity} %RH` : ''}
          </Text>
        </View>

        {/* ================================================================ */}
        {/* SECTION F: CALIBRATION PROCEDURE REFERENCE */}
        {/* ================================================================ */}
        {oneParameter ? (
          /* One parameter, one procedure - a sentence says it without a table. */
          <View style={[styles.infoLine, { marginBottom: dynamicMargin(5) }]} wrap={false}>
            <Text style={styles.infoLabel}>Calibration procedure reference :</Text>
            <Text style={styles.infoValue}>
              {parameterSpecs[0]?.sopReference
                ? `HTA Cal Procedure ${parameterSpecs[0].sopReference}`
                : '-'}
            </Text>
          </View>
        ) : (
          /* Two or more, and the joined sentence stopped saying which procedure
             covered which parameter. One block each answers it. */
          <View style={{ marginBottom: dynamicMargin(5) }} wrap={false}>
            <Text style={[styles.infoLabel, { marginBottom: dynamicMargin(3) }]}>
              Calibration procedure reference :
            </Text>
            <View style={styles.uucTable}>
              {parameterSpecs.map((spec, specIdx) => (
                <React.Fragment key={spec.id}>
                  <View style={[styles.bannerRow, { minHeight: dynamicHeight(14) }]}>
                    <View style={styles.bannerCell}>
                      <Text style={styles.bannerText}>
                        PARAMETER UNDER CALIBRATION ASSESSMENT : {spec.name}
                      </Text>
                    </View>
                  </View>
                  <View
                    style={[
                      specIdx === parameterSpecs.length - 1 ? styles.uucRowLast : styles.uucRow,
                      { minHeight: dynamicHeight(14) },
                    ]}
                  >
                    <View style={styles.halfLabelCell}>
                      <Text style={styles.uucLabel}>HTA Calibration SOP Reference</Text>
                    </View>
                    <View style={styles.halfValueCell}>
                      <Text style={styles.uucValue}>{spec.sopReference || '-'}</Text>
                    </View>
                  </View>
                </React.Fragment>
              ))}
            </View>
          </View>
        )}

        {/* ================================================================ */}
        {/* SECTION G: CALIBRATION DATA TABLES (per parameter) */}
        {/* Reordered based on layout plan for optimal page distribution */}
        {/* ================================================================ */}
        {parametersToRender.map((param, _paramIdx) => {
          const rangeStr = param.rangeMin && param.rangeMax
            ? `${param.rangeMin} to ${param.rangeMax} ${param.parameterUnit}`
            : ''
          const _middleRowIdx = Math.floor(param.results.length / 2)
          const sectionId = `cal-table-${param.id}`
          const needsBreak = shouldBreakBefore(sectionId, layoutPlan)

          // Section 05 lets an engineer declare the columns for this table. When it has,
          // the certificate prints those columns; a parameter that declared none keeps
          // the fixed Standard / UUC / Error / Remarks layout, which is every
          // certificate written before Section 05 existed.
          const declared = [...(param.fieldDefinitions ?? [])].sort((a, b) => {
            if (a.group !== b.group) return a.group === 'master' ? -1 : 1
            return a.order - b.order
          })
          const isDynamic = declared.length > 0
          // Sl. No. and Parameter & Range keep their widths; the rest of the table is
          // shared evenly by the declared columns plus Error and Remarks.
          const dataColumnCount = declared.length + 2
          const dataWidth = `${100 / dataColumnCount}%`
          const masterColumns = declared.filter((f) => f.group === 'master')
          const uucColumns = declared.filter((f) => f.group === 'uuc')
          // The declared columns share the part of the table that is not Error or
          // Remarks; widths inside that block are relative to it, so a band over n
          // columns and the n columns themselves always line up.
          const declaredWidth = `${(100 * declared.length) / dataColumnCount}%`
          const bandWidth = (n: number) =>
            declared.length > 0 ? `${(100 * n) / declared.length}%` : '0%'
          // One tier of the header. Both tiers get the same height, and the cells that
          // span both get twice it, so nothing sits half a row out.
          const headerTier = dynamicHeight(12)

          return (
            <View key={param.id} style={[styles.calibrationSection, { marginBottom: dynamicMargin(12) }]} wrap={false} break={needsBreak}>
              <View style={styles.calibrationTable}>
                {/* Header Row 1 */}
                <View
                  style={[
                    styles.calibrationHeaderRow,
                    isDynamic ? { minHeight: headerTier * 2 } : {},
                  ]}
                >
                  <View style={[styles.calCell, { width: '8%' }]}>
                    <Text style={styles.calHeaderText}>Sl.</Text>
                    <Text style={styles.calHeaderText}>No.</Text>
                  </View>
                  <View style={[styles.calCell, { width: '20%' }]}>
                    <Text style={styles.calHeaderText}>Parameter &</Text>
                    <Text style={styles.calHeaderText}>Range</Text>
                  </View>
                  {isDynamic ? (
                    // Two tiers over the declared columns - which instrument they
                    // belong to, then the columns themselves - while Error Observed and
                    // Remarks span both, since neither belongs to an instrument. Every
                    // tier is one headerTier high so the two sides line up.
                    <View style={{ width: '72%', flexDirection: 'row', alignItems: 'stretch' }}>
                      <View style={{ width: declaredWidth }}>
                        <View
                          style={{
                            flexDirection: 'row',
                            alignItems: 'stretch',
                            minHeight: headerTier,
                            borderBottomWidth: 0.5,
                            borderBottomColor: '#000',
                          }}
                        >
                          {masterColumns.length > 0 && (
                            <View
                              style={[styles.calCell, { width: bandWidth(masterColumns.length) }]}
                            >
                              <Text style={styles.calHeaderText}>Master Instrument</Text>
                            </View>
                          )}
                          {uucColumns.length > 0 && (
                            <View style={[styles.calCell, { width: bandWidth(uucColumns.length) }]}>
                              <Text style={styles.calHeaderText}>UUC</Text>
                            </View>
                          )}
                        </View>
                        <View
                          style={{ flexDirection: 'row', alignItems: 'stretch', minHeight: headerTier }}
                        >
                          {declared.map((field) => (
                            <View
                              key={field.id}
                              style={[styles.calCell, { width: bandWidth(1) }]}
                            >
                              <Text style={styles.calHeaderText}>
                                {columnLabel(field, param.errorConfig ?? null)}
                              </Text>
                            </View>
                          ))}
                        </View>
                      </View>
                      <View
                        style={[
                          styles.calCell,
                          { width: dataWidth, minHeight: headerTier * 2 },
                        ]}
                      >
                        <Text style={styles.calHeaderText}>Error Observed</Text>
                        <Text style={styles.calHeaderText}>
                          (±) {errorFormulaLabel(param.errorConfig ?? null)}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.calCellLast,
                          { width: dataWidth, minHeight: headerTier * 2 },
                        ]}
                      >
                        <Text style={styles.calHeaderText}>Remarks</Text>
                      </View>
                    </View>
                  ) : (
                    <View style={{ width: '72%', flexDirection: 'row' }}>
                      <View style={[styles.calCell, { width: '25%' }]}>
                        <Text style={styles.calHeaderText}>Standard Meter</Text>
                        <Text style={styles.calHeaderText}>Reading (y)</Text>
                      </View>
                      <View style={[styles.calCell, { width: '25%' }]}>
                        <Text style={styles.calHeaderText}>UUC Reading</Text>
                        <Text style={styles.calHeaderText}>(x)</Text>
                      </View>
                      <View style={[styles.calCell, { width: '25%' }]}>
                        <Text style={styles.calHeaderText}>Error Observed</Text>
                        <Text style={styles.calHeaderText}>(±) z = (x-y)</Text>
                      </View>
                      <View style={[styles.calCellLast, { width: '25%' }]}>
                        <Text style={styles.calHeaderText}>Remarks</Text>
                      </View>
                    </View>
                  )}
                </View>

                {/* Sub-header Row (units) */}
                <View style={[styles.calibrationSubHeaderRow, isDynamic ? { minHeight: headerTier } : {}]}>
                  <View style={[styles.calCell, { width: '8%' }]}>
                    <Text style={styles.calSubHeaderText}></Text>
                  </View>
                  <View style={[styles.calCell, { width: '20%' }]}>
                    {/* The engineer's own name for this table, which is what it is
                        called on the certificate. Falls back to the parameter. */}
                    <Text style={styles.calSubHeaderText}>
                      {param.tableName?.trim() || param.parameterName?.toUpperCase() || ''}
                    </Text>
                  </View>
                  {isDynamic ? (
                    <View style={{ width: '72%', flexDirection: 'row', alignItems: 'stretch' }}>
                      {declared.map((field) => (
                        <View key={field.id} style={[styles.calCell, { width: dataWidth }]}>
                          <Text style={styles.calSubHeaderText}>{field.unit || ''}</Text>
                        </View>
                      ))}
                      <View style={[styles.calCell, { width: dataWidth }]}>
                        <Text style={styles.calSubHeaderText}>
                          {param.errorConfig?.unit || param.parameterUnit}
                        </Text>
                      </View>
                      <View style={[styles.calCellLast, { width: dataWidth }]}>
                        <Text style={styles.calSubHeaderText}></Text>
                      </View>
                    </View>
                  ) : (
                    <View style={{ width: '72%', flexDirection: 'row' }}>
                      <View style={[styles.calCell, { width: '25%' }]}>
                        <Text style={styles.calSubHeaderText}>{param.parameterUnit}</Text>
                      </View>
                      <View style={[styles.calCell, { width: '25%' }]}>
                        <Text style={styles.calSubHeaderText}>{param.parameterUnit}</Text>
                      </View>
                      <View style={[styles.calCell, { width: '25%' }]}>
                        <Text style={styles.calSubHeaderText}>{param.parameterUnit}</Text>
                      </View>
                      <View style={[styles.calCellLast, { width: '25%' }]}>
                        <Text style={styles.calSubHeaderText}></Text>
                      </View>
                    </View>
                  )}
                </View>

                {/* Data section with merged Parameter & Range column */}
                <View style={{ flexDirection: 'row', alignItems: 'stretch' }}>
                  {/* Sl. No. column (individual cells per row) */}
                  <View style={{ width: '8%' }}>
                    {param.results.map((result, resultIdx) => {
                      const isLastRow = resultIdx === param.results.length - 1
                      return (
                        <View
                          key={`sl-${result.id}`}
                          style={[styles.calCell, {
                            width: '100%',
                            minHeight: dynamicHeight(14),
                            borderBottomWidth: isLastRow ? 0 : 0.5,
                            borderBottomColor: '#000',
                          }]}
                        >
                          <Text style={[styles.calCellText, result.isOutOfLimit ? styles.failedCalCellText : {}]}>{padSerialNumber(resultIdx + 1)}</Text>
                        </View>
                      )
                    })}
                  </View>

                  {/* Merged Parameter & Range column (single cell spanning all rows) */}
                  <View style={[styles.calCell, { width: '20%', minHeight: param.results.length * dynamicHeight(14) }]}>
                    <Text style={styles.calCellText}>{rangeStr || '-'}</Text>
                  </View>

                  {/* Other data columns (individual cells per row) */}
                  <View style={{ width: '72%' }}>
                    {param.results.map((result, resultIdx) => {
                      const isLastRow = resultIdx === param.results.length - 1
                      // The reading the least count is judged at: the declared master
                      // field where there is one, the legacy standardReading otherwise.
                      // A row may predate the schema and hold only the legacy three,
                      // so map those onto the declared columns rather than print blanks.
                      const rowValues = isDynamic
                        ? resultValues(result, declared, param.errorConfig ?? null)
                        : {}
                      const masterReading = isDynamic
                        ? (rowValues[param.errorConfig?.masterFieldId ?? ''] ?? null)
                        : result.standardReading
                      const { precision } = resolveCalibrationPrecision(param, masterReading)
                      /**
                       * The error is reported at the finer of the two instruments'
                       * resolutions, which is neither reading's own.
                       *
                       * The master's comes from the copy the certificate kept when the
                       * instrument was chosen, not from the register - the register
                       * moves on and a certificate has to keep saying what the
                       * instrument was good to on the day.
                       */
                      const errorPrecision = precisionOf(
                        errorResolution(
                          recordedResolution('master', masterLeastCountFor(param.id)),
                          uucResolution(param, Number(masterReading)),
                        ),
                      )
                      const failedText = result.isOutOfLimit ? styles.failedCalCellText : {}
                      // Expression columns are computed here rather than stored, so the
                      // certificate shows the same value the engineer saw.
                      const resolved = isDynamic
                        ? resolveRowValues(
                            {
                              id: result.id,
                              pointNumber: result.pointNumber,
                              values: rowValues,
                              errorObserved: result.errorObserved,
                              isOutOfLimit: result.isOutOfLimit,
                            },
                            declared,
                          )
                        : {}

                      return (
                        <View
                          key={result.id}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'stretch',
                            minHeight: dynamicHeight(14),
                            borderBottomWidth: isLastRow ? 0 : 0.5,
                            borderBottomColor: '#000',
                          }}
                        >
                          {isDynamic ? (
                            declared.map((field) => {
                              const raw = resolved[field.id] ?? ''
                              const numeric =
                                field.type !== 'text' && raw !== '' && Number.isFinite(Number(raw))
                              return (
                                <View key={field.id} style={[styles.calCell, { width: dataWidth }]}>
                                  <Text style={[styles.calCellText, failedText]}>
                                    {numeric ? formatWithPrecision(Number(raw), precision) : raw || '-'}
                                  </Text>
                                </View>
                              )
                            })
                          ) : (
                            <>
                              <View style={[styles.calCell, { width: '25%' }]}>
                                <Text style={[styles.calCellText, failedText]}>
                                  {formatWithPrecision(result.standardReading, precision)}
                                </Text>
                              </View>
                              <View style={[styles.calCell, { width: '25%' }]}>
                                <Text style={[styles.calCellText, failedText]}>
                                  {formatWithPrecision(result.beforeAdjustment, precision)}
                                </Text>
                              </View>
                            </>
                          )}
                          <View style={[styles.calCell, { width: isDynamic ? dataWidth : '25%' }]}>
                            <Text style={[styles.calCellText, failedText]}>
                              {result.errorObserved !== null
                                ? /* errorPrecision, not the readings' - an error is a
                                     difference between two instruments and is bound by
                                     neither alone. Printed at the unit's resolution, a
                                     real error of 0.28 against a unit reading whole
                                     degrees came out as "0". */
                                  formatWithPrecision(result.errorObserved, errorPrecision)
                                : '-'}
                            </Text>
                          </View>
                          <View style={[styles.calCellLast, { width: isDynamic ? dataWidth : '25%' }]}>
                            <Text style={[styles.calCellText, failedText]}>
                              {result.isOutOfLimit
                                ? 'Fail*'
                                : result.errorObserved !== null ? 'Pass' : '-'}
                            </Text>
                          </View>
                        </View>
                      )
                    })}
                  </View>
                </View>
              </View>
            </View>
          )
        })}

        {/* ================================================================ */}
        {/* SECTION H: MASTER INSTRUMENTS USED DETAILS (Table Format) */}
        {/* ================================================================ */}
        <View style={[styles.masterSection, { marginBottom: dynamicMargin(8) }]} wrap={false} break={shouldBreakBefore('master-instruments', layoutPlan)}>
          <Text style={[styles.masterHeader, { marginBottom: dynamicMargin(4) }]}>MASTER INSTRUMENTS USED DETAILS:-</Text>

          {masterGroups.map((group) => {
            const master = group.entry
            const oneCapability = group.capabilities.length <= 1
            return (
              <View key={master.id} style={styles.masterTable}>
                <View style={[styles.masterRow, { minHeight: dynamicHeight(14) }]}>
                  <View style={styles.masterLabelCell}>
                    <Text style={styles.masterLabel}>Inst. Description</Text>
                  </View>
                  <View style={styles.masterValueCell}>
                    <Text style={styles.masterValue}>{master.description || '-'}</Text>
                  </View>
                  <View style={styles.masterLabelCellRight}>
                    <Text style={styles.masterLabel}>Make</Text>
                  </View>
                  <View style={styles.masterValueCellRight}>
                    <Text style={styles.masterValue}>{master.make || '-'}</Text>
                  </View>
                </View>

                <View style={[styles.masterRow, { minHeight: dynamicHeight(14) }]}>
                  <View style={styles.masterLabelCell}>
                    <Text style={styles.masterLabel}>Model</Text>
                  </View>
                  <View style={styles.masterValueCell}>
                    <Text style={styles.masterValue}>{master.model || '-'}</Text>
                  </View>
                  <View style={styles.masterLabelCellRight}>
                    <Text style={styles.masterLabel}>Sl. No.</Text>
                  </View>
                  <View style={styles.masterValueCellRight}>
                    <Text style={styles.masterValue}>{master.serialNumber || '-'}</Text>
                  </View>
                </View>

                <View style={[styles.masterRow, { minHeight: dynamicHeight(14) }]}>
                  <View style={styles.masterLabelCell}>
                    <Text style={styles.masterLabel}>Calibration Due</Text>
                  </View>
                  <View style={styles.masterValueCell}>
                    <Text style={styles.masterValue}>{formatDateDDMMYYYY(master.calibrationDueDate)}</Text>
                  </View>
                  <View style={styles.masterLabelCellRight}>
                    <Text style={styles.masterLabel}>Certificate No.</Text>
                  </View>
                  <View style={styles.masterValueCellRight}>
                    <Text style={styles.masterValue}>{master.reportNo || '-'}</Text>
                  </View>
                </View>

                {/* What the instrument resolves to and is accurate to, from its own
                    certificate. An instrument with two capabilities has two sets in
                    different units, so each gets a banner; with one there is nothing
                    to tell apart and the row stands on its own. */}
                {group.capabilities.map((capability, capIdx) => (
                  <React.Fragment key={`${capability.parameter}-${capIdx}`}>
                    {!oneCapability && (
                      <View style={[styles.bannerRow, { minHeight: dynamicHeight(14) }]}>
                        <View style={styles.bannerCell}>
                          <Text style={styles.bannerText}>
                            Master Parameter Used : {capability.parameter || '-'}
                          </Text>
                        </View>
                      </View>
                    )}
                    <View style={[styles.masterRow, { minHeight: dynamicHeight(14) }]}>
                      <View style={styles.masterLabelCell}>
                        <Text style={styles.masterLabel}>Least Count</Text>
                      </View>
                      <View style={styles.masterValueCell}>
                        <Text style={styles.masterValue}>{capability.leastCount}</Text>
                      </View>
                      <View style={styles.masterLabelCellRight}>
                        <Text style={styles.masterLabel}>Accuracy</Text>
                      </View>
                      <View style={styles.masterValueCellRight}>
                        <Text style={styles.masterValue}>{capability.accuracy}</Text>
                      </View>
                    </View>
                  </React.Fragment>
                ))}

                <View
                  style={[
                    oneParameter ? styles.masterRowLast : styles.masterRow,
                    { minHeight: dynamicHeight(14) },
                  ]}
                >
                  <View style={styles.masterLabelCell}>
                    <Text style={styles.masterLabel}>Calibrated At</Text>
                  </View>
                  <View style={[styles.masterValueCell, { width: '80%', borderRightWidth: 0 }]}>
                    <Text style={styles.masterValue}>{master.calibratedAt || '-'}</Text>
                  </View>
                </View>

                {/* Which parameters on this certificate it was used for. Dropped where
                    there is only one - the certificate is about that one thing, and a
                    heading with a single answer says nothing. */}
                {!oneParameter && group.uses.length > 0 && (
                  <>
                    <View style={[styles.headerRow, { minHeight: dynamicHeight(14) }]}>
                      <View style={styles.halfLabelCell}>
                        <Text style={styles.masterLabel}>Used for UUC Parameters</Text>
                      </View>
                      <View style={styles.halfValueCell}>
                        <Text style={styles.masterLabel}>Range</Text>
                      </View>
                    </View>
                    {group.uses.map((use, useIdx) => (
                      <View
                        key={`${use.parameter}-${useIdx}`}
                        style={[
                          useIdx === group.uses.length - 1 ? styles.masterRowLast : styles.masterRow,
                          { minHeight: dynamicHeight(14) },
                        ]}
                      >
                        <View style={styles.halfLabelCell}>
                          <Text style={styles.masterValue}>{use.parameter || '-'}</Text>
                        </View>
                        <View style={styles.halfValueCell}>
                          <Text style={styles.masterValue}>{use.range}</Text>
                        </View>
                      </View>
                    ))}
                  </>
                )}
              </View>
            )
          })}
        </View>

        {/* Keep the entire conclusion/signature group on the same PDF page. */}
        <View wrap={false} break={shouldBreakBefore('group-e', layoutPlan)}>
          {/* ================================================================ */}
          {/* SECTION I: CONCLUSION (normal flow) */}
          {/* ================================================================ */}
          {(data.selectedConclusionStatements.length > 0 || data.additionalConclusionStatement) && (
          <View style={[styles.conclusionSection, { marginTop: dynamicMargin(8), marginBottom: dynamicMargin(8) }]} wrap={false}>
            {data.selectedConclusionStatements.map((statementKey, idx) => (
              <View key={idx} style={[styles.conclusionItem, { marginBottom: dynamicMargin(2) }]}>
                {idx === 0 ? (
                  <Text style={styles.conclusionLabel}>Conclusion</Text>
                ) : (
                  <View style={{ width: 70 }} />
                )}
                <Text style={styles.conclusionColon}>:</Text>
                <Text style={styles.conclusionNumber}>{idx + 1}.</Text>
                <Text style={styles.conclusionText}>
                  {statementKey === 'out_of_accuracy' ? (
                    <>
                      <Text style={styles.conclusionMarker}>{'"*"'}</Text>
                      {getConclusionText(statementKey).slice(3)}
                    </>
                  ) : getConclusionText(statementKey)}
                </Text>
              </View>
            ))}
            {/* Additional custom conclusion statement */}
            {data.additionalConclusionStatement && (
              <View style={[styles.conclusionItem, { marginBottom: dynamicMargin(2) }]}>
                {data.selectedConclusionStatements.length === 0 ? (
                  <Text style={styles.conclusionLabel}>Conclusion</Text>
                ) : (
                  <View style={{ width: 70 }} />
                )}
                <Text style={styles.conclusionColon}>:</Text>
                <Text style={styles.conclusionNumber}>{data.selectedConclusionStatements.length + 1}.</Text>
                <Text style={styles.conclusionText}>{data.additionalConclusionStatement}</Text>
              </View>
            )}
          </View>
          )}

          {/* ================================================================ */}
          {/* SECTION J: VALIDITY STATEMENT (normal flow) */}
          {/* ================================================================ */}
          <View style={[styles.validitySection, { marginBottom: dynamicMargin(4) }]} wrap={false}>
            <Text style={styles.validityText}>{VALIDITY_STATEMENT}</Text>
          </View>

          {/* ================================================================ */}
          {/* SECTION K: SIGNATURE BLOCK - 3 columns: Engineer, Reviewer, Admin */}
          {/* ================================================================ */}
          <View style={[styles.signatureSection, { marginTop: dynamicMargin(4) }]} wrap={false}>
          <View style={styles.signatureRow}>
            {/* Column 1: Calibrated By (Engineer) */}
            <View style={styles.signatureColumn}>
              <Text style={styles.signatureLabel}>CALIBRATED BY:</Text>
              {signatures?.engineer?.image ? (
                <Image src={signatures.engineer.image} style={styles.signatureImage} />
              ) : (
                <View style={styles.signatureBox} />
              )}
              <Text style={[styles.signatureName, { marginBottom: signatures?.engineer?.metadata ? 2 : 0 }]}>{signatures?.engineer?.name || SIGNATORIES.calibratedBy}</Text>
              {/* Signing Metadata */}
              {signatures?.engineer?.metadata && (
                <View style={styles.signatureMetadata}>
                  {signatures.engineer.metadata.signedAt && (
                    <Text style={styles.signatureMetadataLine}>
                      <Text style={styles.signatureMetadataLabel}>Signed:</Text>
                      {formatSigningDateTime(signatures.engineer.metadata.signedAt, signatures.engineer.metadata.timezone)}
                    </Text>
                  )}
                  {signatures.engineer.metadata.ipAddress && (
                    <Text style={styles.signatureMetadataLine}>
                      <Text style={styles.signatureMetadataLabel}>IP: </Text>
                      {signatures.engineer.metadata.ipAddress}
                    </Text>
                  )}
                  {signatures.engineer.metadata.deviceInfo && (
                    <Text style={styles.signatureMetadataLine}>
                      <Text style={styles.signatureMetadataLabel}>Device: </Text>
                      {signatures.engineer.metadata.deviceInfo}
                    </Text>
                  )}
                </View>
              )}
              {signatures?.engineer?.signatureId && (
                <Text style={styles.signatureMetadataLine}>
                  <Text style={styles.signatureMetadataLabel}>Signature ID: </Text>
                  {signatures.engineer.signatureId}
                </Text>
              )}
            </View>

            {/* Column 2: Checked By (Reviewer) */}
            <View style={styles.signatureColumn}>
              <Text style={styles.signatureLabel}>CHECKED BY:</Text>
              {signatures?.hod?.image ? (
                <Image src={signatures.hod.image} style={styles.signatureImage} />
              ) : (
                <View style={styles.signatureBox} />
              )}
              <Text style={[styles.signatureName, { marginBottom: signatures?.hod?.metadata ? 2 : 0 }]}>{signatures?.hod?.name || SIGNATORIES.checkedBy}</Text>
              {/* Signing Metadata */}
              {signatures?.hod?.metadata && (
                <View style={styles.signatureMetadata}>
                  {signatures.hod.metadata.signedAt && (
                    <Text style={styles.signatureMetadataLine}>
                      <Text style={styles.signatureMetadataLabel}>Signed: </Text>
                      {formatSigningDateTime(signatures.hod.metadata.signedAt, signatures.hod.metadata.timezone)}
                    </Text>
                  )}
                  {signatures.hod.metadata.ipAddress && (
                    <Text style={styles.signatureMetadataLine}>
                      <Text style={styles.signatureMetadataLabel}>IP: </Text>
                      {signatures.hod.metadata.ipAddress}
                    </Text>
                  )}
                  {signatures.hod.metadata.deviceInfo && (
                    <Text style={styles.signatureMetadataLine}>
                      <Text style={styles.signatureMetadataLabel}>Device: </Text>
                      {signatures.hod.metadata.deviceInfo}
                    </Text>
                  )}
                </View>
              )}
              {signatures?.hod?.signatureId && (
                <Text style={styles.signatureMetadataLine}>
                  <Text style={styles.signatureMetadataLabel}>Signature ID: </Text>
                  {signatures.hod.signatureId}
                </Text>
              )}
            </View>

            {/* Column 3: Approved & Issued By (Admin) */}
            <View style={styles.signatureColumn}>
              <Text style={styles.signatureLabel}>APPROVED & ISSUED BY:</Text>
              {signatures?.admin?.image ? (
                <Image src={signatures.admin.image} style={styles.signatureImage} />
              ) : (
                <View style={styles.signatureBox} />
              )}
              <Text style={[styles.signatureName, { marginBottom: signatures?.admin?.metadata ? 2 : 0 }]}>{signatures?.admin?.name || SIGNATORIES.approvedIssuedBy}</Text>
              {/* Signing Metadata */}
              {signatures?.admin?.metadata && (
                <View style={styles.signatureMetadata}>
                  {signatures.admin.metadata.signedAt && (
                    <Text style={styles.signatureMetadataLine}>
                      <Text style={styles.signatureMetadataLabel}>Signed: </Text>
                      {formatSigningDateTime(signatures.admin.metadata.signedAt, signatures.admin.metadata.timezone)}
                    </Text>
                  )}
                  {signatures.admin.metadata.ipAddress && (
                    <Text style={styles.signatureMetadataLine}>
                      <Text style={styles.signatureMetadataLabel}>IP: </Text>
                      {signatures.admin.metadata.ipAddress}
                    </Text>
                  )}
                  {signatures.admin.metadata.deviceInfo && (
                    <Text style={styles.signatureMetadataLine}>
                      <Text style={styles.signatureMetadataLabel}>Device: </Text>
                      {signatures.admin.metadata.deviceInfo}
                    </Text>
                  )}
                </View>
              )}
              {signatures?.admin?.signatureId && (
                <Text style={styles.signatureMetadataLine}>
                  <Text style={styles.signatureMetadataLabel}>Signature ID: </Text>
                  {signatures.admin.signatureId}
                </Text>
              )}
            </View>
          </View>
          </View>

          {/* ================================================================ */}
          {/* SECTION M: CUSTOMER ACKNOWLEDGMENT (conditional) */}
          {/* ================================================================ */}
          {signatures?.customer && (
            <View style={styles.customerAckSection} wrap={false}>
            <Text style={styles.customerAckTitle}>CUSTOMER ACKNOWLEDGMENT</Text>
            <Text style={styles.customerAckText}>{CUSTOMER_ACKNOWLEDGMENT_TEXT}</Text>
            <View style={styles.customerAckBody}>
              <View style={styles.customerAckSigBox}>
                {signatures.customer.image ? (
                  <Image src={signatures.customer.image} style={styles.customerAckSigImage} />
                ) : (
                  <Text style={{ fontSize: 7, color: '#999' }}>Signed</Text>
                )}
              </View>
              <View style={styles.customerAckDetails}>
                <Text style={styles.customerAckDetailLine}>
                  <Text style={styles.customerAckDetailLabel}>Customer: </Text>
                  {signatures.customer.companyName}
                </Text>
                <Text style={styles.customerAckDetailLine}>
                  <Text style={styles.customerAckDetailLabel}>Name: </Text>
                  {signatures.customer.name}
                </Text>
                <Text style={styles.customerAckDetailLine}>
                  <Text style={styles.customerAckDetailLabel}>Email: </Text>
                  {signatures.customer.email}
                </Text>
                <Text style={styles.customerAckDetailLine}>
                  <Text style={styles.customerAckDetailLabel}>Date: </Text>
                  {signatures.customer.metadata?.signedAt
                    ? formatSigningDateTime(signatures.customer.metadata.signedAt, signatures.customer.metadata.timezone)
                    : formatDateDDMMYYYY(signatures.customer.signedAt.split('T')[0])}
                </Text>
                {signatures.customer.metadata?.ipAddress && (
                  <Text style={styles.customerAckDetailLine}>
                    <Text style={styles.customerAckDetailLabel}>IP: </Text>
                    {signatures.customer.metadata.ipAddress}
                  </Text>
                )}
                {signatures.customer.metadata?.deviceInfo && (
                  <Text style={styles.customerAckDetailLine}>
                    <Text style={styles.customerAckDetailLabel}>Device: </Text>
                    {signatures.customer.metadata.deviceInfo}
                  </Text>
                )}
              </View>
            </View>
            <Text style={styles.customerAckDetailLine}>
              <Text style={styles.customerAckDetailLabel}>Signature ID: </Text>
              {signatures.customer.signatureId}
            </Text>
            </View>
          )}

        </View>

        {/* ================================================================ */}
        {/* SECTION L: FOOTER NOTES */}
        {/* ================================================================ */}
        <View style={styles.footerSection} fixed>
          {FOOTER_NOTES.map((note, idx) => (
            <Text key={idx} style={styles.footerNote}>
              {idx + 1}. {note}
            </Text>
          ))}
        </View>

        {/* ================================================================ */}
        {/* APPENDIX: the photographs, and the readings they are evidence of */}
        {/* Opens on a fresh page of its own and keeps the letterhead, the   */}
        {/* watermark and the folio, so it reads as part of the certificate. */}
        {/* ================================================================ */}
        {appendix ? <CertificateAppendix appendix={appendix} /> : null}
      </Page>
    </Document>
  )
}

export default CalibrationCertificatePDF
