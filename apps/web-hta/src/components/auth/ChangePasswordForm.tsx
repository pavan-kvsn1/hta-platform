'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Lock, Eye, EyeOff, Check, X, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ChangePasswordFormProps {
  apiEndpoint: '/api/auth/change-password' | '/api/customer/change-password'
  onSuccess?: () => void
}

interface PasswordRequirement {
  label: string
  test: (password: string) => boolean
}

const passwordRequirements: PasswordRequirement[] = [
  { label: 'At least 8 characters', test: (p) => p.length >= 8 },
  { label: 'One uppercase letter', test: (p) => /[A-Z]/.test(p) },
  { label: 'One lowercase letter', test: (p) => /[a-z]/.test(p) },
  { label: 'One number', test: (p) => /[0-9]/.test(p) },
]

export function ChangePasswordForm({ apiEndpoint, onSuccess }: ChangePasswordFormProps) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess(false)

    // Client-side validation
    if (!currentPassword || !newPassword || !confirmPassword) {
      setError('All fields are required')
      return
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    const allRequirementsMet = passwordRequirements.every((req) => req.test(newPassword))
    if (!allRequirementsMet) {
      setError('Password does not meet all requirements')
      return
    }

    setLoading(true)

    try {
      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword,
          newPassword,
          confirmPassword,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || 'Failed to change password')
        return
      }

      setSuccess(true)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      onSuccess?.()
    } catch {
      setError('An error occurred. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const passwordsMatch = newPassword && confirmPassword && newPassword === confirmPassword

  return (
    <div className="bg-white rounded-xl border border-[#e2e8f0] p-6">
      <div className="mb-5">
        <h2 className="text-[15px] font-semibold text-[#0f172a] flex items-center gap-2">
          <Lock className="size-[18px] text-[#94a3b8]" />
          Change Password
        </h2>
        <p className="text-[13px] text-[#94a3b8] mt-1 ml-[26px]">
          Update your password to keep your account secure
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-lg bg-[#fef2f2] border border-[#fecaca] px-3.5 py-2.5 text-[13px] text-[#dc2626]">
            {error}
          </div>
        )}

        {success && (
          <div className="rounded-lg bg-[#f0fdf4] border border-[#bbf7d0] px-3.5 py-2.5 text-[13px] text-[#16a34a] flex items-center gap-2">
            <Check className="size-3.5" />
            Password changed successfully
          </div>
        )}

        {/* Current Password */}
        <div className="space-y-1.5">
          <Label htmlFor="currentPassword" className="text-[13px] font-semibold text-[#0f172a]">Current Password</Label>
          <div className="relative">
            <Input
              id="currentPassword"
              type={showCurrentPassword ? 'text' : 'password'}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Enter your current password"
              className="pr-10 rounded-lg border-[#e2e8f0] h-10 text-[13px] placeholder:text-[#94a3b8]"
            />
            <button
              type="button"
              onClick={() => setShowCurrentPassword(!showCurrentPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94a3b8] hover:text-[#475569]"
            >
              {showCurrentPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </div>

        {/* New Password */}
        <div className="space-y-1.5">
          <Label htmlFor="newPassword" className="text-[13px] font-semibold text-[#0f172a]">New Password</Label>
          <div className="relative">
            <Input
              id="newPassword"
              type={showNewPassword ? 'text' : 'password'}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Enter your new password"
              className="pr-10 rounded-lg border-[#e2e8f0] h-10 text-[13px] placeholder:text-[#94a3b8]"
            />
            <button
              type="button"
              onClick={() => setShowNewPassword(!showNewPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94a3b8] hover:text-[#475569]"
            >
              {showNewPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </div>

        {/* Password Requirements */}
        {newPassword && (
          <div className="rounded-lg bg-[#f8fafc] border border-[#e2e8f0] p-3 space-y-1">
            <p className="text-[11px] font-semibold text-[#64748b] uppercase tracking-wider mb-2">Password Requirements</p>
            {passwordRequirements.map((req, index) => {
              const met = req.test(newPassword)
              return (
                <div
                  key={index}
                  className={cn(
                    'flex items-center gap-2 text-[12px]',
                    met ? 'text-[#16a34a]' : 'text-[#94a3b8]'
                  )}
                >
                  {met ? (
                    <Check className="size-3" />
                  ) : (
                    <X className="size-3" />
                  )}
                  {req.label}
                </div>
              )
            })}
          </div>
        )}

        {/* Confirm Password */}
        <div className="space-y-1.5">
          <Label htmlFor="confirmPassword" className="text-[13px] font-semibold text-[#0f172a]">Confirm New Password</Label>
          <div className="relative">
            <Input
              id="confirmPassword"
              type={showConfirmPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm your new password"
              className={cn(
                'pr-10 rounded-lg border-[#e2e8f0] h-10 text-[13px] placeholder:text-[#94a3b8]',
                confirmPassword && (passwordsMatch ? 'border-[#16a34a]' : 'border-[#dc2626]')
              )}
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94a3b8] hover:text-[#475569]"
            >
              {showConfirmPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          {confirmPassword && !passwordsMatch && (
            <p className="text-[12px] text-[#dc2626]">Passwords do not match</p>
          )}
        </div>

        <Button
          type="submit"
          disabled={loading || !currentPassword || !newPassword || !confirmPassword}
          className="w-full rounded-lg h-10 text-[13px] font-semibold"
        >
          {loading ? (
            <>
              <Loader2 className="mr-1.5 size-3.5 animate-spin" />
              Changing Password...
            </>
          ) : (
            'Change Password'
          )}
        </Button>
      </form>
    </div>
  )
}
