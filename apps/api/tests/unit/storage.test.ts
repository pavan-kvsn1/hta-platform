/**
 * Storage Library Unit Tests
 *
 * Tests for the storage provider factory, key helpers,
 * image key generation/parsing, and listCertificateImages.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── Mock GCSStorageProvider with vi.hoisted ───────────────────────────────────
// vi.mock is hoisted to the top of the file, so variables used inside the
// factory must be defined with vi.hoisted().

const { mockList, mockUpload, MockGCSStorageProvider } = vi.hoisted(() => {
  const mockList = vi.fn()
  const mockUpload = vi.fn()
  const MockGCSStorageProvider = vi.fn().mockImplementation(() => ({
    list: mockList,
    upload: mockUpload,
    download: vi.fn(),
    delete: vi.fn(),
    exists: vi.fn(),
    getSignedUrl: vi.fn(),
    getMetadata: vi.fn(),
  }))
  return { mockList, mockUpload, MockGCSStorageProvider }
})

vi.mock('../../src/lib/storage/gcs-storage.js', () => ({
  GCSStorageProvider: MockGCSStorageProvider,
}))

// ── Import after mocking ──────────────────────────────────────────────────────

import {
  getStorageProvider,
  resetStorageProvider,
  resetImageStorageProvider,
  getImageStorageProvider,
  assetNumberToFileName,
  fileNameToAssetNumber,
  generateImageStorageKey,
  parseImageStorageKey,
  getImageVariantKeys,
  listCertificateImages,
} from '../../src/lib/storage/index.js'

// ── Test utilities ────────────────────────────────────────────────────────────

function setEnv(vars: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) {
      delete process.env[k]
    } else {
      process.env[k] = v
    }
  }
}

// ── getStorageProvider ────────────────────────────────────────────────────────

describe('getStorageProvider', () => {
  beforeEach(() => {
    resetStorageProvider()
    MockGCSStorageProvider.mockClear()
  })

  afterEach(() => {
    resetStorageProvider()
    setEnv({ GCS_BUCKET: undefined, GCS_CERTIFICATES_BUCKET: undefined, GCP_PROJECT_ID: undefined })
  })

  it('throws when GCS_BUCKET is not set', () => {
    setEnv({ GCS_BUCKET: undefined, GCS_CERTIFICATES_BUCKET: undefined })
    expect(() => getStorageProvider()).toThrow('GCS_BUCKET environment variable is required')
  })

  it('returns a GCSStorageProvider when GCS_BUCKET is configured', () => {
    setEnv({ GCS_BUCKET: 'my-bucket' })
    const provider = getStorageProvider()
    expect(provider).toBeDefined()
    expect(MockGCSStorageProvider).toHaveBeenCalledWith('my-bucket', undefined)
  })

  it('uses GCS_CERTIFICATES_BUCKET as fallback when GCS_BUCKET is absent', () => {
    setEnv({ GCS_BUCKET: undefined, GCS_CERTIFICATES_BUCKET: 'certs-bucket' })
    getStorageProvider()
    expect(MockGCSStorageProvider).toHaveBeenCalledWith('certs-bucket', undefined)
  })

  it('caches the singleton — returns same instance on second call', () => {
    setEnv({ GCS_BUCKET: 'my-bucket' })
    const first = getStorageProvider()
    const second = getStorageProvider()
    expect(first).toBe(second)
    expect(MockGCSStorageProvider).toHaveBeenCalledTimes(1)
  })

  it('resetStorageProvider clears the cache so next call creates new instance', () => {
    setEnv({ GCS_BUCKET: 'my-bucket' })
    getStorageProvider()
    resetStorageProvider()
    getStorageProvider()
    expect(MockGCSStorageProvider).toHaveBeenCalledTimes(2)
  })

  it('passes GCP_PROJECT_ID to GCSStorageProvider', () => {
    setEnv({ GCS_BUCKET: 'my-bucket', GCP_PROJECT_ID: 'my-project' })
    getStorageProvider()
    expect(MockGCSStorageProvider).toHaveBeenCalledWith('my-bucket', 'my-project')
  })
})

// ── getImageStorageProvider ───────────────────────────────────────────────────

describe('getImageStorageProvider', () => {
  beforeEach(() => {
    resetImageStorageProvider()
    MockGCSStorageProvider.mockClear()
  })

  afterEach(() => {
    resetImageStorageProvider()
    setEnv({
      GCS_IMAGES_BUCKET: undefined,
      GCS_BUCKET: undefined,
      GCS_CERTIFICATES_BUCKET: undefined,
    })
  })

  it('throws when no image bucket is configured', () => {
    setEnv({ GCS_IMAGES_BUCKET: undefined, GCS_BUCKET: undefined, GCS_CERTIFICATES_BUCKET: undefined })
    expect(() => getImageStorageProvider()).toThrow('GCS_IMAGES_BUCKET environment variable is required')
  })

  it('uses GCS_IMAGES_BUCKET when available', () => {
    setEnv({ GCS_IMAGES_BUCKET: 'images-bucket' })
    getImageStorageProvider()
    expect(MockGCSStorageProvider).toHaveBeenCalledWith('images-bucket', undefined)
  })

  it('falls back to GCS_BUCKET when GCS_IMAGES_BUCKET is absent', () => {
    setEnv({ GCS_IMAGES_BUCKET: undefined, GCS_BUCKET: 'main-bucket' })
    getImageStorageProvider()
    expect(MockGCSStorageProvider).toHaveBeenCalledWith('main-bucket', undefined)
  })

  it('caches the singleton', () => {
    setEnv({ GCS_IMAGES_BUCKET: 'img-bucket' })
    getImageStorageProvider()
    getImageStorageProvider()
    expect(MockGCSStorageProvider).toHaveBeenCalledTimes(1)
  })
})

// ── assetNumberToFileName ─────────────────────────────────────────────────────

describe('assetNumberToFileName', () => {
  it('converts a simple asset number to filename', () => {
    expect(assetNumberToFileName('HTA-001')).toBe('HTA-001.pdf')
  })

  it('replaces forward slashes with spaces', () => {
    expect(assetNumberToFileName('HTA/CAL/001')).toBe('HTA CAL 001.pdf')
  })

  it('handles asset numbers without special chars', () => {
    expect(assetNumberToFileName('ASSET123')).toBe('ASSET123.pdf')
  })

  it('appends .pdf extension', () => {
    const result = assetNumberToFileName('test')
    expect(result.endsWith('.pdf')).toBe(true)
  })
})

// ── fileNameToAssetNumber ─────────────────────────────────────────────────────

describe('fileNameToAssetNumber', () => {
  it('strips .pdf extension', () => {
    expect(fileNameToAssetNumber('HTA-001.pdf')).toBe('HTA-001')
  })

  it('strips .PDF extension (case-insensitive)', () => {
    expect(fileNameToAssetNumber('HTA-001.PDF')).toBe('HTA-001')
  })

  it('returns name unchanged when no .pdf extension', () => {
    expect(fileNameToAssetNumber('HTA-001')).toBe('HTA-001')
  })

  it('round-trips with assetNumberToFileName for slash-free names', () => {
    const original = 'HTA-001'
    const filename = assetNumberToFileName(original)
    expect(fileNameToAssetNumber(filename)).toBe(original)
  })
})

// ── generateImageStorageKey ───────────────────────────────────────────────────

describe('generateImageStorageKey', () => {
  it('generates a key with correct prefix for UUC type', () => {
    const key = generateImageStorageKey(
      { certificateId: 'cert-123', imageType: 'UUC' },
      'photo.jpg'
    )
    expect(key).toMatch(/^certificates\/cert-123\/uuc\//)
    expect(key).toMatch(/\.jpg$/)
  })

  it('generates a key for MASTER_INSTRUMENT type', () => {
    const key = generateImageStorageKey(
      { certificateId: 'cert-123', imageType: 'MASTER_INSTRUMENT', masterInstrumentIndex: 2 },
      'master.jpg'
    )
    expect(key).toContain('master/2')
  })

  it('defaults masterInstrumentIndex to 0 when not specified', () => {
    const key = generateImageStorageKey(
      { certificateId: 'cert-123', imageType: 'MASTER_INSTRUMENT' },
      'master.jpg'
    )
    expect(key).toContain('master/0')
  })

  it('generates a key for READING_UUC type', () => {
    const key = generateImageStorageKey(
      { certificateId: 'cert-123', imageType: 'READING_UUC', parameterIndex: 1, pointNumber: 3 },
      'reading.jpg'
    )
    expect(key).toContain('readings/param-1/point-3/uuc')
  })

  it('generates a key for READING_MASTER type', () => {
    const key = generateImageStorageKey(
      { certificateId: 'cert-123', imageType: 'READING_MASTER', parameterIndex: 0, pointNumber: 0 },
      'master-read.jpg'
    )
    expect(key).toContain('readings/param-0/point-0/master')
  })

  it('adds optimized suffix for optimized variant', () => {
    const key = generateImageStorageKey(
      { certificateId: 'cert-abc', imageType: 'UUC' },
      'photo.jpg',
      'optimized'
    )
    expect(key).toMatch(/-optimized\.jpg$/)
  })

  it('adds thumbnail suffix for thumbnail variant', () => {
    const key = generateImageStorageKey(
      { certificateId: 'cert-abc', imageType: 'UUC' },
      'photo.jpg',
      'thumbnail'
    )
    expect(key).toMatch(/-thumbnail\.jpg$/)
  })

  it('preserves original file extension for original variant', () => {
    const key = generateImageStorageKey(
      { certificateId: 'cert-abc', imageType: 'UUC' },
      'photo.png',
      'original'
    )
    expect(key).toMatch(/\.png$/)
  })

  it('adds version suffix for version > 1', () => {
    const key = generateImageStorageKey(
      { certificateId: 'cert-abc', imageType: 'UUC', version: 3 },
      'photo.jpg'
    )
    expect(key).toContain('-v3')
  })

  it('does not add version suffix for version = 1 (default)', () => {
    const key = generateImageStorageKey(
      { certificateId: 'cert-abc', imageType: 'UUC', version: 1 },
      'photo.jpg'
    )
    expect(key).not.toContain('-v1')
  })

  it('generates unique keys on consecutive calls', () => {
    const opts = { certificateId: 'cert-abc', imageType: 'UUC' as const }
    const key1 = generateImageStorageKey(opts, 'photo.jpg')
    const key2 = generateImageStorageKey(opts, 'photo.jpg')
    expect(key1).not.toBe(key2)
  })
})

// ── parseImageStorageKey ──────────────────────────────────────────────────────

describe('parseImageStorageKey', () => {
  it('returns empty object for invalid key format', () => {
    expect(parseImageStorageKey('invalid/path')).toEqual({})
    expect(parseImageStorageKey('')).toEqual({})
    expect(parseImageStorageKey('other/prefix/cert/uuc/file.jpg')).toEqual({})
  })

  it('parses UUC image key correctly', () => {
    const key = 'certificates/cert-123/uuc/1700000000000-abc123.jpg'
    const result = parseImageStorageKey(key)
    expect(result.certificateId).toBe('cert-123')
    expect(result.imageType).toBe('UUC')
  })

  it('parses MASTER_INSTRUMENT key with index', () => {
    const key = 'certificates/cert-123/master/2/1700000000000-abc123.jpg'
    const result = parseImageStorageKey(key)
    expect(result.imageType).toBe('MASTER_INSTRUMENT')
    expect(result.masterInstrumentIndex).toBe(2)
  })

  it('parses READING_UUC key with param and point indices', () => {
    const key = 'certificates/cert-123/readings/param-1/point-3/uuc/1700000000000-abc123.jpg'
    const result = parseImageStorageKey(key)
    expect(result.imageType).toBe('READING_UUC')
    expect(result.parameterIndex).toBe(1)
    expect(result.pointNumber).toBe(3)
  })

  it('parses READING_MASTER key correctly', () => {
    const key = 'certificates/cert-123/readings/param-0/point-0/master/1700000000000-abc123.jpg'
    const result = parseImageStorageKey(key)
    expect(result.imageType).toBe('READING_MASTER')
  })

  it('detects optimized variant', () => {
    const key = 'certificates/cert-123/uuc/1700000000000-abc123-optimized.jpg'
    const result = parseImageStorageKey(key)
    expect(result.variant).toBe('optimized')
  })

  it('detects thumbnail variant', () => {
    const key = 'certificates/cert-123/uuc/1700000000000-abc123-thumbnail.jpg'
    const result = parseImageStorageKey(key)
    expect(result.variant).toBe('thumbnail')
  })

  it('defaults to original variant when no suffix', () => {
    const key = 'certificates/cert-123/uuc/1700000000000-abc123.jpg'
    const result = parseImageStorageKey(key)
    expect(result.variant).toBe('original')
  })

  it('extracts timestamp from filename', () => {
    const ts = 1700000000000
    const key = `certificates/cert-123/uuc/${ts}-abc123.jpg`
    const result = parseImageStorageKey(key)
    expect(result.timestamp).toBe(ts)
  })
})

// ── getImageVariantKeys ───────────────────────────────────────────────────────

describe('getImageVariantKeys', () => {
  it('returns original, optimized, and thumbnail keys', () => {
    const original = 'certificates/cert-abc/uuc/12345-xyz.jpg'
    const result = getImageVariantKeys(original)

    expect(result.original).toBe(original)
    expect(result.optimized).toBe('certificates/cert-abc/uuc/12345-xyz-optimized.jpg')
    expect(result.thumbnail).toBe('certificates/cert-abc/uuc/12345-xyz-thumbnail.jpg')
  })

  it('optimized and thumbnail variants always use .jpg extension', () => {
    const original = 'certificates/cert-abc/uuc/12345-xyz.png'
    const result = getImageVariantKeys(original)

    expect(result.optimized.endsWith('.jpg')).toBe(true)
    expect(result.thumbnail.endsWith('.jpg')).toBe(true)
  })
})

// ── listCertificateImages ─────────────────────────────────────────────────────

describe('listCertificateImages', () => {
  beforeEach(() => {
    resetImageStorageProvider()
    MockGCSStorageProvider.mockClear()
    mockList.mockReset()
    setEnv({ GCS_IMAGES_BUCKET: 'img-bucket' })
  })

  afterEach(() => {
    resetImageStorageProvider()
    setEnv({ GCS_IMAGES_BUCKET: undefined, GCS_BUCKET: undefined })
  })

  const makeStorageFile = (path: string) => ({
    path,
    size: 1024,
    contentType: 'image/jpeg',
    lastModified: new Date(),
  })

  it('lists all images for a certificate when no type filter', async () => {
    mockList.mockResolvedValue([
      makeStorageFile('certificates/cert-1/uuc/img1.jpg'),
      makeStorageFile('certificates/cert-1/master/0/img2.jpg'),
      makeStorageFile('certificates/cert-1/readings/param-0/point-0/uuc/img3.jpg'),
    ])

    const result = await listCertificateImages('cert-1')

    expect(result).toHaveLength(3)
    expect(mockList).toHaveBeenCalledWith('certificates/cert-1/')
  })

  it('filters by UUC type', async () => {
    mockList.mockResolvedValue([
      makeStorageFile('certificates/cert-1/uuc/img1.jpg'),
      makeStorageFile('certificates/cert-1/master/0/img2.jpg'),
    ])

    const result = await listCertificateImages('cert-1', 'UUC')

    expect(result).toHaveLength(1)
    expect(result[0]).toContain('/uuc/')
  })

  it('filters by MASTER_INSTRUMENT type', async () => {
    mockList.mockResolvedValue([
      makeStorageFile('certificates/cert-1/uuc/img1.jpg'),
      makeStorageFile('certificates/cert-1/master/0/img2.jpg'),
      makeStorageFile('certificates/cert-1/master/1/img3.jpg'),
    ])

    const result = await listCertificateImages('cert-1', 'MASTER_INSTRUMENT')

    expect(result).toHaveLength(2)
    result.forEach(r => expect(r).toContain('/master/'))
  })

  it('filters by READING_UUC type (readings prefix)', async () => {
    mockList.mockResolvedValue([
      makeStorageFile('certificates/cert-1/uuc/img1.jpg'),
      makeStorageFile('certificates/cert-1/readings/param-0/point-0/uuc/img2.jpg'),
      makeStorageFile('certificates/cert-1/readings/param-0/point-0/master/img3.jpg'),
    ])

    const result = await listCertificateImages('cert-1', 'READING_UUC')

    expect(result).toHaveLength(2)
    result.forEach(r => expect(r).toContain('/readings/'))
  })

  it('returns empty array when no images exist', async () => {
    mockList.mockResolvedValue([])

    const result = await listCertificateImages('cert-empty')

    expect(result).toHaveLength(0)
  })

  it('returns paths as strings', async () => {
    mockList.mockResolvedValue([
      makeStorageFile('certificates/cert-1/uuc/img1.jpg'),
    ])

    const result = await listCertificateImages('cert-1')

    expect(typeof result[0]).toBe('string')
  })
})
