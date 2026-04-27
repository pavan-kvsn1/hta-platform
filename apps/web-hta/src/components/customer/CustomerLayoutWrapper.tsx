'use client'

import { useState, useEffect, ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { AppFooter } from '@/components/layout/AppFooter'

interface CustomerLayoutWrapperProps {
  children: ReactNode
  companyName: string
  isPrimaryPoc: boolean
}

const STORAGE_KEY = 'customer-sidebar-collapsed'

export function CustomerLayoutWrapper({
  children,
}: CustomerLayoutWrapperProps) {
  const [isCollapsed, setIsCollapsed] = useState(false)

  useEffect(() => {
    const checkCollapsed = () => {
      const saved = localStorage.getItem(STORAGE_KEY)
      setIsCollapsed(saved === 'true')
    }

    checkCollapsed()

    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        setIsCollapsed(e.newValue === 'true')
      }
    }

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
      <main className="flex-1 overflow-auto flex flex-col">
        <div className="flex-1">{children}</div>
        <AppFooter />
      </main>
    </div>
  )
}
