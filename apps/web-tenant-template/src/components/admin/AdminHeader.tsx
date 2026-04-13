'use client'

import Link from 'next/link'
import { Menu, ArrowRightLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface AdminHeaderProps {
  showEngineerSwitch?: boolean
}

export function AdminHeader({ showEngineerSwitch = false }: AdminHeaderProps) {
  return (
    <header className="flex items-center justify-between whitespace-nowrap bg-[#222D7C] px-4 sm:px-6 h-16 sticky top-0 z-[60]">
      {/* Left Side - Mobile Menu & Title */}
      <div className="flex items-center gap-3">
        {/* Mobile Menu Button */}
        <button
          className="lg:hidden p-2 rounded-lg text-white hover:bg-blue-500 transition-colors"
          aria-label="Toggle menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        {/* Title */}
        <h1 className="text-white text-base font-semibold">
          Admin Portal
        </h1>
      </div>

      {/* Right Side - Actions */}
      <div className="flex items-center gap-3">
        {/* Switch to Engineer View */}
        {showEngineerSwitch && (
          <Link href="/dashboard">
            <Button
              variant="outline"
              size="sm"
              className="bg-white text-blue-600 hover:bg-blue-50 border-0 h-9 text-xs font-medium"
            >
              <ArrowRightLeft className="h-3.5 w-3.5 mr-1.5" />
              <span className="hidden sm:inline">Engineer Portal</span>
            </Button>
          </Link>
        )}
      </div>
    </header>
  )
}
