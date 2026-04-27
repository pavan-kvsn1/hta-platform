'use client'

import { Check } from 'lucide-react'
import { useCountUp } from './useCountUp'

export function HeroVisual() {
  const avgHours = useCountUp(18)

  return (
    <div className="hero-visual">
      {/* Floating stat chip */}
      <div className="v-stat">
        <div className="v-stat-num">{avgHours}h</div>
        <div className="v-stat-lbl">Avg. Turnaround</div>
      </div>

      {/* Main certificate card */}
      <div className="v-card">
        <div className="v-card-top">
          <div>
            <div className="v-cert-num">HTA/00001/24/04</div>
            <div className="v-cert-sub">Test Company Pvt Ltd · Laboratory</div>
          </div>
          <span className="v-badge">Authorized</span>
        </div>
        <div className="v-divider" />
        <div className="v-fields">
          <div>
            <div className="v-fl">UUC</div>
            <div className="v-fv">Digital RTD Thermometer</div>
          </div>
          <div>
            <div className="v-fl">Cal. Date</div>
            <div className="v-fv v-fv-mono">23 Apr 2026</div>
          </div>
          <div>
            <div className="v-fl">Engineer</div>
            <div className="v-fv">Rajesh Sharma</div>
          </div>
          <div>
            <div className="v-fl">Due Date</div>
            <div className="v-fv v-fv-mono">24 Apr 2027</div>
          </div>
        </div>

        {/* Pipeline */}
        <div className="v-pipe">
          {(['Draft', 'Review', 'Customer'] as const).map((label) => (
            <PipeStage key={label} label={label} variant="done" />
          ))}
          <PipeStage label="Authorized" variant="auth" last />
        </div>
      </div>

      {/* Notification chip */}
      <div className="v-notif">
        <div className="v-notif-ico">
          <Check size={15} strokeWidth={2.5} className="text-green-400" />
        </div>
        <div>
          <div className="v-notif-t">Certificate authorized</div>
          <div className="v-notif-s">by Kiran Kumar · just now</div>
        </div>
      </div>
    </div>
  )
}

function PipeStage({ label, variant, last }: { label: string; variant: 'done' | 'auth'; last?: boolean }) {
  return (
    <>
      <div className="v-stage">
        <div className={`v-dot ${variant === 'auth' ? 'v-dot-auth' : 'v-dot-done'}`}>&#10003;</div>
        <div className={`v-slbl ${variant === 'auth' ? 'v-slbl-auth' : ''}`}>{label}</div>
      </div>
      {!last && <div className="v-conn" />}
    </>
  )
}
