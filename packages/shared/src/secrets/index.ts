/**
 * @hta/shared - Secrets Management
 *
 * Provides secret access and rotation functionality using Google Secret Manager.
 *
 * Usage:
 *   import { getSecret, rotateSecret } from '@hta/shared/secrets'
 *
 *   const dbUrl = await getSecret('database-url')
 *   await rotateSecret('jwt-secret', () => generateRandomBytes(64))
 */

export { getSecret, getSecretWithMetadata, secretExists } from './access.js'
export { rotateSecret, disableOldVersions, scheduleRotation } from './rotation.js'
export type { SecretMetadata, RotationConfig } from './types.js'
