/**
 * 2FA Disable API
 *
 * POST /api/auth/2fa/disable - Disable 2FA for the user
 *
 * Requires current password or valid 2FA code for security.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { verifyTOTP } from '@hta/shared/auth'
import { verifyPassword } from '@hta/shared/auth'

export async function POST(request: NextRequest) {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { code, password } = body

    // Require either TOTP code or password
    if (!code && !password) {
      return NextResponse.json(
        { error: 'Please provide your 2FA code or password to disable 2FA.' },
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
        passwordHash: true,
      },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    if (!user.totpEnabled) {
      return NextResponse.json({ error: '2FA is not enabled.' }, { status: 400 })
    }

    // Verify authorization
    let authorized = false

    if (code && user.totpSecret) {
      // Verify with TOTP code
      authorized = verifyTOTP(code, user.totpSecret)
    } else if (password && user.passwordHash) {
      // Verify with password
      authorized = await verifyPassword(password, user.passwordHash)
    }

    if (!authorized) {
      return NextResponse.json(
        { error: 'Invalid code or password.' },
        { status: 400 }
      )
    }

    // Disable 2FA
    await prisma.user.update({
      where: { id: user.id },
      data: {
        totpEnabled: false,
        totpSecret: null,
        totpVerifiedAt: null,
        backupCodes: [],
      },
    })

    return NextResponse.json({
      success: true,
      message: '2FA has been disabled.',
    })
  } catch (error) {
    console.error('2FA disable error:', error)
    return NextResponse.json({ error: 'Failed to disable 2FA' }, { status: 500 })
  }
}
