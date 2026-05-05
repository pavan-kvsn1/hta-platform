'use client'

import { useSession, signOut } from 'next-auth/react'
import Link from 'next/link'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { LogOut, User } from 'lucide-react'
import { NotificationBell } from '@/components/notifications'

interface DashboardHeaderProps {
  title?: string
}

export function DashboardHeader({ title }: DashboardHeaderProps) {
  const { data: session } = useSession()

  const handleSignOut = async () => {
    await signOut({ redirect: false })
    window.location.href = 'https://hta-calibration.com'
  }

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'ENGINEER':
        return 'Engineer'
      case 'ADMIN':
        return 'Administrator'
      case 'CUSTOMER':
        return 'Customer'
      default:
        return role
    }
  }

  const getDashboardLink = (role: string) => {
    switch (role) {
      case 'CUSTOMER':
        return '/customer/dashboard'
      default:
        return '/dashboard'
    }
  }

  return (
    <header className="bg-white border-b-2 border-gray-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-20">
          {/* Logo and Title */}
          <div className="flex items-center gap-5">
            <Link href={getDashboardLink(session?.user?.role || 'ENGINEER')}>
              <Image
                src="/hta-logo.jpg"
                alt="HTA Instrumentation"
                width={100}
                height={50}
                className="object-contain"
              />
            </Link>
            {title && (
              <>
                <div className="h-8 w-px bg-gray-300" />
                <h1 className="text-xl font-bold text-gray-900">{title}</h1>
              </>
            )}
          </div>

          {/* User Info and Actions */}
          <div className="flex items-center gap-4">
            {/* Notifications */}
            <NotificationBell userRole={session?.user?.role || 'ENGINEER'} />

            {/* User Info */}
            <div className="flex items-center gap-3 pl-4 border-l border-gray-200">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 bg-blue-100 rounded-full flex items-center justify-center">
                  <User className="h-4 w-4 text-blue-600" />
                </div>
                <div className="hidden sm:block">
                  <p className="text-sm font-medium text-gray-900">
                    {session?.user?.name || 'User'}
                  </p>
                  <p className="text-xs text-gray-500">
                    {getRoleLabel(session?.user?.role || '')}
                  </p>
                </div>
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={handleSignOut}
                className="text-gray-500 hover:text-gray-700"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}
