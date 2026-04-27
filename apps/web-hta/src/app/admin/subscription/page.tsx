'use client'

import { apiFetch } from '@/lib/api-client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  ChevronLeft,
  Loader2,
  CreditCard,
  Users,
  Building2,
  FileText,
  Check,
  Minus,
  Plus,
  ArrowUpRight,
} from 'lucide-react'

interface SubscriptionData {
  subscription: {
    tier: string
    status: string
    currentPeriodStart: string
    currentPeriodEnd: string
    extraStaffSeats: number
    extraCustomerAccounts: number
    extraCustomerUserSeats: number
  } | null
  usage: {
    certificatesThisPeriod: number
    staffUsers: number
    customerAccounts: number
    customerUsers: number
  }
  limits: {
    certificates: number
    staffUsers: number
    customerAccounts: number
    customerUsers: number
  }
  billing: {
    subtotal: number
    tax: number
    total: number
  }
  addOnPrices: {
    staffSeat: number
    customerAccount: number
    customerUser: number
  }
}

interface PendingExtras {
  staffSeats: number
  customerAccounts: number
  customerUsers: number
}

const TIER_CONFIG: Record<string, { name: string; price: string; bg: string; text: string; border: string }> = {
  STARTER: { name: 'Starter', price: '2,999', bg: 'bg-[#dbeafe]', text: 'text-[#1d4ed8]', border: 'border-[#bfdbfe]' },
  GROWTH: { name: 'Growth', price: '5,999', bg: 'bg-[#f3e8ff]', text: 'text-[#7c3aed]', border: 'border-[#e9d5ff]' },
  SCALE: { name: 'Scale', price: '11,999', bg: 'bg-[#fffbeb]', text: 'text-[#d97706]', border: 'border-[#fef3c7]' },
  INTERNAL: { name: 'Internal', price: '0', bg: 'bg-[#dcfce7]', text: 'text-[#16a34a]', border: 'border-[#bbf7d0]' },
}

// Base prices in paise (for client-side bill preview)
const TIER_BASE_PRICE: Record<string, number> = {
  STARTER: 299900,
  GROWTH: 599900,
  SCALE: 1199900,
  INTERNAL: 0,
}

// Add-on prices in paise
const ADD_ON_PRICES = {
  staffSeat: 5000,        // ₹50/mo
  customerAccount: 50000, // ₹500/mo
  customerUser: 10000,    // ₹100/mo
}

const GST_RATE = 0.18

const PRICING_TIERS = [
  {
    slug: 'STARTER',
    name: 'Starter',
    price: '2,999',
    certificates: '500',
    staffUsers: '5',
    customerAccounts: '20',
    customerUsers: '50',
    features: ['Certificate management', 'Customer portal', 'Email notifications'],
  },
  {
    slug: 'GROWTH',
    name: 'Growth',
    price: '5,999',
    certificates: '5,000',
    staffUsers: '15',
    customerAccounts: '100',
    customerUsers: '300',
    features: ['Everything in Starter', 'Custom branding', 'API access', 'Priority support'],
    recommended: true,
  },
  {
    slug: 'SCALE',
    name: 'Scale',
    price: '11,999',
    certificates: 'Unlimited',
    staffUsers: 'Unlimited',
    customerAccounts: 'Unlimited',
    customerUsers: 'Unlimited',
    features: ['Everything in Growth', 'White-label option', 'Dedicated support', 'Custom integrations'],
  },
]

function formatPrice(paise: number): string {
  const rupees = paise / 100
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
  }).format(rupees)
}

function formatPriceShort(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN')}`
}

function Stepper({
  value,
  onChange,
  min = 0,
  disabled,
}: {
  value: number
  onChange: (v: number) => void
  min?: number
  disabled?: boolean
}) {
  return (
    <div className="inline-flex items-center gap-0.5">
      <button
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={disabled || value <= min}
        className="size-7 flex items-center justify-center rounded-md border border-[#e2e8f0] text-[#64748b] hover:bg-[#f8fafc] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        <Minus className="size-3" />
      </button>
      <span className="w-8 text-center text-[13px] font-semibold text-[#0f172a] tabular-nums">{value}</span>
      <button
        onClick={() => onChange(value + 1)}
        disabled={disabled}
        className="size-7 flex items-center justify-center rounded-md border border-[#e2e8f0] text-[#64748b] hover:bg-[#f8fafc] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        <Plus className="size-3" />
      </button>
    </div>
  )
}

