'use client'

import { PenLine, Search, UserCheck, ShieldCheck, FileDown, ArrowRight } from 'lucide-react'
import { useReveal } from './useReveal'
import type { LucideIcon } from 'lucide-react'

interface Step {
  num: string
  label: string
  desc: string
  icon: LucideIcon
  final?: boolean
}

const steps: Step[] = [
  {
    num: '01',
    label: 'Create',
    desc: 'Engineer fills the digital certificate form',
    icon: PenLine,
  },
  {
    num: '02',
    label: 'Review',
    desc: 'Peer reviewer checks all calculations',
    icon: Search,
  },
  {
    num: '03',
    label: 'Customer',
    desc: 'Customer approves digitally',
    icon: UserCheck,
  },
  {
    num: '04',
    label: 'Authorize',
    desc: 'Admin performs final authorization',
    icon: ShieldCheck,
  },
  {
    num: '05',
    label: 'Issued',
    desc: 'PDF certificate delivered instantly',
    icon: FileDown,
    final: true,
  },
]

export function WorkflowSection() {
  const { ref, visible } = useReveal()

  return (
    <section className="wf-section" id="workflow">
      <div className="wf-grid" />
      <div className="relative z-[1]">
        <div className="over">How it works</div>
        <h2 className="sec-title">From draft to authorized in hours.</h2>
        <p className="sec-sub">
          A structured, trackable workflow that eliminates paper, reduces errors,
          and cuts turnaround time dramatically.
        </p>

        <div className="wf-steps" ref={ref}>
          {steps.map((step, i) => {
            const Icon = step.icon
            const isFinal = !!step.final
            const isLast = i === steps.length - 1

            return (
              <div key={step.num} className="contents">
                <div className={`wf-step ${isFinal ? 'wf-step-final' : ''} ${visible ? 'vis' : ''}`}>
                  {/* Numbered circle with icon below */}
                  <div className="wf-num">{step.num}</div>

                  {/* Icon */}
                  <div className={`mx-auto mb-3 w-9 h-9 rounded-lg flex items-center justify-center ${
                    isFinal
                      ? 'bg-green-400/10'
                      : 'bg-[#1a6fdb]/10'
                  }`}>
                    <Icon
                      size={18}
                      strokeWidth={1.75}
                      className={isFinal ? 'text-green-400' : 'text-[#1a6fdb]'}
                    />
                  </div>

                  <div className="wf-lbl">{step.label}</div>
                  <div className="wf-d">{step.desc}</div>

                  {/* Status indicator dot */}
                  <div className={`mx-auto mt-3 w-1.5 h-1.5 rounded-full ${
                    isFinal
                      ? 'bg-green-400/50'
                      : 'bg-[#1a6fdb]/30'
                  }`} />
                </div>

                {/* Arrow connector */}
                {!isLast && (
                  <div className="wf-arr">
                    <ArrowRight size={20} strokeWidth={1.5} className="text-white" />
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Timeline bar below steps */}
        <div className="relative mt-12 mx-auto max-w-2xl">
          <div className="h-px bg-white/[0.06]" />
          <div className="absolute inset-y-0 left-0 w-[80%] h-px bg-gradient-to-r from-[#1a6fdb]/40 via-[#1a6fdb]/20 to-transparent" />
          <div className="flex justify-between mt-3">
            <span className="text-[10px] uppercase tracking-widest text-white/20 font-medium">Start</span>
            <span className="text-[10px] uppercase tracking-widest text-green-400/30 font-medium">Certificate Issued</span>
          </div>
        </div>
      </div>
    </section>
  )
}
