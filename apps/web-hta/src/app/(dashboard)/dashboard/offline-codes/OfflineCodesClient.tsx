'use client'

import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '@/lib/api-client'
import { KeyRound, Printer, Send, AlertTriangle, Monitor, Clock, XCircle } from 'lucide-react'

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

interface BatchStatus {
  hasBatch: boolean
  batchId?: string
  total?: number
  remaining?: number
  pairs?: CodePair[]
  expiresAt?: string
  isExpired?: boolean
  pendingRequest?: PendingRequest | null
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
        body: JSON.stringify({
          type: 'OFFLINE_CODE_REQUEST',
          reason: reason || undefined,
        }),
      })
      if (res.ok) {
        setShowRequestForm(false)
        setReason('')
        await fetchStatus()
      }
    } catch { /* ignore */ }
    setRequesting(false)
  }

  const handlePrint = () => {
    window.print()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    )
  }

  const pairGrid = status?.pairs ? buildGrid(status.pairs) : null
  const usedKeySet = new Set(status?.pairs?.filter((p) => p.used).map((p) => p.key) || [])
  const pendingRequest = status?.pendingRequest

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Offline Access Codes</h1>
        <p className="text-sm text-slate-500 mt-1">
          Challenge-response card for the desktop app when working offline
        </p>
      </div>

      {/* Request Status Banners */}
      {pendingRequest?.status === 'PENDING' && (
        <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <Clock className="h-5 w-5 text-amber-600 shrink-0" />
          <div>
            <p className="text-sm font-medium text-amber-800">Request Pending</p>
            <p className="text-sm text-amber-700">
              Your card request is awaiting admin approval. Submitted {new Date(pendingRequest.createdAt).toLocaleDateString()}.
            </p>
          </div>
        </div>
      )}

      {pendingRequest?.status === 'REJECTED' && !status?.hasBatch && (
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
          <XCircle className="h-5 w-5 text-red-600 shrink-0" />
          <div>
            <p className="text-sm font-medium text-red-800">Request Rejected</p>
            <p className="text-sm text-red-700">
              {pendingRequest.adminNote || 'Your card request was rejected. You may submit a new request.'}
            </p>
          </div>
        </div>
      )}

      {/* Batch Status Card */}
      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <div className="flex items-center gap-3 mb-4">
          <KeyRound className="h-5 w-5 text-blue-600" />
          <h2 className="text-lg font-semibold text-slate-900">Card Status</h2>
        </div>

        {status?.hasBatch ? (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-3 bg-slate-50 rounded-lg">
                <p className="text-2xl font-bold text-slate-900">{status.remaining}</p>
                <p className="text-xs text-slate-500">Remaining</p>
              </div>
              <div className="text-center p-3 bg-slate-50 rounded-lg">
                <p className="text-2xl font-bold text-slate-900">{status.total}</p>
                <p className="text-xs text-slate-500">Total</p>
              </div>
              <div className="text-center p-3 bg-slate-50 rounded-lg">
                <p className="text-sm font-medium text-slate-900">
                  {status.expiresAt ? new Date(status.expiresAt).toLocaleDateString() : '-'}
                </p>
                <p className="text-xs text-slate-500">Expires</p>
              </div>
            </div>

            {status.isExpired && (
              <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                <p className="text-sm text-amber-800">
                  Your card has expired. Request a new one below.
                </p>
              </div>
            )}

            {!status.isExpired && status.remaining !== undefined && status.remaining < 10 && (
              <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                <p className="text-sm text-amber-800">
                  Running low on codes. Request a new card before your next onsite visit.
                </p>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-slate-500">
            No active card. Request one to use with the desktop app.
          </p>
        )}

        {/* Request New Card */}
        {pendingRequest?.status !== 'PENDING' && (
          <div className="mt-4">
            {showRequestForm ? (
              <div className="space-y-3 p-4 bg-slate-50 rounded-lg">
                <p className="text-sm text-slate-600">
                  {status?.hasBatch && !status.isExpired
                    ? 'Requesting a new card will replace your current one when approved.'
                    : 'Submit a request for a new challenge-response card.'}
                </p>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Reason (optional) — e.g., codes running low, card expired, lost printout"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={2}
                />
                <div className="flex gap-3">
                  <button
                    onClick={handleRequest}
                    disabled={requesting}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    <Send className="h-4 w-4" />
                    {requesting ? 'Submitting...' : 'Submit Request'}
                  </button>
                  <button
                    onClick={() => { setShowRequestForm(false); setReason('') }}
                    className="px-4 py-2 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowRequestForm(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
              >
                <Send className="h-4 w-4" />
                Request New Card
              </button>
            )}
          </div>
        )}
      </div>

      {/* Challenge-Response Grid */}
      {pairGrid && (
        <div className="bg-white rounded-lg border border-slate-200 p-6" id="printable-codes">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-900">Your Challenge-Response Card</h2>
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 px-3 py-1.5 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 print:hidden"
            >
              <Printer className="h-4 w-4" />
              Print
            </button>
          </div>

          <p className="text-sm text-slate-500 mb-4 print:hidden">
            The desktop app will show a key (e.g., &quot;B4&quot;). Enter the matching value from this card.
            Used codes are struck through and cannot be reused.
          </p>

          <div className="text-center text-sm text-slate-500 mb-3 hidden print:block">
            HTA Calibr8s — Challenge-Response Card — Valid until: {status?.expiresAt ? new Date(status.expiresAt).toLocaleDateString() : ''}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse font-mono text-sm">
              <thead>
                <tr>
                  <th className="p-2 bg-slate-100 border border-slate-300 w-10"></th>
                  {Array.from({ length: COLS }, (_, i) => (
                    <th key={i} className="p-2 bg-slate-100 border border-slate-300 text-center text-slate-600 font-semibold">
                      {i + 1}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROW_LABELS.map((row) => (
                  <tr key={row}>
                    <td className="p-2 bg-slate-100 border border-slate-300 text-center text-slate-600 font-semibold">
                      {row}
                    </td>
                    {Array.from({ length: COLS }, (_, c) => {
                      const key = `${row}${c + 1}`
                      const value = pairGrid[key] || '—'
                      const isUsed = usedKeySet.has(key)
                      return (
                        <td
                          key={c}
                          className={`p-2 border border-slate-300 text-center tracking-wider ${
                            isUsed
                              ? 'line-through text-slate-400 bg-red-50'
                              : 'text-slate-900'
                          }`}
                        >
                          {value}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-slate-400 mt-3 text-center">
            Valid until: {status?.expiresAt ? new Date(status.expiresAt).toLocaleDateString() : ''} &mdash; {status?.remaining}/{status?.total} remaining
          </p>
        </div>
      )}

      {/* Registered Devices */}
      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <div className="flex items-center gap-3 mb-4">
          <Monitor className="h-5 w-5 text-blue-600" />
          <h2 className="text-lg font-semibold text-slate-900">Registered Devices</h2>
        </div>

        {devices.length === 0 ? (
          <p className="text-sm text-slate-500">
            No devices registered. Register a device from the desktop app to get started.
          </p>
        ) : (
          <div className="space-y-3">
            {devices.map((d) => (
              <div
                key={d.id}
                className="flex items-center justify-between p-3 bg-slate-50 rounded-lg"
              >
                <div>
                  <p className="text-sm font-medium text-slate-900">{d.deviceName}</p>
                  <p className="text-xs text-slate-500">
                    {d.platform} &mdash; Registered {new Date(d.registeredAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {d.lastSyncAt && (
                    <span className="text-xs text-slate-400">
                      Last sync: {new Date(d.lastSyncAt).toLocaleDateString()}
                    </span>
                  )}
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      d.status === 'ACTIVE'
                        ? 'bg-green-100 text-green-700'
                        : d.status === 'REVOKED'
                        ? 'bg-red-100 text-red-700'
                        : d.status === 'WIPE_PENDING'
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {d.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function buildGrid(pairs: CodePair[]): Record<string, string> {
  const grid: Record<string, string> = {}
  for (const p of pairs) {
    grid[p.key] = p.value
  }
  return grid
}
