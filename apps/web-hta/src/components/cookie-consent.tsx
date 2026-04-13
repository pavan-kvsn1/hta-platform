'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { X } from 'lucide-react'
import { tenantConfig } from '@/config/tenant'

const CONSENT_KEY = `${tenantConfig.slug}-cookie-consent`

interface ConsentData {
  essential: boolean
  accepted: string
  version: string
}

export function CookieConsent() {
  const [showBanner, setShowBanner] = useState(false)

  useEffect(() => {
    // Check if consent has already been given
    const consent = localStorage.getItem(CONSENT_KEY)
    if (!consent) {
      // Small delay to prevent flash on page load
      const timer = setTimeout(() => setShowBanner(true), 500)
      return () => clearTimeout(timer)
    }
  }, [])

  const acceptCookies = () => {
    const consentData: ConsentData = {
      essential: true,
      accepted: new Date().toISOString(),
      version: '1.0',
    }
    localStorage.setItem(CONSENT_KEY, JSON.stringify(consentData))
    setShowBanner(false)
  }

  const dismissBanner = () => {
    // Dismissing without explicit accept - still set minimal consent
    const consentData: ConsentData = {
      essential: true,
      accepted: new Date().toISOString(),
      version: '1.0',
    }
    localStorage.setItem(CONSENT_KEY, JSON.stringify(consentData))
    setShowBanner(false)
  }

  if (!showBanner) return null

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 p-4 bg-background border-t shadow-lg animate-in slide-in-from-bottom-4 duration-300"
      role="dialog"
      aria-label="Cookie consent"
    >
      <div className="container mx-auto max-w-5xl">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex-1 pr-8">
            <p className="text-sm text-muted-foreground">
              We use essential cookies to ensure our website functions properly.
              These cookies are necessary for authentication and security.
              By continuing to use this site, you agree to our{' '}
              <Link
                href="/privacy"
                className="underline hover:text-foreground transition-colors"
              >
                Privacy Policy
              </Link>.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              asChild
            >
              <Link href="/privacy">Learn More</Link>
            </Button>
            <Button
              size="sm"
              onClick={acceptCookies}
            >
              Accept
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={dismissBanner}
              className="h-8 w-8 p-0"
              aria-label="Dismiss cookie banner"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
