'use client'

import { apiFetch } from '@/lib/api-client'
import { useState, useCallback, useEffect, useRef } from 'react'
// Mirror of Prisma enum for client-side usage
export type CertificateImageType = 'UUC' | 'MASTER_INSTRUMENT' | 'READING_UUC' | 'READING_MASTER'

export interface CertificateImage {
  id: string
  imageType: CertificateImageType
  masterInstrumentIndex: number | null
  parameterIndex: number | null
  pointNumber: number | null
  fileName: string
  fileSize: number
  mimeType: string
  caption: string | null
  version: number
  uploadedAt: string
  thumbnailUrl: string | null
  optimizedUrl: string | null
  originalUrl: string | null
  isProcessing?: boolean
}

export interface ImageUploadMetadata {
  imageType: CertificateImageType
  masterInstrumentIndex?: number
  parameterIndex?: number
  pointNumber?: number
  caption?: string
}

interface UseCertificateImagesOptions {
  certificateId: string | null
  autoRefresh?: boolean
  refreshInterval?: number
}

interface UseCertificateImagesReturn {
  images: CertificateImage[]
  isLoading: boolean
  error: string | null
  // Upload function
  uploadImage: (file: File, metadata: ImageUploadMetadata) => Promise<CertificateImage | null>
  // Upload with explicit certificate ID (for after auto-save)
  uploadImageWithId: (certificateId: string, file: File, metadata: ImageUploadMetadata) => Promise<CertificateImage | null>
  // Delete function
  deleteImage: (imageId: string) => Promise<boolean>
  // Update caption
  updateCaption: (imageId: string, caption: string) => Promise<boolean>
  // Get images by type
  getImagesByType: (type: CertificateImageType) => CertificateImage[]
  // Get UUC images
  getUucImages: () => CertificateImage[]
  // Get master instrument images
  getMasterImages: (masterIndex: number) => CertificateImage[]
  // Get reading images for a specific point
  getReadingImages: (parameterIndex: number, pointNumber: number) => {
    uuc: CertificateImage | null
    master: CertificateImage | null
  }
  // Check processing status
  checkProcessingStatus: () => Promise<void>
  // Refresh images
  refresh: () => Promise<void>
  // Refresh with explicit certificate ID
  refreshWithId: (certificateId: string) => Promise<void>
}

