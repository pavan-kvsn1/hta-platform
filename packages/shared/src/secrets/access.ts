/**
 * Secret Access Module
 *
 * Provides functions to read secrets from Google Secret Manager.
 * Falls back to environment variables in development.
 */

import { createLogger } from '../logger/index.js'
import type { SecretMetadata, SecretAccessOptions } from './types.js'

const logger = createLogger('secrets')

// Minimal interface for Secret Manager client methods we use
interface SecretManagerClient {
  accessSecretVersion(request: { name: string }): Promise<[{ payload?: { data?: Buffer | string }; name?: string; createTime?: { seconds: number }; state?: string }]>
  getSecret(request: { name: string }): Promise<[unknown]>
}

// Lazy-loaded Secret Manager client
let secretManagerClient: SecretManagerClient | null = null
let clientLoadAttempted = false

async function getClient(): Promise<SecretManagerClient | null> {
  if (clientLoadAttempted) {
    return secretManagerClient
  }
  clientLoadAttempted = true

  try {
    // Dynamic import to avoid bundling issues and allow graceful fallback
    const module = await import('@google-cloud/secret-manager' as string)
    secretManagerClient = new module.SecretManagerServiceClient() as SecretManagerClient
    return secretManagerClient
  } catch {
    logger.warn('Secret Manager client not available, using environment variables')
    return null
  }
}

/**
 * Get the GCP project ID from environment or metadata server
 */
function getProjectId(): string {
  return process.env.GCP_PROJECT_ID
    || process.env.GOOGLE_CLOUD_PROJECT
    || process.env.GCLOUD_PROJECT
    || 'hta-calibration-prod'
}

/**
 * Convert secret ID to environment variable name
 * e.g., 'database-url' -> 'DATABASE_URL'
 */
function secretIdToEnvVar(secretId: string): string {
  return secretId.toUpperCase().replace(/-/g, '_')
}

/**
 * Get a secret value from Secret Manager
 *
 * Falls back to environment variables if:
 * - Running in development (NODE_ENV !== 'production')
 * - Secret Manager client unavailable
 *
 * @param secretId - The secret ID (e.g., 'database-url')
 * @param options - Access options
 * @returns The secret value
 */
export async function getSecret(
  secretId: string,
  options: SecretAccessOptions = {}
): Promise<string> {
  const { version = 'latest', projectId = getProjectId() } = options

  // In development, prefer environment variables
  if (process.env.NODE_ENV !== 'production') {
    const envVar = secretIdToEnvVar(secretId)
    const envValue = process.env[envVar]
    if (envValue) {
      logger.debug({ secretId, source: 'env' }, 'Secret loaded from environment')
      return envValue
    }
  }

  const client = await getClient()
  if (!client) {
    // Fall back to environment variable
    const envVar = secretIdToEnvVar(secretId)
    const envValue = process.env[envVar]
    if (envValue) {
      return envValue
    }
    throw new Error(`Secret ${secretId} not found and Secret Manager unavailable`)
  }

  try {
    const name = `projects/${projectId}/secrets/${secretId}/versions/${version}`
    const [response] = await client.accessSecretVersion({ name })

    if (!response.payload?.data) {
      throw new Error(`Secret ${secretId} has no data`)
    }

    const value = response.payload.data.toString()
    logger.debug({ secretId, version }, 'Secret accessed from Secret Manager')

    return value
  } catch (error) {
    logger.error({ secretId, error }, 'Failed to access secret')
    throw error
  }
}

/**
 * Get a secret value along with its metadata
 *
 * @param secretId - The secret ID
 * @param options - Access options
 * @returns The secret value and metadata
 */
export async function getSecretWithMetadata(
  secretId: string,
  options: SecretAccessOptions = {}
): Promise<{ value: string; metadata: SecretMetadata }> {
  const { version = 'latest', projectId = getProjectId() } = options

  const client = await getClient()
  if (!client) {
    throw new Error('Secret Manager client required for metadata access')
  }

  const name = `projects/${projectId}/secrets/${secretId}/versions/${version}`
  const [response] = await client.accessSecretVersion({ name })

  if (!response.payload?.data) {
    throw new Error(`Secret ${secretId} has no data`)
  }

  const value = response.payload.data.toString()
  const metadata: SecretMetadata = {
    name: response.name || secretId,
    version: response.name?.split('/').pop() || version,
    createTime: response.createTime ? new Date(response.createTime.seconds * 1000) : new Date(),
    state: (response.state as SecretMetadata['state']) || 'ENABLED',
  }

  return { value, metadata }
}

/**
 * Check if a secret exists in Secret Manager
 *
 * @param secretId - The secret ID
 * @param projectId - Optional project ID override
 * @returns True if the secret exists
 */
export async function secretExists(
  secretId: string,
  projectId: string = getProjectId()
): Promise<boolean> {
  const client = await getClient()
  if (!client) {
    return false
  }

  try {
    const name = `projects/${projectId}/secrets/${secretId}`
    await client.getSecret({ name })
    return true
  } catch (error: any) {
    if (error.code === 5) {
      // NOT_FOUND
      return false
    }
    throw error
  }
}
