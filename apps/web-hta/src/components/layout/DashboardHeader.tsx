'use client'

import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { Settings, Menu } from 'lucide-react'

interface DashboardHeaderProps {
  onMobileMenuToggle: () => void
}

export function DashboardHeader({ onMobileMenuToggle }: DashboardHeaderProps) {
  const { data: session } = useSession()

  return (
    <header className="flex items-center justify-between bg-white border-b border-[#e2e8f0] px-4 sm:px-6 h-12 sticky top-0 z-[60]">
      {/* Mobile Menu Button */}
      <button
        onClick={onMobileMenuToggle}
        className="lg:hidden p-2 -ml-2 rounded-lg hover:bg-[#f1f5f9] text-[#64748b]"
        aria-label="Toggle menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Admin Link */}
      {(session?.user?.role === 'ADMIN' || session?.user?.isAdmin) && (
        <Link
          href="/admin"
          className="flex items-center gap-1.5 text-xs font-medium text-[#475569] hover:text-[#0f172a] px-2.5 py-1.5 rounded-lg hover:bg-[#f1f5f9] transition-colors"
        >
          <Settings className="size-3.5" />
          <span className="hidden sm:inline">Admin Panel</span>
        </Link>
      )}
    </header>
  )
}
