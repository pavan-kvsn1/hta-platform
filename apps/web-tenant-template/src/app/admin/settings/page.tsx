'use client'

import { useSession } from 'next-auth/react'
import { Settings, User, ShieldCheck } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChangePasswordForm } from '@/components/auth/ChangePasswordForm'
import { Badge } from '@/components/ui/badge'

export default function AdminSettingsPage() {
  const { data: session } = useSession()

  const getAdminTypeBadge = () => {
    if (session?.user?.adminType === 'MASTER') {
      return <Badge className="bg-purple-100 text-purple-800">Master Admin</Badge>
    }
    if (session?.user?.adminType === 'WORKER') {
      return <Badge className="bg-blue-100 text-blue-800">Worker Admin</Badge>
    }
    return <Badge variant="secondary">Admin</Badge>
  }

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
              <span className="text-slate-500 text-sm">Name</span>
              <span className="font-medium text-sm">{session?.user?.name || '-'}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-slate-100">
              <span className="text-slate-500 text-sm">Email</span>
              <span className="font-medium text-sm">{session?.user?.email || '-'}</span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-slate-500 flex items-center gap-2 text-sm">
                <ShieldCheck className="h-4 w-4" />
                Role
              </span>
              {getAdminTypeBadge()}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Password Change */}
      <ChangePasswordForm apiEndpoint="/api/auth/change-password" />
    </div>
  )
}
