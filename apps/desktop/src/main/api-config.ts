const DEFAULT_PRIVATE_API_BASE = 'http://10.100.0.1'
const DEFAULT_PROVISION_API_BASE = 'https://hta-calibration.com'

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, '')
}

export function getPrivateApiBase(): string {
  return normalizeBaseUrl(process.env.HTA_API_URL || process.env.API_URL || DEFAULT_PRIVATE_API_BASE)
}

export function getProvisionApiBase(): string {
  return normalizeBaseUrl(process.env.HTA_PROVISION_URL || DEFAULT_PROVISION_API_BASE)
}

