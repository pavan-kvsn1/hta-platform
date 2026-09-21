/**
 * The certificate's print colours, in one place.
 *
 * HTA_BLUE lived in CalibrationCertificatePDF.tsx until the appendix needed it too, and
 * a second copy of a hex is a copy that eventually says something else. It matches
 * packages/assets/brand.json, which is also what the logo and watermark are recoloured
 * to; brand-colour.test.ts fails if the two drift.
 */
export const HTA_BLUE = '#0099CC'

/** The company name on the letterhead. Near-black rather than black, off the proofs. */
export const INK = '#101820'

/** Contact detail, captions, anything secondary. */
export const SLATE = '#64748B'

/** The rules either side of an address, and the edge of a photograph. */
export const HAIRLINE = '#CBD5E1'
