import { afterEach, describe, expect, it } from 'vitest'
import { getPrivateApiBase, getProvisionApiBase } from '../../src/main/api-config'

const ORIGINAL_ENV = {
  HTA_API_URL: process.env.HTA_API_URL,
  API_URL: process.env.API_URL,
  HTA_PROVISION_URL: process.env.HTA_PROVISION_URL,
}

function resetDesktopApiEnv() {
  for (const key of Object.keys(ORIGINAL_ENV) as Array<keyof typeof ORIGINAL_ENV>) {
    const value = ORIGINAL_ENV[key]
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }
}

describe('desktop API config', () => {
  afterEach(() => {
    resetDesktopApiEnv()
  })

  it('defaults provisioning to the public API domain', () => {
    delete process.env.HTA_PROVISION_URL

    expect(getProvisionApiBase()).toBe('https://hta-calibration.com')
  })

  it('defaults private API traffic to the VPN gateway', () => {
    delete process.env.HTA_API_URL
    delete process.env.API_URL

    expect(getPrivateApiBase()).toBe('http://10.100.0.1')
  })

  it('allows local mode to override both provisioning and private traffic', () => {
    process.env.HTA_PROVISION_URL = 'http://localhost:4000/'
    process.env.HTA_API_URL = 'http://localhost:4000/'

    expect(getProvisionApiBase()).toBe('http://localhost:4000')
    expect(getPrivateApiBase()).toBe('http://localhost:4000')
  })

  it('falls back to API_URL for the embedded Next rewrite base', () => {
    delete process.env.HTA_API_URL
    process.env.API_URL = 'http://localhost:4000/'

    expect(getPrivateApiBase()).toBe('http://localhost:4000')
  })
})

