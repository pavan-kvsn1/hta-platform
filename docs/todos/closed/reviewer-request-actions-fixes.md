# Reviewer Request Actions — Versioning, Blocking & History

## Problem

Three issues with how "Request Actions" (field change requests from reviewer to admin) work on the reviewer certificate page (`/dashboard/reviewer/[id]`):

### Issue 1: Admin response lands in wrong revision

When a customer requests revision on multiple sections, the reviewer forwards some fields to the admin as "Request Actions" (field change requests). The flow is:

```
Rev 2: Customer requests revision → Reviewer raises field change request to admin
Rev 2: Engineer resubmits revised cert → Rev 3 begins
Rev 3: Admin approves/rejects the field change request
```

The admin's approval/rejection is timestamped during Rev 3, so the feedback timeline groups it under Rev 3. But logically it belongs to Rev 2 — the revision where the customer feedback originated. This breaks the audit trail.

**Screenshot evidence:** Certificate HTA/00002/24/04 — Customer feedback "The calibration date needs to be changed to 23rd April" appears under "Revision 1 → 2" (correct), but the resulting "Field Change Applied" appears under "Revision 2 → 3" (wrong). The field change was the engineer's response TO that customer feedback — it should be grouped with it under "Revision 1 → 2".

**Expected:** The admin's response should appear under the revision where the request was raised, not where it was resolved.

### Issue 2: Review actions not blocked during pending admin action

When a reviewer raises a field change request to the admin, the reviewer can still approve/reject/send-to-customer the certificate while the admin hasn't responded yet. This creates inconsistency — the reviewer might approve the cert with outdated field values that the admin hasn't updated yet.

Additionally, when the admin directly edits a field value on the certificate (via the admin edit flow), the reviewer's page doesn't reflect the change until a full page reload. The reviewer sees stale data.

**Expected:**
- If any field change request is PENDING, disable the review action buttons (Approve, Request Revision, Send to Customer) with a message: "Waiting for admin response on field change request"
- When the admin edits a field, the reviewer page should reflect the updated value (either via polling or notification-triggered refresh)

### Issue 3: "System" shown instead of actual admin/user name

On the feedback history timeline, field change requests show "System" as the actor instead of the actual admin who approved/applied the change. This happens because:

1. The API returns `requestedBy: { name: "Kiran Kumar" }` as a nested object
2. The reviewer page's data mapping reads `r.requestedByName` (flat string) which doesn't exist on the API response
3. Falls back to "System" as default

**Screenshot evidence:** Certificate HTA/00002/24/04 — "Revision 2 → 3" shows "System" with "Field Change Applied" badge instead of the admin who approved it.

**Fix:** In `reviewer/[id]/page.tsx`, the `fieldChangeRequests` and `sectionUnlockRequests` mappings need to read `r.requestedBy?.name` (nested object) instead of `r.requestedByName` (flat string). This was partially fixed (the code has type casting) but the fix may not have been deployed.

**Files:**
- `apps/web-hta/src/app/(dashboard)/dashboard/reviewer/[id]/page.tsx` — data mapping
- `apps/web-hta/src/app/(dashboard)/dashboard/reviewer/[id]/ReviewerPageClient.tsx` — rendering

### Issue 4: Request action history lacks detail

The "Request Actions" tab shows previous requests with just their status (Approved/Rejected) but doesn't show:
- Which field was requested to change
- What the old value was
- What the requested new value was (if applicable)
- The admin's note/reason for approval or rejection
- The description the reviewer provided when raising the request

Previous request actions appear as bare status markers with no context.

**Expected:** Each request action card should show:
- Field name (e.g., "Certificate Number", "SRF Number")
- Description/reason from the reviewer
- Admin's note (if approved/rejected)
- Status badge (Pending/Approved/Rejected)
- Timestamp

---

## Scope of Changes

### Phase 1: Fix request action versioning in timeline

**Problem:** Admin approval/rejection event is grouped by timestamp into the wrong revision.

**Files:**
- `apps/web-hta/src/app/(dashboard)/dashboard/reviewer/[id]/ReviewerPageClient.tsx` (or wherever the feedback timeline renders)
- `apps/web-hta/src/components/feedback/shared/FeedbackTimeline.tsx`

**Approach:**
- When grouping timeline items by revision, field change approval/rejection events should inherit the revision number from the original request, not from the event timestamp
- The `FIELD_CHANGE_APPROVED` / `FIELD_CHANGE_REJECTED` events already have metadata with the request ID — use that to look up the original request's revision number
- Alternatively, the API could include `revisionNumber` in the field change event data when creating the event

