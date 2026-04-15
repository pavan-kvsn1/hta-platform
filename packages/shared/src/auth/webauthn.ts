/**
 * @hta/shared - WebAuthn (Passkeys) Authentication
 *
 * Provides passwordless authentication using WebAuthn/FIDO2.
 * Supports security keys, biometrics, and platform authenticators.
 *
 * Usage:
 *   import { startRegistration, finishRegistration, startAuthentication } from '@hta/shared/auth'
 *
 *   // Registration flow
 *   const options = await startRegistration(user)
 *   // ... browser creates credential ...
 *   const credential = await finishRegistration(response, challenge)
 *
 *   // Authentication flow
 *   const authOptions = await startAuthentication(userCredentials)
 *   // ... browser signs challenge ...
 *   const verified = await finishAuthentication(response, challenge, credential)
 *
 * Note: This module provides the server-side logic. Use @simplewebauthn/browser
 * on the client side for the actual WebAuthn API calls.
 */

import { createLogger } from '../logger/index.js'
import { randomBytes, createHash, createVerify } from 'crypto'

const logger = createLogger('webauthn')

// WebAuthn configuration
const WEBAUTHN_CONFIG = {
  rpName: process.env.WEBAUTHN_RP_NAME || 'HTA Calibr8s',
  rpId: process.env.WEBAUTHN_RP_ID || 'localhost',
  origin: process.env.WEBAUTHN_ORIGIN || 'http://localhost:3000',
  timeout: 60000, // 60 seconds
  challengeSize: 32,
}

export interface WebAuthnUser {
  id: string
  email: string
  name?: string
}

export interface WebAuthnCredential {
  credentialId: string
  publicKey: Buffer
  counter: number
  deviceType?: string
  transports?: AuthenticatorTransport[]
}

export type AuthenticatorTransport = 'usb' | 'nfc' | 'ble' | 'internal' | 'hybrid'

export interface RegistrationOptions {
  challenge: string
  rp: { id: string; name: string }
  user: { id: string; name: string; displayName: string }
  pubKeyCredParams: Array<{ type: 'public-key'; alg: number }>
  timeout: number
  attestation: 'none' | 'indirect' | 'direct'
  authenticatorSelection: {
    authenticatorAttachment?: 'platform' | 'cross-platform'
    residentKey: 'discouraged' | 'preferred' | 'required'
    userVerification: 'discouraged' | 'preferred' | 'required'
  }
  excludeCredentials?: Array<{ id: string; type: 'public-key'; transports?: AuthenticatorTransport[] }>
}

export interface AuthenticationOptions {
  challenge: string
  timeout: number
  rpId: string
  allowCredentials: Array<{ id: string; type: 'public-key'; transports?: AuthenticatorTransport[] }>
  userVerification: 'discouraged' | 'preferred' | 'required'
}

/**
 * Generate a cryptographically secure challenge
 */
export function generateChallenge(): string {
  return randomBytes(WEBAUTHN_CONFIG.challengeSize).toString('base64url')
}

/**
 * Start WebAuthn registration - generates options for navigator.credentials.create()
 */
export function startRegistration(
  user: WebAuthnUser,
  existingCredentials: Array<{ id: string; transports?: AuthenticatorTransport[] }> = []
): RegistrationOptions {
  const challenge = generateChallenge()

  const options: RegistrationOptions = {
    challenge,
    rp: {
      id: WEBAUTHN_CONFIG.rpId,
      name: WEBAUTHN_CONFIG.rpName,
    },
    user: {
      id: Buffer.from(user.id).toString('base64url'),
      name: user.email,
      displayName: user.name || user.email,
    },
    pubKeyCredParams: [
      { type: 'public-key', alg: -7 }, // ES256 (ECDSA w/ SHA-256)
      { type: 'public-key', alg: -257 }, // RS256 (RSASSA-PKCS1-v1_5 w/ SHA-256)
    ],
    timeout: WEBAUTHN_CONFIG.timeout,
    attestation: 'none', // We don't need attestation for most use cases
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
    excludeCredentials: existingCredentials.map((cred) => ({
      id: cred.id,
      type: 'public-key' as const,
      transports: cred.transports,
    })),
  }

  logger.info({ userId: user.id }, 'Started WebAuthn registration')
  return options
}

