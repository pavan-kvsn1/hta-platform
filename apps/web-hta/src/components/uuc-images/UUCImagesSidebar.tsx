'use client'

import { apiFetch } from '@/lib/api-client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import {
  ImageIcon,
  ChevronLeft,
  ChevronRight,
  X,
  Download,
  ZoomIn,
  Loader2,
  Camera,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface UUCImage {
  id: string
  fileName: string
  fileSize: number
  mimeType: string
  caption: string | null
  sortOrder: number
  createdAt: string
}

interface UUCImagesSidebarProps {
  certificateId: string
  className?: string
}

export function UUCImagesSidebar({
  certificateId,
  className,
}: UUCImagesSidebarProps) {
  const [images, setImages] = useState<UUCImage[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)

  useEffect(() => {
    const fetchImages = async () => {
      try {
        setIsLoading(true)
        setError(null)
        const res = await apiFetch(`/api/certificates/${certificateId}/uuc-images`)

        if (!res.ok) {
          throw new Error('Failed to load images')
        }

        const data = await res.json()
        setImages(data.images || [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load images')
      } finally {
        setIsLoading(false)
      }
    }

    fetchImages()
  }, [certificateId])

  const handlePrevious = () => {
    if (selectedIndex === null || selectedIndex <= 0) return
    setSelectedIndex(selectedIndex - 1)
  }

  const handleNext = () => {
    if (selectedIndex === null || selectedIndex >= images.length - 1) return
    setSelectedIndex(selectedIndex + 1)
  }

  const handleDownload = async (image: UUCImage) => {
    try {
      const res = await apiFetch(`/api/certificates/${certificateId}/uuc-images/${image.id}/file`)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = image.fileName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Download failed:', err)
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const selectedImage = selectedIndex !== null ? images[selectedIndex] : null

  return (
    <div className={cn('bg-white rounded-lg border shadow-sm', className)}>
      {/* Header */}
      <div className="px-4 py-3 border-b bg-gray-50">
        <div className="flex items-center gap-2">
          <Camera className="h-4 w-4 text-gray-500" />
          <h3 className="font-semibold text-gray-900 text-sm">UUC Reading Images</h3>
          {images.length > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-600 font-medium">
              {images.length}
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500 mt-1">
          Internal reference only - not included in PDF
        </p>
      </div>

      {/* Content */}
      <div className="p-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 text-gray-400 animate-spin" />
          </div>
        ) : error ? (
          <div className="text-center py-8 text-sm text-red-600">{error}</div>
        ) : images.length === 0 ? (
          <div className="text-center py-8">
            <ImageIcon className="h-10 w-10 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500">No UUC images uploaded</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {images.map((image, index) => (
              <button
                key={image.id}
                onClick={() => setSelectedIndex(index)}
                className="relative aspect-square rounded-lg overflow-hidden border hover:ring-2 hover:ring-blue-400 transition-all group"
              >
                <Image
                  src={`/api/certificates/${certificateId}/uuc-images/${image.id}/file`}
                  alt={image.caption || `UUC Image ${index + 1}`}
                  fill
                  className="object-cover"
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                  <ZoomIn className="h-5 w-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Lightbox Modal */}
      {selectedImage && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center">
          {/* Close Button */}
          <button
            onClick={() => setSelectedIndex(null)}
            className="absolute top-4 right-4 p-2 text-white/80 hover:text-white transition-colors"
          >
            <X className="h-6 w-6" />
          </button>

          {/* Navigation */}
          <button
            onClick={handlePrevious}
            disabled={selectedIndex === 0}
            className={cn(
              'absolute left-4 p-2 text-white/80 hover:text-white transition-colors',
              selectedIndex === 0 && 'opacity-30 cursor-not-allowed'
            )}
          >
            <ChevronLeft className="h-8 w-8" />
          </button>

          <button
            onClick={handleNext}
            disabled={selectedIndex === images.length - 1}
            className={cn(
              'absolute right-4 p-2 text-white/80 hover:text-white transition-colors',
              selectedIndex === images.length - 1 && 'opacity-30 cursor-not-allowed'
            )}
          >
            <ChevronRight className="h-8 w-8" />
          </button>

          {/* Image */}
          <div className="max-w-4xl max-h-[80vh] relative">
            <Image
              src={`/api/certificates/${certificateId}/uuc-images/${selectedImage.id}/file`}
              alt={selectedImage.caption || 'UUC Image'}
              width={1200}
              height={800}
              className="object-contain max-h-[80vh]"
            />
          </div>

          {/* Footer Info */}
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
            <div className="max-w-4xl mx-auto flex items-center justify-between text-white">
              <div>
                <p className="font-medium">
                  {selectedImage.caption || selectedImage.fileName}
                </p>
                <p className="text-sm text-white/70">
                  {selectedIndex! + 1} of {images.length} • {formatFileSize(selectedImage.fileSize)}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleDownload(selectedImage)}
                className="text-white border-white/50 hover:bg-white/20"
              >
                <Download className="h-4 w-4 mr-2" />
                Download
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
