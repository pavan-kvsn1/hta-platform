/**
 * Subscription Pricing Unit Tests
 *
 * Tests for:
 * - TIER_PRICES — correct pricing per tier
 * - OVERAGE_PRICES — correct add-on pricing
 * - PRICING_TIERS — complete tier definitions
 * - calculateMonthlyBill() — base plan, add-ons, GST, totals
 * - formatPrice() — INR formatting from paise
 * - generateLineItems() — invoice line items generation
 */

import { describe, it, expect } from 'vitest'
import {
  TIER_PRICES,
  OVERAGE_PRICES,
  GST_RATE,
  PRICING_TIERS,
  calculateMonthlyBill,
  formatPrice,
  generateLineItems,
} from '../src/subscription/pricing'

describe('TIER_PRICES', () => {
  it('STARTER costs 299900 paise (INR 2999)', () => {
    expect(TIER_PRICES.STARTER).toBe(299900)
  })

  it('GROWTH costs 599900 paise (INR 5999)', () => {
    expect(TIER_PRICES.GROWTH).toBe(599900)
  })

  it('SCALE costs 1199900 paise (INR 11999)', () => {
    expect(TIER_PRICES.SCALE).toBe(1199900)
  })

  it('INTERNAL is free', () => {
    expect(TIER_PRICES.INTERNAL).toBe(0)
  })

  it('higher tiers cost more', () => {
    expect(TIER_PRICES.GROWTH).toBeGreaterThan(TIER_PRICES.STARTER)
    expect(TIER_PRICES.SCALE).toBeGreaterThan(TIER_PRICES.GROWTH)
  })
})

describe('OVERAGE_PRICES', () => {
  it('staff user add-on is 5000 paise (INR 50)', () => {
    expect(OVERAGE_PRICES.staffUser).toBe(5000)
  })

  it('customer account add-on is 50000 paise (INR 500)', () => {
    expect(OVERAGE_PRICES.customerAccount).toBe(50000)
  })

  it('customer user add-on is 10000 paise (INR 100)', () => {
    expect(OVERAGE_PRICES.customerUser).toBe(10000)
  })
})

describe('GST_RATE', () => {
  it('is 18%', () => {
    expect(GST_RATE).toBe(0.18)
  })
})

describe('PRICING_TIERS', () => {
  it('has 3 tiers (Starter, Growth, Scale)', () => {
    expect(PRICING_TIERS).toHaveLength(3)
  })

  it('each tier has all required fields', () => {
    for (const tier of PRICING_TIERS) {
      expect(tier).toHaveProperty('name')
      expect(tier).toHaveProperty('slug')
      expect(tier).toHaveProperty('monthlyPrice')
      expect(tier).toHaveProperty('displayPrice')
      expect(tier).toHaveProperty('certificates')
      expect(tier).toHaveProperty('staffUsers')
      expect(tier).toHaveProperty('customerAccounts')
      expect(tier).toHaveProperty('customerUsers')
      expect(tier).toHaveProperty('features')
      expect(Array.isArray(tier.features)).toBe(true)
      expect(tier.features.length).toBeGreaterThan(0)
    }
  })

  it('Growth is the recommended tier', () => {
    const growth = PRICING_TIERS.find(t => t.slug === 'GROWTH')
    expect(growth?.recommended).toBe(true)
  })

  it('Scale has Unlimited resources', () => {
    const scale = PRICING_TIERS.find(t => t.slug === 'SCALE')
    expect(scale?.certificates).toBe('Unlimited')
    expect(scale?.staffUsers).toBe('Unlimited')
  })
})