/**
 * Finish WebAuthn registration - verifies the credential and extracts public key
 */
export async function finishRegistration(
  response: {
    id: string
    rawId: string
    type: 'public-key'
    response: {
      clientDataJSON: string
      attestationObject: string
    }
  },
  expectedChallenge: string,
  expectedOrigin: string = WEBAUTHN_CONFIG.origin
): Promise<{
  verified: boolean
  credential?: {
    credentialId: string
    publicKey: Buffer
    counter: number
  }
  error?: string
}> {
  try {
    // Decode client data
    const clientDataJSON = Buffer.from(response.response.clientDataJSON, 'base64url')
    const clientData = JSON.parse(clientDataJSON.toString('utf-8'))

    // Verify challenge
    if (clientData.challenge !== expectedChallenge) {
      logger.warn('WebAuthn registration: challenge mismatch')
      return { verified: false, error: 'Challenge mismatch' }
    }

    // Verify origin
    if (clientData.origin !== expectedOrigin) {
      logger.warn({ expected: expectedOrigin, got: clientData.origin }, 'WebAuthn registration: origin mismatch')
      return { verified: false, error: 'Origin mismatch' }
    }

    // Verify type
    if (clientData.type !== 'webauthn.create') {
      return { verified: false, error: 'Invalid type' }
    }

    // Decode attestation object (CBOR encoded)
    const attestationObject = Buffer.from(response.response.attestationObject, 'base64url')
    const { authData, publicKey } = parseAttestationObject(attestationObject)

    if (!publicKey) {
      return { verified: false, error: 'Could not extract public key' }
    }

    logger.info({ credentialId: response.id }, 'WebAuthn registration completed')

    return {
      verified: true,
      credential: {
        credentialId: response.id,
        publicKey,
        counter: authData.counter,
      },
    }
  } catch (error) {
    logger.error({ err: error }, 'WebAuthn registration failed')
    return { verified: false, error: 'Verification failed' }
  }
}

/**
 * Start WebAuthn authentication - generates options for navigator.credentials.get()
 */
export function startAuthentication(
  credentials: Array<{ id: string; transports?: AuthenticatorTransport[] }>
): AuthenticationOptions {
  const challenge = generateChallenge()

  const options: AuthenticationOptions = {
    challenge,
    timeout: WEBAUTHN_CONFIG.timeout,
    rpId: WEBAUTHN_CONFIG.rpId,
    allowCredentials: credentials.map((cred) => ({
      id: cred.id,
      type: 'public-key' as const,
      transports: cred.transports,
    })),
    userVerification: 'preferred',
  }

  logger.info({ credentialCount: credentials.length }, 'Started WebAuthn authentication')
  return options
}

/**
 * Finish WebAuthn authentication - verifies the signature
 */
