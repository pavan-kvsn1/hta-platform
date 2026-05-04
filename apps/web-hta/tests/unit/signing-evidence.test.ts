/**
 * Signing Evidence Unit Tests (actual imports)
 *
 * Tests for src/lib/stores/signing-evidence.ts:
 * - computeHash — SHA-256 hash determinism and uniqueness
 * - collectServerEvidence — IP/user-agent extraction from request headers
 * - buildSigningEvidencePayload — payload construction
 *
 * Mocks: prisma (DB calls), constants
 */
import { describe, it, expect, vi } from 'vitest'

// Mock prisma to prevent DB connection
vi.mock('@/lib/prisma', () => ({
  prisma: {
    signingEvidence: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({}),
    },
  },
}))

// Mock constants
vi.mock('@/lib/constants/consent-text', () => ({
  CONSENT_TEXT: 'I agree to the terms and conditions.',
  CONSENT_VERSION: 'v1.0',
}))

import {
  computeHash,
  collectServerEvidence,
  buildSigningEvidencePayload,
  type ClientEvidence,
} from '@/lib/stores/signing-evidence'

// ---------------------------------------------------------------------------
// computeHash
// ---------------------------------------------------------------------------
describe('computeHash', () => {
  it('returns a hex string', () => {
    const hash = computeHash('hello')
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('is deterministic for the same input', () => {
    expect(computeHash('test data')).toBe(computeHash('test data'))
  })

  it('produces different hashes for different inputs', () => {
    expect(computeHash('input1')).not.toBe(computeHash('input2'))
  })

  it('returns known SHA-256 hash for empty string', () => {
    // SHA-256 of empty string is well-known
    expect(computeHash('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
  })

  it('handles JSON-encoded strings', () => {
    const jsonData = JSON.stringify({ key: 'value', num: 42 })
    const hash = computeHash(jsonData)
    expect(hash).toHaveLength(64)
  })
})

// ---------------------------------------------------------------------------
// collectServerEvidence
// ---------------------------------------------------------------------------
describe('collectServerEvidence', () => {
  function makeRequest(headers: Record<string, string>, method = 'POST'): Request {
    return new Request('http://localhost:3000/api/test', {
      method,
      headers,
    })
  }

  it('extracts IP from x-forwarded-for header', () => {
    const req = makeRequest({ 'x-forwarded-for': '203.0.113.5, 10.0.0.1' })
    const evidence = collectServerEvidence(req, 'session')
    expect(evidence.ipAddress).toBe('203.0.113.5')
  })

  it('extracts IP from x-real-ip when x-forwarded-for is absent', () => {
    const req = makeRequest({ 'x-real-ip': '198.51.100.7' })
    const evidence = collectServerEvidence(req, 'token')
    expect(evidence.ipAddress).toBe('198.51.100.7')
  })

  it('falls back to "unknown" when no IP headers present', () => {
    const req = makeRequest({ 'user-agent': 'Test Agent' })
    const evidence = collectServerEvidence(req, 'direct')
    expect(evidence.ipAddress).toBe('unknown')
  })

  it('extracts user agent', () => {
    const req = makeRequest({ 'user-agent': 'Mozilla/5.0 Test Browser', 'x-forwarded-for': '1.2.3.4' })
    const evidence = collectServerEvidence(req, 'session')
    expect(evidence.userAgent).toBe('Mozilla/5.0 Test Browser')
  })

  it('sets user agent to "unknown" when header is absent', () => {
    const req = makeRequest({ 'x-forwarded-for': '1.2.3.4' })
    const evidence = collectServerEvidence(req, 'session')
    expect(evidence.userAgent).toBe('unknown')
  })

  it('passes sessionMethod through', () => {
    const req = makeRequest({ 'x-forwarded-for': '1.2.3.4' })
    const evidence = collectServerEvidence(req, 'token')
    expect(evidence.sessionMethod).toBe('token')
  })
})

// ---------------------------------------------------------------------------
// buildSigningEvidencePayload
// ---------------------------------------------------------------------------
describe('buildSigningEvidencePayload', () => {
  const baseClientEvidence: ClientEvidence = {
    clientTimestamp: Date.parse('2025-01-15T10:00:00Z'),
    userAgent: 'Test Browser',
    screenResolution: '1920x1080',
    timezone: 'Asia/Kuala_Lumpur',
    canvasSize: { width: 1920, height: 1080 },
    consentVersion: 'v1.0',
    consentAcceptedAt: Date.parse('2025-01-15T09:59:00Z'),
  }

  const baseServerEvidence = {
    ipAddress: '203.0.113.10',
    userAgent: 'Test Browser',
    sessionMethod: 'session' as const,
  }

  const baseSignerInfo = {
    signerType: 'ASSIGNEE' as const,
    signerName: 'John Doe',
    signerEmail: 'john@hta.com',
    signerId: 'user-123',
  }

  it('includes consent version and text', () => {
    const payload = buildSigningEvidencePayload(baseClientEvidence, baseServerEvidence, baseSignerInfo)
    expect(payload.consentVersion).toBe('v1.0')
    expect(payload.consentText).toBe('I agree to the terms and conditions.')
  })

  it('formats consentAcceptedAt as ISO string', () => {
    const payload = buildSigningEvidencePayload(baseClientEvidence, baseServerEvidence, baseSignerInfo)
    expect(payload.consentAcceptedAt).toBe(new Date(baseClientEvidence.consentAcceptedAt).toISOString())
  })

  it('includes IP address from server evidence', () => {
    const payload = buildSigningEvidencePayload(baseClientEvidence, baseServerEvidence, baseSignerInfo)
    expect(payload.ipAddress).toBe('203.0.113.10')
  })

  it('includes timezone and screen resolution', () => {
    const payload = buildSigningEvidencePayload(baseClientEvidence, baseServerEvidence, baseSignerInfo)
    expect(payload.timezone).toBe('Asia/Kuala_Lumpur')
    expect(payload.screenResolution).toBe('1920x1080')
  })

  it('includes canvas size', () => {
    const payload = buildSigningEvidencePayload(baseClientEvidence, baseServerEvidence, baseSignerInfo)
    expect(payload.canvasSize).toEqual({ width: 1920, height: 1080 })
  })

  it('includes signer info', () => {
    const payload = buildSigningEvidencePayload(baseClientEvidence, baseServerEvidence, baseSignerInfo)
    expect(payload.signerType).toBe('ASSIGNEE')
    expect(payload.signerName).toBe('John Doe')
    expect(payload.signerEmail).toBe('john@hta.com')
    expect(payload.signerId).toBe('user-123')
  })

  it('includes document hash when provided', () => {
    const evidence: ClientEvidence = {
      ...baseClientEvidence,
      documentHash: 'abc123def456',
    }
    const payload = buildSigningEvidencePayload(evidence, baseServerEvidence, baseSignerInfo)
    expect(payload.documentHash).toBe('abc123def456')
  })

  it('has undefined documentHash when not provided', () => {
    const payload = buildSigningEvidencePayload(baseClientEvidence, baseServerEvidence, baseSignerInfo)
    expect(payload.documentHash).toBeUndefined()
  })

  it('includes token info when provided', () => {
    const signerInfo = {
      ...baseSignerInfo,
      signerType: 'CUSTOMER' as const,
      tokenId: 'tok-xyz',
      tokenEmail: 'customer@example.com',
    }
    const payload = buildSigningEvidencePayload(baseClientEvidence, baseServerEvidence, signerInfo)
    expect(payload.tokenId).toBe('tok-xyz')
    expect(payload.tokenEmail).toBe('customer@example.com')
  })

  it('includes customer ID when provided', () => {
    const signerInfo = {
      ...baseSignerInfo,
      signerType: 'CUSTOMER' as const,
      customerId: 'cust-456',
    }
    const payload = buildSigningEvidencePayload(baseClientEvidence, baseServerEvidence, signerInfo)
    expect(payload.customerId).toBe('cust-456')
  })

  it('serverTimestamp is a valid ISO string', () => {
    const payload = buildSigningEvidencePayload(baseClientEvidence, baseServerEvidence, baseSignerInfo)
    expect(() => new Date(payload.serverTimestamp)).not.toThrow()
    expect(new Date(payload.serverTimestamp).toISOString()).toBe(payload.serverTimestamp)
  })

  it('REVIEWER signerType is preserved', () => {
    const payload = buildSigningEvidencePayload(
      baseClientEvidence,
      baseServerEvidence,
      { ...baseSignerInfo, signerType: 'REVIEWER' }
    )
    expect(payload.signerType).toBe('REVIEWER')
  })

  it('ADMIN signerType is preserved', () => {
    const payload = buildSigningEvidencePayload(
      baseClientEvidence,
      baseServerEvidence,
      { ...baseSignerInfo, signerType: 'ADMIN' }
    )
    expect(payload.signerType).toBe('ADMIN')
  })
})
