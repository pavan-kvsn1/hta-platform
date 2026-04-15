/**
 * 2FA Setup API
 *
 * POST /api/auth/2fa/setup - Generate TOTP secret and return QR code URL
 *
 * Requires authenticated user. Does not enable 2FA until verified.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generateTOTPSecret, generateBackupCodes, hashBackupCode } from '@hta/shared/auth'
import QRCode from 'qrcode'

export async function POST(request: NextRequest) {
  try {
    // Get authenticated session
    const session = await auth()

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user already has 2FA enabled
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { totpEnabled: true, email: true },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    if (user.totpEnabled) {
      return NextResponse.json(
        { error: '2FA is already enabled. Disable it first to set up again.' },
        { status: 400 }
      )
    }

    // Generate TOTP secret
    const { secret, otpauthUrl } = generateTOTPSecret(user.email)

    // Generate QR code as data URL
    const qrCodeUrl = await QRCode.toDataURL(otpauthUrl, {
      errorCorrectionLevel: 'M',
      width: 200,
      margin: 2,
    })

    // Generate backup codes
    const backupCodes = generateBackupCodes(10)
    const hashedBackupCodes = backupCodes.map(hashBackupCode)

    // Store secret and backup codes (not enabled yet - requires verification)
    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        totpSecret: secret, // In production, encrypt this
        backupCodes: hashedBackupCodes,
        totpEnabled: false, // Will be enabled after verification
      },
    })

    return NextResponse.json({
      success: true,
      secret,
      qrCodeUrl,
      // Return backup codes only once during setup
      backupCodes,
      message: 'Scan the QR code with your authenticator app, then verify with a code.',
    })
  } catch (error) {
    console.error('2FA setup error:', error)
    return NextResponse.json({ error: 'Failed to setup 2FA' }, { status: 500 })
  }
}
