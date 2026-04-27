import Image from 'next/image'
import { Check } from 'lucide-react'

const features = [
  'Multi-stage approval workflow',
  'Automatic error calculation',
  'Immutable audit trail',
]

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="login-split">
      {/* LEFT — branded panel */}
      <div className="login-brand">
        <div className="login-brand-blob-1" />
        <div className="login-brand-blob-2" />

        {/* Logo */}
        <div className="relative z-[1] flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-lg overflow-hidden flex-shrink-0">
            <Image src="/hta-logo.jpg" alt="HTA" width={44} height={44} className="w-full h-full object-cover" />
          </div>
          <div>
            <div className="text-[17px] font-bold text-white tracking-tight">HTA Instrumentation</div>
            <div className="text-[11px] text-white/35 tracking-[0.07em] uppercase mt-0.5">Calibration Management</div>
          </div>
        </div>

        {/* Headline */}
        <div className="relative z-[1]">
          <h2 className="text-[42px] font-extrabold text-white tracking-tight leading-[1.15] mb-[18px]">
            Digital Calibration<br />Certificates
          </h2>
          <p className="text-[17px] text-white/45 leading-[1.7] max-w-[320px]">
            Create, review, and authorize calibration certificates with precision and full auditability.
          </p>
          <div className="mt-9 flex flex-col gap-3">
            {features.map((f) => (
              <div key={f} className="flex items-center gap-2.5">
                <div className="login-feature-check">
                  <Check size={11} className="text-[#5eead4]" />
                </div>
                <span className="text-sm text-white/55">{f}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <p className="relative z-[1] text-xs text-white/20">
          &copy; 2026 HTA Instrumentation. All rights reserved.
        </p>
      </div>

      {/* RIGHT — form panel */}
      <div className="login-form-panel">
        <div className="login-form-inner">
          {children}
        </div>
      </div>
    </div>
  )
}
