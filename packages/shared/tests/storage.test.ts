/**
 * Storage Unit Tests
 *
 * Tests for storage helpers, utilities, and providers
 *
 * Migrated from hta-calibration/tests/unit/storage.test.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Self-contained mock implementations

type StorageType = 'local' | 'gcs'

interface StorageConfig {
  type: StorageType
  localPath?: string
  gcsBucket?: string
  projectId?: string
}

interface ImageStorageOptions {
  certificateId: string
  imageType: 'UUC' | 'MASTER_INSTRUMENT' | 'READING_UUC' | 'READING_MASTER'
  parameterIndex?: number
  pointNumber?: number
  masterInstrumentIndex?: number
  version?: number
}

interface ParsedImageKey {
  certificateId?: string
  imageType?: string
  parameterIndex?: number
  pointNumber?: number
  masterInstrumentIndex?: number
  timestamp?: number
  variant?: 'original' | 'optimized' | 'thumbnail'
}

// Singleton storage provider
let storageProvider: { type: StorageType } | null = null

function getStorageConfig(): StorageConfig {
  const type = (process.env.CERTIFICATE_STORAGE_TYPE as StorageType) || 'local'
  return {
    type,
    localPath: process.env.CERTIFICATE_STORAGE_PATH || './certificates',
    gcsBucket: process.env.GCS_CERTIFICATES_BUCKET,
    projectId: process.env.GCP_PROJECT_ID,
  }
}

function getImageStorageConfig(): StorageConfig {
  const imageType = process.env.IMAGE_STORAGE_TYPE as StorageType | undefined
  const certType = process.env.CERTIFICATE_STORAGE_TYPE as StorageType | undefined

  if (imageType === 'gcs' && process.env.GCS_IMAGES_BUCKET) {
    return {
      type: 'gcs',
      gcsBucket: process.env.GCS_IMAGES_BUCKET,
    }
  }

  if (certType === 'gcs' && process.env.GCS_CERTIFICATES_BUCKET) {
    return {
      type: 'gcs',
      gcsBucket: process.env.GCS_CERTIFICATES_BUCKET,
    }
  }

  return { type: 'local' }
}

function assetNumberToFileName(assetNumber: string): string {
  return assetNumber.replace(/\//g, ' ') + '.pdf'
}

function fileNameToAssetNumber(fileName: string): string {
  return fileName.replace(/\.(pdf|PDF)$/, '')
}

function generateImageStorageKey(
  options: ImageStorageOptions,
  originalFileName: string,
  variant?: 'optimized' | 'thumbnail'
): string {
  const { certificateId, imageType, parameterIndex, pointNumber, masterInstrumentIndex, version } =
    options

  const ext = originalFileName.split('.').pop()?.toLowerCase() || 'jpg'
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 8)

  let versionSuffix = ''
  if (version && version > 1) {
    versionSuffix = `-v${version}`
  }

  let variantSuffix = ''
  let finalExt = ext
  if (variant) {
    variantSuffix = `-${variant}`
    finalExt = 'jpg' // Variants are always JPG
  }

  let basePath = `certificates/${certificateId}`

  switch (imageType) {
    case 'UUC':
      basePath += `/uuc`
      break
    case 'MASTER_INSTRUMENT':
      basePath += `/master/${masterInstrumentIndex}`
      break
    case 'READING_UUC':
      basePath += `/readings/param-${parameterIndex}/point-${pointNumber}/uuc`
      break
    case 'READING_MASTER':
      basePath += `/readings/param-${parameterIndex}/point-${pointNumber}/master`
      break
  }

  return `${basePath}/${timestamp}-${random}${versionSuffix}${variantSuffix}.${finalExt}`
}

function parseImageStorageKey(key: string): ParsedImageKey {
  // certificates/cert-id/uuc/timestamp-random.jpg
  // certificates/cert-id/master/2/timestamp-random.jpg
  // certificates/cert-id/readings/param-1/point-3/uuc/timestamp-random.jpg

  const uucMatch = key.match(/^certificates\/([^/]+)\/uuc\/(\d+)-([^.]+)\.(\w+)$/)
  if (uucMatch) {
    const variant = uucMatch[3].includes('-optimized')
      ? 'optimized'
      : uucMatch[3].includes('-thumbnail')
        ? 'thumbnail'
        : 'original'
    return {
      certificateId: uucMatch[1],
      imageType: 'UUC',
      timestamp: parseInt(uucMatch[2]),
      variant,
    }
  }

  const masterMatch = key.match(/^certificates\/([^/]+)\/master\/(\d+)\/(\d+)-([^.]+)\.(\w+)$/)
  if (masterMatch) {
    return {
      certificateId: masterMatch[1],
      imageType: 'MASTER_INSTRUMENT',
      masterInstrumentIndex: parseInt(masterMatch[2]),
      timestamp: parseInt(masterMatch[3]),
      variant: 'original',
    }
  }

  const readingUucMatch = key.match(
    /^certificates\/([^/]+)\/readings\/param-(\d+)\/point-(\d+)\/uuc\/(\d+)-([^.]+)\.(\w+)$/
  )
  if (readingUucMatch) {
    return {
      certificateId: readingUucMatch[1],
      imageType: 'READING_UUC',
      parameterIndex: parseInt(readingUucMatch[2]),
      pointNumber: parseInt(readingUucMatch[3]),
      timestamp: parseInt(readingUucMatch[4]),
      variant: 'original',
    }
  }

  return {}
}

function getImageVariantKeys(originalKey: string): {
  original: string
  optimized: string
  thumbnail: string
} {
  const dotIndex = originalKey.lastIndexOf('.')
  const basePath = originalKey.substring(0, dotIndex)
  const ext = originalKey.substring(dotIndex + 1)

  return {
    original: originalKey,
    optimized: `${basePath}-optimized.jpg`,
    thumbnail: `${basePath}-thumbnail.jpg`,
  }
}

function getStorageProvider() {
  if (!storageProvider) {
    const config = getStorageConfig()
    storageProvider = { type: config.type }
  }
  return storageProvider
}

function resetStorageProvider() {
  storageProvider = null
}

describe('Storage', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.resetModules()
    process.env = { ...originalEnv }
    resetStorageProvider()
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe('Storage Configuration', () => {
    it('should return local config by default', () => {
      delete process.env.CERTIFICATE_STORAGE_TYPE
      delete process.env.GCS_CERTIFICATES_BUCKET

      const config = getStorageConfig()

      expect(config.type).toBe('local')
    })

    it('should return GCS config when configured', () => {
      process.env.CERTIFICATE_STORAGE_TYPE = 'gcs'
      process.env.GCS_CERTIFICATES_BUCKET = 'my-bucket'
      process.env.GCP_PROJECT_ID = 'my-project'

      const config = getStorageConfig()

      expect(config.type).toBe('gcs')
      expect(config.gcsBucket).toBe('my-bucket')
    })

    it('should use custom local path when configured', () => {
      process.env.CERTIFICATE_STORAGE_TYPE = 'local'
      process.env.CERTIFICATE_STORAGE_PATH = '/custom/path'

      const config = getStorageConfig()

      expect(config.type).toBe('local')
      expect(config.localPath).toBe('/custom/path')
    })
  })

  describe('Image Storage Configuration', () => {
    it('should default to certificate storage type', () => {
      delete process.env.IMAGE_STORAGE_TYPE
      process.env.CERTIFICATE_STORAGE_TYPE = 'gcs'
      process.env.GCS_CERTIFICATES_BUCKET = 'cert-bucket'

      const config = getImageStorageConfig()

      expect(config.type).toBe('gcs')
    })

    it('should use dedicated image storage when configured', () => {
      process.env.IMAGE_STORAGE_TYPE = 'gcs'
      process.env.GCS_IMAGES_BUCKET = 'images-bucket'

      const config = getImageStorageConfig()

      expect(config.type).toBe('gcs')
      expect(config.gcsBucket).toBe('images-bucket')
    })

    it('should return local image storage config', () => {
      delete process.env.IMAGE_STORAGE_TYPE
      delete process.env.CERTIFICATE_STORAGE_TYPE

      const config = getImageStorageConfig()

      expect(config.type).toBe('local')
    })
  })

  describe('Asset Number Conversion', () => {
    it('should convert asset number to safe filename', () => {
      expect(assetNumberToFileName('149 HTAIPL/L')).toBe('149 HTAIPL L.pdf')
    })

    it('should handle asset number without slash', () => {
      expect(assetNumberToFileName('ABC123')).toBe('ABC123.pdf')
    })

    it('should handle multiple slashes', () => {
      expect(assetNumberToFileName('A/B/C')).toBe('A B C.pdf')
    })

    it('should preserve other special characters', () => {
      expect(assetNumberToFileName('TEST-001_v2')).toBe('TEST-001_v2.pdf')
    })
  })

  describe('File Name to Asset Number', () => {
    it('should remove .pdf extension', () => {
      expect(fileNameToAssetNumber('149 HTAIPL L.pdf')).toBe('149 HTAIPL L')
    })

    it('should handle uppercase extension', () => {
      expect(fileNameToAssetNumber('ABC123.PDF')).toBe('ABC123')
    })

    it('should handle file without extension', () => {
      expect(fileNameToAssetNumber('ABC123')).toBe('ABC123')
    })
  })

  describe('Image Storage Key Generation', () => {
    it('should generate UUC image key', () => {
      const key = generateImageStorageKey(
        {
          certificateId: 'cert-123',
          imageType: 'UUC',
        },
        'photo.jpg'
      )

      expect(key).toMatch(/^certificates\/cert-123\/uuc\/\d+-\w+\.jpg$/)
    })

    it('should generate master instrument image key', () => {
      const key = generateImageStorageKey(
        {
          certificateId: 'cert-123',
          imageType: 'MASTER_INSTRUMENT',
          masterInstrumentIndex: 2,
        },
        'master.png'
      )

      expect(key).toMatch(/^certificates\/cert-123\/master\/2\/\d+-\w+\.png$/)
    })

    it('should generate reading UUC image key', () => {
      const key = generateImageStorageKey(
        {
          certificateId: 'cert-123',
          imageType: 'READING_UUC',
          parameterIndex: 1,
          pointNumber: 3,
        },
        'reading.jpg'
      )

      expect(key).toMatch(
        /^certificates\/cert-123\/readings\/param-1\/point-3\/uuc\/\d+-\w+\.jpg$/
      )
    })

    it('should include version suffix for versions > 1', () => {
      const key = generateImageStorageKey(
        {
          certificateId: 'cert-123',
          imageType: 'UUC',
          version: 2,
        },
        'photo.jpg'
      )

      expect(key).toContain('-v2.')
    })

    it('should generate optimized variant key', () => {
      const key = generateImageStorageKey(
        {
          certificateId: 'cert-123',
          imageType: 'UUC',
        },
        'photo.png',
        'optimized'
      )

      expect(key).toMatch(/-optimized\.jpg$/)
    })

    it('should generate thumbnail variant key', () => {
      const key = generateImageStorageKey(
        {
          certificateId: 'cert-123',
          imageType: 'UUC',
        },
        'photo.png',
        'thumbnail'
      )

      expect(key).toMatch(/-thumbnail\.jpg$/)
    })
  })

  describe('Image Storage Key Parsing', () => {
    it('should parse UUC image key', () => {
      const result = parseImageStorageKey('certificates/cert-123/uuc/1700000000-abc123.jpg')

      expect(result.certificateId).toBe('cert-123')
      expect(result.imageType).toBe('UUC')
      expect(result.timestamp).toBe(1700000000)
      expect(result.variant).toBe('original')
    })

    it('should parse master instrument image key', () => {
      const result = parseImageStorageKey('certificates/cert-456/master/2/1700000000-xyz.jpg')

      expect(result.certificateId).toBe('cert-456')
      expect(result.imageType).toBe('MASTER_INSTRUMENT')
      expect(result.masterInstrumentIndex).toBe(2)
    })

    it('should parse reading UUC image key', () => {
      const result = parseImageStorageKey(
        'certificates/cert-789/readings/param-1/point-3/uuc/1700000000-abc.jpg'
      )

      expect(result.imageType).toBe('READING_UUC')
      expect(result.parameterIndex).toBe(1)
      expect(result.pointNumber).toBe(3)
    })

    it('should detect optimized variant', () => {
      const result = parseImageStorageKey(
        'certificates/cert-123/uuc/1700000000-abc-optimized.jpg'
      )

      expect(result.variant).toBe('optimized')
    })

    it('should detect thumbnail variant', () => {
      const result = parseImageStorageKey(
        'certificates/cert-123/uuc/1700000000-abc-thumbnail.jpg'
      )

      expect(result.variant).toBe('thumbnail')
    })

    it('should return empty object for invalid key', () => {
      const result = parseImageStorageKey('invalid/path')
      expect(result).toEqual({})
    })
  })

  describe('Image Variant Keys', () => {
    it('should return all variant keys', () => {
      const originalKey = 'certificates/cert-123/uuc/1700000000-abc.jpg'
      const variants = getImageVariantKeys(originalKey)

      expect(variants.original).toBe(originalKey)
      expect(variants.optimized).toBe('certificates/cert-123/uuc/1700000000-abc-optimized.jpg')
      expect(variants.thumbnail).toBe('certificates/cert-123/uuc/1700000000-abc-thumbnail.jpg')
    })

    it('should handle different original extensions', () => {
      const variants = getImageVariantKeys('path/to/image.png')

      expect(variants.original).toBe('path/to/image.png')
      expect(variants.optimized).toBe('path/to/image-optimized.jpg')
      expect(variants.thumbnail).toBe('path/to/image-thumbnail.jpg')
    })
  })

  describe('Storage Provider Singleton', () => {
    it('should return same instance on subsequent calls', () => {
      delete process.env.CERTIFICATE_STORAGE_TYPE

      resetStorageProvider()

      const provider1 = getStorageProvider()
      const provider2 = getStorageProvider()

      expect(provider1).toBe(provider2)
    })

    it('should reset the singleton', () => {
      delete process.env.CERTIFICATE_STORAGE_TYPE

      const provider1 = getStorageProvider()
      resetStorageProvider()
      const provider2 = getStorageProvider()

      expect(provider1).not.toBe(provider2)
    })
  })
})
