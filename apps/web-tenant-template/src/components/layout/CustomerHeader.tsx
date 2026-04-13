'use client'

import { useSession, signOut } from 'next-auth/react'
import Link from 'next/link'
import Image from 'next/image'
import { LogOut, Building2, Users, Crown } from 'lucide-react'
import { NotificationBell } from '@/components/notifications'

interface CustomerHeaderProps {
  title?: string
}

export function CustomerHeader({ title }: CustomerHeaderProps) {
  const { data: session } = useSession()

  const handleSignOut = async () => {
    await signOut({ callbackUrl: '/customer/login' })
  }

  // Get user initials
  const getInitials = (name: string) => {
    if (!name) return 'C'
    const parts = name.split(' ')
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
    }
    return name.substring(0, 2).toUpperCase()
  }

  return (
    <header className="flex items-center justify-between whitespace-nowrap border-b border-slate-200 bg-white px-6 py-2.5 sticky top-0 z-[60] shadow-sm">
      <div className="flex items-center gap-4">
        {/* Logo */}
        <Link href="/customer/dashboard">
          <Image
            src="/hta-logo.jpg"
            alt="HTA Instrumentation"
            width={55}
            height={28}
            className="object-contain"
          />
        </Link>
        <div className="h-5 w-px bg-slate-300" />
        <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded">
          Customer Portal
        </span>
        {title && (
          <>
            <div className="h-5 w-px bg-slate-300" />
            <h2 className="text-base font-bold text-slate-900 tracking-tight">{title}</h2>
          </>
        )}
      </div>

      <div className="flex flex-1 justify-end gap-3 items-center">
        {/* Company Name Badge */}
        {session?.user?.companyName && (
          <div className="hidden md:flex items-center gap-1.5 text-xs text-slate-600 bg-slate-50 px-2.5 py-1 rounded-full border border-slate-100">
            <Building2 className="size-3.5" />
            <span>{session.user.companyName}</span>
          </div>
        )}

        {/* Team Management Link (POC only) */}
        {session?.user?.isPrimaryPoc && (
          <Link
            href="/customer/users"
            className="hidden sm:flex items-center gap-1.5 text-xs text-purple-700 bg-purple-50 px-2.5 py-1 rounded-full border border-purple-200 hover:bg-purple-100 transition-colors"
          >
            <Users className="size-3.5" />
            <span>Manage Team</span>
          </Link>
        )}

        {/* Notifications */}
        <NotificationBell userRole="CUSTOMER" />

        {/* User info and logout */}
        <div className="flex items-center gap-2 pl-3 border-l border-slate-200">
          <div className="flex items-center gap-2">
            <div className="size-7 rounded-full ring-1 ring-slate-100 bg-green-600 text-white flex items-center justify-center font-bold text-xs">
              {getInitials(session?.user?.name || 'Customer')}
            </div>
            <div className="hidden sm:block">
              <p className="text-xs font-semibold text-slate-800">
                {session?.user?.name || 'Customer'}
              </p>
              <p className="text-[10px] text-slate-500 flex items-center gap-1">
                {session?.user?.isPrimaryPoc ? (
                  <>
                    <Crown className="size-2.5 text-amber-500" />
                    <span>Primary POC</span>
                  </>
                ) : (
                  'Customer'
                )}
              </p>
            </div>
          </div>

          <button
            onClick={handleSignOut}
            className="p-1.5 hover:bg-slate-50 rounded-full transition-colors text-slate-500 hover:text-slate-700"
            title="Sign out"
          >
            <LogOut className="size-3.5" />
          </button>
        </div>
      </div>
    </header>
  )
}
