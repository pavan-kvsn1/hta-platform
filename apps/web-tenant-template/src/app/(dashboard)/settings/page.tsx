'use client'

import { useSession } from 'next-auth/react'
import { Settings, User } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChangePasswordForm } from '@/components/auth/ChangePasswordForm'

export default function DashboardSettingsPage() {
  const { data: session } = useSession()

  return (
    <div className="p-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Settings className="h-6 w-6 text-slate-400" />
          Settings
        </h1>
        <p className="text-slate-500 mt-1">Manage your account settings</p>
      </div>

      {/* User Info */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <User className="h-5 w-5 text-slate-400" />
            Account Information
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex justify-between py-2 border-b border-slate-100">
              <span className="text-slate-500">Name</span>
              <span className="font-medium">{session?.user?.name || '-'}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-slate-100">
              <span className="text-slate-500">Email</span>
              <span className="font-medium">{session?.user?.email || '-'}</span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-slate-500">Role</span>
              <span className="font-medium capitalize">
                {session?.user?.role?.toLowerCase() || '-'}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Password Change */}
      <ChangePasswordForm apiEndpoint="/api/auth/change-password" />
    </div>
  )
}
