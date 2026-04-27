'use client'

import { Award, Clock, Wifi, Leaf } from 'lucide-react'
import { useCountUp } from './useCountUp'
import type { LucideIcon } from 'lucide-react'

const stats: { target: number; suffix: string; label: string; icon: LucideIcon }[] = [
  { target: 500, suffix: '+', label: 'Certificates Issued', icon: Award },
  { target: 18, suffix: 'h', label: 'Average Turnaround', icon: Clock },
  { target: 99, suffix: '%', label: 'Uptime Reliability', icon: Wifi },
  { target: 100, suffix: '%', label: 'Paperless Workflow', icon: Leaf },
]

export function HeroStats() {
  return (
    <div className="hero-stats">
      {stats.map((stat) => (
        <StatItem key={stat.label} {...stat} />
      ))}
    </div>
  )
}

function StatItem({
  target,
  suffix,
  label,
  icon: Icon,
}: {
  target: number
  suffix: string
  label: string
  icon: LucideIcon
}) {
  const value = useCountUp(target)

  return (
    <div className="hstat">
      <div className="flex items-center justify-center gap-3 mb-2">
        <div className="w-8 h-8 rounded-lg bg-[#1a6fdb]/10 flex items-center justify-center">
          <Icon size={16} strokeWidth={1.75} className="text-[#1a6fdb]" />
        </div>
        <div className="hstat-num">
          {value}<span className="hstat-acc">{suffix}</span>
        </div>
      </div>
      <div className="hstat-lbl">{label}</div>
    </div>
  )
}
