/**
 * Storage Provider Factory
 * Returns the appropriate storage provider based on environment configuration
 */

import { StorageProvider, StorageType, StorageConfig } from './types.js'
import { LocalStorageProvider } from './local-storage.js'
import { GCSStorageProvider } from './gcs-storage.js'

export * from './types.js'
export { LocalStorageProvider } from './local-storage.js'
export { GCSStorageProvider } from './gcs-storage.js'

// Certificate image types
export type CertificateImageType = 'UUC' | 'MASTER_INSTRUMENT' | 'READING_UUC' | 'READING_MASTER'

// Singleton instances for reuse
let storageProviderInstance: StorageProvider | null = null
let imageStorageProviderInstance: StorageProvider | null = null

/**
 * Get storage configuration from environment variables
 */
export function getStorageConfig(): StorageConfig {
  const type = (process.env.CERTIFICATE_STORAGE_TYPE || 'local') as StorageType

  return {
    type,
    localPath: process.env.CERTIFICATE_STORAGE_PATH || './storage/master-instrument-certificates',
    gcsBucket: process.env.GCS_CERTIFICATES_BUCKET,
    gcsProjectId: process.env.GCP_PROJECT_ID,
  }
}

/**
 * Get storage configuration for certificate images
 */
export function getImageStorageConfig(): StorageConfig {
  const type = (process.env.IMAGE_STORAGE_TYPE || process.env.CERTIFICATE_STORAGE_TYPE || 'local') as StorageType

  return {
    type,
    localPath: process.env.IMAGE_STORAGE_PATH || './storage/certificate-images',
    gcsBucket: process.env.GCS_IMAGES_BUCKET || process.env.GCS_CERTIFICATES_BUCKET,
    gcsProjectId: process.env.GCP_PROJECT_ID,
  }
}

/**
 * Get or create a storage provider instance
 * Uses singleton pattern for efficiency
 */
export function getStorageProvider(): StorageProvider {
  if (storageProviderInstance) {
    return storageProviderInstance
  }

  const config = getStorageConfig()

  if (config.type === 'gcs') {
    if (!config.gcsBucket) {
      throw new Error('GCS_CERTIFICATES_BUCKET environment variable is required for GCS storage')
    }
    storageProviderInstance = new GCSStorageProvider(config.gcsBucket, config.gcsProjectId)
  } else {
    storageProviderInstance = new LocalStorageProvider(config.localPath!)
  }

  return storageProviderInstance
}

/**
 * Get or create an image storage provider instance
 * Uses singleton pattern for efficiency
 */
export function getImageStorageProvider(): StorageProvider {
  if (imageStorageProviderInstance) {
    return imageStorageProviderInstance
  }

  const config = getImageStorageConfig()

  if (config.type === 'gcs') {
    if (!config.gcsBucket) {
      throw new Error('GCS_IMAGES_BUCKET environment variable is required for GCS image storage')
    }
    imageStorageProviderInstance = new GCSStorageProvider(config.gcsBucket, config.gcsProjectId)
  } else {
    imageStorageProviderInstance = new LocalStorageProvider(config.localPath!)
  }

  return imageStorageProviderInstance
}

/**
 * Reset the storage provider instance (useful for testing)
 */
export function resetStorageProvider(): void {
  storageProviderInstance = null
}

/**
 * Reset the image storage provider instance (useful for testing)
 */
export function resetImageStorageProvider(): void {
  imageStorageProviderInstance = null
}

/**
 * Get a storage provider for master instrument certificates specifically
 * This is a convenience function that ensures the correct subdirectory is used
 */
export function getMasterInstrumentCertificateStorage(): StorageProvider {
  return getStorageProvider()
}

/**
 * Helper to convert asset number to storage-safe filename
 * "149 HTAIPL/L" -> "149 HTAIPL L.pdf"
 */
