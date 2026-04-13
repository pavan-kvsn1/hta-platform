import Link from 'next/link'
import Image from 'next/image'
import { CheckCircle, Download, Home, LogIn } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function ApprovalSuccessPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50 to-white flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-10 max-w-md w-full text-center">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <Image
            src="/hta-logo.jpg"
            alt="HTA Instrumentation"
            width={100}
            height={50}
            className="object-contain"
          />
        </div>

        {/* Success Icon - Large and Prominent */}
        <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6 ring-8 ring-green-50">
          <CheckCircle className="w-14 h-14 text-green-600" />
        </div>

        {/* Message */}
        <h1 className="text-3xl font-bold text-gray-900 mb-3">
          Certificate Approved!
        </h1>
        <p className="text-gray-600 mb-8 text-lg">
          Thank you for approving the calibration certificate. Your signature has been recorded successfully.
        </p>

        {/* Receipt Download Section */}
        <div className="bg-gray-50 rounded-lg p-4 mb-6">
          <p className="text-sm text-gray-600 mb-3">
            A confirmation receipt has been generated.
          </p>
          <Button variant="outline" className="w-full">
            <Download className="h-4 w-4 mr-2" />
            Download Receipt
          </Button>
        </div>

        {/* Actions */}
        <div className="space-y-3">
          <Link href="/customer/dashboard" className="block">
            <Button className="w-full bg-green-600 hover:bg-green-700 h-12 text-base">
              <Home className="h-5 w-5 mr-2" />
              Go to Dashboard
            </Button>
          </Link>
          <p className="text-sm text-gray-500">
            Track all your certificates in one place
          </p>
        </div>

        {/* Login CTA for non-logged-in users */}
        <div className="mt-8 pt-6 border-t">
          <p className="text-sm text-gray-500 mb-3">
            Don't have an account yet?
          </p>
          <Link href="/customer/login">
            <Button variant="outline" size="sm">
              <LogIn className="h-4 w-4 mr-2" />
              Login to track all certificates
            </Button>
          </Link>
        </div>

        {/* Footer */}
        <div className="mt-8 pt-4 border-t">
          <p className="text-xs text-gray-400">
            HTA Instrumentation (P) Ltd.
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Bookmark this page to check your certificate status anytime.
          </p>
        </div>
      </div>
    </div>
  )
}
