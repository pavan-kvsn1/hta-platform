'use client'

import { FileText, BarChart3, ClipboardCheck, ShieldCheck } from 'lucide-react'
import { useReveal } from './useReveal'

export function FeaturesSection() {
  const { ref, visible } = useReveal()

  return (
    <section className="features-section" id="features">
      <div className="over">Why HTA Calibr8s</div>
      <h2 className="sec-title">Every tool your calibration team needs.</h2>
      <p className="sec-sub">
        Purpose-built for calibration labs that demand precision, traceability, and speed.
      </p>

      <div className="feat-grid" ref={ref}>
        {/* Digital Forms */}
        <div className={`feat-card ${visible ? 'vis' : ''}`}>
          <div className="feat-ico">
            <FileText size={22} strokeWidth={1.75} className="text-[#1a6fdb]" />
          </div>
          <div className="feat-t">Digital Forms</div>
          <div className="feat-d">
            Complete calibration certificates with intuitive section-based forms
            and automatic field population.
          </div>
          <div className="mt-4 flex items-center gap-2">
            <span className="inline-block w-8 h-1 rounded-full bg-[#1a6fdb]/20" />
            <span className="inline-block w-5 h-1 rounded-full bg-[#1a6fdb]/10" />
          </div>
        </div>

        {/* Error Calculation */}
        <div className={`feat-card ${visible ? 'vis' : ''}`}>
          <div className="feat-ico">
            <BarChart3 size={22} strokeWidth={1.75} className="text-[#1a6fdb]" />
          </div>
          <div className="feat-t">Error Calculation</div>
          <div className="feat-d">
            Automatic error and uncertainty calculations with out-of-limit flagging
            and compliance checking.
          </div>
          {/* Mini bar chart decoration */}
          <div className="mt-4 flex items-end gap-[3px] h-5">
            <span className="w-2 bg-[#1a6fdb]/15 rounded-sm" style={{ height: '60%' }} />
            <span className="w-2 bg-[#1a6fdb]/20 rounded-sm" style={{ height: '100%' }} />
            <span className="w-2 bg-[#1a6fdb]/15 rounded-sm" style={{ height: '45%' }} />
            <span className="w-2 bg-[#1a6fdb]/10 rounded-sm" style={{ height: '80%' }} />
            <span className="w-2 bg-[#1a6fdb]/20 rounded-sm" style={{ height: '70%' }} />
          </div>
        </div>

        {/* Approval Workflow */}
        <div className={`feat-card ${visible ? 'vis' : ''}`}>
          <div className="feat-ico">
            <ClipboardCheck size={22} strokeWidth={1.75} className="text-[#1a6fdb]" />
          </div>
          <div className="feat-t">Approval Workflow</div>
          <div className="feat-d">
            Multi-stage process: engineer creates, reviewer approves, customer signs off,
            admin authorizes.
          </div>
          {/* Mini pipeline decoration */}
          <div className="mt-4 flex items-center gap-1.5">
            {['Draft', 'Review', 'Approve', 'Auth'].map((stage, i) => (
              <div key={stage} className="flex items-center gap-1.5">
                <span className="w-[18px] h-[18px] rounded-full bg-[#1a6fdb]/15 flex items-center justify-center">
                  <span className="text-[8px] font-bold text-[#1a6fdb]/60">{i + 1}</span>
                </span>
                {i < 3 && <span className="w-3 h-px bg-[#1a6fdb]/15" />}
              </div>
            ))}
          </div>
        </div>

        {/* Audit Trail */}
        <div className={`feat-card ${visible ? 'vis' : ''}`}>
          <div className="feat-ico">
            <ShieldCheck size={22} strokeWidth={1.75} className="text-[#1a6fdb]" />
          </div>
          <div className="feat-t">Audit Trail</div>
          <div className="feat-d">
            Every action is timestamped and immutable. Full versioning with digital
            signature records.
          </div>
          {/* Mini hash chain decoration */}
          <div className="mt-4 flex items-center gap-1">
            {[1, 2, 3].map((n) => (
              <div key={n} className="flex items-center gap-1">
                <span className="px-1.5 py-0.5 rounded bg-[#1a6fdb]/8 text-[9px] font-mono text-[#1a6fdb]/40">
                  {`#${n.toString().padStart(3, '0')}`}
                </span>
                {n < 3 && (
                  <svg width="8" height="8" viewBox="0 0 8 8" className="text-[#1a6fdb]/20">
                    <path d="M2 4h4M4.5 2l2 2-2 2" fill="none" stroke="currentColor" strokeWidth="1" />
                  </svg>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
