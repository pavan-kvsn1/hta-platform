'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import Image from 'next/image'
import {
  Camera,
  Upload,
  X,
  Loader2,
  Image as ImageIcon,
  Trash2,
  ZoomIn,
  AlertCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'

export interface GalleryImage {
  id: string
  fileName: string
  thumbnailUrl: string | null
  optimizedUrl: string | null
  originalUrl: string | null
  caption?: string | null
  isProcessing?: boolean
}

export interface ImageUploadGalleryProps {
  certificateId: string
  imageType: 'UUC' | 'MASTER_INSTRUMENT' | 'READING_UUC' | 'READING_MASTER'
  masterInstrumentIndex?: number
  parameterIndex?: number
  pointNumber?: number
  images: GalleryImage[]
  maxImages: number
  onUpload: (file: File) => Promise<void>
  onDelete: (imageId: string) => Promise<void>
  onCaptionChange?: (imageId: string, caption: string) => Promise<void>
  disabled?: boolean
  compact?: boolean
  className?: string
}

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp']
const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB

export function ImageUploadGallery({
  images,
  maxImages,
  onUpload,
  onDelete,
  disabled = false,
  compact = false,
  className,
}: ImageUploadGalleryProps) {
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [previewImage, setPreviewImage] = useState<GalleryImage | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const canUpload = images.length < maxImages && !disabled && !isUploading

  const handleFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return

      const availableSlots = maxImages - images.length
      if (availableSlots <= 0) {
        setError(`Maximum images (${maxImages}) reached`)
        return
      }

      const invalidFile = files.find(
        (file) => !ACCEPTED_TYPES.includes(file.type) || file.size > MAX_FILE_SIZE
      )
      if (invalidFile) {
        setError(
          !ACCEPTED_TYPES.includes(invalidFile.type)
            ? 'Please select valid image files (JPEG, PNG, HEIC, WebP)'
            : `Images must be at most ${MAX_FILE_SIZE / 1024 / 1024}MB each`
        )
        return
      }

      const filesToUpload = files.slice(0, availableSlots)
      setError(null)
      setIsUploading(true)

      try {
        // Upload sequentially so each request observes the latest server-side limit.
        for (const file of filesToUpload) {
          await onUpload(file)
        }

        if (files.length > availableSlots) {
          setError(`Only ${availableSlots} additional image${availableSlots === 1 ? '' : 's'} could be added`)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to upload image')
      } finally {
        setIsUploading(false)
      }
    },
    [images.length, maxImages, onUpload]
  )

  const handleFileSelect = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files || [])

      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }

      void handleFiles(files)
    },
    [handleFiles]
  )
  const handleDelete = useCallback(
    async (imageId: string) => {
      if (deletingId) return

      setDeletingId(imageId)
      try {
        await onDelete(imageId)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to delete image')
      } finally {
        setDeletingId(null)
      }
    },
    [onDelete, deletingId]
  )

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault()
      event.stopPropagation()

      if (!canUpload) return

      void handleFiles(Array.from(event.dataTransfer.files))
    },
    [canUpload, handleFiles]
  )
  const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
  }, [])

  // Auto-clear error after 5 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [error])

  if (compact) {
    // Compact view: horizontal scroll of small thumbnails
    return (
      <div className={cn('space-y-2', className)}>
        <div className="flex items-center gap-2 overflow-x-auto pb-2">
          {images.map((image) => (
            <div
              key={image.id}
              className="relative flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border border-slate-200 group"
            >
              {image.thumbnailUrl ? (
                <Image
                  src={image.thumbnailUrl}
                  alt={image.fileName}
                  fill
                  className="object-cover"
                  unoptimized
                />
              ) : (
                <div className="w-full h-full bg-slate-100 flex items-center justify-center">
                  {image.isProcessing ? (
                    <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
                  ) : (
                    <ImageIcon className="w-4 h-4 text-slate-400" />
                  )}
                </div>
              )}
              <button
                type="button"
                onClick={() => handleDelete(image.id)}
                disabled={deletingId === image.id}
                className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
              >
                {deletingId === image.id ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <X className="w-3 h-3" />
                )}
              </button>
            </div>
          ))}
          {canUpload && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={!canUpload}
              className="flex-shrink-0 w-16 h-16 rounded-lg border-2 border-dashed border-slate-300 hover:border-primary flex items-center justify-center transition-colors"
            >
              {isUploading ? (
                <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
              ) : (
                <Camera className="w-5 h-5 text-slate-400" />
              )}
            </button>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_TYPES.join(',')}
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />
        {error && (
          <p className="text-xs text-red-500 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            {error}
          </p>
        )}
      </div>
    )
  }

  // Full gallery view
  return (
    <div className={cn('space-y-4', className)}>
      {/* Upload area */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        className={cn(
          'border-2 border-dashed rounded-xl p-6 text-center transition-colors',
          canUpload
            ? 'border-slate-300 hover:border-primary cursor-pointer'
            : 'border-slate-200 bg-slate-50 cursor-not-allowed'
        )}
        onClick={() => canUpload && fileInputRef.current?.click()}
      >
        {isUploading ? (
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
            <p className="text-sm text-slate-600">Uploading...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
              <Upload className="w-6 h-6 text-slate-500" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-700">
                {canUpload
                  ? 'Drop images here or click to upload'
                  : images.length >= maxImages
                    ? 'Maximum images reached'
                    : 'Upload disabled'}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                JPEG, PNG, HEIC, WebP (max {MAX_FILE_SIZE / 1024 / 1024}MB)
              </p>
            </div>
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_TYPES.join(',')}
          multiple
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Error message */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Image grid */}
      {images.length > 0 && (
        <div className="max-h-64 overflow-y-auto pr-1">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(6rem,6rem))] gap-2">
            {images.map((image) => (
              <div
                key={image.id}
                className="relative h-24 w-24 rounded-lg overflow-hidden border border-slate-200 bg-slate-50 group"
              >
                {image.thumbnailUrl ? (
                  <Image
                    src={image.thumbnailUrl}
                    alt={image.fileName}
                    fill
                    className="object-cover"
                    unoptimized
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    {image.isProcessing ? (
                      <div className="text-center">
                        <Loader2 className="w-8 h-8 text-slate-400 animate-spin mx-auto" />
                        <p className="text-xs text-slate-500 mt-2">Processing...</p>
                      </div>
                    ) : (
                      <ImageIcon className="w-8 h-8 text-slate-300" />
                    )}
                  </div>
                )}

                {/* Overlay actions */}
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  {image.optimizedUrl && (
                    <button
                      type="button"
                      onClick={() => setPreviewImage(image)}
                      className="w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-colors"
                    >
                      <ZoomIn className="w-5 h-5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDelete(image.id)}
                    disabled={deletingId === image.id}
                    className="w-10 h-10 rounded-full bg-red-500/80 hover:bg-red-500 flex items-center justify-center text-white transition-colors"
                  >
                    {deletingId === image.id ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Trash2 className="w-5 h-5" />
                    )}
                  </button>
                </div>

                {/* File name overlay */}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                  <p className="text-xs text-white truncate">{image.fileName}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {/* Image count */}
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>
          {images.length} of {maxImages} images
        </span>
        {images.some((img) => img.isProcessing) && (
          <span className="flex items-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" />
            Processing images...
          </span>
        )}
      </div>

      {/* Preview modal */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setPreviewImage(null)}
        >
          <div className="relative max-w-4xl max-h-full" style={{ width: '100%', height: '80vh' }}>
            <Image
              src={previewImage.optimizedUrl || previewImage.originalUrl || ''}
              alt={previewImage.fileName}
              fill
              className="object-contain rounded-lg"
              unoptimized
            />
            <button
              type="button"
              onClick={() => setPreviewImage(null)}
              className="absolute top-2 right-2 w-10 h-10 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center text-white transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
            <div className="absolute bottom-2 left-2 right-2 bg-black/50 rounded-lg p-2">
              <p className="text-white text-sm truncate">{previewImage.fileName}</p>
              {previewImage.caption && (
                <p className="text-white/80 text-xs mt-1">{previewImage.caption}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
