import os from 'os'
import { getDeviceId } from './auth'
import { wipeAllLocalData } from './security'

interface DeviceStatus {
  status: 'ACTIVE' | 'REVOKED' | 'WIPE_PENDING'
}

type DeviceStatusResponse =
  | DeviceStatus
  | { device?: Partial<DeviceStatus> }

function normalizeDeviceStatus(data: DeviceStatusResponse): DeviceStatus {
  const status = 'status' in data ? data.status : data.device?.status
  if (status === 'REVOKED' || status === 'WIPE_PENDING') return { status }
  return { status: 'ACTIVE' }
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
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)

  let res: Response
  try {
    res = await fetch(`${apiBase}/api/devices/register`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Tenant-ID': 'hta-calibration',
      },
      body: JSON.stringify({
        deviceId,
        deviceName: os.hostname(),
        platform: process.platform,
        appVersion,
      }),
    })
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Device registration timed out after 10 seconds')
    }
    throw err
  } finally {
    clearTimeout(timeout)
  }

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
      headers: { 'Authorization': `Bearer ${token}`, 'X-Tenant-ID': 'hta-calibration' },
    })

    if (!res.ok) {
      // Don't wipe on 404 — device may not be registered yet or endpoint may not exist.
      // Only wipe on explicit REVOKED/WIPE_PENDING status in the response body.
      console.log(`[device] Status check returned ${res.status} — assuming active`)
      return { status: 'ACTIVE' }
    }

    const data = await res.json() as DeviceStatusResponse
    const deviceStatus = normalizeDeviceStatus(data)

    if (deviceStatus.status === 'REVOKED' || deviceStatus.status === 'WIPE_PENDING') {
      await wipeAllLocalData(`Device ${deviceStatus.status}`)

      // Confirm wipe to server
      if (deviceStatus.status === 'WIPE_PENDING') {
        await fetch(`${apiBase}/api/devices/${deviceId}/confirm-wipe`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
        }).catch(() => {}) // Best-effort
      }
    }

    return deviceStatus
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
    headers: { 'Authorization': `Bearer ${token}`, 'X-Tenant-ID': 'hta-calibration' },
  }).catch(() => {}) // Best-effort
}
