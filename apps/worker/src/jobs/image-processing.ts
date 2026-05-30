import { Job } from 'bullmq'
import { Storage } from '@google-cloud/storage'
import sharp from 'sharp'
import { prisma } from '@hta/database'
import type { ImageProcessingJobData } from '../types.js'

const storage = new Storage({
  projectId: process.env.GCP_PROJECT_ID,
})

function normalizeBucketName(bucketName: string | undefined): string | undefined {
  if (!bucketName) return undefined
  return bucketName.replace(/^gs:\/\//, '').replace(/\/+$/, '')
}

function getCertificateImageBucket(): string {
  const bucket = normalizeBucketName(
    process.env.GCS_CERTIFICATE_IMAGES_BUCKET
    || process.env.GCS_IMAGES_BUCKET
    || process.env.GCS_BUCKET
    || process.env.GCS_CERTIFICATES_BUCKET
  )

  if (!bucket) {
    throw new Error('GCS_CERTIFICATE_IMAGES_BUCKET environment variable is required')
  }

  return bucket
}

function getImageVariantKeys(originalKey: string): { optimized: string; thumbnail: string } {
  const basePath = originalKey.replace(/\.[^.]+$/, '')
  return {
    optimized: `${basePath}-optimized.jpg`,
    thumbnail: `${basePath}-thumbnail.jpg`,
  }
}

async function createOptimizedImage(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .resize({
      width: 2000,
      height: 2000,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer()
}

async function createThumbnail(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .resize({
      width: 200,
      height: 200,
      fit: 'cover',
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .jpeg({ quality: 85 })
    .toBuffer()
}

export async function processImageProcessingJob(job: Job<ImageProcessingJobData>): Promise<void> {
  const { imageId } = job.data
  console.log(`[ImageProcessing] Processing image ${imageId}`)

  const image = await prisma.certificateImage.findUnique({
    where: { id: imageId },
    select: {
      id: true,
      storageBucket: true,
      storageKey: true,
      optimizedKey: true,
      thumbnailKey: true,
      mimeType: true,
      isLatest: true,
    },
  })

  if (!image) {
    console.warn(`[ImageProcessing] Image ${imageId} not found`)
    return
  }

  const bucketName = normalizeBucketName(image.storageBucket || undefined) || getCertificateImageBucket()
  const bucket = storage.bucket(bucketName)
  const [originalBuffer] = await bucket.file(image.storageKey).download()
  const variants = getImageVariantKeys(image.storageKey)

  const [optimizedBuffer, thumbnailBuffer] = await Promise.all([
    createOptimizedImage(originalBuffer),
    createThumbnail(originalBuffer),
  ])

  await Promise.all([
    bucket.file(variants.optimized).save(optimizedBuffer, {
      contentType: 'image/jpeg',
      metadata: {
        metadata: {
          sourceImageId: image.id,
          variant: 'optimized',
        },
      },
    }),
    bucket.file(variants.thumbnail).save(thumbnailBuffer, {
      contentType: 'image/jpeg',
      metadata: {
        metadata: {
          sourceImageId: image.id,
          variant: 'thumbnail',
        },
      },
    }),
  ])

  await prisma.certificateImage.update({
    where: { id: image.id },
    data: {
      optimizedKey: variants.optimized,
      thumbnailKey: variants.thumbnail,
    },
  })

  console.log(`[ImageProcessing] Completed image ${imageId}`)
}
