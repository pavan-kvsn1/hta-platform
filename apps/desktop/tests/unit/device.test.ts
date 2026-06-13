import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getDeviceId: vi.fn(),
  wipeAllLocalData: vi.fn(),
}))

vi.mock('../../src/main/auth', () => ({
  getDeviceId: mocks.getDeviceId,
}))

vi.mock('../../src/main/security', () => ({
  wipeAllLocalData: mocks.wipeAllLocalData,
}))

import { checkDeviceStatus } from '../../src/main/device'

const API_BASE = 'http://10.100.0.1'
const TOKEN = 'test-token'
const DEVICE_ID = 'device-123'

describe('checkDeviceStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getDeviceId.mockReturnValue(DEVICE_ID)
    global.fetch = vi.fn()
  })

  it('accepts the API device wrapper response shape', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ device: { status: 'ACTIVE' } }),
    } as Response)

    await expect(checkDeviceStatus(API_BASE, TOKEN)).resolves.toEqual({ status: 'ACTIVE' })
  })

  it('preserves the legacy direct status response shape', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 'ACTIVE' }),
    } as Response)

    await expect(checkDeviceStatus(API_BASE, TOKEN)).resolves.toEqual({ status: 'ACTIVE' })
  })

  it('wipes local data for wrapped WIPE_PENDING responses', async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ device: { status: 'WIPE_PENDING' } }),
      } as Response)
      .mockResolvedValueOnce({ ok: true } as Response)

    await expect(checkDeviceStatus(API_BASE, TOKEN)).resolves.toEqual({ status: 'WIPE_PENDING' })
    expect(mocks.wipeAllLocalData).toHaveBeenCalledWith('Device WIPE_PENDING')
    expect(global.fetch).toHaveBeenLastCalledWith(
      `${API_BASE}/api/devices/${DEVICE_ID}/confirm-wipe`,
      expect.objectContaining({ method: 'POST' }),
    )
  })
})
