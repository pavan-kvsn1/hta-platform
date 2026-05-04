'use client'

import { useState, useEffect } from 'react'
import { WifiOff } from 'lucide-react'

/**
 * Connectivity pill for the Electron desktop app.
 * Self-hides when running in a normal browser (electronAPI not present).
 */
export function OfflineIndicator() {
  const [offline, setOffline] = useState(false)
  const [isElectron, setIsElectron] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || !window.electronAPI) return
    setIsElectron(true)

    const check = () => setOffline(window.electronAPI!.isOffline())
    check()

    window.addEventListener('online', check)
    window.addEventListener('offline', check)
    const interval = setInterval(check, 5000)

    return () => {
      window.removeEventListener('online', check)
      window.removeEventListener('offline', check)
      clearInterval(interval)
    }
  }, [])

  if (!isElectron || !offline) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 px-3 py-2 bg-amber-100 border border-amber-300 rounded-full shadow-lg print:hidden">
      <WifiOff className="h-4 w-4 text-amber-700" />
      <span className="text-xs font-medium text-amber-800">Offline Mode</span>
    </div>
  )
}
