/**
 * Secret Rotation Module
 *
 * Provides functions to rotate secrets in Google Secret Manager.
 * Supports automatic generation and cleanup of old versions.
 */

import { randomBytes } from 'crypto'
import { createLogger } from '../logger/index.js'
import type { RotationConfig, RotationResult } from './types.js'

const logger = createLogger('secrets:rotation')

// Lazy-loaded Secret Manager client
let secretManagerClient: any = null

async function getClient() {
  if (!secretManagerClient) {
    const { SecretManagerServiceClient } = await import('@google-cloud/secret-manager')
    secretManagerClient = new SecretManagerServiceClient()
  }
  return secretManagerClient
}

function getProjectId(): string {
  return process.env.GCP_PROJECT_ID
    || process.env.GOOGLE_CLOUD_PROJECT
    || 'hta-calibration-prod'
}

/**
 * Default secret value generators
 */
export const generators = {
  /** Generate a random base64 string (for JWT secrets, encryption keys) */
  base64: (bytes: number = 64) => async () => randomBytes(bytes).toString('base64'),

  /** Generate a random hex string */
  hex: (bytes: number = 32) => async () => randomBytes(bytes).toString('hex'),

  /** Generate a random alphanumeric string */
  alphanumeric: (length: number = 32) => async () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    const bytes = randomBytes(length)
    return Array.from(bytes).map(b => chars[b % chars.length]).join('')
  },
}

/**
 * Rotate a secret by adding a new version
 *
 * @param secretId - The secret ID to rotate
 * @param generateValue - Function to generate the new secret value
 * @param projectId - Optional project ID override
 * @returns Rotation result with new version info
 */
export async function rotateSecret(
  secretId: string,
  generateValue: () => Promise<string> = generators.base64(64),
  projectId: string = getProjectId()
): Promise<RotationResult> {
  const client = await getClient()
  const secretName = `projects/${projectId}/secrets/${secretId}`

  logger.info({ secretId }, 'Starting secret rotation')

  try {
    // Generate new secret value
    const newValue = await generateValue()

    // Add new version
    const [version] = await client.addSecretVersion({
      parent: secretName,
      payload: {
        data: Buffer.from(newValue, 'utf8'),
      },
    })

    const newVersionName = version.name?.split('/').pop() || 'unknown'
    logger.info({ secretId, version: newVersionName }, 'New secret version created')

    // Disable old versions (keep last 2)
    const disabledVersions = await disableOldVersions(secretId, 2, projectId)

    return {
      success: true,
      newVersion: newVersionName,
      disabledVersions,
    }
  } catch (error: any) {
    logger.error({ secretId, error }, 'Secret rotation failed')
    return {
      success: false,
      newVersion: '',
      disabledVersions: [],
      error: error.message,
    }
  }
}

/**
 * Disable old secret versions, keeping the most recent N versions
 *
 * @param secretId - The secret ID
 * @param keepCount - Number of versions to keep enabled
 * @param projectId - Optional project ID override
 * @returns List of disabled version names
 */
export async function disableOldVersions(
  secretId: string,
  keepCount: number = 2,
  projectId: string = getProjectId()
): Promise<string[]> {
  const client = await getClient()
  const secretName = `projects/${projectId}/secrets/${secretId}`

  // List all versions
  const [versions] = await client.listSecretVersions({ parent: secretName })

  // Filter to enabled versions and sort by create time (newest first)
  const enabledVersions = versions
    .filter((v: any) => v.state === 'ENABLED')
    .sort((a: any, b: any) => {
      const aTime = Number(a.createTime?.seconds) || 0
      const bTime = Number(b.createTime?.seconds) || 0
      return bTime - aTime
    })

  // Disable versions beyond keepCount
  const toDisable = enabledVersions.slice(keepCount)
  const disabledVersions: string[] = []

  for (const version of toDisable) {
    try {
      await client.disableSecretVersion({ name: version.name })
      const versionName = version.name?.split('/').pop() || 'unknown'
      disabledVersions.push(versionName)
      logger.debug({ secretId, version: versionName }, 'Disabled old secret version')
    } catch (error) {
      logger.warn({ secretId, version: version.name, error }, 'Failed to disable version')
    }
  }

  if (disabledVersions.length > 0) {
    logger.info({ secretId, count: disabledVersions.length }, 'Disabled old secret versions')
  }

  return disabledVersions
}

/**
 * Schedule secret rotation (for use with Cloud Scheduler)
 *
 * Returns a Cloud Function-compatible handler that rotates the specified secrets.
 *
 * @param configs - Array of rotation configurations
 * @returns Handler function for Cloud Functions/Cloud Run
 */
export function scheduleRotation(configs: RotationConfig[]) {
  return async (req?: any, res?: any) => {
    const results: Record<string, RotationResult> = {}

    for (const config of configs) {
      const generator = config.generateValue || generators.base64(64)
      results[config.secretId] = await rotateSecret(
        config.secretId,
        generator,
        process.env.GCP_PROJECT_ID
      )
    }

    const allSuccess = Object.values(results).every(r => r.success)

    if (res) {
      res.status(allSuccess ? 200 : 500).json(results)
    }

    return results
  }
}

/**
 * Rotate common secrets (convenience function)
 *
 * Rotates JWT secret and encryption keys with appropriate generators.
 */
export async function rotateCommonSecrets(projectId?: string): Promise<Record<string, RotationResult>> {
  const secrets = [
    { id: 'hta-api-jwt-secret', generator: generators.base64(64) },
    { id: 'hta-api-encryption-key', generator: generators.base64(32) },
    { id: 'hta-web-nextauth-secret', generator: generators.base64(32) },
  ]

  const results: Record<string, RotationResult> = {}

  for (const { id, generator } of secrets) {
    results[id] = await rotateSecret(id, generator, projectId)
  }

  return results
}
