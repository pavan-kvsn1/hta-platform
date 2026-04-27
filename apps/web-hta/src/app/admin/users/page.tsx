import { Suspense } from 'react'
import { UserListClient } from './UserListClient'
import { Loader2 } from 'lucide-react'

export default function UsersPage() {
  return (
    <Suspense
      fallback={
        <div className="h-full overflow-auto bg-[#f1f5f9] flex items-center justify-center">
          <Loader2 className="size-6 animate-spin text-[#94a3b8]" />
        </div>
      }
    >
      <UserListClient />
    </Suspense>
  )
}
