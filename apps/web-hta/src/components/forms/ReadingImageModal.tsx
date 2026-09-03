'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import Image from 'next/image'
import {
  X,
  Camera,
  Download,
  Upload,
  Loader2,
  Image as ImageIcon,
  Trash2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { apiFetch } from '@/lib/api-client'

export interface ReadingImage {
  id: string
  fileName: string
  thumbnailUrl: string | null
  optimizedUrl: string | null
  originalUrl: string | null
  isProcessing?: boolean
}

export interface ReadingImageModalProps {
  isOpen: boolean
  onClose: () => void
  certificateId: string
  parameterIndex: number
  parameterName: string
  pointNumber: number
  standardReading: string
  uucReading: string
  uucImage: ReadingImage | null
  masterImage: ReadingImage | null
  onUploadUuc: (file: File) => Promise<void>
  onUploadMaster: (file: File) => Promise<void>
  onDeleteUuc: (imageId: string) => Promise<void>
  onDeleteMaster: (imageId: string) => Promise<void>
  totalPoints: number
  onNavigate?: (direction: 'prev' | 'next') => void
  disabled?: boolean
}

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp']
const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB

export function ReadingImageModal({
  isOpen,
  onClose,
  certificateId,
  parameterName,
  pointNumber,
  standardReading,
  uucReading,
  uucImage,
  masterImage,
  onUploadUuc,
  onUploadMaster,
  onDeleteUuc,
  onDeleteMaster,
  totalPoints,
  onNavigate,
  disabled = false,
}: ReadingImageModalProps) {
  const [uploadingUuc, setUploadingUuc] = useState(false)
  const [uploadingMaster, setUploadingMaster] = useState(false)
  const [deletingUuc, setDeletingUuc] = useState(false)
  const [deletingMaster, setDeletingMaster] = useState(false)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const uucInputRef = useRef<HTMLInputElement>(null)
  const masterInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      } else if (e.key === 'ArrowLeft' && onNavigate && pointNumber > 1) {
        onNavigate('prev')
      } else if (e.key === 'ArrowRight' && onNavigate && pointNumber < totalPoints) {
        onNavigate('next')
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose, onNavigate, pointNumber, totalPoints])

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [error])

  const handleFileSelect = useCallback(
    async (
      event: React.ChangeEvent<HTMLInputElement>,
      type: 'uuc' | 'master'
    ) => {
      const file = event.target.files?.[0]
      if (!file) return

      const inputRef = type === 'uuc' ? uucInputRef : masterInputRef
      if (inputRef.current) {
        inputRef.current.value = ''
      }

      if (!ACCEPTED_TYPES.includes(file.type)) {
        setError('Please select a valid image file (JPEG, PNG, HEIC, WebP)')
        return
      }

      if (file.size > MAX_FILE_SIZE) {
        setError(`File is too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB`)
        return
      }

      setError(null)

      if (type === 'uuc') {
        setUploadingUuc(true)
        try {
          await onUploadUuc(file)
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to upload UUC image')
        } finally {
          setUploadingUuc(false)
        }
      } else {
        setUploadingMaster(true)
        try {
          await onUploadMaster(file)
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to upload Master image')
        } finally {
          setUploadingMaster(false)
        }
      }
    },
    [onUploadUuc, onUploadMaster]
  )

  const handleDelete = useCallback(
    async (type: 'uuc' | 'master') => {
      if (type === 'uuc' && uucImage) {
        setDeletingUuc(true)
        try {
          await onDeleteUuc(uucImage.id)
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to delete UUC image')
        } finally {
          setDeletingUuc(false)
        }
      } else if (type === 'master' && masterImage) {
        setDeletingMaster(true)
        try {
          await onDeleteMaster(masterImage.id)
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to delete Master image')
        } finally {
          setDeletingMaster(false)
        }
      }
    },
    [uucImage, masterImage, onDeleteUuc, onDeleteMaster]
  )

  const triggerDownload = useCallback((url: string, fileName: string) => {
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }, [])

  const handleDownload = useCallback(
    async (image: ReadingImage) => {
      if (downloadingId) return

      setDownloadingId(image.id)
      setError(null)

      try {
        if (certificateId && certificateId !== 'pending') {
          try {
            const response = await apiFetch(
              `/api/certificates/${certificateId}/images/${image.id}/file?variant=original&download=true`
            )

            if (response.ok) {
              const blob = await response.blob()
              const url = URL.createObjectURL(blob)
              triggerDownload(url, image.fileName)
              URL.revokeObjectURL(url)
              return
            }
          } catch {
            // Fall through to signed URL or Electron local image download.
          }
        }

        const directUrl = image.originalUrl || image.optimizedUrl || image.thumbnailUrl
        if (directUrl) {
          triggerDownload(directUrl, image.fileName)
          return
        }

        const electronAPI = typeof window !== 'undefined'
          ? (window as unknown as { electronAPI?: { getImagePath?: (imageId: string) => Promise<string | null> } }).electronAPI
          : undefined
        const localDataUrl = await electronAPI?.getImagePath?.(image.id)
        if (localDataUrl) {
          triggerDownload(localDataUrl, image.fileName)
          return
        }

        setError('Image is not available for download yet')
      } finally {
        setDownloadingId(null)
      }
    },
    [certificateId, downloadingId, triggerDownload]
  )

  if (!isOpen) return null

  const renderImagePane = (
    title: string,
    reading: string,
    image: ReadingImage | null,
    isUploading: boolean,
    isDeleting: boolean,
    onUploadClick: () => void,
    onDeleteClick: () => void,
    isProcessing?: boolean
  ) => {
    const imageUrl = image?.optimizedUrl || image?.thumbnailUrl || image?.originalUrl || null
    const isDownloading = image ? downloadingId === image.id : false

    return (
      <div className="flex-1 flex flex-col rounded-xl border border-slate-200 overflow-hidden bg-white">
        <div className="px-5 py-3 border-b border-slate-200 bg-slate-50">
          <h3 className="font-semibold text-slate-800">{title}</h3>
          <p className="text-sm text-slate-600 mt-1">
            Reading: <span className="font-mono font-medium">{reading || '-'}</span>
          </p>
        </div>

        <div className="p-4 flex flex-col items-center gap-3">
          {image ? (
            <div className="relative h-44 w-full max-w-[260px] rounded-xl overflow-hidden border border-slate-200 bg-slate-100">
              {imageUrl ? (
                <Image
                  src={imageUrl}
                  alt={title}
                  fill
                  className="object-contain"
                  unoptimized
                />
              ) : isProcessing || image.isProcessing ? (
                <div className="w-full h-full flex items-center justify-center">
                  <div className="text-center">
                    <Loader2 className="w-10 h-10 text-slate-400 animate-spin mx-auto" />
                    <p className="text-sm text-slate-500 mt-2">Processing...</p>
                  </div>
                </div>
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <ImageIcon className="w-12 h-12 text-slate-300" />
                </div>
              )}

              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-3">
                <p className="text-sm text-white truncate">{image.fileName}</p>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={onUploadClick}
              disabled={disabled || isUploading}
              className={cn(
                'h-44 w-full max-w-[260px] border-2 border-dashed rounded-xl flex flex-col items-center justify-center gap-3 transition-colors',
                disabled || isUploading
                  ? 'border-slate-200 bg-slate-50 cursor-not-allowed'
                  : 'border-slate-300 hover:border-primary hover:bg-primary/5 cursor-pointer'
              )}
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-10 h-10 text-primary animate-spin" />
                  <p className="text-sm text-slate-600">Uploading...</p>
                </>
              ) : (
                <>
                  <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center">
                    <Camera className="w-8 h-8 text-slate-500" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium text-slate-700">
                      Click to upload {title.toLowerCase()} photo
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      JPEG, PNG, HEIC, WebP
                    </p>
                  </div>
                </>
              )}
            </button>
          )}

          {image && (
            <div className="flex w-full max-w-[260px] items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => handleDownload(image)}
                disabled={isDownloading}
                className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md border border-blue-600 bg-blue-600 px-2.5 text-xs font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-wait disabled:opacity-80"
                title="Download image"
              >
                {isDownloading ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Download className="size-3.5" />
                )}
                Download
              </button>

              {!disabled && (
                <>
                  <button
                    type="button"
                    onClick={onUploadClick}
                    disabled={isUploading}
                    className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isUploading ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Upload className="size-3.5" />
                    )}
                    Replace
                  </button>
                  <button
                    type="button"
                    onClick={onDeleteClick}
                    disabled={isDeleting}
                    className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md border border-red-200 bg-white px-2.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isDeleting ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="size-3.5" />
                    )}
                    Delete
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="bg-slate-100 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[80vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-slate-200 bg-white">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-bold text-slate-800">
              Point {pointNumber} Photos
            </h2>
            <span className="text-sm text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
              {parameterName}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {onNavigate && (
              <div className="flex items-center gap-1 mr-2">
                <button
                  type="button"
                  onClick={() => onNavigate('prev')}
                  disabled={pointNumber <= 1}
                  className="p-2 rounded-lg hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Previous point"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <span className="text-sm text-slate-500">
                  {pointNumber} / {totalPoints}
                </span>
                <button
                  type="button"
                  onClick={() => onNavigate('next')}
                  disabled={pointNumber >= totalPoints}
                  className="p-2 rounded-lg hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Next point"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
              aria-label="Close image modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {error && (
          <div className="mx-4 mt-4 flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        <div className="flex-1 flex min-h-0 m-4 gap-4">
          {renderImagePane(
            'UUC Reading',
            uucReading,
            uucImage,
            uploadingUuc,
            deletingUuc,
            () => uucInputRef.current?.click(),
            () => handleDelete('uuc'),
            uucImage?.isProcessing
          )}

          {renderImagePane(
            'Standard Meter Reading',
            standardReading,
            masterImage,
            uploadingMaster,
            deletingMaster,
            () => masterInputRef.current?.click(),
            () => handleDelete('master'),
            masterImage?.isProcessing
          )}
        </div>

        <input
          ref={uucInputRef}
          type="file"
          accept={ACCEPTED_TYPES.join(',')}
          onChange={(e) => handleFileSelect(e, 'uuc')}
          className="hidden"
        />
        <input
          ref={masterInputRef}
          type="file"
          accept={ACCEPTED_TYPES.join(',')}
          onChange={(e) => handleFileSelect(e, 'master')}
          className="hidden"
        />

        <div className="p-4 border-t border-slate-200 bg-white flex items-center justify-between">
          <p className="text-xs text-slate-500">
            Use left and right arrow keys to navigate between points
          </p>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
