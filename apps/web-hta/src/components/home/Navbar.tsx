'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'

export function Navbar() {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <nav className={`home-nav ${scrolled ? 'scrolled' : ''}`}>
      <Link href="/" className="flex items-center gap-[11px] no-underline">
        <div className="w-10 h-10 rounded-md overflow-hidden flex-shrink-0">
          <Image src="/hta-logo.jpg" alt="HTA" width={40} height={40} className="w-full h-full object-cover" />
        </div>
        <span className="text-base font-bold text-white tracking-tight">HTA Instrumentation</span>
      </Link>

      <div className="flex gap-1 nav-links">
        <a href="#features" className="nav-link px-3.5 py-2 rounded-lg text-sm font-medium text-white/50 no-underline hover:text-white hover:bg-white/[0.06] transition-colors">
          Features
        </a>
        <a href="#workflow" className="nav-link px-3.5 py-2 rounded-lg text-sm font-medium text-white/50 no-underline hover:text-white hover:bg-white/[0.06] transition-colors">
          How it works
        </a>
      </div>

      <Link
        href="/login"
        className="h-[38px] px-5 rounded-[9px] bg-[#1a6fdb] text-white text-sm font-bold inline-flex items-center hover:bg-[#1250b8] transition-colors no-underline"
      >
        Staff Login
      </Link>
    </nav>
  )
}
