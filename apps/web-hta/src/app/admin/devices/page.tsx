import { Suspense } from 'react'
import { DeviceListClient } from './DeviceListClient'
import { Loader2 } from 'lucide-react'

export default function DevicesPage() {
  return (
    <Suspense
      fallback={
        <div className="h-full overflow-auto bg-[#f1f5f9] flex items-center justify-center">
          <Loader2 className="size-6 animate-spin text-[#94a3b8]" />
        </div>
      }
    >
      <DeviceListClient />
    </Suspense>
  )
}
