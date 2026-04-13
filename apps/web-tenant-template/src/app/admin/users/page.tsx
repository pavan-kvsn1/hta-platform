import { Suspense } from 'react'
import { UserListClient } from './UserListClient'

export default function UsersPage() {
  return (
    <div className="p-3 h-full">
      {/* Master Bounding Box */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden h-full">
        <div className="p-6 overflow-auto h-full">
          <Suspense fallback={<UserListSkeleton />}>
            <UserListClient />
          </Suspense>
        </div>
      </div>
    </div>
  )
}

function UserListSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="h-8 w-48 bg-slate-200 rounded mb-6" />
      <div className="h-10 w-full bg-slate-200 rounded mb-4" />
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-16 bg-slate-200 rounded" />
        ))}
      </div>
    </div>
  )
}
