'use client'

import { useState, useEffect } from 'react'
import {
  X,
  Loader2,
  Image as ImageIcon,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  Download,
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
  uploadedAt?: string
}

export interface ImageGalleryModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  images: GalleryImage[]
  isLoading?: boolean
  error?: string | null
}

export function ImageGalleryModal({
  isOpen,
  onClose,
  title,
  images,
  isLoading = false,
  error = null,
}: ImageGalleryModalProps) {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [isZoomed, setIsZoomed] = useState(false)

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedIndex(0)
      setIsZoomed(false)
    }
  }, [isOpen])

  // Handle keyboard navigation
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isZoomed) {
          setIsZoomed(false)
        } else {
          onClose()
        }
      } else if (e.key === 'ArrowLeft' && selectedIndex > 0) {
        setSelectedIndex(selectedIndex - 1)
      } else if (e.key === 'ArrowRight' && selectedIndex < images.length - 1) {
        setSelectedIndex(selectedIndex + 1)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose, selectedIndex, images.length, isZoomed])

  if (!isOpen) return null

  const selectedImage = images[selectedIndex]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <ImageIcon className="size-5 text-slate-600" />
            <h2 className="text-lg font-bold text-slate-800">{title}</h2>
            {images.length > 0 && (
              <span className="text-sm text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                {images.length} image{images.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <Loader2 className="size-10 text-slate-400 animate-spin mx-auto" />
                <p className="text-sm text-slate-500 mt-3">Loading images...</p>
              </div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <AlertCircle className="size-10 text-red-400 mx-auto" />
                <p className="text-sm text-red-600 mt-3">{error}</p>
              </div>
            </div>
          ) : images.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <ImageIcon className="size-16 text-slate-200 mx-auto" />
                <p className="text-sm text-slate-500 mt-3">No images uploaded</p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col h-full">
              {/* Main Image View */}
              <div className="flex-1 min-h-0 p-4 flex items-center justify-center bg-slate-50 relative">
                {/* Navigation Arrows */}
                {images.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={() => setSelectedIndex(Math.max(0, selectedIndex - 1))}
                      disabled={selectedIndex === 0}
                      className="absolute left-4 p-2 rounded-full bg-white/90 shadow-lg hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed transition-all z-10"
                    >
                      <ChevronLeft className="size-6" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedIndex(Math.min(images.length - 1, selectedIndex + 1))}
                      disabled={selectedIndex === images.length - 1}
                      className="absolute right-4 p-2 rounded-full bg-white/90 shadow-lg hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed transition-all z-10"
                    >
                      <ChevronRight className="size-6" />
                    </button>
                  </>
                )}

                {/* Image */}
                {selectedImage && (
                  <div className="relative max-h-full max-w-full">
                    <img
                      src={selectedImage.optimizedUrl || selectedImage.originalUrl || ''}
                      alt={selectedImage.fileName}
                      className={cn(
                        'max-h-[50vh] max-w-full object-contain rounded-lg shadow-lg transition-transform',
                        isZoomed && 'scale-150 cursor-zoom-out'
                      )}
                      onClick={() => setIsZoomed(!isZoomed)}
                    />

                    {/* Image Actions */}
                    <div className="absolute bottom-3 right-3 flex gap-2">
                      <button
                        type="button"
                        onClick={() => setIsZoomed(!isZoomed)}
                        className="p-2 rounded-lg bg-black/50 text-white hover:bg-black/70 transition-colors"
                        title="Toggle zoom"
                      >
                        <ZoomIn className="size-4" />
                      </button>
                      {selectedImage.originalUrl && (
                        <a
                          href={selectedImage.originalUrl}
                          download={selectedImage.fileName}
                          className="p-2 rounded-lg bg-black/50 text-white hover:bg-black/70 transition-colors"
                          title="Download original"
                        >
                          <Download className="size-4" />
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Image Info */}
              {selectedImage && (
                <div className="px-4 py-2 bg-slate-100 border-t border-slate-200 text-center">
                  <p className="text-sm font-medium text-slate-700 truncate">
                    {selectedImage.fileName}
                  </p>
                  {selectedImage.caption && (
                    <p className="text-xs text-slate-500 mt-0.5">{selectedImage.caption}</p>
                  )}
                </div>
              )}

              {/* Thumbnail Strip */}
              {images.length > 1 && (
                <div className="flex-shrink-0 p-3 bg-white border-t border-slate-200 overflow-x-auto">
                  <div className="flex gap-2 justify-center">
                    {images.map((image, index) => (
                      <button
                        key={image.id}
                        type="button"
                        onClick={() => setSelectedIndex(index)}
                        className={cn(
                          'flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-all',
                          selectedIndex === index
                            ? 'border-primary ring-2 ring-primary/30'
                            : 'border-slate-200 hover:border-slate-400'
                        )}
                      >
                        {image.thumbnailUrl || image.optimizedUrl ? (
                          <img
                            src={image.thumbnailUrl || image.optimizedUrl || ''}
                            alt={image.fileName}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full bg-slate-100 flex items-center justify-center">
                            <ImageIcon className="size-6 text-slate-300" />
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 px-6 py-4 border-t border-slate-200 bg-white flex items-center justify-between">
          <p className="text-xs text-slate-500">
            Use arrow keys to navigate
          </p>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg transition-colors text-sm font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
