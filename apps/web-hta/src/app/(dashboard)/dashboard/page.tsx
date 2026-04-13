import { redirect } from 'next/navigation'
import Link from 'next/link'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { cached, CacheKeys, CacheTTL } from '@/lib/cache'

// Render at runtime, not build time (needs database)
export const dynamic = 'force-dynamic'
import { CertificateTable, CertificateListItem } from '@/components/dashboard/CertificateTable'
import { Button } from '@/components/ui/button'
import { Plus, FileText, Clock, CheckCircle, AlertCircle } from 'lucide-react'

async function getCertificates(userId: string): Promise<CertificateListItem[]> {
  // Cache engineer's certificates for 30 seconds - they work actively on these
  return cached(
    CacheKeys.engineerCertificates(userId),
    async () => {
      const certificates = await prisma.certificate.findMany({
        where: {
          createdById: userId,
        },
        include: {
          reviewer: {
            select: { id: true, name: true },
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
        reviewerName: cert.reviewer?.name || undefined,
      }))
    },
    { ttl: CacheTTL.VERY_SHORT }
  )
}

async function getStats(userId: string) {
  // Cache engineer's stats for 30 seconds
  return cached(
    CacheKeys.engineerDashboard(userId),
    async () => {
      const [draft, pending, approved, revision] = await Promise.all([
        prisma.certificate.count({
          where: { createdById: userId, status: 'DRAFT' },
        }),
        prisma.certificate.count({
          where: {
            createdById: userId,
            status: { in: ['PENDING_REVIEW', 'PENDING_CUSTOMER_APPROVAL'] },
          },
        }),
        prisma.certificate.count({
          where: { createdById: userId, status: 'APPROVED' },
        }),
        prisma.certificate.count({
          where: {
            createdById: userId,
            status: { in: ['REVISION_REQUIRED', 'CUSTOMER_REVISION_REQUIRED'] },
          },
        }),
      ])

      return { draft, pending, approved, revision }
    },
    { ttl: CacheTTL.VERY_SHORT }
  )
}

export default async function EngineerDashboard() {
  const session = await auth()

  if (!session?.user) {
    redirect('/login')
  }

  // Redirect Admin users to admin dashboard
  if (session.user.role === 'ADMIN') {
    redirect('/admin')
  }

  // Redirect Customer users to customer dashboard
  if (session.user.role === 'CUSTOMER') {
    redirect('/customer/dashboard')
  }

  const [certificates, stats] = await Promise.all([
    getCertificates(session.user.id),
    getStats(session.user.id),
  ])

  return (
    <div className="h-full overflow-auto">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Page Title */}
      <h1 className="text-2xl font-bold text-gray-900 mb-6">My Certificates</h1>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-lg border p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gray-100 rounded-lg">
                <FileText className="h-5 w-5 text-gray-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.draft}</p>
                <p className="text-sm text-gray-500">Drafts</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-100 rounded-lg">
                <Clock className="h-5 w-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.pending}</p>
                <p className="text-sm text-gray-500">Pending Review</p>
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
              <div className="p-2 bg-orange-100 rounded-lg">
                <AlertCircle className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stats.revision}</p>
                <p className="text-sm text-gray-500">Need Revision</p>
              </div>
            </div>
          </div>
        </div>

      {/* Action Button */}
      <div className="flex justify-end mb-6">
        <Link href="/dashboard/certificates/new">
          <Button className="bg-blue-600 hover:bg-blue-700">
            <Plus className="h-4 w-4 mr-2" />
            New Certificate
          </Button>
        </Link>
      </div>

      {/* Certificate Table */}
      <CertificateTable certificates={certificates} userRole="ENGINEER" />
    </div>
    </div>
  )
}
