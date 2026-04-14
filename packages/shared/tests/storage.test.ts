/**
 * Storage Unit Tests
 *
 * Tests for storage helpers, utilities, and providers
 *
 * Migrated from hta-calibration/tests/unit/storage.test.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('Storage', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.resetModules()
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe('Storage Configuration', () => {
    it('should return local config by default', async () => {
      delete process.env.CERTIFICATE_STORAGE_TYPE
      delete process.env.GCS_CERTIFICATES_BUCKET

      const { getStorageConfig } = await import('../src/storage')
      const config = getStorageConfig()

      expect(config.type).toBe('local')
    })

    it('should return GCS config when configured', async () => {
      process.env.CERTIFICATE_STORAGE_TYPE = 'gcs'
      process.env.GCS_CERTIFICATES_BUCKET = 'my-bucket'
      process.env.GCP_PROJECT_ID = 'my-project'

      const { getStorageConfig } = await import('../src/storage')
      const config = getStorageConfig()

      expect(config.type).toBe('gcs')
      expect(config.gcsBucket).toBe('my-bucket')
    })

    it('should use custom local path when configured', async () => {
      process.env.CERTIFICATE_STORAGE_TYPE = 'local'
      process.env.CERTIFICATE_STORAGE_PATH = '/custom/path'

      const { getStorageConfig } = await import('../src/storage')
      const config = getStorageConfig()

      expect(config.type).toBe('local')
      expect(config.localPath).toBe('/custom/path')
    })
  })

  describe('Image Storage Configuration', () => {
    it('should default to certificate storage type', async () => {
      delete process.env.IMAGE_STORAGE_TYPE
      process.env.CERTIFICATE_STORAGE_TYPE = 'gcs'
      process.env.GCS_CERTIFICATES_BUCKET = 'cert-bucket'

      const { getImageStorageConfig } = await import('../src/storage')
      const config = getImageStorageConfig()

      expect(config.type).toBe('gcs')
    })

    it('should use dedicated image storage when configured', async () => {
      process.env.IMAGE_STORAGE_TYPE = 'gcs'
      process.env.GCS_IMAGES_BUCKET = 'images-bucket'

      const { getImageStorageConfig } = await import('../src/storage')
      const config = getImageStorageConfig()

      expect(config.type).toBe('gcs')
      expect(config.gcsBucket).toBe('images-bucket')
    })

    it('should return local image storage config', async () => {
      delete process.env.IMAGE_STORAGE_TYPE
      delete process.env.CERTIFICATE_STORAGE_TYPE

      const { getImageStorageConfig } = await import('../src/storage')
      const config = getImageStorageConfig()

      expect(config.type).toBe('local')
    })
  })

  describe('Asset Number Conversion', () => {
    it('should convert asset number to safe filename', async () => {
      const { assetNumberToFileName } = await import('../src/storage')
      expect(assetNumberToFileName('149 HTAIPL/L')).toBe('149 HTAIPL L.pdf')
    })

    it('should handle asset number without slash', async () => {
      const { assetNumberToFileName } = await import('../src/storage')
      expect(assetNumberToFileName('ABC123')).toBe('ABC123.pdf')
    })

    it('should handle multiple slashes', async () => {
      const { assetNumberToFileName } = await import('../src/storage')
      expect(assetNumberToFileName('A/B/C')).toBe('A B C.pdf')
    })

    it('should preserve other special characters', async () => {
      const { assetNumberToFileName } = await import('../src/storage')
      expect(assetNumberToFileName('TEST-001_v2')).toBe('TEST-001_v2.pdf')
    })
  })

  describe('File Name to Asset Number', () => {
    it('should remove .pdf extension', async () => {
      const { fileNameToAssetNumber } = await import('../src/storage')
      expect(fileNameToAssetNumber('149 HTAIPL L.pdf')).toBe('149 HTAIPL L')
    })

    it('should handle uppercase extension', async () => {
      const { fileNameToAssetNumber } = await import('../src/storage')
      expect(fileNameToAssetNumber('ABC123.PDF')).toBe('ABC123')
    })

    it('should handle file without extension', async () => {
      const { fileNameToAssetNumber } = await import('../src/storage')
      expect(fileNameToAssetNumber('ABC123')).toBe('ABC123')
    })
  })

  describe('Image Storage Key Generation', () => {
    it('should generate UUC image key', async () => {
      const { generateImageStorageKey } = await import('../src/storage')
      const key = generateImageStorageKey(
        {
          certificateId: 'cert-123',
          imageType: 'UUC',
        },
        'photo.jpg'
      )

      expect(key).toMatch(/^certificates\/cert-123\/uuc\/\d+-\w+\.jpg$/)
    })

    it('should generate master instrument image key', async () => {
      const { generateImageStorageKey } = await import('../src/storage')
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

    it('should generate reading UUC image key', async () => {
      const { generateImageStorageKey } = await import('../src/storage')
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

    it('should include version suffix for versions > 1', async () => {
      const { generateImageStorageKey } = await import('../src/storage')
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

    it('should generate optimized variant key', async () => {
      const { generateImageStorageKey } = await import('../src/storage')
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

    it('should generate thumbnail variant key', async () => {
      const { generateImageStorageKey } = await import('../src/storage')
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
    it('should parse UUC image key', async () => {
      const { parseImageStorageKey } = await import('../src/storage')
      const result = parseImageStorageKey('certificates/cert-123/uuc/1700000000-abc123.jpg')

      expect(result.certificateId).toBe('cert-123')
      expect(result.imageType).toBe('UUC')
      expect(result.timestamp).toBe(1700000000)
      expect(result.variant).toBe('original')
    })

    it('should parse master instrument image key', async () => {
      const { parseImageStorageKey } = await import('../src/storage')
      const result = parseImageStorageKey('certificates/cert-456/master/2/1700000000-xyz.jpg')

      expect(result.certificateId).toBe('cert-456')
      expect(result.imageType).toBe('MASTER_INSTRUMENT')
      expect(result.masterInstrumentIndex).toBe(2)
    })

    it('should parse reading UUC image key', async () => {
      const { parseImageStorageKey } = await import('../src/storage')
      const result = parseImageStorageKey(
        'certificates/cert-789/readings/param-1/point-3/uuc/1700000000-abc.jpg'
      )

      expect(result.imageType).toBe('READING_UUC')
      expect(result.parameterIndex).toBe(1)
      expect(result.pointNumber).toBe(3)
    })

    it('should detect optimized variant', async () => {
      const { parseImageStorageKey } = await import('../src/storage')
      const result = parseImageStorageKey(
        'certificates/cert-123/uuc/1700000000-abc-optimized.jpg'
      )

      expect(result.variant).toBe('optimized')
    })

    it('should detect thumbnail variant', async () => {
      const { parseImageStorageKey } = await import('../src/storage')
      const result = parseImageStorageKey(
        'certificates/cert-123/uuc/1700000000-abc-thumbnail.jpg'
      )

      expect(result.variant).toBe('thumbnail')
    })

    it('should return empty object for invalid key', async () => {
      const { parseImageStorageKey } = await import('../src/storage')
      const result = parseImageStorageKey('invalid/path')
      expect(result).toEqual({})
    })
  })

  describe('Image Variant Keys', () => {
    it('should return all variant keys', async () => {
      const { getImageVariantKeys } = await import('../src/storage')
      const originalKey = 'certificates/cert-123/uuc/1700000000-abc.jpg'
      const variants = getImageVariantKeys(originalKey)

      expect(variants.original).toBe(originalKey)
      expect(variants.optimized).toBe('certificates/cert-123/uuc/1700000000-abc-optimized.jpg')
      expect(variants.thumbnail).toBe('certificates/cert-123/uuc/1700000000-abc-thumbnail.jpg')
    })

    it('should handle different original extensions', async () => {
      const { getImageVariantKeys } = await import('../src/storage')
      const variants = getImageVariantKeys('path/to/image.png')

      expect(variants.original).toBe('path/to/image.png')
      expect(variants.optimized).toBe('path/to/image-optimized.jpg')
      expect(variants.thumbnail).toBe('path/to/image-thumbnail.jpg')
    })
  })

  describe('Storage Provider Singleton', () => {
    it('should return same instance on subsequent calls', async () => {
      delete process.env.CERTIFICATE_STORAGE_TYPE

      const { getStorageProvider, resetStorageProvider } = await import('../src/storage')
      resetStorageProvider()

      const provider1 = getStorageProvider()
      const provider2 = getStorageProvider()

      expect(provider1).toBe(provider2)
    })

    it('should reset the singleton', async () => {
      delete process.env.CERTIFICATE_STORAGE_TYPE

      const { getStorageProvider, resetStorageProvider } = await import('../src/storage')

      const provider1 = getStorageProvider()
      resetStorageProvider()
      const provider2 = getStorageProvider()

      expect(provider1).not.toBe(provider2)
    })
  })
})