### Phase 2: Block review actions during pending admin requests

**Files:**
- `apps/web-hta/src/app/(dashboard)/dashboard/reviewer/[id]/page.tsx` — pass `hasPendingFieldChanges` prop
- `apps/web-hta/src/app/(dashboard)/dashboard/reviewer/[id]/ReviewerPageClient.tsx` — disable action buttons

**Approach:**
- Check `fieldChangeRequests` for any with `status === 'PENDING'`
- If pending requests exist:
  - Disable "Approve", "Request Revision", "Send to Customer" buttons
  - Show amber banner: "Review actions paused — waiting for admin response on N field change request(s)"
  - List the pending request fields in the banner
- When the admin responds (approves/rejects), the reviewer should be notified and the page should refresh
  - Use the existing notification system — admin response creates a notification (e.g., `FIELD_CHANGE_APPROVED` / `FIELD_CHANGE_REJECTED`) which the reviewer's notification listener detects, triggering a refetch of the certificate and request data on the reviewer page

### Phase 3: Reflect admin edits in real-time

**Files:**
- `apps/web-hta/src/app/(dashboard)/dashboard/reviewer/[id]/page.tsx`
- `apps/web-hta/src/app/(dashboard)/dashboard/reviewer/[id]/ReviewerPageClient.tsx`

**Approach:**
- After a pending field change request is resolved (approved/rejected), refetch the certificate data to get the admin's edits
- The simplest approach: when the pending request count drops to 0 (detected via polling), refetch the full certificate
- The cert data in the reviewer page is fetched client-side (`apiFetch`), so a refetch is straightforward

### Phase 4: Fix "System" name in feedback timeline

**Problem:** Field change events show "System" instead of the actual admin name.

**Files:**
- `apps/web-hta/src/app/(dashboard)/dashboard/reviewer/[id]/page.tsx` — fix `requestedByName` and `reviewedByName` mapping to read from nested objects
- `apps/web-hta/src/components/feedback/shared/FeedbackTimeline.tsx` — verify fallback logic

**Approach:**
- In the page's `fetchData` function, read `r.requestedBy.name` (object) instead of `r.requestedByName` (string)
- Same for `r.reviewedBy.name`
- The fix was partially implemented but may need deployment
- Also verify the `FeedbackTimeline` component doesn't have its own fallback to "System"

### Phase 5: Enrich request action cards with full detail

**Files:**
- `apps/web-hta/src/app/(dashboard)/dashboard/reviewer/[id]/ReviewerPageClient.tsx` — wherever request actions are rendered
- May need to update the API to return richer data for internal requests

**Current state:** Request action cards show:
```
Field Change — Approved ✓
```

**Target state:** Request action cards should show:
```
┌─────────────────────────────────────────────┐
│ Field Change Request              Approved  │
│─────────────────────────────────────────────│
│ Fields: Certificate Number, SRF Number      │
│ Reason: "Customer requested cert number     │
│          update to match their PO"          │
│─────────────────────────────────────────────│
│ Admin Note: "Updated as requested"          │
│ Reviewed by: Admin Name · 2 days ago        │
└─────────────────────────────────────────────┘
```

**Data needed per request:**
- `fields[]` — from `InternalRequest.data.fields`
- `description` — from `InternalRequest.data.description`
- `adminNote` — from `InternalRequest.adminNote`
- `reviewedBy` — from `InternalRequest.reviewedBy.name`
- `reviewedAt` — from `InternalRequest.reviewedAt`
- `status` — from `InternalRequest.status`
- `createdAt` — from `InternalRequest.createdAt`

**API check:** Verify `GET /api/internal-requests?certificateId=X` returns all these fields. If `data` is stored as a JSON string, parse and extract `fields` and `description` on the API side rather than forcing the frontend to parse.

---

## Verification

1. Reviewer raises field change request → admin approves → approval appears under the correct revision in the timeline (not the next revision)
2. While field change is PENDING, reviewer cannot approve/reject/send the certificate
3. Admin edits a field → reviewer page shows updated value after refresh/poll
4. Field change events show the actual admin name, not "System"
5. "Fields:" line shows the actual field names (e.g., "Certificate Number, SRF Number"), not empty
6. Request action cards show field names, description, admin note, status, and timestamps
7. Multiple field change requests across different revisions are tracked independently
8. Edge case: admin rejects request → reviewer can still proceed with review (rejection doesn't block)

## Priority

Medium-High — this affects data integrity (wrong revision grouping) and workflow correctness (reviewer acting on stale data). Phase 2 (blocking) is the most critical for workflow integrity.
