'use client'

import { useState, useRef, useCallback } from 'react'
import Image from 'next/image'
import { Button as _Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Camera,
  Upload,
  X,
  Loader2,
  GripVertical,
  ImageIcon,
  AlertCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface UUCImage {
  id: string
  fileName: string
  fileSize: number
  mimeType: string
  storagePath: string
  caption: string | null
  sortOrder: number
  previewUrl?: string // For newly uploaded images before save
}

interface UUCImageUploadProps {
  certificateId?: string // Optional - if editing existing certificate
  images: UUCImage[]
  onChange: (images: UUCImage[]) => void
  maxImages?: number
  maxSizeMB?: number
  className?: string
  disabled?: boolean
}

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/heic', 'image/heif']
const DEFAULT_MAX_SIZE_MB = 10

export function UUCImageUpload({
  certificateId,
  images,
  onChange,
  maxImages = 10,
  maxSizeMB = DEFAULT_MAX_SIZE_MB,
  className,
  disabled = false,
}: UUCImageUploadProps) {
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      setUploadError(null)
      const fileArray = Array.from(files)

      // Validate file count
      if (images.length + fileArray.length > maxImages) {
        setUploadError(`Maximum ${maxImages} images allowed`)
        return
      }

      // Validate files
      const validFiles: File[] = []
      for (const file of fileArray) {
        if (!ACCEPTED_TYPES.includes(file.type)) {
          setUploadError(`Invalid file type: ${file.name}. Accepted: JPEG, PNG, HEIC`)
          return
        }
        if (file.size > maxSizeMB * 1024 * 1024) {
          setUploadError(`File too large: ${file.name}. Maximum ${maxSizeMB}MB`)
          return
        }
        validFiles.push(file)
      }

      if (validFiles.length === 0) return

      setIsUploading(true)

      try {
        // If we have a certificateId, upload to server immediately
        if (certificateId) {
          const formData = new FormData()
          validFiles.forEach((file) => formData.append('files', file))

          const res = await fetch(`/api/certificates/${certificateId}/uuc-images`, {
            method: 'POST',
            body: formData,
          })

          if (!res.ok) {
            const data = await res.json()
            throw new Error(data.error || 'Upload failed')
          }

          const data = await res.json()
          onChange([...images, ...data.images])
        } else {
          // No certificateId - store locally with preview URLs
          const newImages: UUCImage[] = await Promise.all(
            validFiles.map(async (file, index) => ({
              id: `temp-${Date.now()}-${index}`,
              fileName: file.name,
              fileSize: file.size,
              mimeType: file.type,
              storagePath: '', // Will be set on server
              caption: null,
              sortOrder: images.length + index,
              previewUrl: URL.createObjectURL(file),
              _file: file, // Store the file for later upload
            }))
          ) as UUCImage[]

          onChange([...images, ...newImages])
        }
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : 'Upload failed')
      } finally {
        setIsUploading(false)
      }
    },
    [certificateId, images, maxImages, maxSizeMB, onChange]
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      if (disabled || isUploading) return
      handleFiles(e.dataTransfer.files)
    },
    [disabled, isUploading, handleFiles]
  )

  const handleRemove = useCallback(
    async (imageId: string) => {
      const imageToRemove = images.find((img) => img.id === imageId)
      if (!imageToRemove) return

      // Revoke object URL if it's a preview
      if (imageToRemove.previewUrl) {
        URL.revokeObjectURL(imageToRemove.previewUrl)
      }

      // If it's a saved image, delete from server
      if (certificateId && !imageId.startsWith('temp-')) {
        try {
          await fetch(`/api/certificates/${certificateId}/uuc-images/${imageId}`, {
            method: 'DELETE',
          })
        } catch (err) {
          console.error('Failed to delete image:', err)
        }
      }

      onChange(images.filter((img) => img.id !== imageId))
    },
    [certificateId, images, onChange]
  )

  const handleCaptionChange = useCallback(
    (imageId: string, caption: string) => {
      onChange(
        images.map((img) =>
          img.id === imageId ? { ...img, caption } : img
        )
      )
    },
    [images, onChange]
  )

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Upload Area */}
      <div
        className={cn(
          'relative border-2 border-dashed rounded-lg p-6 transition-colors',
          dragOver && !disabled ? 'border-blue-400 bg-blue-50' : 'border-gray-300',
          disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-gray-400',
          isUploading && 'pointer-events-none'
        )}
        onDragOver={(e) => {
          e.preventDefault()
          if (!disabled) setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => !disabled && !isUploading && fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_TYPES.join(',')}
          multiple
          className="hidden"
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
          disabled={disabled || isUploading}
        />

        <div className="flex flex-col items-center gap-2 text-center">
          {isUploading ? (
            <>
              <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
              <p className="text-sm text-gray-600">Uploading...</p>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <Camera className="h-6 w-6 text-gray-400" />
                <Upload className="h-6 w-6 text-gray-400" />
              </div>
              <p className="text-sm text-gray-600">
                <span className="font-medium text-blue-600">Click to upload</span> or drag and drop
              </p>
              <p className="text-xs text-gray-500">
                JPEG, PNG, HEIC up to {maxSizeMB}MB ({images.length}/{maxImages} images)
              </p>
            </>
          )}
        </div>
      </div>

      {/* Error Message */}
      {uploadError && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {uploadError}
        </div>
      )}

      {/* Image Grid */}
      {images.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {images.map((image, index) => (
            <div
              key={image.id}
              className="relative group bg-gray-100 rounded-lg overflow-hidden border"
            >
              {/* Drag Handle */}
              <div className="absolute top-1 left-1 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                <GripVertical className="h-4 w-4 text-white drop-shadow" />
              </div>

              {/* Remove Button */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  handleRemove(image.id)
                }}
                className="absolute top-1 right-1 z-10 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                disabled={disabled}
              >
                <X className="h-3 w-3" />
              </button>

              {/* Image Preview */}
              <div className="aspect-square relative">
                {image.previewUrl || image.storagePath ? (
                  <Image
                    src={image.previewUrl || `/api/certificates/${certificateId}/uuc-images/${image.id}/file`}
                    alt={image.caption || `UUC Image ${index + 1}`}
                    fill
                    className="object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <ImageIcon className="h-8 w-8 text-gray-400" />
                  </div>
                )}
              </div>

              {/* Caption Input */}
              <div className="p-2 bg-white border-t">
                <Input
                  type="text"
                  placeholder="Add caption..."
                  value={image.caption || ''}
                  onChange={(e) => handleCaptionChange(image.id, e.target.value)}
                  className="h-7 text-xs"
                  disabled={disabled}
                />
                <p className="text-[10px] text-gray-400 mt-1 truncate">
                  {image.fileName} ({formatFileSize(image.fileSize)})
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Help Text */}
      <p className="text-xs text-gray-500">
        Upload photos of UUC readings. These are for internal reference only and will not appear on the PDF certificate.
      </p>
    </div>
  )
}
