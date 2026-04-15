/**
 * 2FA Status API
 *
 * GET /api/auth/2fa/status - Get current 2FA status for the user
 */

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

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
        totpVerifiedAt: true,
        backupCodes: true,
      },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    return NextResponse.json({
      enabled: user.totpEnabled,
      enabledAt: user.totpVerifiedAt,
      remainingBackupCodes: user.backupCodes.length,
      hasBackupCodes: user.backupCodes.length > 0,
    })
  } catch (error) {
    console.error('2FA status error:', error)
    return NextResponse.json({ error: 'Failed to get 2FA status' }, { status: 500 })
  }
}
