import os from 'os'
import { getDeviceId } from './auth'
import { wipeAllLocalData } from './security'

interface DeviceStatus {
  status: 'ACTIVE' | 'REVOKED' | 'WIPE_PENDING'
}

/**
 * Register this device with the HTA API server.
 * Called once during first-time setup (after online login + PIN creation).
 */
export interface RegistrationResult {
  codes?: Array<{ sequence: number; key: string; value: string }>
  codesExpiresAt?: string
}

export async function registerDevice(
  apiBase: string,
  token: string,
  deviceId: string
): Promise<RegistrationResult> {
  const appVersion = '0.1.0' // TODO: read from package.json at build time

  const res = await fetch(`${apiBase}/api/devices/register`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      deviceId,
      deviceName: os.hostname(),
      platform: process.platform,
      appVersion,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Device registration failed: ${res.status} ${body}`)
  }

  const data = await res.json() as {
    codes?: Array<{ sequence: number; key: string; value: string }>
    codesExpiresAt?: string
  }
  return {
    codes: data.codes,
    codesExpiresAt: data.codesExpiresAt,
  }
}

/**
 * Check device status with the server.
 * If REVOKED or WIPE_PENDING, triggers a full local data wipe.
 */
export async function checkDeviceStatus(
  apiBase: string,
  token: string
): Promise<DeviceStatus> {
  const deviceId = getDeviceId()
  if (!deviceId) return { status: 'REVOKED' }

  try {
    const res = await fetch(`${apiBase}/api/devices/${deviceId}/status`, {
      headers: { 'Authorization': `Bearer ${token}` },
    })

    if (!res.ok) {
      // If 404, device may have been deleted server-side
      if (res.status === 404) {
        await wipeAllLocalData('Device not found on server')
        return { status: 'REVOKED' }
      }
      return { status: 'ACTIVE' } // Network error — assume active
    }

    const data = await res.json() as DeviceStatus

    if (data.status === 'REVOKED' || data.status === 'WIPE_PENDING') {
      await wipeAllLocalData(`Device ${data.status}`)

      // Confirm wipe to server
      if (data.status === 'WIPE_PENDING') {
        await fetch(`${apiBase}/api/devices/${deviceId}/confirm-wipe`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
        }).catch(() => {}) // Best-effort
      }
    }

    return data
  } catch {
    // Offline — assume active, check again next time
    return { status: 'ACTIVE' }
  }
}

/**
 * Send a heartbeat to update the device's lastSyncAt timestamp.
 */
export async function sendHeartbeat(
  apiBase: string,
  token: string
): Promise<void> {
  const deviceId = getDeviceId()
  if (!deviceId) return

  await fetch(`${apiBase}/api/devices/${deviceId}/heartbeat`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
  }).catch(() => {}) // Best-effort
}
