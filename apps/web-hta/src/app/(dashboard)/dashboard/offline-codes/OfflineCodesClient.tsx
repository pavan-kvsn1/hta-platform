'use client'

import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '@/lib/api-client'
import {
  KeyRound, Printer, Send, AlertTriangle, Monitor,
  Clock, XCircle, Copy, Check, Laptop,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface CodePair {
  sequence: number
  key: string
  value: string
  used: boolean
}

interface PendingRequest {
  id: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  adminNote: string | null
  createdAt: string
}

interface VpnInfo {
  latestRequest: PendingRequest | null
  provisioningToken: string | null
  tokenGeneratedAt: string | null
  peer: { ipAddress: string; provisionedAt: string; isActive: boolean } | null
}

interface BatchStatus {
  hasBatch: boolean
  batchId?: string
  total?: number
  remaining?: number
  pairs?: CodePair[]
  expiresAt?: string
  isExpired?: boolean
  pendingRequest?: PendingRequest | null
  vpn?: VpnInfo
}

interface Device {
  id: string
  deviceId: string
  deviceName: string
  platform: string
  status: string
  lastSyncAt: string | null
  registeredAt: string
}

const ROW_LABELS = ['A', 'B', 'C', 'D', 'E']
const COLS = 10

export function OfflineCodesClient() {
  const [status, setStatus] = useState<BatchStatus | null>(null)
  const [devices, setDevices] = useState<Device[]>([])
  const [loading, setLoading] = useState(true)
  const [requesting, setRequesting] = useState(false)
  const [showRequestForm, setShowRequestForm] = useState(false)
  const [reason, setReason] = useState('')
  const [requestingVpn, setRequestingVpn] = useState(false)
  const [vpnReason, setVpnReason] = useState('')
  const [showVpnRequestForm, setShowVpnRequestForm] = useState(false)
  const [tokenCopied, setTokenCopied] = useState(false)

  const fetchStatus = useCallback(async () => {
    try {
      const res = await apiFetch('/api/offline-codes')
      if (res.ok) setStatus(await res.json())
    } catch { /* ignore */ }
  }, [])

  const fetchDevices = useCallback(async () => {
    try {
      const res = await apiFetch('/api/devices/my')
      if (res.ok) {
        const data = await res.json()
        setDevices(data.devices)
      }
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    Promise.all([fetchStatus(), fetchDevices()]).finally(() => setLoading(false))
  }, [fetchStatus, fetchDevices])

  const handleRequest = async () => {
    setRequesting(true)
    try {
      const res = await apiFetch('/api/internal-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'OFFLINE_CODE_REQUEST', reason: reason || undefined }),
      })
      if (res.ok) { setShowRequestForm(false); setReason(''); await fetchStatus() }
    } catch { /* ignore */ }
    setRequesting(false)
  }

  const handleVpnRequest = async () => {
    setRequestingVpn(true)
    try {
      const res = await apiFetch('/api/internal-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'DESKTOP_VPN_REQUEST', reason: vpnReason || undefined }),
      })
      if (res.ok) { setShowVpnRequestForm(false); setVpnReason(''); await fetchStatus() }
    } catch { /* ignore */ }
    setRequestingVpn(false)
  }

  const copyToken = async (token: string) => {
    try {
      await navigator.clipboard.writeText(token)
      setTokenCopied(true)
      setTimeout(() => setTokenCopied(false), 2000)
    } catch { /* ignore */ }
  }

  if (loading) {
    return (
      <div className="h-full bg-[#f1f5f9] flex items-center justify-center">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#7c3aed]" />
      </div>
    )
  }

  const pairGrid = status?.pairs ? buildGrid(status.pairs) : null
  const usedKeySet = new Set(status?.pairs?.filter((p) => p.used).map((p) => p.key) || [])
  const pendingRequest = status?.pendingRequest
  const vpn = status?.vpn

  return (
    <div className="h-full overflow-auto bg-[#f1f5f9]">
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-5">

        {/* Page Header */}
        <div>
          <h1 className="text-[22px] font-bold text-[#0f172a] flex items-center gap-2.5">
            <KeyRound className="size-[22px] text-[#94a3b8]" />
            Offline Access
          </h1>
          <p className="text-[13px] text-[#94a3b8] mt-1">
            Challenge-response card and desktop app setup
          </p>
        </div>

        {/* ── Offline Code Card ───────────────────────────────────────────── */}
        <div className="bg-white rounded-[14px] border border-[#e2e8f0] overflow-hidden">
          <div className="px-5 py-[14px] border-b border-[#f1f5f9] flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">
              Challenge-Response Card
            </span>
            {status?.hasBatch && !status.isExpired && (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-[#f0fdf4] text-[#16a34a]">
                Active
              </span>
            )}
            {status?.isExpired && (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-[#fef2f2] text-[#dc2626]">
                Expired
              </span>
            )}
          </div>

          <div className="p-5">
            {/* Request status banners */}
            {pendingRequest?.status === 'PENDING' && (
              <div className="flex items-center gap-3 p-3.5 bg-[#fffbeb] border border-[#fde68a] rounded-[9px] mb-4">
                <Clock className="size-4 text-[#d97706] shrink-0" />
                <div>
                  <p className="text-[12.5px] font-semibold text-[#92400e]">Request pending admin approval</p>
                  <p className="text-[12px] text-[#b45309]">
                    Submitted {new Date(pendingRequest.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
            )}

            {pendingRequest?.status === 'REJECTED' && !status?.hasBatch && (
              <div className="flex items-center gap-3 p-3.5 bg-[#fef2f2] border border-[#fecaca] rounded-[9px] mb-4">
                <XCircle className="size-4 text-[#dc2626] shrink-0" />
                <p className="text-[12.5px] text-[#dc2626]">
                  {pendingRequest.adminNote || 'Your request was rejected. You may submit a new one.'}
                </p>
              </div>
            )}

            {/* Batch stats */}
            {status?.hasBatch ? (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'Remaining', value: status.remaining },
                    { label: 'Total', value: status.total },
                    { label: 'Expires', value: status.expiresAt ? new Date(status.expiresAt).toLocaleDateString() : '—' },
                  ].map((s) => (
                    <div key={s.label} className="text-center p-3 bg-[#f8fafc] rounded-[9px] border border-[#e2e8f0]">
                      <p className="text-[22px] font-extrabold text-[#0f172a]">{s.value}</p>
                      <p className="text-[11px] text-[#94a3b8] mt-0.5">{s.label}</p>
                    </div>
                  ))}
                </div>

                {status.isExpired && (
                  <div className="flex items-center gap-2 p-3 bg-[#fef2f2] border border-[#fecaca] rounded-[9px]">
                    <AlertTriangle className="size-4 text-[#dc2626] shrink-0" />
                    <p className="text-[12.5px] text-[#dc2626]">Card expired — request a new one below.</p>
                  </div>
                )}

                {!status.isExpired && (status.remaining ?? 0) < 10 && (
                  <div className="flex items-center gap-2 p-3 bg-[#fffbeb] border border-[#fde68a] rounded-[9px]">
                    <AlertTriangle className="size-4 text-[#d97706] shrink-0" />
                    <p className="text-[12.5px] text-[#92400e]">Running low — request a new card soon.</p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-[13px] text-[#94a3b8]">No active card. Request one below.</p>
            )}

            {/* Request new card */}
            {pendingRequest?.status !== 'PENDING' && (
              <div className="mt-4">
                {showRequestForm ? (
                  <div className="p-4 bg-[#f8fafc] border border-[#e2e8f0] rounded-[9px] space-y-3">
                    <p className="text-[12.5px] text-[#64748b]">
                      {status?.hasBatch && !status.isExpired
                        ? 'A new card will replace your current one when approved.'
                        : 'Submit a request for a new challenge-response card.'}
                    </p>
                    <textarea
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Reason (optional)"
                      rows={2}
                      className="w-full px-3 py-2 text-[13px] text-[#0f172a] border border-[#e2e8f0] rounded-[9px] resize-none placeholder:text-[#94a3b8] focus:ring-2 focus:ring-[#7c3aed]/20 focus:border-[#7c3aed] outline-none"
                    />
                    <div className="flex gap-2.5">
                      <button
                        onClick={handleRequest}
                        disabled={requesting}
                        className="inline-flex items-center gap-1.5 px-4 py-2 text-[12.5px] font-semibold text-white bg-[#7c3aed] hover:bg-[#6d28d9] rounded-[9px] transition-colors disabled:opacity-50"
                      >
                        <Send className="size-3.5" />
                        {requesting ? 'Submitting…' : 'Submit Request'}
                      </button>
                      <button
                        onClick={() => { setShowRequestForm(false); setReason('') }}
                        className="px-4 py-2 text-[12.5px] font-semibold text-[#475569] border border-[#e2e8f0] bg-white hover:bg-[#f8fafc] rounded-[9px] transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowRequestForm(true)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-[12.5px] font-semibold text-white bg-[#7c3aed] hover:bg-[#6d28d9] rounded-[9px] transition-colors"
                  >
                    <Send className="size-3.5" />
                    Request New Card
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Code Grid ───────────────────────────────────────────────────── */}
        {pairGrid && (
          <div className="bg-white rounded-[14px] border border-[#e2e8f0] overflow-hidden" id="printable-codes">
            <div className="px-5 py-[14px] border-b border-[#f1f5f9] flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">
                Your Card
              </span>
              <button
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold text-[#475569] border border-[#e2e8f0] bg-white hover:bg-[#f8fafc] rounded-[7px] transition-colors print:hidden"
              >
                <Printer className="size-3.5" />
                Print
              </button>
            </div>

            <div className="p-5">
              <p className="text-[12.5px] text-[#64748b] mb-4 print:hidden">
                The desktop app shows a key (e.g. &quot;B4&quot;) — enter the matching value from this card.
                Struck-through codes have been used.
              </p>

              <div className="hidden print:block text-center text-[12px] text-[#64748b] mb-3">
                HTA Calibr8s — Challenge-Response Card — Valid until:{' '}
                {status?.expiresAt ? new Date(status.expiresAt).toLocaleDateString() : ''}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full border-collapse font-mono text-[13px]">
                  <thead>
                    <tr>
                      <th className="p-2 bg-[#f8fafc] border border-[#e2e8f0] w-10" />
                      {Array.from({ length: COLS }, (_, i) => (
                        <th key={i} className="p-2 bg-[#f8fafc] border border-[#e2e8f0] text-center text-[#64748b] font-semibold">
                          {i + 1}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ROW_LABELS.map((row) => (
                      <tr key={row}>
                        <td className="p-2 bg-[#f8fafc] border border-[#e2e8f0] text-center text-[#64748b] font-semibold">
                          {row}
                        </td>
                        {Array.from({ length: COLS }, (_, c) => {
                          const key = `${row}${c + 1}`
                          const isUsed = usedKeySet.has(key)
                          return (
                            <td
                              key={c}
                              className={cn(
                                'p-2 border border-[#e2e8f0] text-center tracking-wider',
                                isUsed ? 'line-through text-[#cbd5e1] bg-[#fef2f2]' : 'text-[#0f172a]'
                              )}
                            >
                              {pairGrid[key] || '—'}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="text-[11px] text-[#94a3b8] mt-3 text-center">
                Valid until: {status?.expiresAt ? new Date(status.expiresAt).toLocaleDateString() : ''} &mdash; {status?.remaining}/{status?.total} remaining
              </p>
            </div>
          </div>
        )}

        {/* ── Desktop App Setup ────────────────────────────────────────────── */}
        <div className="bg-white rounded-[14px] border border-[#e2e8f0] overflow-hidden">
          <div className="px-5 py-[14px] border-b border-[#f1f5f9] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Laptop className="size-4 text-[#94a3b8]" />
              <span className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">
                Desktop App Setup
              </span>
            </div>
            {vpn?.peer?.isActive && (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-[#ecfdf5] text-[#065f46]">
                Connected
              </span>
            )}
          </div>

          <div className="p-5">
            {vpn?.peer?.isActive ? (
              /* Provisioned */
              <div className="flex items-center gap-3 p-3.5 bg-[#f0fdf4] border border-[#bbf7d0] rounded-[9px]">
                <Check className="size-4 text-[#16a34a] shrink-0" />
                <div>
                  <p className="text-[12.5px] font-semibold text-[#14532d]">Desktop app configured</p>
                  <p className="text-[12px] text-[#166534]">
                    Connected via VPN ({vpn.peer.ipAddress}) since {new Date(vpn.peer.provisionedAt).toLocaleDateString()}
                  </p>
                </div>
              </div>

            ) : vpn?.provisioningToken ? (
              /* Token ready */
              <div className="space-y-3">
                <div className="flex items-start gap-3 p-3.5 bg-[#eff6ff] border border-[#bfdbfe] rounded-[9px]">
                  <Check className="size-4 text-[#2563eb] shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[12.5px] font-semibold text-[#1e3a8a]">Access approved</p>
                    <p className="text-[12px] text-[#1d4ed8]">
                      Open the desktop app and enter this token on the first-run screen.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 px-4 py-3 bg-[#f8fafc] border border-[#e2e8f0] rounded-[9px]">
                  <code className="flex-1 font-mono text-[15px] tracking-widest text-[#0f172a] select-all">
                    {vpn.provisioningToken}
                  </code>
                  <button
                    onClick={() => copyToken(vpn.provisioningToken!)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold text-[#475569] border border-[#e2e8f0] bg-white hover:bg-[#f8fafc] rounded-[7px] transition-colors"
                  >
                    {tokenCopied
                      ? <><Check className="size-3.5 text-[#16a34a]" /> Copied</>
                      : <><Copy className="size-3.5" /> Copy</>
                    }
                  </button>
                </div>
                <p className="text-[11px] text-[#94a3b8]">
                  Valid for 7 days from approval. Cleared automatically once the app connects.
                </p>
              </div>

            ) : vpn?.latestRequest?.status === 'PENDING' ? (
              /* Pending */
              <div className="flex items-center gap-3 p-3.5 bg-[#fffbeb] border border-[#fde68a] rounded-[9px]">
                <Clock className="size-4 text-[#d97706] shrink-0" />
                <div>
                  <p className="text-[12.5px] font-semibold text-[#92400e]">Request pending admin approval</p>
                  <p className="text-[12px] text-[#b45309]">
                    Submitted {new Date(vpn.latestRequest.createdAt).toLocaleDateString()}. You&apos;ll be notified when reviewed.
                  </p>
                </div>
              </div>

            ) : vpn?.latestRequest?.status === 'REJECTED' ? (
              /* Rejected */
              <div className="space-y-3">
                <div className="flex items-center gap-3 p-3.5 bg-[#fef2f2] border border-[#fecaca] rounded-[9px]">
                  <XCircle className="size-4 text-[#dc2626] shrink-0" />
                  <p className="text-[12.5px] text-[#dc2626]">
                    {vpn.latestRequest.adminNote || 'Your request was rejected. You may submit a new one.'}
                  </p>
                </div>
                <button
                  onClick={() => setShowVpnRequestForm(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-[12.5px] font-semibold text-white bg-[#7c3aed] hover:bg-[#6d28d9] rounded-[9px] transition-colors"
                >
                  <Send className="size-3.5" />
                  Request Again
                </button>
              </div>

            ) : (
              /* No request yet */
              <div className="space-y-3">
                <p className="text-[13px] text-[#64748b]">
                  Request access to connect the desktop app to the HTA platform. An admin will review and approve your request.
                </p>
                {showVpnRequestForm ? (
                  <div className="p-4 bg-[#f8fafc] border border-[#e2e8f0] rounded-[9px] space-y-3">
                    <textarea
                      value={vpnReason}
                      onChange={(e) => setVpnReason(e.target.value)}
                      placeholder="Reason (optional)"
                      rows={2}
                      className="w-full px-3 py-2 text-[13px] text-[#0f172a] border border-[#e2e8f0] rounded-[9px] resize-none placeholder:text-[#94a3b8] focus:ring-2 focus:ring-[#7c3aed]/20 focus:border-[#7c3aed] outline-none"
                    />
                    <div className="flex gap-2.5">
                      <button
                        onClick={handleVpnRequest}
                        disabled={requestingVpn}
                        className="inline-flex items-center gap-1.5 px-4 py-2 text-[12.5px] font-semibold text-white bg-[#7c3aed] hover:bg-[#6d28d9] rounded-[9px] transition-colors disabled:opacity-50"
                      >
                        <Send className="size-3.5" />
                        {requestingVpn ? 'Submitting…' : 'Submit Request'}
                      </button>
                      <button
                        onClick={() => { setShowVpnRequestForm(false); setVpnReason('') }}
                        className="px-4 py-2 text-[12.5px] font-semibold text-[#475569] border border-[#e2e8f0] bg-white hover:bg-[#f8fafc] rounded-[9px] transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowVpnRequestForm(true)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-[12.5px] font-semibold text-white bg-[#7c3aed] hover:bg-[#6d28d9] rounded-[9px] transition-colors"
                  >
                    <Monitor className="size-3.5" />
                    Request Desktop Access
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Registered Devices ───────────────────────────────────────────── */}
        <div className="bg-white rounded-[14px] border border-[#e2e8f0] overflow-hidden">
          <div className="px-5 py-[14px] border-b border-[#f1f5f9] flex items-center gap-2">
            <Monitor className="size-4 text-[#94a3b8]" />
            <span className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">
              Registered Devices
            </span>
            {devices.length > 0 && (
              <span className="ml-auto text-[11px] font-semibold text-[#64748b]">{devices.length}</span>
            )}
          </div>

          <div className="p-5">
            {devices.length === 0 ? (
              <p className="text-[13px] text-[#94a3b8]">
                No devices registered. Register from the desktop app to get started.
              </p>
            ) : (
              <div className="divide-y divide-[#f1f5f9]">
                {devices.map((d) => (
                  <div key={d.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                    <div>
                      <p className="text-[13px] font-medium text-[#0f172a]">{d.deviceName}</p>
                      <p className="text-[11px] text-[#94a3b8] mt-0.5">
                        {d.platform} &mdash; Registered {new Date(d.registeredAt).toLocaleDateString()}
                        {d.lastSyncAt && ` · Last sync ${new Date(d.lastSyncAt).toLocaleDateString()}`}
                      </p>
                    </div>
                    <span className={cn(
                      'px-2 py-0.5 rounded-md text-[11px] font-semibold',
                      d.status === 'ACTIVE' && 'bg-[#f0fdf4] text-[#16a34a]',
                      d.status === 'REVOKED' && 'bg-[#fef2f2] text-[#dc2626]',
                      d.status === 'WIPE_PENDING' && 'bg-[#fffbeb] text-[#d97706]',
                      !['ACTIVE', 'REVOKED', 'WIPE_PENDING'].includes(d.status) && 'bg-[#f1f5f9] text-[#64748b]',
                    )}>
                      {d.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}

function buildGrid(pairs: CodePair[]): Record<string, string> {
  const grid: Record<string, string> = {}
  for (const p of pairs) grid[p.key] = p.value
  return grid
}
