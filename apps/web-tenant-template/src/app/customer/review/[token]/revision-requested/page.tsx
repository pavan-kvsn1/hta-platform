import Link from 'next/link'
import Image from 'next/image'
import { Clock, Home, MessageSquare, ArrowLeft, Bookmark } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface RevisionRequestedPageProps {
  params: Promise<{ token: string }>
  searchParams: Promise<{ feedback?: string }>
}

export default async function RevisionRequestedPage({
  params,
  searchParams,
}: RevisionRequestedPageProps) {
  const { token } = await params
  const { feedback } = await searchParams

  return (
    <div className="min-h-screen bg-gradient-to-b from-orange-50 to-white flex items-center justify-center p-4">
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

        {/* Icon */}
        <div className="w-24 h-24 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-6 ring-8 ring-orange-50">
          <MessageSquare className="w-14 h-14 text-orange-600" />
        </div>

        {/* Message */}
        <h1 className="text-3xl font-bold text-gray-900 mb-3">
          Revision Requested
        </h1>
        <p className="text-gray-600 mb-6 text-lg">
          Your feedback has been submitted to the HTA team. They will review your comments and make the necessary corrections.
        </p>

        {/* Feedback Display */}
        {feedback && (
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-6 text-left">
            <p className="text-sm font-medium text-orange-800 mb-2">Your Feedback:</p>
            <p className="text-sm text-orange-700 italic">&ldquo;{decodeURIComponent(feedback)}&rdquo;</p>
          </div>
        )}

        {/* Status Info */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
          <div className="flex items-center justify-center gap-2 text-amber-700">
            <Clock className="h-5 w-5" />
            <span className="font-medium">Awaiting Revision</span>
          </div>
          <p className="text-sm text-amber-600 mt-2">
            You will receive a notification when the updated certificate is ready for your review.
          </p>
        </div>

        {/* Actions */}
        <div className="space-y-3">
          <Link href={`/customer/review/${encodeURIComponent(token)}`} className="block">
            <Button variant="outline" className="w-full">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Certificate
            </Button>
          </Link>

          <Link href="/customer/dashboard" className="block">
            <Button className="w-full bg-green-600 hover:bg-green-700 h-12 text-base">
              <Home className="h-5 w-5 mr-2" />
              Go to Dashboard
            </Button>
          </Link>
        </div>

        {/* Bookmark Instruction */}
        <div className="mt-8 pt-6 border-t">
          <div className="flex items-center justify-center gap-2 text-gray-500 mb-2">
            <Bookmark className="h-4 w-4" />
            <p className="text-sm font-medium">Bookmark this page</p>
          </div>
          <p className="text-xs text-gray-400">
            Save this link to easily check back on your revision status.
          </p>
        </div>

        {/* Footer */}
        <div className="mt-6 pt-4 border-t">
          <p className="text-xs text-gray-400">
            HTA Instrumentation (P) Ltd.
          </p>
        </div>
      </div>
    </div>
  )
}
