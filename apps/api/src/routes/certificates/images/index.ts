/**
 * Certificate Images API Routes
 *
 * Handles image upload, retrieval, and management for certificates.
 * Supports image types: UUC, MASTER_INSTRUMENT, READING_UUC, READING_MASTER
 */

import { FastifyPluginAsync } from 'fastify'
import { MultipartFile } from '@fastify/multipart'
import { prisma, Prisma } from '@hta/database'
import { requireAuth } from '../../../middleware/auth.js'
import {
  getImageStorageProvider,
  generateImageStorageKey,
  getImageVariantKeys,
  type CertificateImageType,
} from '../../../lib/storage/index.js'

// Max images per type
const MAX_UUC_IMAGES = 10
const MAX_MASTER_IMAGES_PER_INSTRUMENT = 5

// Allowed MIME types
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/heif',
  'image/webp',
]

interface ImageUploadRequest {
  imageType: CertificateImageType
  masterInstrumentIndex?: number
  parameterIndex?: number
  pointNumber?: number
  caption?: string
}

const certificateImagesRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/certificates/:id/images - List images for a certificate
  fastify.get<{ Params: { id: string } }>('/', {
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const userId = request.user!.sub
    const userRole = request.user!.role
    const tenantId = request.tenantId
    const { id } = request.params

    // Verify certificate exists and user has access
    const certificate = await prisma.certificate.findUnique({
      where: { id },
      select: { id: true, tenantId: true, createdById: true, reviewerId: true, customerName: true },
    })

    if (!certificate) {
      return reply.status(404).send({ error: 'Certificate not found' })
    }

    if (certificate.tenantId !== tenantId) {
      return reply.status(403).send({ error: 'Access denied' })
    }

    // Check access: creator, reviewer, admin, or customer with matching company
    const isCreator = certificate.createdById === userId
    const isReviewer = certificate.reviewerId === userId
    const isAdmin = userRole === 'ADMIN'
    const isCustomer = userRole === 'CUSTOMER'

    let hasCustomerAccess = false
    if (isCustomer && request.user!.email) {
      const customer = await prisma.customerUser.findUnique({
        where: { tenantId_email: { tenantId, email: request.user!.email } },
        include: { customerAccount: true },
      })
      if (customer) {
        const companyName = customer.customerAccount?.companyName || customer.companyName || ''
        hasCustomerAccess = companyName.toLowerCase() === certificate.customerName?.toLowerCase()
      }
    }

    if (!isCreator && !isReviewer && !isAdmin && !hasCustomerAccess) {
      return reply.status(403).send({ error: 'Access denied' })
    }

    // Parse query params for filtering
    const query = request.query as {
      type?: string
      parameterIndex?: string
      pointNumber?: string
      masterInstrumentIndex?: string
    }

    // Build where clause
    const where: {
      certificateId: string
      isLatest: boolean
      imageType?: CertificateImageType
      parameterIndex?: number
      pointNumber?: number
      masterInstrumentIndex?: number
    } = {
      certificateId: id,
      isLatest: true,
    }

    if (query.type) where.imageType = query.type as CertificateImageType
    if (query.parameterIndex) where.parameterIndex = parseInt(query.parameterIndex)
    if (query.pointNumber) where.pointNumber = parseInt(query.pointNumber)
    if (query.masterInstrumentIndex) where.masterInstrumentIndex = parseInt(query.masterInstrumentIndex)

    const images = await prisma.certificateImage.findMany({
      where,
      orderBy: [
        { imageType: 'asc' },
        { parameterIndex: 'asc' },
        { pointNumber: 'asc' },
        { uploadedAt: 'desc' },
      ],
      select: {
        id: true,
        imageType: true,
        masterInstrumentIndex: true,
        parameterIndex: true,
        pointNumber: true,
        fileName: true,
        fileSize: true,
        mimeType: true,
        storageKey: true,
        thumbnailKey: true,
        optimizedKey: true,
        caption: true,
        version: true,
        uploadedAt: true,
        uploadedBy: {
          select: { id: true, name: true },
        },
      },
    })

    // Generate signed URLs for images
    const storage = getImageStorageProvider()

    const imagesWithUrls = await Promise.all(
      images.map(async (img: (typeof images)[number]) => {
        let thumbnailUrl: string | null = null
        let optimizedUrl: string | null = null
        let originalUrl: string | null = null

        try {
          if (img.thumbnailKey) {
            thumbnailUrl = await storage.getSignedUrl(img.thumbnailKey, { expiresInMinutes: 60 })
          }
          if (img.optimizedKey) {
            optimizedUrl = await storage.getSignedUrl(img.optimizedKey, { expiresInMinutes: 60 })
          }
          originalUrl = await storage.getSignedUrl(img.storageKey, { expiresInMinutes: 60 })
        } catch {
          // URL generation failed, URLs will be null
        }

        return {
          ...img,
          uploadedAt: img.uploadedAt.toISOString(),
          thumbnailUrl,
          optimizedUrl,
          originalUrl,
          storageProvider: 'gcs',
        }
      })
    )

    return { images: imagesWithUrls }
  })

  // POST /api/certificates/:id/images - Upload new images
  fastify.post<{ Params: { id: string } }>('/', {
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const userId = request.user!.sub
    const userRole = request.user!.role
    const tenantId = request.tenantId
    const { id } = request.params

    // Verify certificate exists and user can upload
    const certificate = await prisma.certificate.findUnique({
      where: { id },
      include: {
        parameters: {
          include: { results: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
    })

    if (!certificate) {
      return reply.status(404).send({ error: 'Certificate not found' })
    }

    if (certificate.tenantId !== tenantId) {
      return reply.status(403).send({ error: 'Access denied' })
    }

    // Only creator or admin can upload
    const isCreator = certificate.createdById === userId
    const isAdmin = userRole === 'ADMIN'

    if (!isCreator && !isAdmin) {
      return reply.status(403).send({ error: 'Access denied' })
    }

    // Parse multipart form data
    let file: { filename: string; mimetype: string; data: Buffer } | null = null
    let metadata: ImageUploadRequest | null = null

    // Get file from request
    const multipartFile = await request.file() as MultipartFile | undefined
    if (!multipartFile) {
      return reply.status(400).send({ error: 'No file provided' })
    }

    // Get the file buffer
    const chunks: Buffer[] = []
    for await (const chunk of multipartFile.file) {
      chunks.push(chunk)
    }
    file = {
      filename: multipartFile.filename,
      mimetype: multipartFile.mimetype,
      data: Buffer.concat(chunks),
    }

    // Get metadata from fields
    const metadataField = multipartFile.fields['metadata']
    if (metadataField && 'value' in metadataField) {
      try {
        metadata = JSON.parse(metadataField.value as string)
      } catch {
        return reply.status(400).send({ error: 'Invalid metadata JSON' })
      }
    }

    if (!metadata) {
      return reply.status(400).send({ error: 'No metadata provided' })
    }

    // Validate file type
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      return reply.status(400).send({
        error: `Invalid file type: ${file.mimetype}. Allowed: ${ALLOWED_MIME_TYPES.join(', ')}`,
      })
    }

    // Validate image type
    const validImageTypes: CertificateImageType[] = ['UUC', 'MASTER_INSTRUMENT', 'READING_UUC', 'READING_MASTER']
    if (!validImageTypes.includes(metadata.imageType)) {
      return reply.status(400).send({ error: `Invalid image type: ${metadata.imageType}` })
    }

    // Check limits based on image type
    const existingCount = await getExistingImageCount(id, metadata)
    const maxAllowed = getMaxAllowed(metadata, certificate.parameters)

    if (existingCount >= maxAllowed) {
      return reply.status(400).send({
        error: `Maximum images (${maxAllowed}) reached for this context`,
      })
    }

    // For reading images, validate that parameter and point exist
    if (metadata.imageType === 'READING_UUC' || metadata.imageType === 'READING_MASTER') {
      if (metadata.parameterIndex === undefined || metadata.pointNumber === undefined) {
        return reply.status(400).send({
          error: 'parameterIndex and pointNumber are required for reading images',
        })
      }

      const param = certificate.parameters[metadata.parameterIndex]
      if (!param) {
        return reply.status(400).send({
          error: `Parameter at index ${metadata.parameterIndex} not found`,
        })
      }

      const pointExists = param.results.some((r: (typeof param.results)[number]) => r.pointNumber === metadata!.pointNumber)
      if (!pointExists) {
        return reply.status(400).send({
          error: `Point ${metadata.pointNumber} not found in parameter`,
        })
      }
    }

    // Upload to storage
    const storage = getImageStorageProvider()
    const storageBucket = process.env.GCS_IMAGES_BUCKET || process.env.GCS_BUCKET || process.env.GCS_CERTIFICATES_BUCKET || null

    const storageKey = generateImageStorageKey(
      {
        certificateId: id,
        imageType: metadata.imageType,
        masterInstrumentIndex: metadata.masterInstrumentIndex,
        parameterIndex: metadata.parameterIndex,
        pointNumber: metadata.pointNumber,
      },
      file.filename,
      'original'
    )

    // Upload original
    try {
      await storage.upload(storageKey, file.data, {
        contentType: file.mimetype,
        metadata: {
          certificateId: id,
          imageType: metadata.imageType,
          originalFileName: file.filename,
          uploadedBy: userId,
        },
      })
    } catch (uploadError) {
      fastify.log.error(uploadError, 'Storage upload failed')
      throw uploadError
    }

    // Cloud Function will process images asynchronously and create optimized/thumbnail variants

    // Check if there's an existing image to supersede (for versioning)
    const existingImage = await prisma.certificateImage.findFirst({
      where: {
        certificateId: id,
        imageType: metadata.imageType,
        masterInstrumentIndex: metadata.masterInstrumentIndex ?? null,
        parameterIndex: metadata.parameterIndex ?? null,
        pointNumber: metadata.pointNumber ?? null,
        isLatest: true,
      },
    })

    // Create database record
    const image = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Mark old image as superseded if exists
      let newVersion = 1
      if (existingImage) {
        newVersion = existingImage.version + 1
        await tx.certificateImage.update({
          where: { id: existingImage.id },
          data: {
            isLatest: false,
            archivedAt: new Date(),
          },
        })
      }

      // Create new image record
      const newImage = await tx.certificateImage.create({
        data: {
          certificateId: id,
          imageType: metadata!.imageType,
          masterInstrumentIndex: metadata!.masterInstrumentIndex ?? null,
          parameterIndex: metadata!.parameterIndex ?? null,
          pointNumber: metadata!.pointNumber ?? null,
          fileName: file!.filename,
          fileSize: file!.data.length,
          mimeType: file!.mimetype,
          storageProvider: 'GCP',
          storageBucket,
          storageKey,
          optimizedKey: null, // Cloud Function will populate
          thumbnailKey: null, // Cloud Function will populate
          version: newVersion,
          isLatest: true,
          supersededById: null,
          caption: metadata!.caption ?? null,
          uploadedById: userId,
          certificateRevision: certificate.currentRevision,
        },
        select: {
          id: true,
          imageType: true,
          masterInstrumentIndex: true,
          parameterIndex: true,
          pointNumber: true,
          fileName: true,
          fileSize: true,
          mimeType: true,
          storageKey: true,
          caption: true,
          version: true,
          uploadedAt: true,
          uploadedBy: {
            select: { id: true, name: true },
          },
        },
      })

      // Update supersededById on old image
      if (existingImage) {
        await tx.certificateImage.update({
          where: { id: existingImage.id },
          data: { supersededById: newImage.id },
        })
      }

      return newImage
    })

    // Generate signed URL for the uploaded image
    // Optimized/thumbnail variants will be created by Cloud Function
    const originalUrl = await storage.getSignedUrl(storageKey, { expiresInMinutes: 60 })

    return reply.status(201).send({
      image: {
        ...image,
        uploadedAt: image.uploadedAt.toISOString(),
        originalUrl,
        thumbnailUrl: null, // Created async by Cloud Function
        optimizedUrl: null, // Created async by Cloud Function
        storageProvider: 'gcs',
      },
    })
  })

  // GET /api/certificates/:id/images/:imageId - Get image details
  fastify.get<{ Params: { id: string; imageId: string } }>('/:imageId', {
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const userId = request.user!.sub
    const userRole = request.user!.role
    const tenantId = request.tenantId
    const { id, imageId } = request.params

    // Verify certificate exists and user has access
    const certificate = await prisma.certificate.findUnique({
      where: { id },
      select: { id: true, tenantId: true, createdById: true, reviewerId: true },
    })

    if (!certificate) {
      return reply.status(404).send({ error: 'Certificate not found' })
    }

    if (certificate.tenantId !== tenantId) {
      return reply.status(403).send({ error: 'Access denied' })
    }

    const isCreator = certificate.createdById === userId
    const isReviewer = certificate.reviewerId === userId
    const isAdmin = userRole === 'ADMIN'

    if (!isCreator && !isReviewer && !isAdmin) {
      return reply.status(403).send({ error: 'Access denied' })
    }

    const image = await prisma.certificateImage.findFirst({
      where: {
        id: imageId,
        certificateId: id,
      },
      include: {
        uploadedBy: {
          select: { id: true, name: true, email: true },
        },
        supersedes: {
          select: {
            id: true,
            version: true,
            uploadedAt: true,
            archivedAt: true,
          },
          orderBy: { version: 'desc' },
        },
      },
    })

    if (!image) {
      return reply.status(404).send({ error: 'Image not found' })
    }

    // Generate signed URLs
    const storage = getImageStorageProvider()

    let thumbnailUrl: string | null = null
    let optimizedUrl: string | null = null
    let originalUrl: string | null = null

    try {
      if (image.thumbnailKey) {
        thumbnailUrl = await storage.getSignedUrl(image.thumbnailKey, { expiresInMinutes: 60 })
      }
      if (image.optimizedKey) {
        optimizedUrl = await storage.getSignedUrl(image.optimizedKey, { expiresInMinutes: 60 })
      }
      originalUrl = await storage.getSignedUrl(image.storageKey, { expiresInMinutes: 60 })
    } catch {
      // URL generation failed
    }

    return {
      image: {
        id: image.id,
        imageType: image.imageType,
        masterInstrumentIndex: image.masterInstrumentIndex,
        parameterIndex: image.parameterIndex,
        pointNumber: image.pointNumber,
        fileName: image.fileName,
        fileSize: image.fileSize,
        mimeType: image.mimeType,
        caption: image.caption,
        version: image.version,
        isLatest: image.isLatest,
        archivedAt: image.archivedAt?.toISOString() ?? null,
        uploadedAt: image.uploadedAt.toISOString(),
        uploadedBy: image.uploadedBy,
        certificateRevision: image.certificateRevision,
        thumbnailUrl,
        optimizedUrl,
        originalUrl,
        storageProvider: 'gcs',
        previousVersions: image.supersedes.map((prev: (typeof image.supersedes)[number]) => ({
          id: prev.id,
          version: prev.version,
          uploadedAt: prev.uploadedAt.toISOString(),
          archivedAt: prev.archivedAt?.toISOString() ?? null,
        })),
      },
    }
  })

  // PATCH /api/certificates/:id/images/:imageId - Update image caption
  fastify.patch<{ Params: { id: string; imageId: string } }>('/:imageId', {
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const userId = request.user!.sub
    const userRole = request.user!.role
    const tenantId = request.tenantId
    const { id, imageId } = request.params
    const body = request.body as { caption?: string }

    // Verify certificate exists and user can edit
    const certificate = await prisma.certificate.findUnique({
      where: { id },
      select: { id: true, tenantId: true, createdById: true },
    })

    if (!certificate) {
      return reply.status(404).send({ error: 'Certificate not found' })
    }

    if (certificate.tenantId !== tenantId) {
      return reply.status(403).send({ error: 'Access denied' })
    }

    const isCreator = certificate.createdById === userId
    const isAdmin = userRole === 'ADMIN'

    if (!isCreator && !isAdmin) {
      return reply.status(403).send({ error: 'Access denied' })
    }

    // Verify image exists and belongs to certificate
    const image = await prisma.certificateImage.findFirst({
      where: {
        id: imageId,
        certificateId: id,
      },
    })

    if (!image) {
      return reply.status(404).send({ error: 'Image not found' })
    }

    // Update caption
    const updated = await prisma.certificateImage.update({
      where: { id: imageId },
      data: { caption: body.caption ?? null },
      select: {
        id: true,
        caption: true,
      },
    })

    return { image: updated }
  })

  // DELETE /api/certificates/:id/images/:imageId - Archive image (soft delete)
  fastify.delete<{ Params: { id: string; imageId: string } }>('/:imageId', {
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const userId = request.user!.sub
    const userRole = request.user!.role
    const tenantId = request.tenantId
    const { id, imageId } = request.params

    // Verify certificate exists and user can delete
    const certificate = await prisma.certificate.findUnique({
      where: { id },
      select: { id: true, tenantId: true, createdById: true },
    })

    if (!certificate) {
      return reply.status(404).send({ error: 'Certificate not found' })
    }

    if (certificate.tenantId !== tenantId) {
      return reply.status(403).send({ error: 'Access denied' })
    }

    const isCreator = certificate.createdById === userId
    const isAdmin = userRole === 'ADMIN'

    if (!isCreator && !isAdmin) {
      return reply.status(403).send({ error: 'Access denied' })
    }

    // Verify image exists and belongs to certificate
    const image = await prisma.certificateImage.findFirst({
      where: {
        id: imageId,
        certificateId: id,
        isLatest: true, // Can only delete latest version
      },
    })

    if (!image) {
      return reply.status(404).send({ error: 'Image not found or already archived' })
    }

    // Soft delete: mark as archived, not latest
    await prisma.certificateImage.update({
      where: { id: imageId },
      data: {
        isLatest: false,
        archivedAt: new Date(),
      },
    })

    return { success: true }
  })

  // GET /api/certificates/:id/images/:imageId/file - Download the image file
  fastify.get<{ Params: { id: string; imageId: string } }>('/:imageId/file', {
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const userId = request.user!.sub
    const userRole = request.user!.role
    const tenantId = request.tenantId
    const { id, imageId } = request.params
    const query = request.query as { variant?: string; download?: string }

    // Verify certificate exists and user has access
    const certificate = await prisma.certificate.findUnique({
      where: { id },
      select: { id: true, tenantId: true, createdById: true, reviewerId: true },
    })

    if (!certificate) {
      return reply.status(404).send({ error: 'Certificate not found' })
    }

    if (certificate.tenantId !== tenantId) {
      return reply.status(403).send({ error: 'Access denied' })
    }

    const isCreator = certificate.createdById === userId
    const isReviewer = certificate.reviewerId === userId
    const isAdmin = userRole === 'ADMIN'

    if (!isCreator && !isReviewer && !isAdmin) {
      return reply.status(403).send({ error: 'Access denied' })
    }

    // Get image record
    const image = await prisma.certificateImage.findFirst({
      where: {
        id: imageId,
        certificateId: id,
      },
    })

    if (!image) {
      return reply.status(404).send({ error: 'Image not found' })
    }

    // Determine which variant to serve
    const variant = query.variant || 'optimized'

    let storageKey: string
    let mimeType: string = image.mimeType

    switch (variant) {
      case 'thumbnail':
        if (image.thumbnailKey) {
          storageKey = image.thumbnailKey
          mimeType = 'image/jpeg'
        } else {
          storageKey = image.storageKey
        }
        break

      case 'optimized':
        if (image.optimizedKey) {
          storageKey = image.optimizedKey
          mimeType = 'image/jpeg'
        } else {
          storageKey = image.storageKey
        }
        break

      case 'original':
      default:
        storageKey = image.storageKey
        break
    }

    // Download from storage
    const storage = getImageStorageProvider()
    let buffer: Buffer

    try {
      buffer = await storage.download(storageKey)
    } catch (error) {
      fastify.log.error({ error, storageKey }, 'Image file download error')
      return reply.status(404).send({ error: 'File not found in storage' })
    }

    // Determine content disposition
    const download = query.download === 'true'
    const contentDisposition = download
      ? `attachment; filename="${image.fileName}"`
      : 'inline'

    reply.header('Content-Type', mimeType)
    reply.header('Content-Length', buffer.length.toString())
    reply.header('Content-Disposition', contentDisposition)
    reply.header('Cache-Control', 'private, max-age=3600')

    return reply.send(buffer)
  })

  // POST /api/certificates/:id/images/process-check - Check if images have been processed
  fastify.post<{ Params: { id: string } }>('/process-check', {
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const userId = request.user!.sub
    const userRole = request.user!.role
    const tenantId = request.tenantId
    const { id } = request.params

    // Verify certificate exists
    const certificate = await prisma.certificate.findUnique({
      where: { id },
      select: { id: true, tenantId: true, createdById: true, reviewerId: true },
    })

    if (!certificate) {
      return reply.status(404).send({ error: 'Certificate not found' })
    }

    if (certificate.tenantId !== tenantId) {
      return reply.status(403).send({ error: 'Access denied' })
    }

    const isCreator = certificate.createdById === userId
    const isReviewer = certificate.reviewerId === userId
    const isAdmin = userRole === 'ADMIN'

    if (!isCreator && !isReviewer && !isAdmin) {
      return reply.status(403).send({ error: 'Access denied' })
    }

    // Get all images that don't have optimized/thumbnail keys yet
    const pendingImages = await prisma.certificateImage.findMany({
      where: {
        certificateId: id,
        isLatest: true,
        OR: [
          { optimizedKey: null },
          { thumbnailKey: null },
        ],
      },
      select: {
        id: true,
        storageKey: true,
        optimizedKey: true,
        thumbnailKey: true,
      },
    })

    if (pendingImages.length === 0) {
      return {
        processed: true,
        message: 'All images have been processed',
        pendingCount: 0,
      }
    }

    const storage = getImageStorageProvider()
    const updatedImages: string[] = []
    let stillPending = 0

    for (const image of pendingImages) {
      const variants = getImageVariantKeys(image.storageKey)
      let needsUpdate = false
      let optimizedKey = image.optimizedKey
      let thumbnailKey = image.thumbnailKey

      // Check if optimized version exists
      if (!image.optimizedKey) {
        const optimizedExists = await storage.exists(variants.optimized)
        if (optimizedExists) {
          optimizedKey = variants.optimized
          needsUpdate = true
        }
      }

      // Check if thumbnail version exists
      if (!image.thumbnailKey) {
        const thumbnailExists = await storage.exists(variants.thumbnail)
        if (thumbnailExists) {
          thumbnailKey = variants.thumbnail
          needsUpdate = true
        }
      }

      // Update database if variants were found
      if (needsUpdate) {
        await prisma.certificateImage.update({
          where: { id: image.id },
          data: {
            optimizedKey,
            thumbnailKey,
          },
        })
        updatedImages.push(image.id)
      } else {
        stillPending++
      }
    }

    return {
      processed: stillPending === 0,
      message: stillPending === 0
        ? 'All images have been processed'
        : `${stillPending} images still processing`,
      updatedCount: updatedImages.length,
      pendingCount: stillPending,
      updatedImageIds: updatedImages,
    }
  })
}

