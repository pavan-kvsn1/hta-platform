'use client'

import { useEffect, useState } from 'react'

export function useCountUp(target: number, duration = 1800) {
  const [value, setValue] = useState(0)

  useEffect(() => {
    const totalFrames = 60
    const interval = duration / totalFrames
    let frame = 0

    const timer = setInterval(() => {
      frame++
      const progress = frame / totalFrames
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(Math.round(eased * target))

      if (frame >= totalFrames) clearInterval(timer)
    }, interval)

    return () => clearInterval(timer)
  }, [target, duration])

  return value
}