export function assetNumberToFileName(assetNumber: string): string {
  // Replace forward slashes with spaces, keep other characters
  const safeName = assetNumber.replace(/\//g, ' ')
  return `${safeName}.pdf`
}

/**
 * Helper to convert storage filename back to asset number
 * "149 HTAIPL L.pdf" -> "149 HTAIPL/L"
 */
export function fileNameToAssetNumber(fileName: string): string {
  // Remove .pdf extension and try to restore the original format
  // This is a best-effort conversion since the original "/" is lost
  const withoutExt = fileName.replace(/\.pdf$/i, '')
  // We can't reliably restore "/" since spaces are ambiguous
  // Return as-is for lookup purposes
  return withoutExt
}

// ====================
// Certificate Image Storage Helpers
// ====================

export interface ImagePathOptions {
  certificateId: string
  imageType: CertificateImageType
  version?: number
  // For MASTER_INSTRUMENT type
  masterInstrumentIndex?: number
  // For READING_* types
  parameterIndex?: number
  pointNumber?: number
}

/**
 * Generate a unique filename for an uploaded image
 * Format: {certificateId}/{imageType}/{context}/{timestamp}-{random}.{ext}
 */
export function generateImageStorageKey(
  options: ImagePathOptions,
  originalFileName: string,
  variant: 'original' | 'optimized' | 'thumbnail' = 'original'
): string {
  const { certificateId, imageType, version = 1 } = options
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 8)
  const ext = getImageExtension(originalFileName, variant)

  // Build the path based on image type
  let contextPath = ''
  switch (imageType) {
    case 'UUC':
      contextPath = 'uuc'
      break
    case 'MASTER_INSTRUMENT':
      contextPath = `master/${options.masterInstrumentIndex ?? 0}`
      break
    case 'READING_UUC':
      contextPath = `readings/param-${options.parameterIndex ?? 0}/point-${options.pointNumber ?? 0}/uuc`
      break
    case 'READING_MASTER':
      contextPath = `readings/param-${options.parameterIndex ?? 0}/point-${options.pointNumber ?? 0}/master`
      break
    default:
      contextPath = 'other'
  }

  // Add variant suffix for optimized/thumbnail
  const variantSuffix = variant === 'original' ? '' : `-${variant}`
  const versionSuffix = version > 1 ? `-v${version}` : ''

  return `certificates/${certificateId}/${contextPath}/${timestamp}-${random}${versionSuffix}${variantSuffix}.${ext}`
}

/**
 * Get the appropriate file extension for an image variant
 */
function getImageExtension(originalFileName: string, variant: 'original' | 'optimized' | 'thumbnail'): string {
  if (variant === 'original') {
    // Keep original extension
    const ext = originalFileName.split('.').pop()?.toLowerCase() || 'jpg'
    return ext
  }
  // Optimized and thumbnails are always JPEG
  return 'jpg'
}

/**
 * Parse a storage key to extract image metadata
 */
export function parseImageStorageKey(storageKey: string): Partial<ImagePathOptions> & {
  timestamp?: number
  variant?: 'original' | 'optimized' | 'thumbnail'
} {
  const parts = storageKey.split('/')

  // Expected format: certificates/{certificateId}/{context}/.../{filename}
  if (parts.length < 4 || parts[0] !== 'certificates') {
    return {}
  }

  const certificateId = parts[1]
  const contextType = parts[2]

  let imageType: CertificateImageType = 'UUC'
  let masterInstrumentIndex: number | undefined
  let parameterIndex: number | undefined
  let pointNumber: number | undefined

  if (contextType === 'uuc') {
    imageType = 'UUC'
  } else if (contextType === 'master' && parts[3]) {
    imageType = 'MASTER_INSTRUMENT'
    masterInstrumentIndex = parseInt(parts[3]) || 0
  } else if (contextType === 'readings' && parts.length >= 6) {
    // readings/param-X/point-Y/uuc|master
    const paramMatch = parts[3]?.match(/param-(\d+)/)
    const pointMatch = parts[4]?.match(/point-(\d+)/)
    parameterIndex = paramMatch ? parseInt(paramMatch[1]) : 0
    pointNumber = pointMatch ? parseInt(pointMatch[1]) : 0
    imageType = parts[5] === 'master' ? 'READING_MASTER' : 'READING_UUC'
  }

  // Parse filename for timestamp and variant
  const filename = parts[parts.length - 1]
  const filenameMatch = filename.match(/^(\d+)-\w+(?:-v\d+)?(?:-(optimized|thumbnail))?\./)
  const timestamp = filenameMatch ? parseInt(filenameMatch[1]) : undefined
  const variant = filenameMatch?.[2] as 'optimized' | 'thumbnail' | undefined

  return {
    certificateId,
    imageType,
    masterInstrumentIndex,
    parameterIndex,
    pointNumber,
    timestamp,
    variant: variant || 'original',
  }
}

/**
 * Get the storage keys for all variants of an image
 */
export function getImageVariantKeys(originalKey: string): {
  original: string
  optimized: string
  thumbnail: string
} {
  // Replace extension with jpg for variants
  const basePath = originalKey.replace(/\.[^.]+$/, '')

  return {
    original: originalKey,
    optimized: `${basePath}-optimized.jpg`,
    thumbnail: `${basePath}-thumbnail.jpg`,
  }
}

/**
 * Get list of images for a certificate by type
 */
export async function listCertificateImages(
  certificateId: string,
  imageType?: CertificateImageType
): Promise<string[]> {
  const storage = getImageStorageProvider()
  const prefix = `certificates/${certificateId}/`

  const files = await storage.list(prefix)

  // Filter by image type if specified
  if (imageType) {
    const typePrefix = imageType === 'UUC'
      ? 'uuc/'
      : imageType === 'MASTER_INSTRUMENT'
        ? 'master/'
        : 'readings/'

    return files
      .filter(f => f.path.includes(`/${typePrefix}`))
      .map(f => f.path)
  }

  return files.map(f => f.path)
}
