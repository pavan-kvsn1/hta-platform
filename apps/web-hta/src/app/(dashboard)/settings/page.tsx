'use client'

import { useSession } from 'next-auth/react'
import { Settings, User } from 'lucide-react'
import { ChangePasswordForm } from '@/components/auth/ChangePasswordForm'
import { TwoFactorSettings } from '@/components/auth/TwoFactorSettings'

export default function DashboardSettingsPage() {
  const { data: session } = useSession()

  return (
    <div className="p-8 max-w-[820px] mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-[22px] font-bold text-[#0f172a] flex items-center gap-2.5">
          <Settings className="size-[22px] text-[#94a3b8]" />
          Settings
        </h1>
        <p className="text-[13px] text-[#94a3b8] mt-1">Manage your account settings and security preferences.</p>
      </div>

      {/* Account Information */}
      <div className="bg-white rounded-xl border border-[#e2e8f0] p-6 mb-5">
        <h2 className="text-[15px] font-semibold text-[#0f172a] flex items-center gap-2 mb-5">
          <User className="size-[18px] text-[#94a3b8]" />
          Account Information
        </h2>
        <div className="divide-y divide-[#f1f5f9]">
          <div className="flex justify-between py-3">
            <span className="text-[13px] text-[#64748b]">Name</span>
            <span className="text-[13px] font-medium text-[#0f172a]">{session?.user?.name || '-'}</span>
          </div>
          <div className="flex justify-between py-3">
            <span className="text-[13px] text-[#64748b]">Email</span>
            <span className="text-[13px] font-medium text-[#0f172a]">{session?.user?.email || '-'}</span>
          </div>
          <div className="flex justify-between py-3">
            <span className="text-[13px] text-[#64748b]">Role</span>
            <span className="text-[13px] font-medium text-[#0f172a] capitalize">
              {session?.user?.role?.toLowerCase() || '-'}
            </span>
          </div>
        </div>
      </div>

      {/* Two-Factor Authentication */}
      <div className="mb-5">
        <TwoFactorSettings />
      </div>

      {/* Password Change */}
      <ChangePasswordForm apiEndpoint="/api/auth/change-password" />
    </div>
  )
}
