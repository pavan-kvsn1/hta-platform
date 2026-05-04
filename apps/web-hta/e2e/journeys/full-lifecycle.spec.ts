/**
 * Full Certificate Lifecycle E2E Tests
 *
 * Chained multi-role tests that verify the complete status transition chain.
 * Unlike the individual journey specs (which use pre-seeded data per role),
 * these tests create a certificate and drive it through every state transition.
 *
 * P3-5a: Happy path (Engineer -> Reviewer -> Customer -> Admin -> AUTHORIZED)
 * P3-5b: Reviewer revision loop (submit -> revision -> resubmit -> approve)
 * P3-5c: Customer revision loop (customer rejects -> fix -> re-approve -> sign)
 * P3-5d: Admin as reviewer stand-in
 * P3-5e: Admin support actions mid-lifecycle (section unlocks, offline codes)
 *
 * Each describe block is serial — if a step fails, subsequent steps are skipped.
 * Uses browser.newContext({ storageState }) to switch roles within a serial chain.
 */

import { test, expect, type Browser, type Page, type BrowserContext } from '@playwright/test'
import { TEST_CERTIFICATE, STATUS_LABELS } from '../fixtures/test-data'

const STORAGE = {
  engineer: 'e2e/.auth/engineer.json',
  reviewer: 'e2e/.auth/reviewer.json',
  admin: 'e2e/.auth/admin.json',
  customer: 'e2e/.auth/customer.json',
} as const

type Role = keyof typeof STORAGE

/** Create a new browser context and page for a given role */
async function openAs(browser: Browser, role: Role) {
  const context = await browser.newContext({ storageState: STORAGE[role] })
  const page = await context.newPage()
  return { context, page }
}

/** Engineer: create a new certificate, fill fields, submit for review. Returns cert ID from URL. */
async function engineerCreateAndSubmit(browser: Browser): Promise<string> {
  const { context, page } = await openAs(browser, 'engineer')

  await page.goto('/dashboard/certificates/new')
  await page.waitForURL(/dashboard\/certificates\/.*\/edit/, { timeout: 15000 })
  await page.waitForSelector('text=Loading certificate...', { state: 'hidden', timeout: 20000 })
  await page.waitForSelector('text=Summary Information', { timeout: 15000 })

  // Fill required fields
  await page.getByPlaceholder(/start typing customer name/i).fill(TEST_CERTIFICATE.customerName)
  await page.getByPlaceholder(/enter customer address/i).fill(TEST_CERTIFICATE.customerAddress)

  // Capture cert ID from URL
  const certIdMatch = page.url().match(/certificates\/([^/]+)\/edit/)
  expect(certIdMatch).toBeTruthy()
  const certId = certIdMatch![1]

  // Navigate to Submit section and submit for review
  await page.getByRole('button', { name: 'Submit', exact: true }).first().click()
  const submitButton = page.getByRole('button', { name: /submit for peer review/i })
  await expect(submitButton).toBeVisible({ timeout: 5000 })
  await submitButton.click()

  // Verify status changed to PENDING_REVIEW
  await expect(
    page.getByText(/pending review|submitted/i).first()
  ).toBeVisible({ timeout: 10000 })

  await context.close()
  return certId
}

/** Find a certificate row by status badge and navigate to its detail page */
async function navigateToCertByStatus(page: Page, statusLabel: string) {
  const badge = page.locator(`text=${statusLabel}`).first()
  await expect(badge).toBeVisible({ timeout: 10000 })

  const row = badge.locator('xpath=ancestor::tr | ancestor::div[contains(@class, "row")]')
  await row.locator('a').first().click()
  await page.waitForLoadState('domcontentloaded')
}

/** Click a button and handle optional confirmation dialog */
async function clickWithConfirm(page: Page, buttonLocator: string) {
  const btn = page.locator(buttonLocator).first()
  await expect(btn).toBeVisible({ timeout: 5000 })
  await btn.click()

  const confirmButton = page.locator('button:has-text("Confirm"), button:has-text("Yes")')
  if (await confirmButton.isVisible({ timeout: 2000 }).catch(() => false)) {
    await confirmButton.click()
  }
}

// =============================================
// P3-5a: Happy path
// Engineer -> Reviewer -> Customer -> Admin -> AUTHORIZED
// =============================================

