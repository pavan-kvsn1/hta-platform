# Offline Certificate Editing — Spec

**Problem:** Engineers can see cached certificates offline but can't edit them or create new ones. The sync status badge shows incorrect state.

---

## Issue 1: Can't edit cached certificates offline

**Current:** `cached_certificates` table stores summary only (cert number, status, customer name). The edit page calls `GET /api/certificates/:id` for full data → fails offline.

**Fix:** Cache the **full certificate JSON** (parameters, results, master instruments) for actionable certs during the slow sync.

### Schema change

Add `full_data` column to `cached_certificates`:

```sql
ALTER TABLE cached_certificates ADD COLUMN full_data TEXT;
```

`full_data` stores the complete `GET /api/certificates/:id` response as JSON.

### Sync change

In the slow sync loop, for each actionable certificate:
1. Fetch `GET /api/certificates/:id` (full data with parameters, results, instruments)
2. Store the JSON in `full_data`
3. Only for DRAFT + REVISION_REQUIRED (engineer's own) — these are editable
4. PENDING_REVIEW + CUSTOMER_REVISION_REQUIRED (reviewer) — cache full data for viewing, not editing

### Edit page change

When the edit page loads:
1. Try `GET /api/certificates/:id` (online path)
2. If fails → check `cached_certificates.full_data` via IPC
3. If cached → load from local data
4. Certificate number field: disabled offline, enabled online
5. Submit for review: disabled offline

### New IPC handler

```
certificates:get-cached-full — returns full_data JSON for a given cert ID
```

### Files to modify

- `apps/desktop/src/migrations/007-cached-full-data.sql` — add column
- `apps/desktop/src/main/index.ts` — fetch full data in slow sync
- `apps/desktop/src/main/ipc-handlers.ts` — add `certificates:get-cached-full`
- `apps/desktop/src/preload/index.ts` — expose IPC
- Certificate edit page — fallback to cached data when API fails

---

## Issue 2: Can't create new certificates offline

**Current:** "New Certificate" button disabled offline with "Requires online connection."

**Fix:** Allow creating local drafts with a temporary certificate number.

### Flow

**Offline:**
1. Engineer clicks "New Certificate"
2. Draft created in SQLCipher with temp number: `DRAFT-{timestamp}` (e.g., `DRAFT-1717600000`)
3. Certificate number field is **disabled** (grayed, non-editable) — shows the temp number
4. Engineer fills in all other fields: customer, SRF, parameters, results, instruments, images
5. "Submit for Review" button is **disabled** — tooltip: "Requires online connection"
6. Draft saved locally in SQLCipher `drafts` table

**Online (reconnected):**
7. Certificate number field **unlocks** — engineer can set the real number
8. Engineer reviews the draft, sets proper cert number (e.g., `HTA/12345/24/01`)
9. Clicks "Submit for Review" — draft syncs to server, reviewer assigned

### How sync works

- Sync engine detects local drafts without a `server_id`
- Pushes to `POST /api/certificates` with the engineer's chosen cert number
- Server creates the certificate, returns the `server_id`
- Local draft updated with `server_id` and `synced_at`

### Offline detection for UI controls

The certificate edit page needs to know if the app is offline to:
- Disable cert number field
- Disable "Submit for Review"
- Show "offline" indicators

Use the existing `isApiReachable` IPC check or a simpler `window.electronAPI?.isOffline()`.

### Files to modify

- `apps/web-hta/src/app/(dashboard)/dashboard/certificates/new/page.tsx` — enable offline, create local draft
- `apps/web-hta/src/components/dashboard/CertificateTable.tsx` — enable "New Certificate" button offline
- Certificate edit page — disable cert number + submit when offline
- `apps/desktop/src/main/ipc-handlers.ts` — `draft:create` handler (may already exist)

---

## Issue 3: Sync status badge shows "Online" when offline

**Current:** `SyncStatusBadge` uses `net.isOnline()` which checks internet, not VPN/API reachability. Shows "Online Not synced yet" even when API is unreachable.

**Fix:** Use the `isApiReachable` IPC result instead of `net.isOnline()`.

### Change in SyncStatusBadge

```typescript
// Current (wrong):
status.online  // from net.isOnline()

// Fix:
// Use the isApiReachable check from the sync status IPC
// The sync:get-status handler already returns `online` field
// Update it to check API reachability, not just internet
```

### Change in sync:get-status IPC handler

```typescript
// Current:
return { online: net.isOnline(), ... }

// Fix:
const apiReachable = apiReachableCache.value  // from the API health check
return { online: net.isOnline() && apiReachable, ... }
```

### Files to modify

- `apps/desktop/src/main/ipc-handlers.ts` — update `sync:get-status` to check API reachability
- `apps/web-hta/src/components/desktop/SyncStatusBadge.tsx` — no change needed (already reads `status.online`)

---

## Issue 4: Sync status not visible when sidebar collapsed

**Current:** `SyncStatusBadge` wrapped in `!mobile && !isCollapsed` — hidden when collapsed.

**Fix:** Show a compact version (just the colored dot) when collapsed.

### Change in DashboardSidebar

```
Expanded: ● Online / Synced 2 min ago / pending counts
Collapsed: ● (just the dot, colored green/amber/red)
```

### Files to modify

- `apps/web-hta/src/components/layout/DashboardSidebar.tsx` — show badge in both states
- `apps/web-hta/src/components/desktop/SyncStatusBadge.tsx` — accept `compact` prop for collapsed view

---

## Issue 5: Editing cached certs + sync conflicts

**Scenario:** Engineer edits a cached DRAFT cert offline. Reviewer sends feedback on the same cert online. When engineer reconnects:

1. Sync engine pushes local changes to `PUT /api/certificates/:id`
2. Server detects version mismatch (reviewer changed it since last sync)
3. Server returns `409 Conflict`
4. Sync engine marks the draft as `CONFLICT` in SQLCipher
5. Existing conflict resolution UI shows both versions — engineer picks which to keep

**One cert = one engineer.** Only the assigned reviewer can make changes (feedback, status). No two engineers edit the same cert. So conflicts are only: engineer's offline edits vs reviewer's online actions.

### Files involved

- `apps/desktop/src/main/sync-engine.ts` — already handles conflicts
- Conflict resolution UI — already built

---

## Issue 6: Serve cached images offline

**Current:** The edit page loads images from the API (`GET /api/certificates/:id/images/:imageId/file`). Offline, this fails. The image caching step downloads and encrypts images to disk in the `cached_images` table, but there's no IPC handler to serve them back to the renderer.

**Fix:** Add `images:get-cached` IPC handler that reads encrypted cached images from disk and returns them as data URLs for display.

### Flow

1. Edit page tries to load image from API → fails offline
2. Falls back to `window.electronAPI.getCachedImage(certId, imageId)`
3. IPC handler looks up `cached_images` table for the `local_path`
4. Reads and decrypts the file using `readImageDecrypted` from `file-store.ts`
5. Returns as base64 data URL → image displays

### Files

- `apps/desktop/src/main/ipc-handlers.ts` — add `images:get-cached` handler
- `apps/desktop/src/preload/index.ts` — expose IPC
- Certificate edit/view page — fall back to cached images when API fails

---

## Implementation order

1. **Issue 3 + 4:** Fix sync status badge (quick, no data changes)
2. **Issue 2:** Enable offline cert creation with temp number
3. **Issue 1:** Cache full cert data for offline editing
4. **Issue 5:** Verify conflict handling works (should already work)

---

## Files summary

| File | Changes |
|---|---|
| `apps/desktop/src/migrations/007-cached-full-data.sql` | Add `full_data` column |
| `apps/desktop/src/main/index.ts` | Fetch full cert data in slow sync |
| `apps/desktop/src/main/ipc-handlers.ts` | `certificates:get-cached-full` IPC + fix `sync:get-status` |
| `apps/desktop/src/preload/index.ts` | Expose new IPC |
| `apps/web-hta/src/components/desktop/SyncStatusBadge.tsx` | Accept `compact` prop |
| `apps/web-hta/src/components/layout/DashboardSidebar.tsx` | Show badge when collapsed |
| `apps/web-hta/src/components/dashboard/CertificateTable.tsx` | Enable "New Certificate" offline |
| `apps/web-hta/src/app/(dashboard)/dashboard/certificates/new/page.tsx` | Create local draft offline |
| Certificate edit page | Fallback to cached data, disable cert number + submit offline |
