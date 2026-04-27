import Image from 'next/image'

export function Footer() {
  return (
    <footer className="home-footer">
      <div className="flex items-center gap-2.5">
        <div className="w-[34px] h-[34px] rounded-md overflow-hidden flex-shrink-0">
          <Image src="/hta-logo.jpg" alt="HTA" width={34} height={34} className="w-full h-full object-cover" />
        </div>
        <div>
          <div className="ft-lbl">HTA Instrumentation</div>
          <div className="ft-tagline">Committed to the Customer since 1989</div>
        </div>
      </div>

      <div className="flex gap-[22px]">
        <a href="#" className="ft-link">Support</a>
        <a href="#" className="ft-link">Privacy Policy</a>
        <a href="#" className="ft-link">Terms</a>
      </div>

      <span className="ft-copy">&copy; 2026 HTA Instrumentation. All rights reserved.</span>
    </footer>
  )
}
