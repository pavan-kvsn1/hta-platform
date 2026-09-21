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

function getImageVariantKeys(
  originalKey: string,
): { optimized: string; print: string; thumbnail: string } {
  const basePath = originalKey.replace(/\.[^.]+$/, '')
  return {
    optimized: `${basePath}-optimized.jpg`,
    print: `${basePath}-print.jpg`,
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

/**
 * The copy that goes into the certificate's appendix.
 *
 * The appendix prints each photograph in a 245 x 155 pt box - about 3.4 inches across -
 * so roughly 510 pixels covers it at 150 dpi. 1000 px is double that, which keeps it
 * sharp if somebody zooms the PDF, and is still a quarter the weight of the optimized
 * copy: about 90 KB against 500.
 *
 * That difference is the whole reason this variant exists. Embedding the 2000 px copy
 * put a certificate with 47 photographs somewhere north of 20 MB, which is not a
 * document anybody can email - and the alternative on the table was to stop printing
 * some of the photographs.
 */
async function createPrintImage(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .resize({
      width: 1000,
      height: 1000,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: 80, mozjpeg: true })
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

  const [optimizedBuffer, printBuffer, thumbnailBuffer] = await Promise.all([
    createOptimizedImage(originalBuffer),
    createPrintImage(originalBuffer),
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
    bucket.file(variants.print).save(printBuffer, {
      contentType: 'image/jpeg',
      metadata: {
        metadata: {
          sourceImageId: image.id,
          variant: 'print',
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

  console.log(
    `[ImageProcessing] ${image.id}: optimized ${Math.round(optimizedBuffer.length / 1024)}KB, `
    + `print ${Math.round(printBuffer.length / 1024)}KB, thumbnail ${Math.round(thumbnailBuffer.length / 1024)}KB`,
  )

  await prisma.certificateImage.update({
    where: { id: image.id },
    data: {
      optimizedKey: variants.optimized,
      printKey: variants.print,
      thumbnailKey: variants.thumbnail,
    },
  })

  console.log(`[ImageProcessing] Completed image ${imageId}`)
}
