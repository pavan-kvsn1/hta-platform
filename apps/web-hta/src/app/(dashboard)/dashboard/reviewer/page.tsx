import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { FileText, Clock, CheckCircle, AlertCircle } from 'lucide-react'

// Render at runtime, not build time (needs database)
export const dynamic = 'force-dynamic'
import { ReviewerCertificateTable } from './ReviewerCertificateTable'

export interface ReviewCertificateItem {
  id: string
  certificateNumber: string
  status: string
  customerName: string
  uucDescription: string
  dateOfCalibration: string
  currentVersion: number
  createdAt: string
  submittedAt: string | null
  assigneeName: string
  assigneeEmail: string
}

async function getReviewCertificates(userId: string): Promise<ReviewCertificateItem[]> {
  const certificates = await prisma.certificate.findMany({
    where: {
      reviewerId: userId,
    },
    include: {
      createdBy: {
        select: { name: true, email: true },
      },
      events: {
        where: {
          eventType: { in: ['SUBMITTED_FOR_REVIEW', 'RESUBMITTED_FOR_REVIEW'] },
        },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
    orderBy: { updatedAt: 'desc' },
  })

  return certificates.map((cert) => ({
    id: cert.id,
    certificateNumber: cert.certificateNumber,
    status: cert.status,
    customerName: cert.customerName || '-',
    uucDescription: cert.uucDescription || '-',
    dateOfCalibration: cert.dateOfCalibration?.toISOString() || '',
    currentVersion: cert.currentRevision,
    createdAt: cert.createdAt.toISOString(),
    submittedAt: cert.events[0]?.createdAt?.toISOString() || null,
    assigneeName: cert.createdBy.name || 'Unknown',
    assigneeEmail: cert.createdBy.email,
  }))
}

async function getReviewStats(userId: string) {
  const [pendingReview, revisionRequested, approved, total] = await Promise.all([
    prisma.certificate.count({
      where: { reviewerId: userId, status: 'PENDING_REVIEW' },
    }),
    prisma.certificate.count({
      where: { reviewerId: userId, status: 'REVISION_REQUIRED' },
    }),
    prisma.certificate.count({
      where: {
        reviewerId: userId,
        status: { in: ['PENDING_CUSTOMER_APPROVAL', 'APPROVED'] },
      },
    }),
    prisma.certificate.count({
      where: { reviewerId: userId },
    }),
  ])

  return { pendingReview, revisionRequested, approved, total }
}

export default async function ReviewerDashboard() {
  const session = await auth()

  if (!session?.user) {
    redirect('/login')
  }

  // Only engineers and admins can be reviewers
  if (session.user.role !== 'ENGINEER' && session.user.role !== 'ADMIN') {
    redirect('/dashboard')
  }

  const [certificates, stats] = await Promise.all([
    getReviewCertificates(session.user.id),
    getReviewStats(session.user.id),
  ])

  return (
    <div className="h-full overflow-auto">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Page Title */}
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Reviews</h1>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-lg border p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-100 rounded-lg">
                <Clock className="h-5 w-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.pendingReview}</p>
                <p className="text-sm text-gray-500">Pending Review</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-100 rounded-lg">
                <AlertCircle className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.revisionRequested}</p>
                <p className="text-sm text-gray-500">Revision Requested</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <CheckCircle className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.approved}</p>
                <p className="text-sm text-gray-500">Approved</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gray-100 rounded-lg">
                <FileText className="h-5 w-5 text-gray-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
                <p className="text-sm text-gray-500">Total Assigned</p>
              </div>
            </div>
          </div>
        </div>

      {/* Certificate Table */}
      {certificates.length === 0 ? (
        <div className="bg-white rounded-lg border p-8 text-center">
          <FileText className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No certificates assigned</h3>
          <p className="text-gray-500">
            When engineers assign you as a reviewer, their certificates will appear here.
          </p>
        </div>
      ) : (
        <ReviewerCertificateTable certificates={certificates} />
      )}
    </div>
    </div>
  )
}
