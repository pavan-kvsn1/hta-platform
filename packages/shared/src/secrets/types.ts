/**
 * Secret metadata returned from Secret Manager
 */
export interface SecretMetadata {
  name: string
  version: string
  createTime: Date
  state: 'ENABLED' | 'DISABLED' | 'DESTROYED'
}

/**
 * Configuration for secret rotation
 */
export interface RotationConfig {
  /** Secret ID in Secret Manager */
  secretId: string
  /** Number of old versions to keep enabled */
  keepVersions?: number
  /** Custom value generator function */
  generateValue?: () => Promise<string>
}

/**
 * Result of a rotation operation
 */
export interface RotationResult {
  success: boolean
  newVersion: string
  disabledVersions: string[]
  error?: string
}

/**
 * Secret access options
 */
export interface SecretAccessOptions {
  /** Specific version to access (default: 'latest') */
  version?: string
  /** Project ID override */
  projectId?: string
}