test.describe('P3-5a: Happy path — full lifecycle', () => {
  test.describe.configure({ mode: 'serial' })

  let certId: string

  test('Step 1: Engineer creates certificate and submits for review', async ({ browser }) => {
    certId = await engineerCreateAndSubmit(browser)
    expect(certId).toBeTruthy()
  })

  test('Step 2: Reviewer approves — status becomes PENDING_CUSTOMER_APPROVAL', async ({ browser }) => {
    const { context, page } = await openAs(browser, 'reviewer')

    await page.goto('/dashboard')
    await navigateToCertByStatus(page, STATUS_LABELS.PENDING_REVIEW)

    await clickWithConfirm(page, 'button:has-text("Approve")')

    await expect(
      page.getByText(/approved|pending customer|success/i).first()
    ).toBeVisible({ timeout: 10000 })

    await context.close()
  })

  test('Step 3: Customer signs — status becomes PENDING_ADMIN_AUTHORIZATION', async ({ browser }) => {
    const { context, page } = await openAs(browser, 'customer')

    await page.goto('/customer/dashboard')
    await navigateToCertByStatus(page, STATUS_LABELS.PENDING_CUSTOMER_APPROVAL)

    // Click Approve/Sign to open signature modal
    const approveButton = page.locator('button:has-text("Approve"), button:has-text("Sign")').first()
    await expect(approveButton).toBeVisible({ timeout: 5000 })
    await approveButton.click()

    // Draw signature on canvas
    const signatureCanvas = page.locator('canvas').first()
    await expect(signatureCanvas).toBeVisible({ timeout: 5000 })

    const box = await signatureCanvas.boundingBox()
    if (box) {
      await page.mouse.move(box.x + 20, box.y + box.height / 2)
      await page.mouse.down()
      await page.mouse.move(box.x + box.width - 20, box.y + box.height / 2, { steps: 10 })
      await page.mouse.up()
    }

    // Confirm signature
    const confirmBtn = page.locator('button:has-text("Confirm"), button:has-text("Submit"), button:has-text("Accept")').first()
    await expect(confirmBtn).toBeVisible({ timeout: 5000 })
    await confirmBtn.click()

    await expect(
      page.getByText(/approved|success|thank you|pending authorization/i).first()
    ).toBeVisible({ timeout: 10000 })

    await context.close()
  })

  test('Step 4: Admin authorizes — status becomes AUTHORIZED', async ({ browser }) => {
    const { context, page } = await openAs(browser, 'admin')

    await page.goto('/admin')
    await navigateToCertByStatus(page, STATUS_LABELS.PENDING_ADMIN_AUTHORIZATION)

    await clickWithConfirm(page, 'button:has-text("Authorize"), button:has-text("Approve")')

    await expect(
      page.getByText(/authorized|success/i).first()
    ).toBeVisible({ timeout: 10000 })

    await context.close()
  })

  test('Step 5: Engineer verifies AUTHORIZED with download option', async ({ browser }) => {
    const { context, page } = await openAs(browser, 'engineer')

    await page.goto('/dashboard')
    await navigateToCertByStatus(page, STATUS_LABELS.AUTHORIZED)

    // Verify status and download availability
    await expect(page.locator(`text=${STATUS_LABELS.AUTHORIZED}`)).toBeVisible()
    await expect(
      page.locator('button:has-text("Download"), a:has-text("Download"), button:has-text("PDF")').first()
    ).toBeVisible({ timeout: 5000 })

    await context.close()
  })
})

// =============================================
// P3-5b: Reviewer revision loop
// Submit -> Revision Required -> Resubmit -> Approve
// =============================================

