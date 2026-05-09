# Offline Certificate Editing — Spec

**Problem:** Engineers can see cached certificates offline but can't edit them, create new ones, or get accurate status information. Multiple UI elements don't work as expected offline.

**Screenshot reference:** `reference_docs/offline-desktop.jpg`

---

## Observed Issues (from screenshot)

| # | What's wrong | Expected | Actual |
|---|---|---|---|
| A | Stat cards all show 0 | Cached counts (Drafts: 4, Pending: 1, Approved: 1) | All zeros |
| B | Sidebar shows "Online / Not synced yet" | "Offline / Last synced May 6 at 11:30 PM" | Wrong state |
| C | No "New Certificate" button in offline view | Button present, creates local draft | Missing entirely |
| D | Cached certs not clickable | Click to view/edit | Static text, no links |
| E | No pending sync summary | "2 certs modified, 3 images pending" | Not shown |
| F | Can't edit DRAFT certs offline | Edit with cert number disabled | Edit page fails (no data) |
| G | Can't create new certs offline | Local draft with temp number | No flow exists |

---

## Phase 1: Fix dashboard display (Issues A, B, E)

**Priority:** High — these are display-only bugs, no data model changes.

### Issue A: Stat cards show 0

**Root cause:** `loadOfflineData()` calls `getSyncStatus()` which does a 3-second API ping inside the IPC handler. The ping fails (offline), but the cached `engineerCounts` from `session_meta` should still be returned. Either the counts aren't stored in `session_meta`, or the JSON doesn't match the `Stats` interface, or the state update has a timing issue.

**Fix:**
1. In `sync:get-status` IPC handler: separate the API ping from the cached data read — always return cached counts regardless of ping result
2. In `loadOfflineData()`: if `engineerCounts` is null, compute counts from `cached_certificates` table directly (count by status)
3. Remove the `!stats` check before the `listDrafts` fallback (stale closure issue)

**Files:**
- `apps/desktop/src/main/ipc-handlers.ts` — fix `sync:get-status`
- `apps/web-hta/src/app/(dashboard)/dashboard/EngineerDashboardClient.tsx` — fix `loadOfflineData`

### Issue B: Sync badge shows "Online"

**Root cause:** `sync:get-status` IPC handler does a 3-second API ping. Code was updated to check reachability, but the badge component polls every 30 seconds. On first render, it may use stale/default state.

**Fix:**
1. `sync:get-status` handler: do the API ping but DON'T block the cached data — return cached data immediately, update `online` based on ping result
2. `SyncStatusBadge`: on first mount, default to `online: false` if `lastSyncedAt` is stale (>10 min ago)
3. Ensure the `onSyncStatus` IPC listener fires after each slow sync cycle

**Files:**
- `apps/desktop/src/main/ipc-handlers.ts` — fix return timing
- `apps/web-hta/src/components/desktop/SyncStatusBadge.tsx` — fix initial state

### Issue E: No pending sync summary

**Root cause:** `PendingSyncSummary` component calls `getSyncStatus()` to get pending counts. If the IPC call fails or returns 0 for all counts, the component renders nothing.

**Fix:**
1. Verify `PendingSyncSummary` renders when `getSyncStatus()` returns pending counts > 0
2. The component might not mount because it's inside the `isOffline` branch — check if it's rendered in the right place in the JSX
3. Add fallback: if IPC fails, count locally from SQLCipher tables

**Files:**
- `apps/web-hta/src/components/desktop/PendingSyncSummary.tsx` — verify mounting
- `apps/web-hta/src/app/(dashboard)/dashboard/EngineerDashboardClient.tsx` — verify JSX placement

---

## Phase 2: Offline cert list interaction (Issues C, D)

**Priority:** High — users need to navigate and create certs offline.

### Issue C: No "New Certificate" button in offline view

**Root cause:** When offline, the dashboard renders the cached cert table (not `CertificateTable` which has the button). The offline view has no "New Certificate" action.

**Fix:**
1. Add a "New Certificate" button above the cached certificates table in the offline view
2. Button links to `/dashboard/certificates/new` which already has offline handling (creates local draft with `DRAFT-{timestamp}`)
3. Style consistently with the online button

**Files:**
- `apps/web-hta/src/app/(dashboard)/dashboard/EngineerDashboardClient.tsx` — add button to offline cert section

### Issue D: Cached certs not clickable

**Root cause:** The offline certificate table renders plain `<tr>` rows with no click handlers or links. The online `CertificateTable` has row clicks that navigate to `/dashboard/certificates/:id/edit`.

**Fix:**
1. Make each cached cert row a link to `/dashboard/certificates/${cert.id}/edit`
2. For DRAFT/REVISION_REQUIRED → editable (if full_data cached)
3. For PENDING_REVIEW/AUTHORIZED → view-only
4. If cert has no `full_data` cached → show "View requires online" tooltip
5. Use `useRouter().push()` on row click

