'use client'

import { useRef, useState, useImperativeHandle, forwardRef, useCallback } from 'react'

export interface SignatureCanvasHandle {
  clear: () => void
  isEmpty: () => boolean
  toDataURL: () => string
}

interface SignatureCanvasProps {
  width?: number
  height?: number
  strokeColor?: string
  strokeWidth?: number
  onSignatureChange?: (hasSignature: boolean) => void
  className?: string
}

const SignatureCanvas = forwardRef<SignatureCanvasHandle, SignatureCanvasProps>(
  function SignatureCanvas(
    {
      width = 400,
      height = 150,
      strokeColor = '#000',
      strokeWidth = 2,
      onSignatureChange,
      className,
    },
    ref
  ) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const [isDrawing, setIsDrawing] = useState(false)
    const [hasSignature, setHasSignature] = useState(false)

    const updateHasSignature = useCallback(
      (value: boolean) => {
        setHasSignature(value)
        onSignatureChange?.(value)
      },
      [onSignatureChange]
    )

    useImperativeHandle(ref, () => ({
      clear: () => {
        const canvas = canvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        updateHasSignature(false)
      },
      isEmpty: () => !hasSignature,
      toDataURL: () => canvasRef.current?.toDataURL('image/png') || '',
    }))

    const getPosition = (
      e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
    ) => {
      const canvas = canvasRef.current
      if (!canvas) return { x: 0, y: 0 }
      const rect = canvas.getBoundingClientRect()

      // Get client coordinates
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY

      // Scale from display coordinates to canvas internal coordinates
      const scaleX = canvas.width / rect.width
      const scaleY = canvas.height / rect.height

      const x = (clientX - rect.left) * scaleX
      const y = (clientY - rect.top) * scaleY
      return { x, y }
    }

    const startDrawing = (
      e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
    ) => {
      const canvas = canvasRef.current
      if (!canvas) return
      setIsDrawing(true)
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const { x, y } = getPosition(e)
      ctx.beginPath()
      ctx.moveTo(x, y)
    }

    const draw = (
      e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
    ) => {
      if (!isDrawing) return
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const { x, y } = getPosition(e)
      ctx.lineWidth = strokeWidth
      ctx.lineCap = 'round'
      ctx.strokeStyle = strokeColor
      ctx.lineTo(x, y)
      ctx.stroke()
      if (!hasSignature) {
        updateHasSignature(true)
      }
    }

    const stopDrawing = () => {
      setIsDrawing(false)
    }

    return (
      <div className={className}>
        <div className="border-2 border-dashed border-gray-300 rounded-lg bg-gray-50">
          <canvas
            ref={canvasRef}
            width={width}
            height={height}
            className="w-full cursor-crosshair touch-none"
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
            onTouchStart={startDrawing}
            onTouchMove={draw}
            onTouchEnd={stopDrawing}
          />
        </div>
      </div>
    )
  }
)

export default SignatureCanvas
