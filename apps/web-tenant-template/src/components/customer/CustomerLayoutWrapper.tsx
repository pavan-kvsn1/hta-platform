'use client'

import { useState, useEffect, ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { CustomerPortalHeader } from './CustomerPortalHeader'
import { AppFooter } from '@/components/layout/AppFooter'

interface CustomerLayoutWrapperProps {
  children: ReactNode
  companyName: string
  isPrimaryPoc: boolean
}

const STORAGE_KEY = 'customer-sidebar-collapsed'

export function CustomerLayoutWrapper({
  children,
  companyName,
  isPrimaryPoc
}: CustomerLayoutWrapperProps) {
  const [isCollapsed, setIsCollapsed] = useState(false)

  useEffect(() => {
    // Initial load from localStorage
    const checkCollapsed = () => {
      const saved = localStorage.getItem(STORAGE_KEY)
      setIsCollapsed(saved === 'true')
    }

    checkCollapsed()

    // Listen for storage changes (cross-tab)
    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        setIsCollapsed(e.newValue === 'true')
      }
    }

    // Listen for custom events (same tab)
    const handleCustomEvent = () => checkCollapsed()

    window.addEventListener('storage', handleStorage)
    window.addEventListener('customer-sidebar-toggle', handleCustomEvent)

    return () => {
      window.removeEventListener('storage', handleStorage)
      window.removeEventListener('customer-sidebar-toggle', handleCustomEvent)
    }
  }, [])

  return (
    <div
      className={cn(
        'h-screen flex flex-col transition-all duration-200 overflow-hidden',
        isCollapsed ? 'ml-16' : 'ml-56'
      )}
    >
      {/* Green Header Banner */}
      <div className="flex-shrink-0">
        <CustomerPortalHeader
          companyName={companyName}
          isPrimaryPoc={isPrimaryPoc}
        />
      </div>

      {/* Main Content - fills remaining height */}
      <main className="flex-1 overflow-auto flex flex-col">
        <div className="flex-1">{children}</div>
        <AppFooter />
      </main>
    </div>
  )
}
