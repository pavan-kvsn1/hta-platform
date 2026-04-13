export const CONSENT_VERSION = '1.0.0'

export const CONSENT_STATEMENTS = [
  'I have reviewed the certificate in full.',
  'I confirm the details are correct and accepted as issued.',
  'I consent to signing this document electronically.',
  'I am authorized to sign on behalf of the indicated party.',
] as const

export const CONSENT_TEXT = CONSENT_STATEMENTS.join(' ')