describe('calculateMonthlyBill', () => {
  it('returns correct base plan for STARTER with no extras', () => {
    const bill = calculateMonthlyBill('STARTER')

    expect(bill.basePlan.tier).toBe('STARTER')
    expect(bill.basePlan.price).toBe(299900)
    expect(bill.addOns.extraStaffSeats).toBe(0)
    expect(bill.addOns.extraStaffPrice).toBe(0)
    expect(bill.subtotal).toBe(299900)
    expect(bill.tax).toBe(Math.round(299900 * 0.18))
    expect(bill.total).toBe(299900 + Math.round(299900 * 0.18))
  })

  it('includes extra staff seat pricing', () => {
    const bill = calculateMonthlyBill('STARTER', 3)

    expect(bill.addOns.extraStaffSeats).toBe(3)
    expect(bill.addOns.extraStaffPrice).toBe(3 * 5000) // 15000
    expect(bill.subtotal).toBe(299900 + 15000)
  })

  it('includes extra customer account pricing', () => {
    const bill = calculateMonthlyBill('STARTER', 0, 5)

    expect(bill.addOns.extraCustomerAccounts).toBe(5)
    expect(bill.addOns.extraCustomerAccountsPrice).toBe(5 * 50000) // 250000
    expect(bill.subtotal).toBe(299900 + 250000)
  })

  it('includes extra customer user seat pricing', () => {
    const bill = calculateMonthlyBill('STARTER', 0, 0, 10)

    expect(bill.addOns.extraCustomerUserSeats).toBe(10)
    expect(bill.addOns.extraCustomerUserSeatsPrice).toBe(10 * 10000) // 100000
    expect(bill.subtotal).toBe(299900 + 100000)
  })

  it('calculates tax correctly (18% GST)', () => {
    const bill = calculateMonthlyBill('GROWTH')

    const expectedTax = Math.round(599900 * 0.18)
    expect(bill.tax).toBe(expectedTax)
    expect(bill.total).toBe(599900 + expectedTax)
  })

  it('INTERNAL tier has zero cost', () => {
    const bill = calculateMonthlyBill('INTERNAL')

    expect(bill.basePlan.price).toBe(0)
    expect(bill.subtotal).toBe(0)
    expect(bill.tax).toBe(0)
    expect(bill.total).toBe(0)
  })

  it('combines all add-ons correctly', () => {
    const bill = calculateMonthlyBill('GROWTH', 2, 3, 5)

    const expectedStaff = 2 * 5000
    const expectedAccounts = 3 * 50000
    const expectedUsers = 5 * 10000
    const expectedSubtotal = 599900 + expectedStaff + expectedAccounts + expectedUsers
    const expectedTax = Math.round(expectedSubtotal * 0.18)

    expect(bill.subtotal).toBe(expectedSubtotal)
    expect(bill.tax).toBe(expectedTax)
    expect(bill.total).toBe(expectedSubtotal + expectedTax)
  })
})

describe('formatPrice', () => {
  it('formats paise to INR', () => {
    const result = formatPrice(299900)
    // Should contain the rupee symbol or "INR" and the number
    expect(result).toContain('2,999')
  })

  it('formats zero correctly', () => {
    const result = formatPrice(0)
    expect(result).toContain('0')
  })

  it('formats large amounts', () => {
    const result = formatPrice(1199900)
    expect(result).toContain('11,999')
  })
})

describe('generateLineItems', () => {
  it('generates base plan line item', () => {
    const items = generateLineItems('STARTER')

    expect(items).toHaveLength(1)
    expect(items[0].description).toContain('Starter')
    expect(items[0].description).toContain('Monthly')
    expect(items[0].quantity).toBe(1)
    expect(items[0].unitPrice).toBe(299900)
    expect(items[0].amount).toBe(299900)
  })

  it('includes extra staff seats line item', () => {
    const items = generateLineItems('STARTER', 3)

    expect(items).toHaveLength(2)
    const staffItem = items.find(i => i.description.includes('Staff'))
    expect(staffItem).toBeDefined()
    expect(staffItem!.quantity).toBe(3)
    expect(staffItem!.unitPrice).toBe(5000)
    expect(staffItem!.amount).toBe(15000)
  })

  it('includes extra customer accounts line item', () => {
    const items = generateLineItems('STARTER', 0, 5)

    expect(items).toHaveLength(2)
    const accountItem = items.find(i => i.description.includes('Customer Accounts'))
    expect(accountItem).toBeDefined()
    expect(accountItem!.quantity).toBe(5)
    expect(accountItem!.amount).toBe(250000)
  })

  it('includes extra customer user seats line item', () => {
    const items = generateLineItems('STARTER', 0, 0, 10)

    expect(items).toHaveLength(2)
    const userItem = items.find(i => i.description.includes('Customer User'))
    expect(userItem).toBeDefined()
    expect(userItem!.quantity).toBe(10)
    expect(userItem!.amount).toBe(100000)
  })

  it('omits add-on line items when count is zero', () => {
    const items = generateLineItems('STARTER', 0, 0, 0)

    expect(items).toHaveLength(1)
  })

  it('includes all line items when all add-ons present', () => {
    const items = generateLineItems('GROWTH', 2, 3, 5)

    expect(items).toHaveLength(4) // base + 3 add-ons
  })

  it('formats tier name correctly for plan description', () => {
    const starterItems = generateLineItems('STARTER')
    expect(starterItems[0].description).toContain('Starter')

    const growthItems = generateLineItems('GROWTH')
    expect(growthItems[0].description).toContain('Growth')

    const scaleItems = generateLineItems('SCALE')
    expect(scaleItems[0].description).toContain('Scale')
  })
})
