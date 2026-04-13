'use client'

import { useRef, useState, useImperativeHandle, forwardRef, useEffect, useCallback } from 'react'

export interface TypedSignatureHandle {
  clear: () => void
  isEmpty: () => boolean
  toDataURL: () => string
}

interface TypedSignatureProps {
  name: string
  width?: number
  height?: number
  onSignatureReady?: (hasSignature: boolean) => void
  className?: string
}

const TypedSignature = forwardRef<TypedSignatureHandle, TypedSignatureProps>(
  function TypedSignature(
    {
      name,
      width = 400*.8,
      height = 150*.8,
      onSignatureReady,
      className,
    },
    ref
  ) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const [fontLoaded, setFontLoaded] = useState(false)
    const [hasSignature, setHasSignature] = useState(false)

    // Check if font is loaded
    useEffect(() => {
      const checkFont = async () => {
        try {
          await document.fonts.ready
          // Check if Caveat is available
          const fontAvailable = document.fonts.check('600 48px Caveat')
          setFontLoaded(fontAvailable)
          if (!fontAvailable) {
            // Retry after a short delay
            setTimeout(() => {
              setFontLoaded(document.fonts.check('600 48px Caveat'))
            }, 500)
          }
        } catch {
          // Fallback - assume font is available
          setFontLoaded(true)
        }
      }
      checkFont()
    }, [])

    const renderSignature = useCallback(() => {
      const canvas = canvasRef.current
      if (!canvas || !fontLoaded) return false

      const ctx = canvas.getContext('2d')
      if (!ctx) return false

      const trimmedName = name.trim()
      if (!trimmedName) {
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        return false
      }

      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // Set up the font - Caveat semibold 600
      const fontSize = 48
      ctx.font = `600 ${fontSize}px Caveat, cursive`
      ctx.fillStyle = '#000000'
      ctx.textBaseline = 'middle'

      // Measure the text and scale if needed
      let textMetrics = ctx.measureText(trimmedName)
      let actualFontSize = fontSize

      // Scale down if text is too wide (with some padding)
      const maxWidth = canvas.width - 40
      if (textMetrics.width > maxWidth) {
        actualFontSize = Math.floor((fontSize * maxWidth) / textMetrics.width)
        ctx.font = `600 ${actualFontSize}px Caveat, cursive`
        textMetrics = ctx.measureText(trimmedName)
      }

      // Center the text
      const x = (canvas.width - textMetrics.width) / 2
      const y = canvas.height / 2

      // Draw the signature
      ctx.fillText(trimmedName, x, y)

      return true
    }, [name, fontLoaded])

    // Notify when name is valid (for button enable/disable)
    useEffect(() => {
      const hasValidName = name.trim().length > 0
      setHasSignature(hasValidName)
      onSignatureReady?.(hasValidName)
    }, [name, onSignatureReady])

    // Render signature on canvas whenever name or font changes
    useEffect(() => {
      if (fontLoaded) {
        renderSignature()
      }
    }, [name, fontLoaded, renderSignature])

    useImperativeHandle(ref, () => ({
      clear: () => {
        const canvas = canvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        setHasSignature(false)
        onSignatureReady?.(false)
      },
      isEmpty: () => !hasSignature,
      toDataURL: () => {
        if (!hasSignature) return ''
        return canvasRef.current?.toDataURL('image/png') || ''
      },
    }))

    return (
      <div className={className}>
        <div className="border-2 border-dashed border-gray-300 rounded-lg bg-white overflow-hidden">
          {/* Visual preview with actual font */}
          <div
            className="w-full flex items-center justify-center"
            style={{ height: `${height * 0.6}px` }}
          >
            <span
              className="font-signature text-5xl text-gray-800 px-4 text-center"
              style={{
                fontWeight: 600,
                opacity: fontLoaded ? 1 : 0.5,
              }}
            >
              {name.trim() || 'Your signature'}
            </span>
          </div>
          {/* Hidden canvas for export */}
          <canvas
            ref={canvasRef}
            width={width}
            height={height}
            className="hidden"
          />
        </div>
        {!name.trim() && (
          <p className="text-xs text-gray-500 mt-1 text-center">
            Enter your name above to generate signature
          </p>
        )}
      </div>
    )
  }
)

export default TypedSignature
