'use client'

import { apiFetch } from '@/lib/api-client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ArrowLeft, Loader2, CreditCard, Users, Building2, FileText, Check } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

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
}

const TIER_DISPLAY: Record<string, { name: string; price: string; color: string }> = {
  STARTER: { name: 'Starter', price: '2,999', color: 'bg-blue-100 text-blue-800' },
  GROWTH: { name: 'Growth', price: '5,999', color: 'bg-purple-100 text-purple-800' },
  SCALE: { name: 'Scale', price: '11,999', color: 'bg-amber-100 text-amber-800' },
  INTERNAL: { name: 'Internal', price: '0', color: 'bg-green-100 text-green-800' },
}

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

function UsageCard({
  icon: Icon,
  label,
  used,
  limit,
}: {
  icon: typeof FileText
  label: string
  used: number
  limit: number
}) {
  const isUnlimited = limit === -1
  const percent = isUnlimited ? 0 : Math.min((used / limit) * 100, 100)
  const isNearLimit = !isUnlimited && percent >= 80

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4">
      <div className="flex items-center gap-2 text-slate-600 mb-2">
        <Icon className="w-4 h-4" />
        <span className="text-sm font-medium">{label}</span>
      </div>
      <div className="text-2xl font-bold text-slate-900">{used.toLocaleString()}</div>
      <div className="mt-2">
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              isNearLimit ? 'bg-amber-500' : 'bg-blue-500'
            }`}
            style={{ width: isUnlimited ? '0%' : `${percent}%` }}
          />
        </div>
        <div className="flex justify-between mt-1 text-xs text-slate-500">
          <span>{isUnlimited ? 'Unlimited' : `/ ${limit.toLocaleString()}`}</span>
          {!isUnlimited && <span>{Math.round(percent)}%</span>}
        </div>
      </div>
    </div>
  )
}

export default function SubscriptionPage() {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<SubscriptionData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchSubscription() {
      try {
        const res = await apiFetch('/api/admin/subscription')
        if (!res.ok) throw new Error('Failed to fetch subscription')
        const result = await res.json()
        setData(result)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred')
      } finally {
        setLoading(false)
      }
    }
    fetchSubscription()
  }, [])

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          {error || 'Failed to load subscription data'}
        </div>
      </div>
    )
  }

  const tier = data.subscription?.tier || 'STARTER'
  const tierInfo = TIER_DISPLAY[tier] || TIER_DISPLAY.STARTER
  const status = data.subscription?.status || 'ACTIVE'
  const periodEnd = data.subscription?.currentPeriodEnd
    ? new Date(data.subscription.currentPeriodEnd).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : 'N/A'

  return (
    <div className="h-full bg-slate-100">
      <div className="h-full flex flex-col bg-white rounded-xl border border-slate-300 shadow-sm overflow-hidden">
        {/* Header */}
        <div className="flex-shrink-0 border-b border-slate-300 px-6 py-4">
          <div className="flex items-center gap-3">
            <Link href="/admin" className="text-slate-400 hover:text-slate-600">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-slate-400" />
                Subscription & Billing
              </h1>
              <p className="text-sm text-slate-500 mt-0.5">Manage your plan and usage</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6 space-y-6">
          {/* Current Plan */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Current Plan</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <Badge className={tierInfo.color}>{tierInfo.name}</Badge>
                  <span className="text-2xl font-bold text-slate-900">
                    {tier === 'INTERNAL' ? 'Internal Use' : `₹${tierInfo.price}/month`}
                  </span>
                </div>
                <div className="text-right">
                  <Badge variant={status === 'ACTIVE' ? 'default' : 'secondary'}>{status}</Badge>
                  <p className="text-sm text-slate-500 mt-1">Renews: {periodEnd}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Usage Summary */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Usage This Period</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <UsageCard
                  icon={FileText}
                  label="Certificates"
                  used={data.usage.certificatesThisPeriod}
                  limit={data.limits.certificates}
                />
                <UsageCard
                  icon={Users}
                  label="Staff Users"
                  used={data.usage.staffUsers}
                  limit={data.limits.staffUsers}
                />
                <UsageCard
                  icon={Building2}
                  label="Customer Accounts"
                  used={data.usage.customerAccounts}
                  limit={data.limits.customerAccounts}
                />
                <UsageCard
                  icon={Users}
                  label="Customer Users"
                  used={data.usage.customerUsers}
                  limit={data.limits.customerUsers}
                />
              </div>
            </CardContent>
          </Card>

          {/* Current Bill */}
          {tier !== 'INTERNAL' && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Current Bill</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-600">{tierInfo.name} Plan - Monthly</span>
                    <span className="font-medium">₹{tierInfo.price}</span>
                  </div>
                  {(data.subscription?.extraStaffSeats || 0) > 0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-600">
                        Additional Staff Seats ({data.subscription?.extraStaffSeats} × ₹50)
                      </span>
                      <span className="font-medium">
                        ₹{((data.subscription?.extraStaffSeats || 0) * 50).toLocaleString()}
                      </span>
                    </div>
                  )}
                  <div className="border-t pt-2 mt-2">
                    <div className="flex justify-between">
                      <span className="text-slate-600">Subtotal</span>
                      <span>{formatPrice(data.billing.subtotal)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">GST (18%)</span>
                      <span>{formatPrice(data.billing.tax)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-base mt-2">
                      <span>Total</span>
                      <span>{formatPrice(data.billing.total)}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Plan Comparison */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Available Plans</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-3 gap-4">
                {PRICING_TIERS.map((plan) => {
                  const isCurrent = plan.slug === tier
                  return (
                    <div
                      key={plan.slug}
                      className={`relative rounded-lg border-2 p-4 ${
                        isCurrent
                          ? 'border-blue-500 bg-blue-50/50'
                          : plan.recommended
                          ? 'border-purple-300'
                          : 'border-slate-200'
                      }`}
                    >
                      {plan.recommended && !isCurrent && (
                        <Badge className="absolute -top-2 left-1/2 -translate-x-1/2 bg-purple-600">
                          Recommended
                        </Badge>
                      )}
                      {isCurrent && (
                        <Badge className="absolute -top-2 left-1/2 -translate-x-1/2 bg-blue-600">
                          Current
                        </Badge>
                      )}
                      <div className="text-center mb-4 pt-2">
                        <h3 className="font-bold text-lg">{plan.name}</h3>
                        <p className="text-2xl font-bold mt-1">
                          ₹{plan.price}
                          <span className="text-sm font-normal text-slate-500">/mo</span>
                        </p>
                      </div>
                      <div className="space-y-2 text-sm mb-4">
                        <div className="flex justify-between">
                          <span className="text-slate-600">Certificates</span>
                          <span className="font-medium">{plan.certificates}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-600">Staff Users</span>
                          <span className="font-medium">{plan.staffUsers}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-600">Customer Accounts</span>
                          <span className="font-medium">{plan.customerAccounts}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-600">Customer Users</span>
                          <span className="font-medium">{plan.customerUsers}</span>
                        </div>
                      </div>
                      <ul className="space-y-1 text-xs text-slate-600 mb-4">
                        {plan.features.map((f) => (
                          <li key={f} className="flex items-center gap-1">
                            <Check className="w-3 h-3 text-green-600" />
                            {f}
                          </li>
                        ))}
                      </ul>
                      <Button
                        className="w-full"
                        variant={isCurrent ? 'outline' : 'default'}
                        disabled={isCurrent || tier === 'INTERNAL'}
                      >
                        {isCurrent ? 'Current Plan' : 'Select Plan'}
                      </Button>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