export default function SubscriptionPage() {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<SubscriptionData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pendingExtras, setPendingExtras] = useState<PendingExtras>({ staffSeats: 0, customerAccounts: 0, customerUsers: 0 })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const fetchSubscription = useCallback(async () => {
    try {
      const res = await apiFetch('/api/admin/subscription')
      if (!res.ok) throw new Error('Failed to fetch subscription')
      const result = await res.json()
      setData(result)
      // Initialize pending extras from current subscription
      setPendingExtras({
        staffSeats: result.subscription?.extraStaffSeats || 0,
        customerAccounts: result.subscription?.extraCustomerAccounts || 0,
        customerUsers: result.subscription?.extraCustomerUserSeats || 0,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSubscription()
  }, [fetchSubscription])

  const handleSaveExtras = async () => {
    setSaving(true)
    setSaveError(null)
    try {
      const res = await apiFetch('/api/admin/subscription/seats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          extraStaffSeats: pendingExtras.staffSeats,
          extraCustomerAccounts: pendingExtras.customerAccounts,
          extraCustomerUserSeats: pendingExtras.customerUsers,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to update add-ons')
      }
      // Refresh data
      await fetchSubscription()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-[#f1f5f9]">
        <div className="text-center">
          <Loader2 className="size-8 animate-spin text-[#94a3b8] mx-auto mb-4" />
          <p className="text-[13px] text-[#64748b]">Loading subscription...</p>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="h-full flex items-center justify-center bg-[#f1f5f9]">
        <div className="text-center">
          <div className="bg-[#fef2f2] border border-[#fee2e2] rounded-lg p-4 text-[#dc2626] text-[13px] mb-4">
            {error || 'Failed to load subscription data'}
          </div>
          <Link
            href="/admin"
            className="inline-flex items-center gap-1 text-[13px] text-[#64748b] hover:text-[#0f172a] transition-colors"
          >
            <ChevronLeft className="size-4" />
            Back to Admin
          </Link>
        </div>
      </div>
    )
  }

  const tier = data.subscription?.tier || 'STARTER'
  const tierInfo = TIER_CONFIG[tier] || TIER_CONFIG.STARTER
  const status = data.subscription?.status || 'ACTIVE'
  const showBill = tier !== 'INTERNAL'
  const isUnlimitedTier = tier === 'SCALE' || tier === 'INTERNAL'
  const periodEnd = data.subscription?.currentPeriodEnd
    ? new Date(data.subscription.currentPeriodEnd).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : 'N/A'

  // Current saved extras
  const currentExtras: PendingExtras = {
    staffSeats: data.subscription?.extraStaffSeats || 0,
    customerAccounts: data.subscription?.extraCustomerAccounts || 0,
    customerUsers: data.subscription?.extraCustomerUserSeats || 0,
  }

  // Has the user changed any add-on values?
  const hasChanges =
    pendingExtras.staffSeats !== currentExtras.staffSeats ||
    pendingExtras.customerAccounts !== currentExtras.customerAccounts ||
    pendingExtras.customerUsers !== currentExtras.customerUsers

  // Client-side bill preview
  const basePrice = TIER_BASE_PRICE[tier] || 0
  const staffCost = pendingExtras.staffSeats * ADD_ON_PRICES.staffSeat
  const accountsCost = pendingExtras.customerAccounts * ADD_ON_PRICES.customerAccount
  const usersCost = pendingExtras.customerUsers * ADD_ON_PRICES.customerUser
  const previewSubtotal = basePrice + staffCost + accountsCost + usersCost
  const previewTax = Math.round(previewSubtotal * GST_RATE)
  const previewTotal = previewSubtotal + previewTax

  // Effective limits (base + extras)
  const effectiveLimits = {
    certificates: data.limits.certificates, // no extras for certs
    staffUsers: data.limits.staffUsers === -1 ? -1 : data.limits.staffUsers + pendingExtras.staffSeats,
    customerAccounts: data.limits.customerAccounts === -1 ? -1 : data.limits.customerAccounts + pendingExtras.customerAccounts,
    customerUsers: data.limits.customerUsers === -1 ? -1 : data.limits.customerUsers + pendingExtras.customerUsers,
  }

  // Usage card helpers
  function getPercent(used: number, limit: number) {
    if (limit === -1) return 0
    return Math.min((used / limit) * 100, 100)
  }

  function getBarColor(percent: number) {
    if (percent >= 90) return 'bg-[#ef4444]'
    if (percent >= 80) return 'bg-[#f59e0b]'
    return 'bg-[#3b82f6]'
  }

  return (
    <div className="h-full overflow-auto bg-[#f1f5f9]">
      <div className="px-8 py-8 max-w-5xl mx-auto pb-32">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/admin"
            className="inline-flex items-center gap-1 text-[13px] text-[#64748b] hover:text-[#0f172a] transition-colors mb-4"
          >
            <ChevronLeft className="size-4" />
            Back to Admin
          </Link>
          <h1 className="text-[22px] font-bold text-[#0f172a] tracking-tight flex items-center gap-2.5">
            <CreditCard className="size-[22px] text-[#94a3b8]" />
            Subscription &amp; Billing
          </h1>
          <p className="text-[13px] text-[#94a3b8] mt-1">Manage your plan, usage, and add-ons</p>
        </div>

        {/* Row 1: Current Plan + Current Bill */}
        <div className={`grid gap-5 mb-5 ${showBill ? 'grid-cols-1 lg:grid-cols-5' : 'grid-cols-1'}`}>
          {/* Current Plan */}
          <div className={`bg-white rounded-xl border border-[#e2e8f0] p-6 flex flex-col justify-between ${showBill ? 'lg:col-span-2' : ''}`}>
            <div>
              <h2 className="text-[15px] font-semibold text-[#0f172a] mb-5">Current Plan</h2>
              <div className="flex items-center gap-3 mb-4">
                <span className={`px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-md border ${tierInfo.bg} ${tierInfo.text} ${tierInfo.border}`}>
                  {tierInfo.name}
                </span>
                <span className={`px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-md border ${
                  status === 'ACTIVE'
                    ? 'bg-[#dcfce7] text-[#16a34a] border-[#bbf7d0]'
                    : 'bg-[#f1f5f9] text-[#64748b] border-[#e2e8f0]'
                }`}>
                  {status}
                </span>
              </div>
              <p className="text-[28px] font-bold text-[#0f172a] leading-tight">
                {tier === 'INTERNAL' ? 'Internal Use' : `₹${tierInfo.price}`}
                {tier !== 'INTERNAL' && <span className="text-[14px] font-normal text-[#94a3b8]">/month</span>}
              </p>
            </div>
            <p className="text-[13px] text-[#94a3b8] mt-5">
              Renews: {periodEnd}
            </p>
          </div>

          {/* Current Bill (live preview) */}
          {showBill && (
            <div className="bg-white rounded-xl border border-[#e2e8f0] p-6 lg:col-span-3">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-[15px] font-semibold text-[#0f172a]">
                  {hasChanges ? 'Projected Bill' : 'Current Bill'}
                </h2>
                {hasChanges && (
                  <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-md bg-[#fef3c7] text-[#d97706] border border-[#fde68a]">
                    Preview
                  </span>
                )}
              </div>
              <div className="divide-y divide-[#f1f5f9]">
                <div className="flex justify-between py-2.5">
                  <span className="text-[13px] text-[#64748b]">{tierInfo.name} Plan - Monthly</span>
                  <span className="text-[13px] font-medium text-[#0f172a]">₹{tierInfo.price}</span>
                </div>
                {pendingExtras.staffSeats > 0 && (
                  <div className="flex justify-between py-2.5">
                    <span className="text-[13px] text-[#64748b]">
                      Extra Staff Seats ({pendingExtras.staffSeats} × ₹50)
                    </span>
                    <span className="text-[13px] font-medium text-[#0f172a]">
                      {formatPriceShort(staffCost)}
                    </span>
                  </div>
                )}
                {pendingExtras.customerAccounts > 0 && (
                  <div className="flex justify-between py-2.5">
                    <span className="text-[13px] text-[#64748b]">
                      Extra Customer Accounts ({pendingExtras.customerAccounts} × ₹500)
                    </span>
                    <span className="text-[13px] font-medium text-[#0f172a]">
                      {formatPriceShort(accountsCost)}
                    </span>
                  </div>
                )}
                {pendingExtras.customerUsers > 0 && (
                  <div className="flex justify-between py-2.5">
                    <span className="text-[13px] text-[#64748b]">
                      Extra Customer Users ({pendingExtras.customerUsers} × ₹100)
                    </span>
                    <span className="text-[13px] font-medium text-[#0f172a]">
                      {formatPriceShort(usersCost)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between py-2.5">
                  <span className="text-[13px] text-[#64748b]">Subtotal</span>
                  <span className="text-[13px] text-[#0f172a]">{formatPrice(previewSubtotal)}</span>
                </div>
                <div className="flex justify-between py-2.5">
                  <span className="text-[13px] text-[#64748b]">GST (18%)</span>
                  <span className="text-[13px] text-[#0f172a]">{formatPrice(previewTax)}</span>
                </div>
                <div className="flex justify-between py-3">
                  <span className="text-[15px] font-semibold text-[#0f172a]">Total</span>
                  <span className="text-[15px] font-semibold text-[#0f172a]">{formatPrice(previewTotal)}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Row 2: Usage & Add-ons */}
        <div className="mb-5">
          <h2 className="text-[15px] font-semibold text-[#0f172a] mb-4">Usage &amp; Add-ons</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Certificates */}
            {(() => {
              const used = data.usage.certificatesThisPeriod
              const limit = effectiveLimits.certificates
              const isUnlimited = limit === -1
              const percent = getPercent(used, limit)
              return (
                <div className="bg-white rounded-xl border border-[#e2e8f0] p-5">
                  <div className="flex items-center gap-2 text-[#64748b] mb-3">
                    <FileText className="size-4" />
                    <span className="text-[13px] font-medium">Certificates</span>
                  </div>
                  <div className="text-[26px] font-bold text-[#0f172a] tabular-nums">{used.toLocaleString()}</div>
                  <div className="mt-3">
                    <div className="h-1.5 bg-[#e2e8f0] rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${isUnlimited ? '' : getBarColor(percent)}`}
                        style={{ width: isUnlimited ? '0%' : `${percent}%` }}
                      />
                    </div>
                    <div className="flex justify-between mt-1.5 text-[11px] text-[#94a3b8]">
                      <span>{isUnlimited ? 'Unlimited' : `/ ${limit.toLocaleString()}`}</span>
                      {!isUnlimited && <span>{Math.round(percent)}%</span>}
                    </div>
                  </div>
                  {/* Certificates cannot be purchased — must upgrade */}
                  {!isUnlimitedTier && (
                    <div className="mt-4 pt-4 border-t border-[#f1f5f9]">
                      <p className="text-[11px] text-[#94a3b8] mb-2">Extra certificates are not available as add-ons.</p>
                      <a
                        href="#available-plans"
                        className="inline-flex items-center gap-1 text-[12px] font-medium text-[#7c3aed] hover:text-[#6d28d9] transition-colors"
                      >
                        Upgrade Plan
                        <ArrowUpRight className="size-3" />
                      </a>
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Staff Users */}
            {(() => {
              const used = data.usage.staffUsers
              const limit = effectiveLimits.staffUsers
              const isUnlimited = limit === -1
              const percent = getPercent(used, limit)
              return (
                <div className="bg-white rounded-xl border border-[#e2e8f0] p-5">
                  <div className="flex items-center gap-2 text-[#64748b] mb-3">
                    <Users className="size-4" />
                    <span className="text-[13px] font-medium">Staff Users</span>
                  </div>
                  <div className="text-[26px] font-bold text-[#0f172a] tabular-nums">{used.toLocaleString()}</div>
                  <div className="mt-3">
                    <div className="h-1.5 bg-[#e2e8f0] rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${isUnlimited ? '' : getBarColor(percent)}`}
                        style={{ width: isUnlimited ? '0%' : `${percent}%` }}
                      />
                    </div>
                    <div className="flex justify-between mt-1.5 text-[11px] text-[#94a3b8]">
                      <span>
                        {isUnlimited
                          ? 'Unlimited'
                          : pendingExtras.staffSeats > 0
                          ? `/ ${limit.toLocaleString()} (${data.limits.staffUsers} base + ${pendingExtras.staffSeats} extra)`
                          : `/ ${limit.toLocaleString()}`}
                      </span>
                      {!isUnlimited && <span>{Math.round(percent)}%</span>}
                    </div>
                  </div>
                  {!isUnlimitedTier && (
                    <div className="mt-4 pt-4 border-t border-[#f1f5f9] flex items-center justify-between">
                      <div>
                        <p className="text-[12px] font-medium text-[#0f172a]">Extra seats</p>
                        <p className="text-[11px] text-[#94a3b8]">₹50/seat/mo</p>
                      </div>
                      <Stepper
                        value={pendingExtras.staffSeats}
                        onChange={(v) => setPendingExtras((prev) => ({ ...prev, staffSeats: v }))}
                      />
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Customer Accounts */}
            {(() => {
              const used = data.usage.customerAccounts
              const limit = effectiveLimits.customerAccounts
              const isUnlimited = limit === -1
              const percent = getPercent(used, limit)
              return (
                <div className="bg-white rounded-xl border border-[#e2e8f0] p-5">
                  <div className="flex items-center gap-2 text-[#64748b] mb-3">
                    <Building2 className="size-4" />
                    <span className="text-[13px] font-medium">Customer Accounts</span>
                  </div>
                  <div className="text-[26px] font-bold text-[#0f172a] tabular-nums">{used.toLocaleString()}</div>
                  <div className="mt-3">
                    <div className="h-1.5 bg-[#e2e8f0] rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${isUnlimited ? '' : getBarColor(percent)}`}
                        style={{ width: isUnlimited ? '0%' : `${percent}%` }}
                      />
                    </div>
                    <div className="flex justify-between mt-1.5 text-[11px] text-[#94a3b8]">
                      <span>
                        {isUnlimited
                          ? 'Unlimited'
                          : pendingExtras.customerAccounts > 0
                          ? `/ ${limit.toLocaleString()} (${data.limits.customerAccounts} base + ${pendingExtras.customerAccounts} extra)`
                          : `/ ${limit.toLocaleString()}`}
                      </span>
                      {!isUnlimited && <span>{Math.round(percent)}%</span>}
                    </div>
                  </div>
                  {!isUnlimitedTier && (
                    <div className="mt-4 pt-4 border-t border-[#f1f5f9] flex items-center justify-between">
                      <div>
                        <p className="text-[12px] font-medium text-[#0f172a]">Extra accounts</p>
                        <p className="text-[11px] text-[#94a3b8]">₹500/account/mo</p>
                      </div>
                      <Stepper
                        value={pendingExtras.customerAccounts}
                        onChange={(v) => setPendingExtras((prev) => ({ ...prev, customerAccounts: v }))}
                      />
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Customer Users */}
            {(() => {
              const used = data.usage.customerUsers
              const limit = effectiveLimits.customerUsers
              const isUnlimited = limit === -1
              const percent = getPercent(used, limit)
              return (
                <div className="bg-white rounded-xl border border-[#e2e8f0] p-5">
                  <div className="flex items-center gap-2 text-[#64748b] mb-3">
                    <Users className="size-4" />
                    <span className="text-[13px] font-medium">Customer Users</span>
                  </div>
                  <div className="text-[26px] font-bold text-[#0f172a] tabular-nums">{used.toLocaleString()}</div>
                  <div className="mt-3">
                    <div className="h-1.5 bg-[#e2e8f0] rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${isUnlimited ? '' : getBarColor(percent)}`}
                        style={{ width: isUnlimited ? '0%' : `${percent}%` }}
                      />
                    </div>
                    <div className="flex justify-between mt-1.5 text-[11px] text-[#94a3b8]">
                      <span>
                        {isUnlimited
                          ? 'Unlimited'
                          : pendingExtras.customerUsers > 0
                          ? `/ ${limit.toLocaleString()} (${data.limits.customerUsers} base + ${pendingExtras.customerUsers} extra)`
                          : `/ ${limit.toLocaleString()}`}
                      </span>
                      {!isUnlimited && <span>{Math.round(percent)}%</span>}
                    </div>
                  </div>
                  {!isUnlimitedTier && (
                    <div className="mt-4 pt-4 border-t border-[#f1f5f9] flex items-center justify-between">
                      <div>
                        <p className="text-[12px] font-medium text-[#0f172a]">Extra seats</p>
                        <p className="text-[11px] text-[#94a3b8]">₹100/seat/mo</p>
                      </div>
                      <Stepper
                        value={pendingExtras.customerUsers}
                        onChange={(v) => setPendingExtras((prev) => ({ ...prev, customerUsers: v }))}
                      />
                    </div>
                  )}
                </div>
              )
            })()}
          </div>
        </div>

        {/* Row 3: Available Plans */}
        <div id="available-plans">
          <h2 className="text-[15px] font-semibold text-[#0f172a] mb-4">Available Plans</h2>
          <div className="grid md:grid-cols-3 gap-4">
            {PRICING_TIERS.map((plan) => {
              const isCurrent = plan.slug === tier
              return (
                <div
                  key={plan.slug}
                  className={`relative bg-white rounded-xl border-2 p-5 ${
                    isCurrent
                      ? 'border-[#3b82f6] bg-[#eff6ff]'
                      : plan.recommended
                      ? 'border-[#c084fc]'
                      : 'border-[#e2e8f0]'
                  }`}
                >
                  {plan.recommended && !isCurrent && (
                    <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-md bg-[#7c3aed] text-white whitespace-nowrap">
                      Recommended
                    </span>
                  )}
                  {isCurrent && (
                    <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-md bg-[#2563eb] text-white whitespace-nowrap">
                      Current Plan
                    </span>
                  )}
                  <div className="text-center mb-4 pt-1">
                    <h3 className="font-bold text-[15px] text-[#0f172a]">{plan.name}</h3>
                    <p className="text-[26px] font-bold text-[#0f172a] mt-1">
                      ₹{plan.price}
                      <span className="text-[13px] font-normal text-[#94a3b8]">/mo</span>
                    </p>
                  </div>
                  <div className="divide-y divide-[#f1f5f9] mb-4">
                    <div className="flex justify-between py-2">
                      <span className="text-[13px] text-[#64748b]">Certificates</span>
                      <span className="text-[13px] font-medium text-[#0f172a]">{plan.certificates}</span>
                    </div>
                    <div className="flex justify-between py-2">
                      <span className="text-[13px] text-[#64748b]">Staff Users</span>
                      <span className="text-[13px] font-medium text-[#0f172a]">{plan.staffUsers}</span>
                    </div>
                    <div className="flex justify-between py-2">
                      <span className="text-[13px] text-[#64748b]">Customer Accounts</span>
                      <span className="text-[13px] font-medium text-[#0f172a]">{plan.customerAccounts}</span>
                    </div>
                    <div className="flex justify-between py-2">
                      <span className="text-[13px] text-[#64748b]">Customer Users</span>
                      <span className="text-[13px] font-medium text-[#0f172a]">{plan.customerUsers}</span>
                    </div>
                  </div>
                  <ul className="space-y-1.5 mb-5">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-center gap-1.5 text-[12px] text-[#64748b]">
                        <Check className="size-3 text-[#16a34a] flex-shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <button
                    disabled={isCurrent || tier === 'INTERNAL'}
                    className={`w-full py-2 text-[13px] font-medium rounded-lg transition-colors disabled:cursor-not-allowed ${
                      isCurrent
                        ? 'border border-[#e2e8f0] text-[#94a3b8] bg-white'
                        : 'bg-[#0f172a] text-white hover:bg-[#1e293b] disabled:opacity-40'
                    }`}
                  >
                    {isCurrent ? 'Current Plan' : 'Select Plan'}
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Sticky Save Bar */}
      {hasChanges && (
        <div className="fixed bottom-0 left-0 right-0 z-50">
          <div className="bg-white border-t border-[#e2e8f0] shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
            <div className="max-w-5xl mx-auto px-8 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="size-2 rounded-full bg-[#f59e0b] animate-pulse" />
                <div>
                  <p className="text-[13px] font-medium text-[#0f172a]">
                    You&apos;ve changed add-ons
                  </p>
                  <p className="text-[12px] text-[#64748b]">
                    New monthly total: <span className="font-semibold text-[#0f172a]">{formatPrice(previewTotal)}</span>
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {saveError && (
                  <span className="text-[12px] text-[#dc2626]">{saveError}</span>
                )}
                <button
                  onClick={() => setPendingExtras(currentExtras)}
                  disabled={saving}
                  className="px-4 py-2 text-[13px] font-medium text-[#0f172a] border border-[#e2e8f0] rounded-lg hover:bg-[#f8fafc] transition-colors disabled:opacity-40"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveExtras}
                  disabled={saving}
                  className="inline-flex items-center gap-2 px-5 py-2 text-[13px] font-medium text-white bg-[#0f172a] hover:bg-[#1e293b] rounded-lg transition-colors disabled:opacity-60"
                >
                  {saving ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save Changes'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