/**
 * Get the count of existing images for a specific context
 */
async function getExistingImageCount(
  certificateId: string,
  metadata: ImageUploadRequest
): Promise<number> {
  const where: {
    certificateId: string
    imageType: CertificateImageType
    isLatest: boolean
    masterInstrumentIndex?: number | null
    parameterIndex?: number | null
    pointNumber?: number | null
  } = {
    certificateId,
    imageType: metadata.imageType,
    isLatest: true,
  }

  // For reading images, count per point
  if (metadata.imageType === 'READING_UUC' || metadata.imageType === 'READING_MASTER') {
    where.parameterIndex = metadata.parameterIndex ?? null
    where.pointNumber = metadata.pointNumber ?? null
  }

  // For master instrument images, count per instrument
  if (metadata.imageType === 'MASTER_INSTRUMENT') {
    where.masterInstrumentIndex = metadata.masterInstrumentIndex ?? null
  }

  return prisma.certificateImage.count({ where })
}

/**
 * Get the maximum allowed images for a specific context
 */
function getMaxAllowed(
  metadata: ImageUploadRequest,
  _parameters: { results: { pointNumber: number }[] }[]
): number {
  switch (metadata.imageType) {
    case 'UUC':
      return MAX_UUC_IMAGES

    case 'MASTER_INSTRUMENT':
      return MAX_MASTER_IMAGES_PER_INSTRUMENT

    case 'READING_UUC':
    case 'READING_MASTER':
      // Strictly limited to 1 per point
      return 1

    default:
      return 1
  }
}

export default certificateImagesRoutes
