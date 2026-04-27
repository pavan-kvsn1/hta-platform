'use client'

import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { HeroVisual } from './HeroVisual'
import { HeroStats } from './HeroStats'

export function HeroSection() {
  return (
    <section className="hero">
      <div className="hero-grid" />
      <div className="blob blob-1" />
      <div className="blob blob-2" />
      <div className="blob blob-3" />

      <div className="hero-body">
        {/* Left text */}
        <div>
          <div className="eyebrow">
            <span className="eyebrow-dot" />
            Calibration Management System
          </div>
          <h1 className="hero-h1">
            <span className="line"><span className="inner">Calibration</span></span>
            <span className="line"><span className="inner">certificates,</span></span>
            <span className="line"><span className="inner hi">done right.</span></span>
          </h1>
          <p className="hero-sub">
            Streamline your entire calibration workflow — from instrument setup to certificate
            authorization — with precision, compliance, and full digital auditability.
          </p>
          <div className="hero-ctas">
            <Link href="/customer/login" className="btn-prim">
              Customer Login
              <ArrowRight size={15} />
            </Link>
            <Link href="/login" className="btn-ghost">
              Staff Login &rarr;
            </Link>
          </div>
        </div>

        {/* Right visual */}
        <HeroVisual />
      </div>

      <HeroStats />
    </section>
  )
}
