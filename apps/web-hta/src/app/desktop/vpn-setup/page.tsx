'use client'

import { useState } from 'react'
import { Monitor, ShieldCheck, Loader2, AlertCircle, CheckCircle, ArrowRight } from 'lucide-react'

// Token format: HTA-XXXX-XXXX-XXXX (hex uppercase)
function formatToken(raw: string): string {
  const clean = raw.toUpperCase().replace(/[^0-9A-F]/g, '')
  const parts = [clean.slice(0, 4), clean.slice(4, 8), clean.slice(8, 12)]
  const filled = parts.filter(Boolean).join('-')
  return filled ? `HTA-${filled}` : ''
}

function parseToken(formatted: string): string {
  return formatted.replace(/^HTA-/, '').replace(/-/g, '')
}

export default function VpnSetupPage() {
  const [rawInput, setRawInput] = useState('')
  const [provisioning, setProvisioning] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  const displayToken = formatToken(rawInput)
  const hexPart = parseToken(displayToken)
  const isComplete = hexPart.length === 12

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.toUpperCase().replace(/[^0-9A-F-]/g, '')
    // Strip prefix if user pastes the full token
    const stripped = val.startsWith('HTA-') ? val.replace(/^HTA-/, '').replace(/-/g, '') : val.replace(/-/g, '')
    setRawInput(stripped.slice(0, 12))
    setError('')
  }

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').toUpperCase().trim()
    // Accept both "HTA-XXXX-XXXX-XXXX" and "XXXXXXXXXXXX" formats
    const stripped = pasted.startsWith('HTA-')
      ? pasted.replace(/^HTA-/, '').replace(/-/g, '')
      : pasted.replace(/-/g, '')
    setRawInput(stripped.replace(/[^0-9A-F]/g, '').slice(0, 12))
    setError('')
  }

  const handleConnect = async () => {
    if (!isComplete || !window.electronAPI) return

    setError('')
    setProvisioning(true)

    try {
      const token = `HTA-${hexPart.slice(0, 4)}-${hexPart.slice(4, 8)}-${hexPart.slice(8, 12)}`
      const result = await window.electronAPI.vpnProvision(token)

      if (!result.success) {
        setError(result.error || 'Provisioning failed. Please check your token and try again.')
      } else {
        setDone(true)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred')
    } finally {
      setProvisioning(false)
    }
  }

  const handleContinue = () => {
    window.location.href = '/desktop/login'
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        {/* Logo / Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 mb-4">
            <Monitor className="w-8 h-8 text-emerald-400" />
          </div>
          <h1 className="text-2xl font-bold text-white">Desktop App Setup</h1>
          <p className="text-slate-400 text-sm mt-2">
            Connect this computer to the HTA platform network
          </p>
        </div>

        {done ? (
          /* Success state */
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center space-y-4">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/20">
              <CheckCircle className="w-7 h-7 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Connected!</h2>
              <p className="text-slate-400 text-sm mt-1">
                Your VPN tunnel is configured and active. The desktop app can now reach the HTA platform.
              </p>
            </div>
            <button
              onClick={handleContinue}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              Continue to Login
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        ) : (
          /* Token entry state */
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 space-y-6">
            {/* Instructions */}
            <div className="flex items-start gap-3 p-4 bg-slate-800/50 rounded-xl border border-slate-700">
              <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <div className="text-sm text-slate-300">
                <p className="font-medium text-white mb-1">Enter your provisioning token</p>
                <p className="text-slate-400">
                  Find this on the{' '}
                  <span className="text-emerald-400">Offline Codes page</span>{' '}
                  of the HTA web app after your desktop access request has been approved.
                </p>
              </div>
            </div>

            {/* Token input */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">
                Provisioning Token
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-mono text-sm select-none pointer-events-none">
                  HTA-
                </span>
                <input
                  type="text"
                  value={hexPart.replace(/(.{4})(.{4})(.{4})/, '$1-$2-$3')}
                  onChange={handleInput}
                  onPaste={handlePaste}
                  placeholder="XXXX-XXXX-XXXX"
                  maxLength={14}
                  spellCheck={false}
                  autoComplete="off"
                  className="w-full pl-12 pr-4 py-3 bg-slate-800 border border-slate-700 text-white font-mono text-base tracking-widest rounded-xl placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
                />
              </div>
              <p className="text-xs text-slate-500 mt-2">
                Format: HTA-XXXX-XXXX-XXXX (letters and numbers only)
              </p>
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-start gap-2.5 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <p className="text-sm text-red-300">{error}</p>
              </div>
            )}

            {/* Connect button */}
            <button
              onClick={handleConnect}
              disabled={!isComplete || provisioning}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              {provisioning ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Connecting…
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  Connect & Continue
                </>
              )}
            </button>

            <p className="text-xs text-slate-500 text-center">
              This installs an encrypted VPN tunnel to reach the HTA platform.
              The key is stored only on this computer.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
