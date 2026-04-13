'use client'

import { Crown, Building2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface CustomerPortalHeaderProps {
  companyName: string
  isPrimaryPoc: boolean
}

export function CustomerPortalHeader({ companyName, isPrimaryPoc }: CustomerPortalHeaderProps) {
  return (
    <header className="sticky top-0 z-[60] h-14 bg-[#222D7C] flex items-center justify-between px-4">
      {/* Left Side - Title & Company Name */}
      <div className="flex items-center gap-3">
        <h1 className="text-white text-base font-semibold">
          Customer Portal
        </h1>
        <Badge className="bg-[#2d3a8c] text-white border-0 hover:bg-[#3d4a9c]">
          <Building2 className="h-3 w-3 mr-1.5" />
          {companyName}
        </Badge>
      </div>

      {/* Right Side - POC Badge */}
      <div className="flex items-center gap-3">
        {isPrimaryPoc && (
          <Badge className="bg-amber-400 text-amber-900 border-0 hover:bg-amber-300">
            <Crown className="h-3 w-3 mr-1.5" />
            Primary POC
          </Badge>
        )}
      </div>
    </header>
  )
}
