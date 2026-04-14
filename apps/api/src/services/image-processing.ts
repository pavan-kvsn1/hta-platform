/**
 * Image Processing Utilities
 *
 * Server-side image processing using Sharp for:
 * - HEIC to JPEG conversion
 * - Creating optimized versions (JPEG 90% quality)
 * - Creating thumbnails (200x200)
 */

import sharp from 'sharp'

export interface ProcessedImage {
  buffer: Buffer
  mimeType: string
  width: number
  height: number
  size: number
}

export interface ImageProcessingOptions {
  /** Quality for JPEG output (1-100), default 90 */
  quality?: number
  /** Max width for optimization (maintains aspect ratio) */
  maxWidth?: number
  /** Max height for optimization (maintains aspect ratio) */
  maxHeight?: number
}

export interface ThumbnailOptions {
  /** Thumbnail width, default 200 */
  width?: number
  /** Thumbnail height, default 200 */
  height?: number
  /** Fit mode: 'cover' (crop), 'contain' (fit), 'fill' (stretch) */
  fit?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside'
  /** Background color for 'contain' mode */
  background?: { r: number; g: number; b: number; alpha: number }
}

const DEFAULT_QUALITY = 90
const DEFAULT_THUMBNAIL_SIZE = 200
const MAX_OPTIMIZED_WIDTH = 2000
const MAX_OPTIMIZED_HEIGHT = 2000

/**
 * Check if the input is a HEIC/HEIF image
 */
export function isHeicImage(mimeType: string): boolean {
  return mimeType === 'image/heic' || mimeType === 'image/heif'
}

/**
 * Get image metadata without fully decoding
 */
export async function getImageMetadata(buffer: Buffer): Promise<{
  width: number
  height: number
  format: string
  size: number
}> {
  const metadata = await sharp(buffer).metadata()

  return {
    width: metadata.width || 0,
    height: metadata.height || 0,
    format: metadata.format || 'unknown',
    size: buffer.length,
  }
}

/**
 * Convert any supported image to JPEG
 * Handles HEIC, PNG, WebP, etc.
 */
export async function convertToJpeg(
  buffer: Buffer,
  options: ImageProcessingOptions = {}
): Promise<ProcessedImage> {
  const quality = options.quality || DEFAULT_QUALITY

  const image = sharp(buffer)

  // Resize if dimensions exceed max
  let resizedImage = image
  if (options.maxWidth || options.maxHeight) {
    resizedImage = image.resize({
      width: options.maxWidth,
      height: options.maxHeight,
      fit: 'inside',
      withoutEnlargement: true,
    })
  }

  // Convert to JPEG
  const output = await resizedImage
    .jpeg({ quality, mozjpeg: true })
    .toBuffer({ resolveWithObject: true })

  return {
    buffer: output.data,
    mimeType: 'image/jpeg',
    width: output.info.width,
    height: output.info.height,
    size: output.data.length,
  }
}

/**
 * Create an optimized version of an image
 * - Converts to JPEG with 90% quality
 * - Resizes to max 2000x2000 (maintains aspect ratio)
 */
export async function createOptimizedImage(
  buffer: Buffer,
  options: ImageProcessingOptions = {}
): Promise<ProcessedImage> {
  return convertToJpeg(buffer, {
    quality: options.quality || DEFAULT_QUALITY,
    maxWidth: options.maxWidth || MAX_OPTIMIZED_WIDTH,
    maxHeight: options.maxHeight || MAX_OPTIMIZED_HEIGHT,
  })
}

/**
 * Create a thumbnail from an image
 * - Default 200x200 with cover fit (crops to fill)
 * - Always JPEG output
 */
