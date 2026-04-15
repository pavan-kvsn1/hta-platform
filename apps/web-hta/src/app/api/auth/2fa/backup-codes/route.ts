/**
 * 2FA Backup Codes API
 *
 * POST /api/auth/2fa/backup-codes - Regenerate backup codes
 *
 * Requires valid 2FA code to regenerate backup codes.
 * Old backup codes are invalidated.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { verifyTOTP, generateBackupCodes, hashBackupCode } from '@hta/shared/auth'

export async function POST(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { code } = body

    if (!code || typeof code !== 'string') {
      return NextResponse.json(
        { error: 'Please provide your current 2FA code to regenerate backup codes.' },
        { status: 400 }
      )
    }

    // Get user with 2FA details
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        totpSecret: true,
        totpEnabled: true,
      },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    if (!user.totpEnabled || !user.totpSecret) {
      return NextResponse.json(
        { error: '2FA must be enabled to regenerate backup codes.' },
        { status: 400 }
      )
    }

    // Verify TOTP code
    const isValid = verifyTOTP(code, user.totpSecret)

    if (!isValid) {
      return NextResponse.json({ error: 'Invalid 2FA code.' }, { status: 400 })
    }

    // Generate new backup codes
    const newBackupCodes = generateBackupCodes(10)
    const hashedBackupCodes = newBackupCodes.map(hashBackupCode)

    // Update user with new backup codes
    await prisma.user.update({
      where: { id: user.id },
      data: { backupCodes: hashedBackupCodes },
    })

    return NextResponse.json({
      success: true,
      backupCodes: newBackupCodes,
      message: 'New backup codes generated. Save them securely - old codes are now invalid.',
    })
  } catch (error) {
    console.error('Backup codes regeneration error:', error)
    return NextResponse.json({ error: 'Failed to regenerate backup codes' }, { status: 500 })
  }
}

/**
 * GET /api/auth/2fa/backup-codes - Get remaining backup code count
 */
export async function GET() {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        totpEnabled: true,
        backupCodes: true,
      },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    return NextResponse.json({
      enabled: user.totpEnabled,
      remainingBackupCodes: user.backupCodes.length,
    })
  } catch (error) {
    console.error('Get backup codes count error:', error)
    return NextResponse.json({ error: 'Failed to get backup codes info' }, { status: 500 })
  }
}
