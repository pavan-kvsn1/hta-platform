'use client'

import { apiFetch } from '@/lib/api-client'

import { useState, useEffect, useCallback } from 'react'
import {
  Monitor,
  Search,
  Loader2,
  ShieldOff,
  Trash2,
  RefreshCw,
  Wifi,
  WifiOff,
  AlertTriangle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDistanceToNow } from 'date-fns'

interface Device {
  id: string
  deviceId: string
  deviceName: string
  platform: string
  appVersion: string | null
  status: string
  lastSyncAt: string | null
  registeredAt: string
  wipedAt: string | null
  user: { id: string; name: string; email: string }
}

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  ACTIVE: { bg: 'bg-[#f0fdf4]', text: 'text-[#16a34a]', label: 'Active' },
  REVOKED: { bg: 'bg-[#fef2f2]', text: 'text-[#dc2626]', label: 'Revoked' },
  WIPE_PENDING: { bg: 'bg-[#fff7ed]', text: 'text-[#c2410c]', label: 'Wipe Pending' },
  WIPED: { bg: 'bg-[#f1f5f9]', text: 'text-[#94a3b8]', label: 'Wiped' },
}

export function DeviceListClient() {
  const [devices, setDevices] = useState<Device[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [confirmAction, setConfirmAction] = useState<{ deviceId: string; action: 'revoke' | 'wipe' } | null>(null)

  const fetchDevices = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiFetch('/api/devices')
      if (res.ok) {
        const data = await res.json()
        setDevices(data.devices)
      }
    } catch (error) {
      console.error('Failed to fetch devices:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchDevices()
  }, [fetchDevices])

  const handleAction = async (deviceId: string, action: 'revoke' | 'wipe') => {
    setActionLoading(deviceId)
    try {
      const res = await apiFetch(`/api/devices/${deviceId}/${action}`, { method: 'POST' })
      if (res.ok) {
        await fetchDevices()
      }
    } catch (error) {
      console.error(`Failed to ${action} device:`, error)
    } finally {
      setActionLoading(null)
      setConfirmAction(null)
    }
  }

  const filtered = devices.filter((d) => {
    if (statusFilter !== 'ALL' && d.status !== statusFilter) return false
    if (search) {
      const q = search.toLowerCase()
      return (
        d.deviceName.toLowerCase().includes(q) ||
        d.user.name.toLowerCase().includes(q) ||
        d.user.email.toLowerCase().includes(q) ||
        d.deviceId.toLowerCase().includes(q)
      )
    }
    return true
  })

  const counts = {
    total: devices.length,
    active: devices.filter((d) => d.status === 'ACTIVE').length,
    revoked: devices.filter((d) => d.status === 'REVOKED').length,
    wipePending: devices.filter((d) => d.status === 'WIPE_PENDING').length,
  }

  return (
    <div className="h-full overflow-auto bg-[#f1f5f9]">
      <div className="px-6 sm:px-9 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-[22px] font-bold text-[#0f172a] flex items-center gap-2.5">
              <Monitor className="size-[22px] text-[#94a3b8]" />
              Registered Devices
            </h1>
            <p className="text-[13px] text-[#94a3b8] mt-1">
              Manage desktop devices registered by engineers
            </p>
          </div>
          <button
            onClick={fetchDevices}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-[12.5px] font-semibold text-[#0f172a] bg-white border border-[#e2e8f0] hover:bg-[#f8fafc] rounded-[9px] transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
            Refresh
          </button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          {[
            { label: 'Total', value: counts.total, color: 'text-[#0f172a]' },
            { label: 'Active', value: counts.active, color: 'text-[#16a34a]' },
            { label: 'Revoked', value: counts.revoked, color: 'text-[#dc2626]' },
            { label: 'Wipe Pending', value: counts.wipePending, color: 'text-[#c2410c]' },
          ].map((card) => (
            <div key={card.label} className="bg-white rounded-[14px] border border-[#e2e8f0] px-4 py-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">{card.label}</p>
              <p className={cn('text-xl font-bold mt-0.5', card.color)}>{card.value}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="bg-white rounded-[14px] border border-[#e2e8f0] p-4 mb-5">
          <div className="flex flex-wrap items-end gap-4">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-[#94a3b8]" />
              <input
                type="text"
                placeholder="Search by device name, user, or device ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-[13px] text-[#0f172a] border border-[#e2e8f0] rounded-[9px] placeholder:text-[#94a3b8] focus:ring-2 focus:ring-[#7c3aed]/20 focus:border-[#7c3aed] outline-none"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="block px-3 py-2 text-[13px] text-[#0f172a] border border-[#e2e8f0] rounded-[9px] bg-white focus:ring-2 focus:ring-[#7c3aed]/20 focus:border-[#7c3aed] outline-none"
              >
                <option value="ALL">All Statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="REVOKED">Revoked</option>
                <option value="WIPE_PENDING">Wipe Pending</option>
                <option value="WIPED">Wiped</option>
              </select>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-[14px] border border-[#e2e8f0] overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="size-6 animate-spin text-[#94a3b8]" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16">
              <Monitor className="size-10 mx-auto mb-3 text-[#e2e8f0]" />
              <p className="text-[13px] text-[#94a3b8]">
                {devices.length === 0 ? 'No devices registered yet' : 'No devices match your filters'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-[#e2e8f0] bg-[#f8fafc]">
                    <th className="text-left py-2.5 px-4 text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Device</th>
                    <th className="text-left py-2.5 px-4 text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Engineer</th>
                    <th className="text-left py-2.5 px-4 text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Platform</th>
                    <th className="text-left py-2.5 px-4 text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Last Sync</th>
                    <th className="text-left py-2.5 px-4 text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Registered</th>
                    <th className="text-center py-2.5 px-4 text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Status</th>
                    <th className="text-right py-2.5 px-4 text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((device) => {
                    const style = STATUS_STYLES[device.status] || STATUS_STYLES.ACTIVE
                    const isStale = device.status === 'ACTIVE' && device.lastSyncAt &&
                      Date.now() - new Date(device.lastSyncAt).getTime() > 7 * 24 * 60 * 60 * 1000

                    return (
                      <tr key={device.id} className="border-b border-[#f1f5f9] hover:bg-[#f8fafc] transition-colors">
                        <td className="py-2.5 px-4">
                          <div className="flex items-center gap-2">
                            <Monitor className="size-4 text-[#94a3b8] shrink-0" />
                            <div>
                              <p className="font-medium text-[#0f172a]">{device.deviceName}</p>
                              <p className="text-[11px] text-[#94a3b8] font-mono">{device.deviceId.slice(0, 8)}...</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-2.5 px-4">
                          <p className="text-[#0f172a]">{device.user.name}</p>
                          <p className="text-[11px] text-[#94a3b8]">{device.user.email}</p>
                        </td>
                        <td className="py-2.5 px-4 text-[#64748b]">
                          {device.platform}
                          {device.appVersion && (
                            <span className="text-[11px] text-[#94a3b8] ml-1">v{device.appVersion}</span>
                          )}
                        </td>
                        <td className="py-2.5 px-4">
                          {device.lastSyncAt ? (
                            <div className="flex items-center gap-1.5">
                              {isStale ? (
                                <WifiOff className="size-3 text-[#c2410c]" />
                              ) : (
                                <Wifi className="size-3 text-[#16a34a]" />
                              )}
                              <span className={cn('text-[#64748b]', isStale && 'text-[#c2410c]')}>
                                {formatDistanceToNow(new Date(device.lastSyncAt), { addSuffix: true })}
                              </span>
                            </div>
                          ) : (
                            <span className="text-[#cbd5e1]">Never</span>
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-[#64748b]">
                          {formatDistanceToNow(new Date(device.registeredAt), { addSuffix: true })}
                        </td>
                        <td className="py-2.5 px-4 text-center">
                          <span className={cn('inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold', style.bg, style.text)}>
                            {style.label}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-right">
                          {device.status === 'ACTIVE' && (
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => setConfirmAction({ deviceId: device.deviceId, action: 'revoke' })}
                                disabled={actionLoading === device.deviceId}
                                title="Revoke device"
                                className="p-1.5 text-[#94a3b8] hover:text-[#c2410c] hover:bg-[#fff7ed] rounded-md transition-colors disabled:opacity-50"
                              >
                                <ShieldOff className="size-3.5" />
                              </button>
                              <button
                                onClick={() => setConfirmAction({ deviceId: device.deviceId, action: 'wipe' })}
                                disabled={actionLoading === device.deviceId}
                                title="Remote wipe"
                                className="p-1.5 text-[#94a3b8] hover:text-[#dc2626] hover:bg-[#fef2f2] rounded-md transition-colors disabled:opacity-50"
                              >
                                <Trash2 className="size-3.5" />
                              </button>
                            </div>
                          )}
                          {device.status === 'REVOKED' && (
                            <span className="text-[11px] text-[#94a3b8]">Revoked</span>
                          )}
                          {device.status === 'WIPE_PENDING' && (
                            <span className="text-[11px] text-[#c2410c]">Awaiting wipe</span>
                          )}
                          {device.status === 'WIPED' && device.wipedAt && (
                            <span className="text-[11px] text-[#94a3b8]">
                              {formatDistanceToNow(new Date(device.wipedAt), { addSuffix: true })}
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="mt-3 flex gap-4 text-[11px] text-[#94a3b8]">
          <span className="flex items-center gap-1"><Wifi className="size-3 text-[#16a34a]" /> Synced recently</span>
          <span className="flex items-center gap-1"><WifiOff className="size-3 text-[#c2410c]" /> No sync in 7+ days</span>
        </div>
      </div>

      {/* Confirmation Dialog */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setConfirmAction(null)} />
          <div className="relative bg-white rounded-2xl shadow-xl border border-[#e2e8f0] p-6 w-full max-w-md mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className={cn(
                'size-10 rounded-full flex items-center justify-center',
                confirmAction.action === 'wipe' ? 'bg-[#fef2f2]' : 'bg-[#fff7ed]'
              )}>
                {confirmAction.action === 'wipe' ? (
                  <Trash2 className="size-5 text-[#dc2626]" />
                ) : (
                  <ShieldOff className="size-5 text-[#c2410c]" />
                )}
              </div>
              <div>
                <h3 className="text-[15px] font-semibold text-[#0f172a]">
                  {confirmAction.action === 'wipe' ? 'Remote Wipe Device' : 'Revoke Device'}
                </h3>
                <p className="text-[12px] text-[#94a3b8]">
                  Device: {confirmAction.deviceId.slice(0, 8)}...
                </p>
              </div>
            </div>

            <div className="flex items-start gap-2 text-[13px] text-[#64748b] bg-[#f8fafc] rounded-lg p-3 mb-5">
              <AlertTriangle className="size-4 text-[#c2410c] shrink-0 mt-0.5" />
              {confirmAction.action === 'wipe' ? (
                <p>This will destroy all local data on the device the next time it connects. This action cannot be undone.</p>
              ) : (
                <p>This will prevent the device from syncing with the server. The device will retain its local data but cannot upload or download.</p>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmAction(null)}
                className="px-4 py-2 text-[13px] font-medium text-[#64748b] bg-white border border-[#e2e8f0] rounded-[9px] hover:bg-[#f8fafc] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleAction(confirmAction.deviceId, confirmAction.action)}
                disabled={actionLoading !== null}
                className={cn(
                  'px-4 py-2 text-[13px] font-semibold text-white rounded-[9px] transition-colors disabled:opacity-50',
                  confirmAction.action === 'wipe'
                    ? 'bg-[#dc2626] hover:bg-[#b91c1c]'
                    : 'bg-[#c2410c] hover:bg-[#9a3412]'
                )}
              >
                {actionLoading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : confirmAction.action === 'wipe' ? (
                  'Wipe Device'
                ) : (
                  'Revoke Device'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