export async function createThumbnail(
  buffer: Buffer,
  options: ThumbnailOptions = {}
): Promise<ProcessedImage> {
  const width = options.width || DEFAULT_THUMBNAIL_SIZE
  const height = options.height || DEFAULT_THUMBNAIL_SIZE
  const fit = options.fit || 'cover'

  const image = sharp(buffer)

  // Resize to thumbnail dimensions
  const resized = image.resize({
    width,
    height,
    fit,
    background: options.background || { r: 255, g: 255, b: 255, alpha: 1 },
  })

  // Convert to JPEG with good quality
  const output = await resized
    .jpeg({ quality: 85 })
    .toBuffer({ resolveWithObject: true })

  return {
    buffer: output.data,
    mimeType: 'image/jpeg',
    width: output.info.width,
    height: output.info.height,
    size: output.data.length,
  }
}

/**
 * Process an uploaded image to generate all variants
 * Returns original (possibly converted), optimized, and thumbnail versions
 */
export async function processUploadedImage(
  buffer: Buffer,
  mimeType: string
): Promise<{
  original: ProcessedImage
  optimized: ProcessedImage
  thumbnail: ProcessedImage
}> {
  // For HEIC, convert to JPEG first
  let originalBuffer = buffer
  let originalMimeType = mimeType

  if (isHeicImage(mimeType)) {
    const converted = await convertToJpeg(buffer, { quality: 95 })
    originalBuffer = converted.buffer
    originalMimeType = 'image/jpeg'
  }

  // Get original metadata
  const metadata = await getImageMetadata(originalBuffer)

  // Create optimized version
  const optimized = await createOptimizedImage(originalBuffer)

  // Create thumbnail
  const thumbnail = await createThumbnail(originalBuffer)

  return {
    original: {
      buffer: originalBuffer,
      mimeType: originalMimeType,
      width: metadata.width,
      height: metadata.height,
      size: originalBuffer.length,
    },
    optimized,
    thumbnail,
  }
}

/**
 * Validate image dimensions and file size
 */
export async function validateImage(
  buffer: Buffer,
  options: {
    maxFileSize?: number // in bytes
    minWidth?: number
    minHeight?: number
    maxWidth?: number
    maxHeight?: number
  } = {}
): Promise<{ valid: boolean; error?: string }> {
  const {
    maxFileSize = 50 * 1024 * 1024, // 50MB default
    minWidth = 100,
    minHeight = 100,
    maxWidth = 10000,
    maxHeight = 10000,
  } = options

  // Check file size
  if (buffer.length > maxFileSize) {
    return {
      valid: false,
      error: `File size (${Math.round(buffer.length / 1024 / 1024)}MB) exceeds maximum allowed (${Math.round(maxFileSize / 1024 / 1024)}MB)`,
    }
  }

  // Get dimensions
  try {
    const metadata = await getImageMetadata(buffer)

    if (metadata.width < minWidth || metadata.height < minHeight) {
      return {
        valid: false,
        error: `Image dimensions (${metadata.width}x${metadata.height}) are too small. Minimum: ${minWidth}x${minHeight}`,
      }
    }

    if (metadata.width > maxWidth || metadata.height > maxHeight) {
      return {
        valid: false,
        error: `Image dimensions (${metadata.width}x${metadata.height}) are too large. Maximum: ${maxWidth}x${maxHeight}`,
      }
    }

    return { valid: true }
  } catch {
    return {
      valid: false,
      error: 'Failed to read image. The file may be corrupted or in an unsupported format.',
    }
  }
}

/**
 * Get compression savings statistics
 */
export function getCompressionStats(
  originalSize: number,
  optimizedSize: number,
  thumbnailSize: number
): {
  originalSizeKB: number
  optimizedSizeKB: number
  thumbnailSizeKB: number
  optimizedSavingsPercent: number
  totalStorageBytes: number
} {
  const originalSizeKB = Math.round(originalSize / 1024)
  const optimizedSizeKB = Math.round(optimizedSize / 1024)
  const thumbnailSizeKB = Math.round(thumbnailSize / 1024)
  const optimizedSavingsPercent = Math.round((1 - optimizedSize / originalSize) * 100)
  const totalStorageBytes = originalSize + optimizedSize + thumbnailSize

  return {
    originalSizeKB,
    optimizedSizeKB,
    thumbnailSizeKB,
    optimizedSavingsPercent,
    totalStorageBytes,
  }
}