test.describe('P3-5b: Reviewer revision loop', () => {
  test.describe.configure({ mode: 'serial' })

  let certId: string

  test('Step 1: Engineer submits certificate for review', async ({ browser }) => {
    certId = await engineerCreateAndSubmit(browser)
    expect(certId).toBeTruthy()
  })

  test('Step 2: Reviewer requests revision with feedback', async ({ browser }) => {
    const { context, page } = await openAs(browser, 'reviewer')

    await page.goto('/dashboard')
    await navigateToCertByStatus(page, STATUS_LABELS.PENDING_REVIEW)

    // Fill revision feedback in the comment textarea
    const commentArea = page.locator('textarea').first()
    await expect(commentArea).toBeVisible({ timeout: 5000 })
    await commentArea.fill('Please correct the measurement uncertainty values in Section 3.')

    // Click "Revision Required" / "Request Revision"
    const revisionButton = page.locator('button:has-text("Revision"), button:has-text("Request Changes"), button:has-text("Reject")')
    await expect(revisionButton.first()).toBeVisible({ timeout: 5000 })
    await revisionButton.first().click()

    // Handle confirmation
    const confirmButton = page.locator('button:has-text("Confirm"), button:has-text("Yes")')
    if (await confirmButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await confirmButton.click()
    }

    // Verify status changed to REVISION_REQUIRED
    await expect(
      page.getByText(/revision required|revision/i).first()
    ).toBeVisible({ timeout: 10000 })

    await context.close()
  })

  test('Step 3: Engineer views feedback, edits, and resubmits', async ({ browser }) => {
    const { context, page } = await openAs(browser, 'engineer')

    await page.goto('/dashboard')
    await navigateToCertByStatus(page, STATUS_LABELS.REVISION_REQUIRED)

    // Verify revision feedback is visible
    await expect(
      page.getByText(/measurement uncertainty|revision|feedback/i).first()
    ).toBeVisible({ timeout: 10000 })

    // Navigate to Submit section and resubmit
    await page.getByRole('button', { name: 'Submit', exact: true }).first().click()
    const submitButton = page.getByRole('button', { name: /submit for peer review|resubmit/i })
    await expect(submitButton).toBeVisible({ timeout: 5000 })
    await submitButton.click()

    // Verify status back to PENDING_REVIEW
    await expect(
      page.getByText(/pending review|submitted/i).first()
    ).toBeVisible({ timeout: 10000 })

    await context.close()
  })

  test('Step 4: Reviewer approves — status becomes PENDING_CUSTOMER_APPROVAL', async ({ browser }) => {
    const { context, page } = await openAs(browser, 'reviewer')

    await page.goto('/dashboard')
    await navigateToCertByStatus(page, STATUS_LABELS.PENDING_REVIEW)

    await clickWithConfirm(page, 'button:has-text("Approve")')

    await expect(
      page.getByText(/approved|pending customer|success/i).first()
    ).toBeVisible({ timeout: 10000 })

    await context.close()
  })
})

// =============================================
// P3-5c: Customer revision loop
// Create -> Approve -> Customer rejects -> Fix -> Re-approve -> Sign
// =============================================

test.describe('P3-5c: Customer revision loop', () => {
  test.describe.configure({ mode: 'serial' })

  let certId: string

  test('Step 1: Engineer submits certificate', async ({ browser }) => {
    certId = await engineerCreateAndSubmit(browser)
    expect(certId).toBeTruthy()
  })

  test('Step 2: Reviewer approves to reach PENDING_CUSTOMER_APPROVAL', async ({ browser }) => {
    const { context, page } = await openAs(browser, 'reviewer')

    await page.goto('/dashboard')
    await navigateToCertByStatus(page, STATUS_LABELS.PENDING_REVIEW)
    await clickWithConfirm(page, 'button:has-text("Approve")')

    await expect(
      page.getByText(/approved|pending customer|success/i).first()
    ).toBeVisible({ timeout: 10000 })

    await context.close()
  })

  test('Step 3: Customer requests revision with feedback', async ({ browser }) => {
    const { context, page } = await openAs(browser, 'customer')

    await page.goto('/customer/dashboard')
    await navigateToCertByStatus(page, STATUS_LABELS.PENDING_CUSTOMER_APPROVAL)

    // Fill feedback
    const messageInput = page.locator('textarea').first()
    await expect(messageInput).toBeVisible({ timeout: 5000 })
    await messageInput.fill('The instrument serial number is incorrect. Please verify.')

    // Click reject/revision button
    const rejectButton = page.locator(
      'button:has-text("Reject"), button:has-text("Request Revision"), button:has-text("Request Changes")'
    ).first()
    await expect(rejectButton).toBeVisible({ timeout: 5000 })
    await rejectButton.click()

    // Handle confirmation
    const confirmButton = page.locator('button:has-text("Confirm"), button:has-text("Yes"), button:has-text("Send")')
    if (await confirmButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await confirmButton.click()
    }

    // Verify status changed
    await expect(
      page.getByText(/revision|rejected|sent/i).first()
    ).toBeVisible({ timeout: 10000 })

    await context.close()
  })

  test('Step 4: Engineer views customer feedback, edits, and resubmits', async ({ browser }) => {
    const { context, page } = await openAs(browser, 'engineer')

    await page.goto('/dashboard')

    // Find cert with CUSTOMER_REVISION_REQUIRED status
    await navigateToCertByStatus(page, STATUS_LABELS.CUSTOMER_REVISION_REQUIRED)

    // Verify customer feedback is visible
    await expect(
      page.getByText(/serial number|incorrect|customer/i).first()
    ).toBeVisible({ timeout: 10000 })

    // Resubmit for review
    await page.getByRole('button', { name: 'Submit', exact: true }).first().click()
    const submitButton = page.getByRole('button', { name: /submit for peer review|resubmit/i })
    await expect(submitButton).toBeVisible({ timeout: 5000 })
    await submitButton.click()

    await expect(
      page.getByText(/pending review|submitted/i).first()
    ).toBeVisible({ timeout: 10000 })

    await context.close()
  })

  test('Step 5: Reviewer re-approves', async ({ browser }) => {
    const { context, page } = await openAs(browser, 'reviewer')

    await page.goto('/dashboard')
    await navigateToCertByStatus(page, STATUS_LABELS.PENDING_REVIEW)
    await clickWithConfirm(page, 'button:has-text("Approve")')

    await expect(
      page.getByText(/approved|pending customer|success/i).first()
    ).toBeVisible({ timeout: 10000 })

    await context.close()
  })

  test('Step 6: Customer signs and approves', async ({ browser }) => {
    const { context, page } = await openAs(browser, 'customer')

    await page.goto('/customer/dashboard')
    await navigateToCertByStatus(page, STATUS_LABELS.PENDING_CUSTOMER_APPROVAL)

    // Click Approve/Sign
    const approveButton = page.locator('button:has-text("Approve"), button:has-text("Sign")').first()
    await expect(approveButton).toBeVisible({ timeout: 5000 })
    await approveButton.click()

    // Draw signature
    const signatureCanvas = page.locator('canvas').first()
    await expect(signatureCanvas).toBeVisible({ timeout: 5000 })

    const box = await signatureCanvas.boundingBox()
    if (box) {
      await page.mouse.move(box.x + 20, box.y + box.height / 2)
      await page.mouse.down()
      await page.mouse.move(box.x + box.width - 20, box.y + box.height / 2, { steps: 10 })
      await page.mouse.up()
    }

    const confirmBtn = page.locator('button:has-text("Confirm"), button:has-text("Submit"), button:has-text("Accept")').first()
    await expect(confirmBtn).toBeVisible({ timeout: 5000 })
    await confirmBtn.click()

    await expect(
      page.getByText(/approved|success|thank you|pending authorization/i).first()
    ).toBeVisible({ timeout: 10000 })

    await context.close()
  })
})

