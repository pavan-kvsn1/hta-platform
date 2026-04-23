import Link from 'next/link'
import Image from 'next/image'
import { ArrowRight, FileText, Users, ClipboardCheck, Shield, LogIn } from 'lucide-react'
import { tenantConfig } from '@/config/tenant'

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Image
              src={tenantConfig.branding.logoUrl}
              alt={tenantConfig.branding.logoAlt}
              width={80}
              height={40}
              className="object-contain"
            />
            <h1 className="text-2xl font-bold text-slate-900">{tenantConfig.name}</h1>
          </div>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            <LogIn className="size-4" />
            Staff Login
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <main className="max-w-6xl mx-auto px-6 py-16">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold text-slate-900 tracking-tight mb-6">
            Digital Calibration Certificates
          </h2>
          <p className="text-xl text-slate-600 max-w-2xl mx-auto mb-8">
            Streamline your calibration workflow with our digital certificate management system.
            Create, review, and approve certificates with ease.
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
            <div className="size-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary mb-4">
              <FileText className="size-6" />
            </div>
            <h3 className="font-bold text-slate-900 mb-2">Digital Forms</h3>
            <p className="text-sm text-slate-600">
              Complete calibration certificates with intuitive digital forms and auto-calculations.
            </p>
          </div>

          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
            <div className="size-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary mb-4">
              <ClipboardCheck className="size-6" />
            </div>
            <h3 className="font-bold text-slate-900 mb-2">Error Calculation</h3>
            <p className="text-sm text-slate-600">
              Automatic error calculation with out-of-limit flagging for accurate results.
            </p>
          </div>

          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
            <div className="size-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary mb-4">
              <Users className="size-6" />
            </div>
            <h3 className="font-bold text-slate-900 mb-2">Approval Workflow</h3>
            <p className="text-sm text-slate-600">
              Multi-stage approval process with peer review and customer sign-off.
            </p>
          </div>

          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
            <div className="size-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary mb-4">
              <Shield className="size-6" />
            </div>
            <h3 className="font-bold text-slate-900 mb-2">Audit Trail</h3>
            <p className="text-sm text-slate-600">
              Complete audit trail with versioning and immutable signature records.
            </p>
          </div>
        </div>

        {/* Quick Links */}
        <div className="mt-16 text-center">
          <p className="text-slate-500 mb-4">Quick Links:</p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link
              href="/customer/login"
              className="inline-flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
            >
              Customer Login
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-8 mt-16">
        <div className="max-w-6xl mx-auto px-6 text-center text-slate-500 text-sm">
          <p>{tenantConfig.name} - Calibration Certificate Management System</p>
        </div>
      </footer>
    </div>
  )
}
