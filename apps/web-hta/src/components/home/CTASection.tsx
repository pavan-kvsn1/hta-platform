import Link from 'next/link'

export function CTASection() {
  return (
    <section className="cta-section">
      <h2 className="cta-t">Ready to go paperless?</h2>
      <p className="cta-s">
        Join calibration labs already using HTA Calibration to issue precise, traceable digital certificates.
      </p>
      <div className="cta-row">
        <Link href="/customer/login" className="cta-btn-w">
          Customer Login &rarr;
        </Link>
        <Link href="/login" className="cta-btn-o">
          Staff Login
        </Link>
      </div>
    </section>
  )
}