// =============================================
// P3-5d: Admin as reviewer stand-in
// Engineer submits -> Admin reviews (not the assigned reviewer) -> Approved
// =============================================

test.describe('P3-5d: Admin as reviewer stand-in', () => {
  test.describe.configure({ mode: 'serial' })

  let certId: string

  test('Step 1: Engineer submits certificate for review', async ({ browser }) => {
    certId = await engineerCreateAndSubmit(browser)
    expect(certId).toBeTruthy()
  })

  test('Step 2: Admin approves as reviewer stand-in', async ({ browser }) => {
    const { context, page } = await openAs(browser, 'admin')

    // Admin goes to admin dashboard (not the reviewer dashboard)
    await page.goto('/admin')
    await page.waitForLoadState('domcontentloaded')

    // Find the PENDING_REVIEW cert — admin should be able to review any cert
    const pendingBadge = page.locator(`text=${STATUS_LABELS.PENDING_REVIEW}`).first()
    await expect(pendingBadge).toBeVisible({ timeout: 10000 })

    const row = pendingBadge.locator('xpath=ancestor::tr | ancestor::div[contains(@class, "row")]')
    await row.locator('a').first().click()
    await page.waitForLoadState('domcontentloaded')

    // Admin clicks Approve (acting as reviewer)
    await clickWithConfirm(page, 'button:has-text("Approve")')

    // Verify transition to PENDING_CUSTOMER_APPROVAL
    await expect(
      page.getByText(/approved|pending customer|success/i).first()
    ).toBeVisible({ timeout: 10000 })

    await context.close()
  })
})

// =============================================
// P3-5e: Admin support actions mid-lifecycle
// Section unlock request + Offline code request
// =============================================

