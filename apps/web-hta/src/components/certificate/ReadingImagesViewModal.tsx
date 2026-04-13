'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  X,
  Loader2,
  Image as ImageIcon,
  ChevronLeft,
  ChevronRight,
  Download,
  AlertCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'

export interface ReadingImageData {
  id: string
  fileName: string
  thumbnailUrl: string | null
  optimizedUrl: string | null
  originalUrl: string | null
}

export interface ParameterReadingImages {
  parameterIndex: number
  parameterName: string
  parameterUnit: string | null
  points: {
    pointNumber: number
    standardReading: string | null
    uucReading: string | null
    uucImage: ReadingImageData | null
    masterImage: ReadingImageData | null
  }[]
}

export interface ReadingImagesViewModalProps {
  isOpen: boolean
  onClose: () => void
  certificateId: string
  parameters: ParameterReadingImages[]
  isLoading?: boolean
  error?: string | null
}

export function ReadingImagesViewModal({
  isOpen,
  onClose,
  parameters,
  isLoading = false,
  error = null,
}: ReadingImagesViewModalProps) {
  const [selectedParamIndex, setSelectedParamIndex] = useState(0)
  const [selectedPointIndex, setSelectedPointIndex] = useState(0)

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedParamIndex(0)
      setSelectedPointIndex(0)
    }
  }, [isOpen])

  const currentParam = parameters[selectedParamIndex]
  const currentPoint = currentParam?.points[selectedPointIndex]
  const totalPoints = currentParam?.points.length ?? 0

  // Navigation functions
  const goToPrevPoint = useCallback(() => {
    if (selectedPointIndex > 0) {
      setSelectedPointIndex(selectedPointIndex - 1)
    } else if (selectedParamIndex > 0) {
      // Go to previous parameter's last point
      const prevParam = parameters[selectedParamIndex - 1]
      setSelectedParamIndex(selectedParamIndex - 1)
      setSelectedPointIndex(prevParam.points.length - 1)
    }
  }, [selectedPointIndex, selectedParamIndex, parameters])

  const goToNextPoint = useCallback(() => {
    if (selectedPointIndex < totalPoints - 1) {
      setSelectedPointIndex(selectedPointIndex + 1)
    } else if (selectedParamIndex < parameters.length - 1) {
      // Go to next parameter's first point
      setSelectedParamIndex(selectedParamIndex + 1)
      setSelectedPointIndex(0)
    }
  }, [selectedPointIndex, totalPoints, selectedParamIndex, parameters.length])

  // Calculate if we can navigate
  const canGoPrev = selectedPointIndex > 0 || selectedParamIndex > 0
  const canGoNext = selectedPointIndex < totalPoints - 1 || selectedParamIndex < parameters.length - 1

  // Handle keyboard navigation
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      } else if (e.key === 'ArrowLeft' && canGoPrev) {
        goToPrevPoint()
      } else if (e.key === 'ArrowRight' && canGoNext) {
        goToNextPoint()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose, canGoPrev, canGoNext, goToPrevPoint, goToNextPoint])

  // Count total images
  const totalImages = parameters.reduce((acc, param) => {
    return acc + param.points.reduce((pAcc, point) => {
      return pAcc + (point.uucImage ? 1 : 0) + (point.masterImage ? 1 : 0)
    }, 0)
  }, 0)

  if (!isOpen) return null

  const renderImagePane = (
    title: string,
    reading: string | null,
    image: ReadingImageData | null
  ) => (
    <div className="flex-1 flex flex-col rounded-xl border border-slate-200 overflow-hidden bg-white">
      {/* Header */}
      <div className="px-5 py-3 border-b border-slate-200 bg-slate-50">
        <h3 className="font-semibold text-slate-800">{title}</h3>
        <p className="text-sm text-slate-600 mt-1">
          Reading: <span className="font-mono font-medium">{reading || '—'}</span>
        </p>
      </div>

      {/* Image area */}
      <div className="flex-1 p-4 flex flex-col min-h-[300px]">
        {image ? (
          <div className="flex-1 relative rounded-xl overflow-hidden bg-slate-100">
            {image.optimizedUrl || image.thumbnailUrl ? (
              <>
                <img
                  src={image.optimizedUrl || image.thumbnailUrl || ''}
                  alt={title}
                  className="w-full h-full object-contain"
                />
                {/* Download button */}
                {image.originalUrl && (
                  <a
                    href={image.originalUrl}
                    download={image.fileName}
                    className="absolute bottom-3 right-3 p-2 rounded-lg bg-black/50 text-white hover:bg-black/70 transition-colors"
                    title="Download original"
                  >
                    <Download className="size-4" />
                  </a>
                )}
              </>
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <div className="text-center">
                  <Loader2 className="w-10 h-10 text-slate-400 animate-spin mx-auto" />
                  <p className="text-sm text-slate-500 mt-2">Processing...</p>
                </div>
              </div>
            )}

            {/* File name overlay */}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-3">
              <p className="text-sm text-white truncate">{image.fileName}</p>
            </div>
          </div>
        ) : (
          <div className="flex-1 border-2 border-dashed border-slate-200 rounded-xl flex flex-col items-center justify-center gap-3 bg-slate-50">
            <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center">
              <ImageIcon className="w-8 h-8 text-slate-300" />
            </div>
            <p className="text-sm text-slate-400">No image uploaded</p>
          </div>
        )}
      </div>
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="bg-slate-100 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-white">
          <div className="flex items-center gap-3">
            <ImageIcon className="size-5 text-slate-600" />
            <h2 className="text-lg font-bold text-slate-800">Calibration Reading Images</h2>
            {totalImages > 0 && (
              <span className="text-sm text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                {totalImages} image{totalImages !== 1 ? 's' : ''}
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
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          {isLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <Loader2 className="size-10 text-slate-400 animate-spin mx-auto" />
                <p className="text-sm text-slate-500 mt-3">Loading images...</p>
              </div>
            </div>
          ) : error ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <AlertCircle className="size-10 text-red-400 mx-auto" />
                <p className="text-sm text-red-600 mt-3">{error}</p>
              </div>
            </div>
          ) : parameters.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <ImageIcon className="size-16 text-slate-200 mx-auto" />
                <p className="text-sm text-slate-500 mt-3">No parameters with images</p>
              </div>
            </div>
          ) : (
            <>
              {/* Parameter Tabs */}
              {parameters.length > 1 && (
                <div className="flex-shrink-0 px-4 py-2 bg-white border-b border-slate-200 overflow-x-auto">
                  <div className="flex gap-2">
                    {parameters.map((param, index) => {
                      const hasImages = param.points.some(p => p.uucImage || p.masterImage)
                      return (
                        <button
                          key={param.parameterIndex}
                          type="button"
                          onClick={() => {
                            setSelectedParamIndex(index)
                            setSelectedPointIndex(0)
                          }}
                          className={cn(
                            'px-3 py-1.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap',
                            selectedParamIndex === index
                              ? 'bg-primary text-white'
                              : hasImages
                              ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                              : 'bg-slate-50 text-slate-400'
                          )}
                        >
                          {param.parameterName}
                          {param.parameterUnit && (
                            <span className="text-xs ml-1 opacity-70">({param.parameterUnit})</span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Point Navigation */}
              <div className="flex-shrink-0 px-4 py-3 bg-white border-b border-slate-200">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-slate-800">
                      {currentParam?.parameterName}
                      {currentParam?.parameterUnit && (
                        <span className="text-slate-500 font-normal ml-1">
                          ({currentParam.parameterUnit})
                        </span>
                      )}
                    </h3>
                    <p className="text-sm text-slate-500">
                      Point {currentPoint?.pointNumber ?? '-'} of {totalPoints}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={goToPrevPoint}
                      disabled={!canGoPrev}
                      className="p-2 rounded-lg hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      title="Previous point (←)"
                    >
                      <ChevronLeft className="size-5" />
                    </button>
                    <span className="text-sm text-slate-600 min-w-[60px] text-center">
                      {selectedPointIndex + 1} / {totalPoints}
                    </span>
                    <button
                      type="button"
                      onClick={goToNextPoint}
                      disabled={!canGoNext}
                      className="p-2 rounded-lg hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      title="Next point (→)"
                    >
                      <ChevronRight className="size-5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Split Pane Images */}
              <div className="flex-1 min-h-0 flex gap-4 p-4 overflow-auto">
                {renderImagePane(
                  'UUC Reading',
                  currentPoint?.uucReading ?? null,
                  currentPoint?.uucImage ?? null
                )}
                {renderImagePane(
                  'Master Reading',
                  currentPoint?.standardReading ?? null,
                  currentPoint?.masterImage ?? null
                )}
              </div>

              {/* Point Thumbnails */}
              {totalPoints > 1 && (
                <div className="flex-shrink-0 px-4 py-3 bg-white border-t border-slate-200 overflow-x-auto">
                  <div className="flex gap-2 justify-center">
                    {currentParam?.points.map((point, index) => {
                      const hasUuc = !!point.uucImage
                      const hasMaster = !!point.masterImage
                      const hasAny = hasUuc || hasMaster

                      return (
                        <button
                          key={point.pointNumber}
                          type="button"
                          onClick={() => setSelectedPointIndex(index)}
                          className={cn(
                            'flex-shrink-0 w-12 h-12 rounded-lg border-2 flex items-center justify-center transition-all',
                            selectedPointIndex === index
                              ? 'border-primary bg-primary/10 text-primary'
                              : hasAny
                              ? 'border-slate-200 bg-white hover:border-slate-400'
                              : 'border-slate-100 bg-slate-50 text-slate-300'
                          )}
                          title={`Point ${point.pointNumber}${hasAny ? '' : ' (no images)'}`}
                        >
                          <span className="text-sm font-medium">{point.pointNumber}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 px-6 py-4 border-t border-slate-200 bg-white flex items-center justify-between">
          <p className="text-xs text-slate-500">
            Use arrow keys to navigate between points
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
