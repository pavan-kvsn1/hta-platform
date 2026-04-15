/**
 * 2FA Verify API
 *
 * POST /api/auth/2fa/verify - Verify TOTP code and enable 2FA
 *
 * Used during:
 * 1. Initial 2FA setup (enables 2FA after first successful verification)
 * 2. Login flow (validates 2FA code)
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { verifyTOTP, verifyBackupCode } from '@hta/shared/auth'

export async function POST(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { code, isBackupCode = false } = body

    if (!code || typeof code !== 'string') {
      return NextResponse.json({ error: 'Code is required' }, { status: 400 })
    }

    // Get user with 2FA details
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        totpSecret: true,
        totpEnabled: true,
        backupCodes: true,
      },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    if (!user.totpSecret) {
      return NextResponse.json(
        { error: '2FA is not set up. Please set up 2FA first.' },
        { status: 400 }
      )
    }

    let isValid = false
    let usedBackupCodeIndex = -1

    if (isBackupCode) {
      // Verify backup code
      usedBackupCodeIndex = verifyBackupCode(code, user.backupCodes)
      isValid = usedBackupCodeIndex !== -1
    } else {
      // Verify TOTP code
      isValid = verifyTOTP(code, user.totpSecret)
    }

    if (!isValid) {
      return NextResponse.json({ error: 'Invalid code' }, { status: 400 })
    }

    // If backup code was used, remove it from the list
    if (usedBackupCodeIndex !== -1) {
      const updatedBackupCodes = [...user.backupCodes]
      updatedBackupCodes.splice(usedBackupCodeIndex, 1)

      await prisma.user.update({
        where: { id: user.id },
        data: { backupCodes: updatedBackupCodes },
      })
    }

    // If 2FA wasn't enabled yet, enable it now (first-time setup)
    if (!user.totpEnabled) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          totpEnabled: true,
          totpVerifiedAt: new Date(),
        },
      })

      return NextResponse.json({
        success: true,
        enabled: true,
        message: '2FA has been enabled successfully.',
        remainingBackupCodes: user.backupCodes.length,
      })
    }

    // Regular verification (during login)
    return NextResponse.json({
      success: true,
      verified: true,
      ...(usedBackupCodeIndex !== -1 && {
        warning: `Backup code used. ${user.backupCodes.length - 1} codes remaining.`,
        remainingBackupCodes: user.backupCodes.length - 1,
      }),
    })
  } catch (error) {
    console.error('2FA verify error:', error)
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 })
  }
}
