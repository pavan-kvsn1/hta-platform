/**
 * Subscription Pricing Constants
 * All prices in paise (INR * 100)
 */

import type { TenantTier } from './limits'

// Base tier pricing (monthly, in paise)
export const TIER_PRICES: Record<TenantTier, number> = {
  STARTER: 299900, // ₹2,999
  GROWTH: 599900, // ₹5,999
  SCALE: 1199900, // ₹11,999
  INTERNAL: 0, // HTA's own tier - no charge
}

// Overage/add-on pricing (per unit per month, in paise)
export const OVERAGE_PRICES = {
  staffUser: 5000, // ₹50
  customerAccount: 50000, // ₹500
  customerUser: 10000, // ₹100
}

// GST rate
export const GST_RATE = 0.18 // 18%

export interface PricingTier {
  name: string
  slug: TenantTier
  monthlyPrice: number // in paise
  displayPrice: string // formatted INR
  certificates: number | 'Unlimited'
  staffUsers: number | 'Unlimited'
  customerAccounts: number | 'Unlimited'
  customerUsers: number | 'Unlimited'
  features: string[]
  recommended?: boolean
}

export const PRICING_TIERS: PricingTier[] = [
  {
    name: 'Starter',
    slug: 'STARTER',
    monthlyPrice: 299900,
    displayPrice: '₹2,999',
    certificates: 500,
    staffUsers: 5,
    customerAccounts: 20,
    customerUsers: 50,
    features: [
      'Certificate management',
      'Customer portal',
      'Email notifications',
      'Basic workflows',
      'Standard support',
    ],
  },
  {
    name: 'Growth',
    slug: 'GROWTH',
    monthlyPrice: 599900,
    displayPrice: '₹5,999',
    certificates: 5000,
    staffUsers: 15,
    customerAccounts: 100,
    customerUsers: 300,
    features: [
      'Everything in Starter',
      'Custom branding',
      'API access',
      'Advanced workflows',
      'Priority support',
    ],
    recommended: true,
  },
  {
    name: 'Scale',
    slug: 'SCALE',
    monthlyPrice: 1199900,
    displayPrice: '₹11,999',
    certificates: 'Unlimited',
    staffUsers: 'Unlimited',
    customerAccounts: 'Unlimited',
    customerUsers: 'Unlimited',
    features: [
      'Everything in Growth',
      'Unlimited certificates',
      'Unlimited users',
      'White-label option',
      'Dedicated support',
      'Custom integrations',
    ],
  },
]

/**
 * Calculate total monthly bill
 */
export interface BillCalculation {
  basePlan: {
    tier: TenantTier
    price: number
  }
  addOns: {
    extraStaffSeats: number
    extraStaffPrice: number
    extraCustomerAccounts: number
    extraCustomerAccountsPrice: number
    extraCustomerUserSeats: number
    extraCustomerUserSeatsPrice: number
  }
  subtotal: number
  tax: number
  total: number
}

export function calculateMonthlyBill(
  tier: TenantTier,
  extraStaffSeats: number = 0,
  extraCustomerAccounts: number = 0,
  extraCustomerUserSeats: number = 0
): BillCalculation {
  const basePlanPrice = TIER_PRICES[tier]

  const extraStaffPrice = extraStaffSeats * OVERAGE_PRICES.staffUser
  const extraCustomerAccountsPrice =
    extraCustomerAccounts * OVERAGE_PRICES.customerAccount
  const extraCustomerUserSeatsPrice =
    extraCustomerUserSeats * OVERAGE_PRICES.customerUser

  const subtotal =
    basePlanPrice +
    extraStaffPrice +
    extraCustomerAccountsPrice +
    extraCustomerUserSeatsPrice
  const tax = Math.round(subtotal * GST_RATE)
  const total = subtotal + tax

  return {
    basePlan: {
      tier,
      price: basePlanPrice,
    },
    addOns: {
      extraStaffSeats,
      extraStaffPrice,
      extraCustomerAccounts,
      extraCustomerAccountsPrice,
      extraCustomerUserSeats,
      extraCustomerUserSeatsPrice,
    },
    subtotal,
    tax,
    total,
  }
}

/**
 * Format price in INR (from paise)
 */
export function formatPrice(paise: number): string {
  const rupees = paise / 100
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(rupees)
}

/**
 * Generate invoice line items
 */
export interface InvoiceLineItem {
  description: string
  quantity: number
  unitPrice: number
  amount: number
}

export function generateLineItems(
  tier: TenantTier,
  extraStaffSeats: number = 0,
  extraCustomerAccounts: number = 0,
  extraCustomerUserSeats: number = 0
): InvoiceLineItem[] {
  const items: InvoiceLineItem[] = []

  // Base plan
  items.push({
    description: `${tier.charAt(0) + tier.slice(1).toLowerCase()} Plan - Monthly`,
    quantity: 1,
    unitPrice: TIER_PRICES[tier],
    amount: TIER_PRICES[tier],
  })

  // Extra staff seats
  if (extraStaffSeats > 0) {
    items.push({
      description: 'Additional Staff Seats',
      quantity: extraStaffSeats,
      unitPrice: OVERAGE_PRICES.staffUser,
      amount: extraStaffSeats * OVERAGE_PRICES.staffUser,
    })
  }

  // Extra customer accounts
  if (extraCustomerAccounts > 0) {
    items.push({
      description: 'Additional Customer Accounts',
      quantity: extraCustomerAccounts,
      unitPrice: OVERAGE_PRICES.customerAccount,
      amount: extraCustomerAccounts * OVERAGE_PRICES.customerAccount,
    })
  }

  // Extra customer user seats
  if (extraCustomerUserSeats > 0) {
    items.push({
      description: 'Additional Customer User Seats',
      quantity: extraCustomerUserSeats,
      unitPrice: OVERAGE_PRICES.customerUser,
      amount: extraCustomerUserSeats * OVERAGE_PRICES.customerUser,
    })
  }

  return items
}