**Files:**
- `apps/web-hta/src/app/(dashboard)/dashboard/EngineerDashboardClient.tsx` — add click handlers to offline cert rows

---

## Phase 3: Offline editing capability (Issues F, G)

**Priority:** Medium — core offline editing feature.

### Issue F: Can't edit DRAFT certs offline

**Root cause:** The edit page calls `GET /api/certificates/:id` for full data. Offline, this fails. The `full_data` column was added to `cached_certificates` and the slow sync fetches it for actionable certs. But the edit page doesn't fall back to the cached data yet.

**Fix:**
1. In the certificate edit page: wrap the API fetch in a try/catch
2. On failure: call `window.electronAPI.getCachedCertificateFull(certId)` to load from SQLCipher
3. If cached data exists → populate the form
4. Certificate number field: **disabled** when offline (grayed, shows current value)
5. "Submit for Review" button: **disabled** when offline with tooltip "Requires online connection"
6. Save button: saves to SQLCipher `drafts` table (existing local draft mechanism)
7. Images: fall back to `window.electronAPI.getCachedImage(certId, imageId)` for display

**Files:**
- Certificate edit page component — add offline data fallback + disabled controls
- May need to identify which component handles the edit form (check route `apps/web-hta/src/app/(dashboard)/dashboard/certificates/[id]/edit/`)

### Issue G: Can't create new certs offline

**Root cause:** The "New Certificate" page (`certificates/new/page.tsx`) tries the API first, then falls back to Electron IPC `createDraft`. But the `createDraft` IPC handler may not exist, and the edit page doesn't know it's an offline draft.

**Fix:**
1. Verify `draft:create` IPC handler exists in `ipc-handlers.ts` — if not, add it
2. `certificates/new/page.tsx`: on API failure, call `electronAPI.createDraft()` → returns `{ id }` → navigate to edit page with `?offline=true`
3. Edit page: detect `offline=true` param → show temp cert number (disabled) → allow editing all other fields
4. On save: store in SQLCipher `drafts` table with `server_id = null`
5. When online: sync engine pushes draft to server → gets real cert number

**Files:**
- `apps/desktop/src/main/ipc-handlers.ts` — verify/add `draft:create`
- `apps/web-hta/src/app/(dashboard)/dashboard/certificates/new/page.tsx` — offline draft creation
- Certificate edit page — handle offline drafts

---

## Phase 4: Offline image serving (Issue 6 from original spec)

**Priority:** Low — editing works without images, images are enhancement.

### Serve cached images offline

**Already implemented (IPC handlers exist):**
- `images:get-cached` — returns base64 data URL
- `images:list-cached` — lists cached image metadata

**Still needed:**
- Certificate edit/view page: detect image load failure → fall back to `window.electronAPI.getCachedImage(certId, imageId)`
- Show placeholder for uncached images: "Image available online"

**Files:**
- Certificate edit page image components — add offline fallback

---

## Phase 5: Conflict handling verification (Issue 5)

**Priority:** Low — should already work, just needs testing.

**Test scenario:**
1. Engineer edits DRAFT cert offline
2. Reviewer sends feedback on same cert online
3. Engineer reconnects → sync detects version mismatch → shows conflict UI

**Files involved (existing, no changes expected):**
- `apps/desktop/src/main/sync-engine.ts`
- Conflict resolution UI components

---

## Implementation order

| Phase | Issues | Effort | Dependency |
|---|---|---|---|
| **Phase 1** | A, B, E (display fixes) | Small | None |
| **Phase 2** | C, D (list interaction) | Small | None |
| **Phase 3** | F, G (offline editing) | Large | Phase 2 |
| **Phase 4** | Images offline | Medium | Phase 3 |
| **Phase 5** | Conflict verification | Small | Phase 3 |

Phases 1 and 2 can run in parallel. Phase 3 depends on Phase 2 (new cert button must work before edit flow). Phase 4 and 5 depend on Phase 3.

---

## Files summary

| File | Phase | Changes |
|---|---|---|
| `apps/desktop/src/main/ipc-handlers.ts` | 1, 3 | Fix `sync:get-status` timing, verify `draft:create` |
| `apps/web-hta/src/app/(dashboard)/dashboard/EngineerDashboardClient.tsx` | 1, 2 | Fix stat counts, add New Cert button, make rows clickable |
| `apps/web-hta/src/components/desktop/SyncStatusBadge.tsx` | 1 | Fix initial state default |
| `apps/web-hta/src/components/desktop/PendingSyncSummary.tsx` | 1 | Verify mounting, add fallback |
| `apps/web-hta/src/app/(dashboard)/dashboard/certificates/new/page.tsx` | 3 | Offline draft creation flow |
| Certificate edit page (`certificates/[id]/edit/`) | 3, 4 | Offline data fallback, disabled controls, image fallback |
| `apps/desktop/src/main/index.ts` | — | Already done: full_data sync |
| `apps/desktop/src/preload/index.ts` | — | Already done: IPC exposed |