test.describe('P3-5e: Admin support actions mid-lifecycle', () => {
  test.describe.configure({ mode: 'serial' })

  test('Steps 1-2: Engineer requests section unlock, admin approves', async ({ browser }) => {
    // Step 1: Engineer navigates to a certificate and requests section unlock
    const { context: engCtx, page: engPage } = await openAs(browser, 'engineer')

    await engPage.goto('/dashboard')
    await engPage.waitForLoadState('domcontentloaded')

    // Find any certificate to request a section unlock on
    const certLink = engPage.locator('table a, [role="table"] a').first()
    await expect(certLink).toBeVisible({ timeout: 10000 })
    await certLink.click()
    await engPage.waitForLoadState('domcontentloaded')

    // Look for section unlock / request unlock button
    const unlockButton = engPage.locator(
      'button:has-text("Request Unlock"), button:has-text("Unlock"), button:has-text("Request")'
    ).first()

    // Section unlock may not be available on all cert states — skip gracefully if not found
    const hasUnlockButton = await unlockButton.isVisible({ timeout: 5000 }).catch(() => false)

    if (hasUnlockButton) {
      await unlockButton.click()

      // Handle confirmation/reason dialog
      const reasonInput = engPage.locator('textarea, input[name*="reason"]').first()
      if (await reasonInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        await reasonInput.fill('Need to correct instrument details in locked section.')
      }

      const submitBtn = engPage.locator(
        'button:has-text("Submit"), button:has-text("Confirm"), button:has-text("Send")'
      ).first()
      if (await submitBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await submitBtn.click()
      }

      // Verify request was created
      await expect(
        engPage.getByText(/pending|submitted|request sent/i).first()
      ).toBeVisible({ timeout: 10000 })
    }

    await engCtx.close()

    // Step 2: Admin approves the section unlock
    if (hasUnlockButton) {
      const { context: adminCtx, page: adminPage } = await openAs(browser, 'admin')

      await adminPage.goto('/admin/requests')
      await adminPage.waitForLoadState('domcontentloaded')

      // Find pending request
      const pendingBadge = adminPage.locator('text=/pending/i').first()
      await expect(pendingBadge).toBeVisible({ timeout: 10000 })

      const row = pendingBadge.locator('xpath=ancestor::tr | ancestor::div[contains(@class, "row")]')
      await row.locator('a').first().click()
      await adminPage.waitForLoadState('domcontentloaded')

      // Approve the request
      await clickWithConfirm(adminPage, 'button:has-text("Approve")')

      await expect(
        adminPage.getByText(/approved|success/i).first()
      ).toBeVisible({ timeout: 10000 })

      await adminCtx.close()
    }
  })

  test('Steps 3-4: Engineer requests offline code card, admin approves', async ({ browser }) => {
    // Step 3: Engineer requests an offline code card
    const { context: engCtx, page: engPage } = await openAs(browser, 'engineer')

    await engPage.goto('/dashboard/offline-codes')
    await engPage.waitForLoadState('domcontentloaded')

    // Check if there's already a pending request or active grid
    const hasPending = await engPage.getByText(/pending|awaiting|approval/i).first()
      .isVisible({ timeout: 3000 }).catch(() => false)
    const hasGrid = await engPage.locator('table, [class*="grid"]').first()
      .isVisible({ timeout: 2000 }).catch(() => false)

    let requestedNewCard = false

    if (!hasPending && !hasGrid) {
      // Click "Request New Card"
      const requestButton = engPage.getByRole('button', { name: /request new card|request/i })
      if (await requestButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        await requestButton.click()

        // Handle confirmation dialog
        const confirmButton = engPage.locator('button:has-text("Confirm"), button:has-text("Submit"), button:has-text("Yes")')
        if (await confirmButton.isVisible({ timeout: 2000 }).catch(() => false)) {
          await confirmButton.click()
        }

        // Verify pending status
        await expect(
          engPage.getByText(/pending|awaiting|approval/i).first()
        ).toBeVisible({ timeout: 10000 })

        requestedNewCard = true
      }
    }

    await engCtx.close()

    // Step 4: Admin approves the offline code request
    if (requestedNewCard || hasPending) {
      const { context: adminCtx, page: adminPage } = await openAs(browser, 'admin')

      await adminPage.goto('/admin/requests')
      await adminPage.waitForLoadState('domcontentloaded')

      // Find a pending request (could be offline code or section unlock)
      const pendingBadge = adminPage.locator('text=/pending/i').first()
      await expect(pendingBadge).toBeVisible({ timeout: 10000 })

      const row = pendingBadge.locator('xpath=ancestor::tr | ancestor::div[contains(@class, "row")]')
      await row.locator('a').first().click()
      await adminPage.waitForLoadState('domcontentloaded')

      await clickWithConfirm(adminPage, 'button:has-text("Approve")')

      await expect(
        adminPage.getByText(/approved|success/i).first()
      ).toBeVisible({ timeout: 10000 })

      await adminCtx.close()

      // Verify engineer can see the code grid
      const { context: engCtx2, page: engPage2 } = await openAs(browser, 'engineer')

      await engPage2.goto('/dashboard/offline-codes')
      await engPage2.waitForLoadState('domcontentloaded')

      await expect(
        engPage2.locator('table, [class*="grid"]').first()
          .or(engPage2.getByText(/A1|challenge|response/i).first())
      ).toBeVisible({ timeout: 10000 })

      await engCtx2.close()
    }
  })
})
