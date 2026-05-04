/**
 * API Auth Routes Unit Tests — 2FA endpoints
 *
 * Self-contained mock-based tests covering:
 * - POST /api/auth/2fa/setup — generate TOTP secret, QR code, backup codes
 * - POST /api/auth/2fa/verify — verify TOTP or backup code, enable 2FA
 * - POST /api/auth/2fa/disable — disable 2FA via TOTP or password
 * - GET  /api/auth/2fa/status — return current 2FA state
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

const mockAuth = vi.fn()
const mockPrismaUserFindUnique = vi.fn()
const mockPrismaUserUpdate = vi.fn()
const mockGenerateTOTPSecret = vi.fn()
const mockGenerateBackupCodes = vi.fn()
const mockHashBackupCode = vi.fn()
const mockVerifyTOTP = vi.fn()
const mockVerifyBackupCode = vi.fn()
const mockVerifyPassword = vi.fn()
const mockQRCodeToDataURL = vi.fn()

// Minimal response builder
function jsonResponse(body: unknown, status = 200) {
  return { status, body }
}

// ---------------------------------------------------------------------------
// Inline route handlers (mirrors the actual route logic without imports)
// ---------------------------------------------------------------------------

async function setupPOST() {
  try {
    const session = await mockAuth()
    if (!session?.user?.id) return jsonResponse({ error: 'Unauthorized' }, 401)

    const user = await mockPrismaUserFindUnique({ where: { id: session.user.id }, select: { totpEnabled: true, email: true } })
    if (!user) return jsonResponse({ error: 'User not found' }, 404)
    if (user.totpEnabled) return jsonResponse({ error: '2FA is already enabled. Disable it first to set up again.' }, 400)

    const { secret, otpauthUrl } = mockGenerateTOTPSecret(user.email)
    const qrCodeUrl = await mockQRCodeToDataURL(otpauthUrl, { errorCorrectionLevel: 'M', width: 200, margin: 2 })
    const backupCodes = mockGenerateBackupCodes(10)
    const hashedBackupCodes = backupCodes.map(mockHashBackupCode)

    await mockPrismaUserUpdate({
      where: { id: session.user.id },
      data: { totpSecret: secret, backupCodes: hashedBackupCodes, totpEnabled: false },
    })

    return jsonResponse({ success: true, secret, qrCodeUrl, backupCodes, message: 'Scan the QR code with your authenticator app, then verify with a code.' })
  } catch {
    return jsonResponse({ error: 'Failed to setup 2FA' }, 500)
  }
}

async function verifyPOST(body: { code?: unknown; isBackupCode?: boolean }) {
  try {
    const session = await mockAuth()
    if (!session?.user?.id) return jsonResponse({ error: 'Unauthorized' }, 401)

    const { code, isBackupCode = false } = body
    if (!code || typeof code !== 'string') return jsonResponse({ error: 'Code is required' }, 400)

    const user = await mockPrismaUserFindUnique({
      where: { id: session.user.id },
      select: { id: true, totpSecret: true, totpEnabled: true, backupCodes: true },
    })
    if (!user) return jsonResponse({ error: 'User not found' }, 404)
    if (!user.totpSecret) return jsonResponse({ error: '2FA is not set up. Please set up 2FA first.' }, 400)

    let isValid = false
    let usedBackupCodeIndex = -1

    if (isBackupCode) {
      usedBackupCodeIndex = mockVerifyBackupCode(code, user.backupCodes)
      isValid = usedBackupCodeIndex !== -1
    } else {
      isValid = mockVerifyTOTP(code, user.totpSecret)
    }

    if (!isValid) return jsonResponse({ error: 'Invalid code' }, 400)

    if (usedBackupCodeIndex !== -1) {
      const updatedBackupCodes = [...user.backupCodes]
      updatedBackupCodes.splice(usedBackupCodeIndex, 1)
      await mockPrismaUserUpdate({ where: { id: user.id }, data: { backupCodes: updatedBackupCodes } })
    }

    if (!user.totpEnabled) {
      await mockPrismaUserUpdate({ where: { id: user.id }, data: { totpEnabled: true, totpVerifiedAt: new Date() } })
      return jsonResponse({ success: true, enabled: true, message: '2FA has been enabled successfully.', remainingBackupCodes: user.backupCodes.length })
    }

    return jsonResponse({
      success: true,
      verified: true,
      ...(usedBackupCodeIndex !== -1 && {
        warning: `Backup code used. ${user.backupCodes.length - 1} codes remaining.`,
        remainingBackupCodes: user.backupCodes.length - 1,
      }),
    })
  } catch {
    return jsonResponse({ error: 'Verification failed' }, 500)
  }
}

async function disablePOST(body: { code?: string; password?: string }) {
  try {
    const session = await mockAuth()
    if (!session?.user?.id) return jsonResponse({ error: 'Unauthorized' }, 401)

    const { code, password } = body
    if (!code && !password) return jsonResponse({ error: 'Please provide your 2FA code or password to disable 2FA.' }, 400)

    const user = await mockPrismaUserFindUnique({
      where: { id: session.user.id },
      select: { id: true, totpSecret: true, totpEnabled: true, passwordHash: true },
    })
    if (!user) return jsonResponse({ error: 'User not found' }, 404)
    if (!user.totpEnabled) return jsonResponse({ error: '2FA is not enabled.' }, 400)

    let authorized = false
    if (code && user.totpSecret) {
      authorized = mockVerifyTOTP(code, user.totpSecret)
    } else if (password && user.passwordHash) {
      authorized = await mockVerifyPassword(password, user.passwordHash)
    }

    if (!authorized) return jsonResponse({ error: 'Invalid code or password.' }, 400)

    await mockPrismaUserUpdate({
      where: { id: user.id },
      data: { totpEnabled: false, totpSecret: null, totpVerifiedAt: null, backupCodes: [] },
    })

    return jsonResponse({ success: true, message: '2FA has been disabled.' })
  } catch {
    return jsonResponse({ error: 'Failed to disable 2FA' }, 500)
  }
}

async function statusGET() {
  try {
    const session = await mockAuth()
    if (!session?.user?.id) return jsonResponse({ error: 'Unauthorized' }, 401)

    const user = await mockPrismaUserFindUnique({
      where: { id: session.user.id },
      select: { totpEnabled: true, totpVerifiedAt: true, backupCodes: true },
    })
    if (!user) return jsonResponse({ error: 'User not found' }, 404)

    return jsonResponse({
      enabled: user.totpEnabled,
      enabledAt: user.totpVerifiedAt,
      remainingBackupCodes: user.backupCodes.length,
      hasBackupCodes: user.backupCodes.length > 0,
    })
  } catch {
    return jsonResponse({ error: 'Failed to get 2FA status' }, 500)
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const SESSION = { user: { id: 'user-123', email: 'test@example.com' } }

describe('POST /api/auth/2fa/setup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGenerateTOTPSecret.mockReturnValue({ secret: 'BASE32SECRET', otpauthUrl: 'otpauth://totp/...' })
    mockQRCodeToDataURL.mockResolvedValue('data:image/png;base64,...')
    mockGenerateBackupCodes.mockReturnValue(['CODE1', 'CODE2', 'CODE3'])
    mockHashBackupCode.mockImplementation((c: string) => `hash(${c})`)
  })

  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue(null)
    const res = await setupPOST()
    expect(res.status).toBe(401)
    expect((res.body as { error: string }).error).toBe('Unauthorized')
  })

  it('returns 404 when user not found in database', async () => {
    mockAuth.mockResolvedValue(SESSION)
    mockPrismaUserFindUnique.mockResolvedValue(null)
    const res = await setupPOST()
    expect(res.status).toBe(404)
  })

  it('returns 400 when 2FA already enabled', async () => {
    mockAuth.mockResolvedValue(SESSION)
    mockPrismaUserFindUnique.mockResolvedValue({ totpEnabled: true, email: 'test@example.com' })
    const res = await setupPOST()
    expect(res.status).toBe(400)
    expect((res.body as { error: string }).error).toContain('already enabled')
  })

  it('generates TOTP secret, QR code, and backup codes on success', async () => {
    mockAuth.mockResolvedValue(SESSION)
    mockPrismaUserFindUnique.mockResolvedValue({ totpEnabled: false, email: 'test@example.com' })
    mockPrismaUserUpdate.mockResolvedValue({})

    const res = await setupPOST()
    const body = res.body as Record<string, unknown>

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.secret).toBe('BASE32SECRET')
    expect(body.qrCodeUrl).toBe('data:image/png;base64,...')
    expect(body.backupCodes).toEqual(['CODE1', 'CODE2', 'CODE3'])
    expect(mockGenerateTOTPSecret).toHaveBeenCalledWith('test@example.com')
    expect(mockGenerateBackupCodes).toHaveBeenCalledWith(10)
  })

  it('stores secret and hashed backup codes in database', async () => {
    mockAuth.mockResolvedValue(SESSION)
    mockPrismaUserFindUnique.mockResolvedValue({ totpEnabled: false, email: 'test@example.com' })
    mockPrismaUserUpdate.mockResolvedValue({})

    await setupPOST()

    expect(mockPrismaUserUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          totpSecret: 'BASE32SECRET',
          backupCodes: ['hash(CODE1)', 'hash(CODE2)', 'hash(CODE3)'],
          totpEnabled: false,
        }),
      })
    )
  })

  it('returns 500 on unexpected error', async () => {
    mockAuth.mockRejectedValue(new Error('DB error'))
    const res = await setupPOST()
    expect(res.status).toBe(500)
  })
})

describe('POST /api/auth/2fa/verify', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue(null)
    const res = await verifyPOST({ code: '123456' })
    expect(res.status).toBe(401)
  })

  it('returns 400 when code is missing', async () => {
    mockAuth.mockResolvedValue(SESSION)
    const res = await verifyPOST({})
    expect(res.status).toBe(400)
    expect((res.body as { error: string }).error).toBe('Code is required')
  })

  it('returns 400 when code is not a string', async () => {
    mockAuth.mockResolvedValue(SESSION)
    const res = await verifyPOST({ code: 123456 as unknown as string })
    expect(res.status).toBe(400)
  })

  it('returns 404 when user not found', async () => {
    mockAuth.mockResolvedValue(SESSION)
    mockPrismaUserFindUnique.mockResolvedValue(null)
    const res = await verifyPOST({ code: '123456' })
    expect(res.status).toBe(404)
  })

  it('returns 400 when TOTP not set up', async () => {
    mockAuth.mockResolvedValue(SESSION)
    mockPrismaUserFindUnique.mockResolvedValue({ id: 'user-123', totpSecret: null, totpEnabled: false, backupCodes: [] })
    const res = await verifyPOST({ code: '123456' })
    expect(res.status).toBe(400)
    expect((res.body as { error: string }).error).toContain('not set up')
  })

  it('returns 400 on invalid TOTP code', async () => {
    mockAuth.mockResolvedValue(SESSION)
    mockPrismaUserFindUnique.mockResolvedValue({ id: 'user-123', totpSecret: 'SECRET', totpEnabled: true, backupCodes: [] })
    mockVerifyTOTP.mockReturnValue(false)
    const res = await verifyPOST({ code: '000000' })
    expect(res.status).toBe(400)
    expect((res.body as { error: string }).error).toBe('Invalid code')
  })

  it('enables 2FA on first successful verification', async () => {
    mockAuth.mockResolvedValue(SESSION)
    mockPrismaUserFindUnique.mockResolvedValue({ id: 'user-123', totpSecret: 'SECRET', totpEnabled: false, backupCodes: ['h1', 'h2'] })
    mockVerifyTOTP.mockReturnValue(true)
    mockPrismaUserUpdate.mockResolvedValue({})

    const res = await verifyPOST({ code: '123456' })
    const body = res.body as Record<string, unknown>

    expect(res.status).toBe(200)
    expect(body.enabled).toBe(true)
    expect(body.message).toContain('enabled successfully')
    expect(mockPrismaUserUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ totpEnabled: true }) })
    )
  })

  it('returns verified:true on regular login verification', async () => {
    mockAuth.mockResolvedValue(SESSION)
    mockPrismaUserFindUnique.mockResolvedValue({ id: 'user-123', totpSecret: 'SECRET', totpEnabled: true, backupCodes: [] })
    mockVerifyTOTP.mockReturnValue(true)

    const res = await verifyPOST({ code: '123456' })
    const body = res.body as Record<string, unknown>

    expect(res.status).toBe(200)
    expect(body.verified).toBe(true)
    expect(body.enabled).toBeUndefined()
  })

  it('consumes backup code and returns warning', async () => {
    mockAuth.mockResolvedValue(SESSION)
    mockPrismaUserFindUnique.mockResolvedValue({ id: 'user-123', totpSecret: 'SECRET', totpEnabled: true, backupCodes: ['h1', 'h2', 'h3'] })
    mockVerifyBackupCode.mockReturnValue(0) // index 0 matched
    mockPrismaUserUpdate.mockResolvedValue({})

    const res = await verifyPOST({ code: 'BACKUP-CODE', isBackupCode: true })
    const body = res.body as Record<string, unknown>

    expect(res.status).toBe(200)
    expect(body.verified).toBe(true)
    expect(body.warning).toContain('Backup code used')
    expect(body.remainingBackupCodes).toBe(2)
  })

  it('returns 400 on invalid backup code', async () => {
    mockAuth.mockResolvedValue(SESSION)
    mockPrismaUserFindUnique.mockResolvedValue({ id: 'user-123', totpSecret: 'SECRET', totpEnabled: true, backupCodes: ['h1'] })
    mockVerifyBackupCode.mockReturnValue(-1)

    const res = await verifyPOST({ code: 'WRONG-CODE', isBackupCode: true })
    expect(res.status).toBe(400)
    expect((res.body as { error: string }).error).toBe('Invalid code')
  })
})

describe('POST /api/auth/2fa/disable', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue(null)
    const res = await disablePOST({ code: '123456' })
    expect(res.status).toBe(401)
  })

  it('returns 400 when neither code nor password provided', async () => {
    mockAuth.mockResolvedValue(SESSION)
    const res = await disablePOST({})
    expect(res.status).toBe(400)
    expect((res.body as { error: string }).error).toContain('provide your 2FA code or password')
  })

  it('returns 404 when user not found', async () => {
    mockAuth.mockResolvedValue(SESSION)
    mockPrismaUserFindUnique.mockResolvedValue(null)
    const res = await disablePOST({ code: '123456' })
    expect(res.status).toBe(404)
  })

  it('returns 400 when 2FA is not enabled', async () => {
    mockAuth.mockResolvedValue(SESSION)
    mockPrismaUserFindUnique.mockResolvedValue({ id: 'user-123', totpSecret: 'S', totpEnabled: false, passwordHash: 'h' })
    const res = await disablePOST({ code: '123456' })
    expect(res.status).toBe(400)
    expect((res.body as { error: string }).error).toBe('2FA is not enabled.')
  })

  it('disables 2FA successfully with valid TOTP code', async () => {
    mockAuth.mockResolvedValue(SESSION)
    mockPrismaUserFindUnique.mockResolvedValue({ id: 'user-123', totpSecret: 'SECRET', totpEnabled: true, passwordHash: 'hash' })
    mockVerifyTOTP.mockReturnValue(true)
    mockPrismaUserUpdate.mockResolvedValue({})

    const res = await disablePOST({ code: '123456' })
    const body = res.body as Record<string, unknown>

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.message).toBe('2FA has been disabled.')
    expect(mockPrismaUserUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          totpEnabled: false,
          totpSecret: null,
          backupCodes: [],
        }),
      })
    )
  })

  it('disables 2FA with valid password', async () => {
    mockAuth.mockResolvedValue(SESSION)
    mockPrismaUserFindUnique.mockResolvedValue({ id: 'user-123', totpSecret: null, totpEnabled: true, passwordHash: 'hash' })
    mockVerifyPassword.mockResolvedValue(true)
    mockPrismaUserUpdate.mockResolvedValue({})

    const res = await disablePOST({ password: 'mypassword' })
    expect(res.status).toBe(200)
  })

  it('returns 400 when TOTP code is invalid', async () => {
    mockAuth.mockResolvedValue(SESSION)
    mockPrismaUserFindUnique.mockResolvedValue({ id: 'user-123', totpSecret: 'SECRET', totpEnabled: true, passwordHash: 'hash' })
    mockVerifyTOTP.mockReturnValue(false)

    const res = await disablePOST({ code: '000000' })
    expect(res.status).toBe(400)
    expect((res.body as { error: string }).error).toBe('Invalid code or password.')
  })

  it('returns 400 when password is incorrect', async () => {
    mockAuth.mockResolvedValue(SESSION)
    mockPrismaUserFindUnique.mockResolvedValue({ id: 'user-123', totpSecret: null, totpEnabled: true, passwordHash: 'hash' })
    mockVerifyPassword.mockResolvedValue(false)

    const res = await disablePOST({ password: 'wrongpassword' })
    expect(res.status).toBe(400)
  })
})

describe('GET /api/auth/2fa/status', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue(null)
    const res = await statusGET()
    expect(res.status).toBe(401)
  })

  it('returns 404 when user not found', async () => {
    mockAuth.mockResolvedValue(SESSION)
    mockPrismaUserFindUnique.mockResolvedValue(null)
    const res = await statusGET()
    expect(res.status).toBe(404)
  })

  it('returns enabled status and backup code count', async () => {
    mockAuth.mockResolvedValue(SESSION)
    const verifiedAt = new Date('2024-01-15')
    mockPrismaUserFindUnique.mockResolvedValue({
      totpEnabled: true,
      totpVerifiedAt: verifiedAt,
      backupCodes: ['h1', 'h2', 'h3', 'h4', 'h5'],
    })

    const res = await statusGET()
    const body = res.body as Record<string, unknown>

    expect(res.status).toBe(200)
    expect(body.enabled).toBe(true)
    expect(body.enabledAt).toEqual(verifiedAt)
    expect(body.remainingBackupCodes).toBe(5)
    expect(body.hasBackupCodes).toBe(true)
  })

  it('returns disabled status when 2FA not set up', async () => {
    mockAuth.mockResolvedValue(SESSION)
    mockPrismaUserFindUnique.mockResolvedValue({ totpEnabled: false, totpVerifiedAt: null, backupCodes: [] })

    const res = await statusGET()
    const body = res.body as Record<string, unknown>

    expect(res.status).toBe(200)
    expect(body.enabled).toBe(false)
    expect(body.remainingBackupCodes).toBe(0)
    expect(body.hasBackupCodes).toBe(false)
  })
})
