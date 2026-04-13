import Link from 'next/link'
import { tenantConfig } from '@/config/tenant'

export function AppFooter() {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="flex-shrink-0 bg-slate-100 border-t border-slate-300 px-6 py-3">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-sm text-slate-600">
        {/* Left side - Brand & Copyright */}
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-700">{tenantConfig.name}</span>
          <span className="text-slate-400">|</span>
          <span>&copy; {currentYear} All rights reserved</span>
        </div>

        {/* Right side - Links */}
        <div className="flex items-center gap-3">
          <Link
            href="/support"
            className="hover:text-slate-900 transition-colors"
          >
            Support
          </Link>
          <span className="text-slate-300">|</span>
          <Link
            href="/privacy"
            className="hover:text-slate-900 transition-colors"
          >
            Privacy Policy
          </Link>
          <span className="text-slate-300">|</span>
          <Link
            href="/terms"
            className="hover:text-slate-900 transition-colors"
          >
            Terms
          </Link>
        </div>
      </div>
    </footer>
  )
}