export function useCertificateImages({
  certificateId,
  autoRefresh = true,
  refreshInterval = 5000,
}: UseCertificateImagesOptions): UseCertificateImagesReturn {
  const [images, setImages] = useState<CertificateImage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null)
  const isRefreshingRef = useRef(false)

  // Fetch images
  const fetchImages = useCallback(async () => {
    if (!certificateId) return

    setIsLoading(true)
    setError(null)

    try {
      const response = await apiFetch(`/api/certificates/${certificateId}/images`)
      if (!response.ok) {
        throw new Error('Failed to fetch images')
      }
      const data = await response.json()
      setImages(data.images || [])
    } catch {
      // Offline fallback: try local draft images then cached images
      const electronAPI = typeof window !== 'undefined'
        ? (window as unknown as { electronAPI?: {
            listImages?: (draftId: string) => Promise<{ id: string; image_type: string; master_instrument_index: number | null; parameter_index: number | null; point_number: number | null; original_name: string | null; mime_type: string | null; size_bytes: number; caption: string | null; created_at: string }[]>
            listCachedImages?: (certId: string) => Promise<{ id: string; imageType: string; masterInstrumentIndex: number | null; parameterIndex: number | null; pointNumber: number | null; fileName: string; mimeType: string; caption: string | null }[]>
          } }).electronAPI
        : undefined
      if (electronAPI) {
        try {
          // Try local draft images first (for offline-created certs)
          if (electronAPI.listImages) {
            const localImgs = await electronAPI.listImages(certificateId)
            if (localImgs?.length) {
              setImages(localImgs.map(img => ({
                id: img.id,
                imageType: (img.image_type || 'UUC') as CertificateImageType,
                masterInstrumentIndex: img.master_instrument_index,
                parameterIndex: img.parameter_index,
                pointNumber: img.point_number,
                fileName: img.original_name || 'image',
                fileSize: img.size_bytes || 0,
                mimeType: img.mime_type || 'image/jpeg',
                caption: img.caption,
                version: 1,
                uploadedAt: img.created_at || new Date().toISOString(),
                thumbnailUrl: null,
                optimizedUrl: null,
                originalUrl: null,
              })))
              return
            }
          }
          // Try cached images (for server-synced certs)
          if (electronAPI.listCachedImages) {
            const cached = await electronAPI.listCachedImages(certificateId)
            if (cached?.length) {
              setImages(cached.map(img => ({
                id: img.id,
                imageType: (img.imageType || 'UUC') as CertificateImageType,
                masterInstrumentIndex: img.masterInstrumentIndex,
                parameterIndex: img.parameterIndex,
                pointNumber: img.pointNumber,
                fileName: img.fileName || 'image',
                fileSize: 0,
                mimeType: img.mimeType || 'image/jpeg',
                caption: img.caption,
                version: 1,
                uploadedAt: new Date().toISOString(),
                thumbnailUrl: null,
                optimizedUrl: null,
                originalUrl: null,
              })))
              return
            }
          }
        } catch { /* fall through */ }
      }
      setError('Images unavailable offline')
    } finally {
      setIsLoading(false)
    }
  }, [certificateId])

  // Initial fetch
  useEffect(() => {
    if (certificateId) {
      fetchImages()
    } else {
      setImages([])
    }
  }, [certificateId, fetchImages])

  // Check processing status and refresh if needed
  const checkProcessingStatus = useCallback(async () => {
    if (!certificateId || isRefreshingRef.current) return

    // Check if any images are still processing
    const hasProcessing = images.some(
      (img) => !img.thumbnailUrl || !img.optimizedUrl
    )

    if (!hasProcessing) return

    isRefreshingRef.current = true

    try {
      const response = await fetch(
        `/api/certificates/${certificateId}/images/process-check`,
        { method: 'POST' }
      )
      if (response.ok) {
        const data = await response.json()
        if (data.updatedCount > 0) {
          // Refresh to get updated URLs
          await fetchImages()
        }
      }
    } catch {
      // Silently ignore errors in background check
    } finally {
      isRefreshingRef.current = false
    }
  }, [certificateId, images, fetchImages])

  // Auto-refresh for processing images
  useEffect(() => {
    if (!autoRefresh || !certificateId) return

    const hasProcessing = images.some(
      (img) => !img.thumbnailUrl || !img.optimizedUrl
    )

    if (hasProcessing) {
      refreshTimerRef.current = setInterval(checkProcessingStatus, refreshInterval)
    }

    return () => {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current)
        refreshTimerRef.current = null
      }
    }
  }, [autoRefresh, certificateId, images, checkProcessingStatus, refreshInterval])

  // Upload image with explicit certificate ID
  const uploadImageWithId = useCallback(
    async (
      certId: string,
      file: File,
      metadata: ImageUploadMetadata
    ): Promise<CertificateImage | null> => {
      // Offline: route to Electron IPC image:save
      const electronAPI = typeof window !== 'undefined'
        ? (window as unknown as { electronAPI?: {
            saveImage?: (draftId: string, meta: unknown, buffer: ArrayBuffer) => Promise<{ success: boolean; id?: string; sizeBytes?: number; error?: string }>
            isOffline?: () => boolean
            isApiReachable?: () => Promise<boolean>
          } }).electronAPI
        : undefined

      if (electronAPI?.saveImage) {
        // Check if offline
        const isOffline = electronAPI.isOffline?.() || false
        let apiReachable = true
        if (!isOffline && electronAPI.isApiReachable) {
          try { apiReachable = await electronAPI.isApiReachable() } catch { apiReachable = false }
        }

        if (isOffline || !apiReachable) {
          const arrayBuffer = await file.arrayBuffer()
          const result = await electronAPI.saveImage(certId, {
            imageType: metadata.imageType,
            masterInstrumentIndex: metadata.masterInstrumentIndex,
            parameterIndex: metadata.parameterIndex,
            pointNumber: metadata.pointNumber,
            originalName: file.name,
            mimeType: file.type,
            caption: metadata.caption,
          }, arrayBuffer)

          if (!result.success) throw new Error(result.error || 'Failed to save image offline')

          const newImage: CertificateImage = {
            id: result.id!,
            imageType: metadata.imageType,
            masterInstrumentIndex: metadata.masterInstrumentIndex ?? null,
            parameterIndex: metadata.parameterIndex ?? null,
            pointNumber: metadata.pointNumber ?? null,
            fileName: file.name,
            fileSize: result.sizeBytes || file.size,
            mimeType: file.type,
            caption: metadata.caption || null,
            version: 1,
            uploadedAt: new Date().toISOString(),
            thumbnailUrl: null,
            optimizedUrl: null,
            originalUrl: null,
          }
          setImages((prev) => [...prev, newImage])
          return newImage
        }
      }

      // Online: normal API upload
      const formData = new FormData()
      formData.append('file', file)
      formData.append('metadata', JSON.stringify(metadata))

      const response = await apiFetch(`/api/certificates/${certId}/images`, {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const errorData = await response.json()
        const errorMsg = errorData.details
          ? `${errorData.error}: ${errorData.details}`
          : errorData.error || 'Failed to upload image'
        throw new Error(errorMsg)
      }

      const data = await response.json()
      const newImage: CertificateImage = {
        ...data.image,
        isProcessing: true,
      }

      setImages((prev) => [...prev, newImage])

      return newImage
    },
    []
  )

  // Upload image (uses hook's certificateId)
  const uploadImage = useCallback(
    async (
      file: File,
      metadata: ImageUploadMetadata
    ): Promise<CertificateImage | null> => {
      if (!certificateId) return null
      return uploadImageWithId(certificateId, file, metadata)
    },
    [certificateId, uploadImageWithId]
  )

  // Refresh with explicit certificate ID
  const refreshWithId = useCallback(async (certId: string) => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await apiFetch(`/api/certificates/${certId}/images`)
      if (!response.ok) {
        throw new Error('Failed to fetch images')
      }
      const data = await response.json()
      setImages(data.images || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch images')
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Delete image
  const deleteImage = useCallback(
    async (imageId: string): Promise<boolean> => {
      if (!certificateId) return false

      const response = await fetch(
        `/api/certificates/${certificateId}/images/${imageId}`,
        { method: 'DELETE' }
      )

      if (!response.ok) {
        throw new Error('Failed to delete image')
      }

      // Remove from local state
      setImages((prev) => prev.filter((img) => img.id !== imageId))

      return true
    },
    [certificateId]
  )

  // Update caption
  const updateCaption = useCallback(
    async (imageId: string, caption: string): Promise<boolean> => {
      if (!certificateId) return false

      const response = await fetch(
        `/api/certificates/${certificateId}/images/${imageId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ caption }),
        }
      )

      if (!response.ok) {
        throw new Error('Failed to update caption')
      }

      // Update local state
      setImages((prev) =>
        prev.map((img) =>
          img.id === imageId ? { ...img, caption } : img
        )
      )

      return true
    },
    [certificateId]
  )

  // Get images by type
  const getImagesByType = useCallback(
    (type: CertificateImageType): CertificateImage[] => {
      return images.filter((img) => img.imageType === type)
    },
    [images]
  )

  // Get UUC images
  const getUucImages = useCallback((): CertificateImage[] => {
    return getImagesByType('UUC')
  }, [getImagesByType])

  // Get master instrument images
  const getMasterImages = useCallback(
    (masterIndex: number): CertificateImage[] => {
      return images.filter(
        (img) =>
          img.imageType === 'MASTER_INSTRUMENT' &&
          img.masterInstrumentIndex === masterIndex
      )
    },
    [images]
  )

  // Get reading images for a specific point
  const getReadingImages = useCallback(
    (
      parameterIndex: number,
      pointNumber: number
    ): { uuc: CertificateImage | null; master: CertificateImage | null } => {
      const uuc = images.find(
        (img) =>
          img.imageType === 'READING_UUC' &&
          img.parameterIndex === parameterIndex &&
          img.pointNumber === pointNumber
      ) || null

      const master = images.find(
        (img) =>
          img.imageType === 'READING_MASTER' &&
          img.parameterIndex === parameterIndex &&
          img.pointNumber === pointNumber
      ) || null

      return { uuc, master }
    },
    [images]
  )

  return {
    images,
    isLoading,
    error,
    uploadImage,
    uploadImageWithId,
    deleteImage,
    updateCaption,
    getImagesByType,
    getUucImages,
    getMasterImages,
    getReadingImages,
    checkProcessingStatus,
    refresh: fetchImages,
    refreshWithId,
  }
}
