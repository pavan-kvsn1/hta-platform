'use client'

import { useSession, signOut } from 'next-auth/react'
import Link from 'next/link'
import Image from 'next/image'
import { Clock, LogOut, Settings } from 'lucide-react'
import { useCertificateStore } from '@/lib/stores/certificate-store'

interface HeaderProps {
  title?: string
  showAutoSave?: boolean
}

export function Header({ title, showAutoSave = true }: HeaderProps) {
  const { data: session } = useSession()
  const { formData, isSaving } = useCertificateStore()

  const formatLastSaved = () => {
    if (!formData.lastSaved) return 'Not saved yet'
    const now = new Date()
    const diff = Math.floor((now.getTime() - formData.lastSaved.getTime()) / 1000)
    if (diff < 60) return `${diff}s ago`
    if (diff < 3600) return `${Math.floor(diff / 60)} min ago`
    return formData.lastSaved.toLocaleTimeString()
  }

  const handleSignOut = async () => {
    await signOut({ callbackUrl: '/login' })
  }

  const getDashboardLink = (role: string) => {
    switch (role) {
      case 'CUSTOMER':
        return '/customer/dashboard'
      default:
        return '/dashboard'
    }
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

  // Get user initials
  const getInitials = (name: string) => {
    if (!name) return 'U'
    const parts = name.split(' ')
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
    }
    return name.substring(0, 2).toUpperCase()
  }

  return (
    <header className="flex items-center justify-between whitespace-nowrap border-b border-slate-200 bg-white px-6 h-16 sticky top-0 z-[60] shadow-sm">
      <div className="flex items-center gap-4">
        {/* Logo */}
        <Link href={getDashboardLink(session?.user?.role || 'ENGINEER')}>
          <Image
            src="/hta-logo.jpg"
            alt="HTA Instrumentation"
            width={55}
            height={28}
            className="object-contain"
          />
        </Link>
        {title && (
          <>
            <div className="h-5 w-px bg-slate-300" />
            <h2 className="text-base font-bold text-slate-900 tracking-tight">{title}</h2>
          </>
        )}
      </div>

      <div className="flex flex-1 justify-end gap-3 items-center">
        {/* Auto-save indicator (only for certificate forms) */}
        {showAutoSave && (
          <div className="hidden md:flex items-center gap-1.5 text-xs text-slate-500 bg-slate-50 px-2.5 py-1 rounded-full border border-slate-100">
            <Clock className="size-3.5" />
            <span>
              {isSaving ? 'Saving...' : `Auto-save: ${formatLastSaved()}`}
            </span>
          </div>
        )}

        {/* Admin Link (for Admin users or users with isAdmin flag) */}
        {(session?.user?.role === 'ADMIN' || session?.user?.isAdmin) && (
          <Link
            href="/admin"
            className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 bg-blue-50 px-2.5 py-1.5 rounded-md border border-blue-200 hover:border-blue-300 transition-colors"
          >
            <Settings className="size-3.5" />
            <span className="hidden sm:inline">Admin Panel</span>
          </Link>
        )}

        {/* User info and logout */}
        <div className="flex items-center gap-2 pl-3 border-l border-slate-200">
          <div className="flex items-center gap-2">
            <div className="size-7 rounded-full ring-1 ring-slate-100 bg-blue-600 text-white flex items-center justify-center font-bold text-xs">
              {getInitials(session?.user?.name || 'User')}
            </div>
            <div className="hidden sm:block">
              <p className="text-xs font-semibold text-slate-800">
                {session?.user?.name || 'User'}
              </p>
              <p className="text-[10px] text-slate-500">
                {getRoleLabel(session?.user?.role || '')}
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