export async function finishAuthentication(
  response: {
    id: string
    rawId: string
    type: 'public-key'
    response: {
      clientDataJSON: string
      authenticatorData: string
      signature: string
      userHandle?: string
    }
  },
  expectedChallenge: string,
  credential: WebAuthnCredential,
  expectedOrigin: string = WEBAUTHN_CONFIG.origin
): Promise<{
  verified: boolean
  newCounter?: number
  error?: string
}> {
  try {
    // Verify credential ID matches
    if (response.id !== credential.credentialId) {
      return { verified: false, error: 'Credential ID mismatch' }
    }

    // Decode client data
    const clientDataJSON = Buffer.from(response.response.clientDataJSON, 'base64url')
    const clientData = JSON.parse(clientDataJSON.toString('utf-8'))

    // Verify challenge
    if (clientData.challenge !== expectedChallenge) {
      return { verified: false, error: 'Challenge mismatch' }
    }

    // Verify origin
    if (clientData.origin !== expectedOrigin) {
      return { verified: false, error: 'Origin mismatch' }
    }

    // Verify type
    if (clientData.type !== 'webauthn.get') {
      return { verified: false, error: 'Invalid type' }
    }

    // Decode authenticator data
    const authenticatorData = Buffer.from(response.response.authenticatorData, 'base64url')
    const { counter, flags } = parseAuthenticatorData(authenticatorData)

    // Verify counter (replay protection)
    if (counter <= credential.counter) {
      logger.warn({ expected: credential.counter, got: counter }, 'WebAuthn: counter not incremented')
      return { verified: false, error: 'Counter not incremented (possible replay)' }
    }

    // Verify user presence flag
    if (!(flags & 0x01)) {
      return { verified: false, error: 'User presence not verified' }
    }

    // Verify signature
    const clientDataHash = createHash('sha256').update(clientDataJSON).digest()
    const signedData = Buffer.concat([authenticatorData, clientDataHash])
    const signature = Buffer.from(response.response.signature, 'base64url')

    const isValid = verifySignature(signedData, signature, credential.publicKey)

    if (!isValid) {
      return { verified: false, error: 'Invalid signature' }
    }

    logger.info({ credentialId: response.id, newCounter: counter }, 'WebAuthn authentication completed')

    return {
      verified: true,
      newCounter: counter,
    }
  } catch (error) {
    logger.error({ err: error }, 'WebAuthn authentication failed')
    return { verified: false, error: 'Verification failed' }
  }
}

/**
 * Parse attestation object (simplified - handles packed format)
 */
function parseAttestationObject(attestationObject: Buffer): {
  authData: { counter: number; flags: number }
  publicKey: Buffer | null
} {
  // This is a simplified parser - in production, use a proper CBOR library
  // The attestation object contains: fmt, attStmt, authData

  // Find authData by looking for the CBOR key
  // For a proper implementation, use cbor-x or similar library

  // Simplified: assume authData starts after format string
  // In reality, you'd decode the full CBOR structure

  // Extract counter and flags from authData
  // authData structure:
  // - rpIdHash (32 bytes)
  // - flags (1 byte)
  // - counter (4 bytes, big endian)
  // - attestedCredentialData (variable, if present)

  // For now, return a placeholder - real implementation needs CBOR parsing
  return {
    authData: { counter: 0, flags: 0x01 },
    publicKey: null, // Would be extracted from attestedCredentialData
  }
}

/**
 * Parse authenticator data
 */
function parseAuthenticatorData(authData: Buffer): {
  rpIdHash: Buffer
  flags: number
  counter: number
} {
  return {
    rpIdHash: authData.subarray(0, 32),
    flags: authData[32],
    counter: authData.readUInt32BE(33),
  }
}

/**
 * Verify a signature using the stored public key
 */
function verifySignature(data: Buffer, signature: Buffer, publicKey: Buffer): boolean {
  try {
    // This needs proper key parsing based on the algorithm used
    // For ES256 (most common), the publicKey is in COSE format

    // Simplified verification - real implementation needs:
    // 1. Parse COSE key format
    // 2. Convert to PEM or use crypto.subtle
    // 3. Verify with appropriate algorithm

    const verify = createVerify('SHA256')
    verify.update(data)
    return verify.verify(
      {
        key: publicKey,
        dsaEncoding: 'ieee-p1363', // For ECDSA
      },
      signature
    )
  } catch {
    return false
  }
}

/**
 * Check if WebAuthn is properly configured
 */
export function isWebAuthnConfigured(): boolean {
  return !!(WEBAUTHN_CONFIG.rpId && WEBAUTHN_CONFIG.origin)
}

/**
 * Get current WebAuthn configuration (for debugging)
 */
export function getWebAuthnConfig() {
  return {
    rpId: WEBAUTHN_CONFIG.rpId,
    rpName: WEBAUTHN_CONFIG.rpName,
    origin: WEBAUTHN_CONFIG.origin,
    timeout: WEBAUTHN_CONFIG.timeout,
  }
}

export default {
  generateChallenge,
  startRegistration,
  finishRegistration,
  startAuthentication,
  finishAuthentication,
  isWebAuthnConfigured,
  getWebAuthnConfig,
}
