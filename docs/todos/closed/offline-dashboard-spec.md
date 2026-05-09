# Offline Dashboard — Full Spec

**Goal:** Engineers using the desktop app can view and edit their active certificates, review pending assignments, and see dashboard stats when offline. All changes sync automatically when reconnected.

---

## Routes

| Route | Online | Offline |
|---|---|---|
| `/dashboard` | Full certificate table from API | DRAFT + REVISION_REQUIRED certs only (editable) |
| `/dashboard/reviewer` | Full review queue from API | PENDING_REVIEW + CUSTOMER_REVISION_REQUIRED only (view-only) |

---

## Data Sync Strategy

### What gets cached

| Data | Endpoint | SQLCipher table | Interval |
|---|---|---|---|
| Engineer's actionable certs | `GET /api/certificates/engineer?status=DRAFT,REVISION_REQUIRED` | `cached_certificates` (role=creator) | 10 min |
| Reviewer's actionable certs | `GET /api/certificates/reviewer?status=PENDING_REVIEW,CUSTOMER_REVISION_REQUIRED` | `cached_certificates` (role=reviewer) | 10 min |
| Engineer stat counts | `GET /api/certificates/engineer/counts` | `session_meta` key: `engineer_counts` | 10 min |
| Reviewer stat counts | `GET /api/certificates/reviewer/counts` | `session_meta` key: `reviewer_counts` | 10 min |
| Images for actionable certs | `GET /api/certificates/:id/images` | Encrypted on disk + `cached_images` table | 10 min |
| Draft push (local to server) | Sync engine | — | 2 min |
| Reference data (instruments, customers) | Existing endpoints | `ref_master_instruments`, `ref_customers` | 4 hours |
| Offline codes | `GET /api/offline-codes` | `offline_codes` | Once (retry until success) |
| Last sync timestamp | — | `session_meta` key: `last_synced_at` | Every sync cycle |

### What does NOT get cached

- APPROVED, AUTHORIZED, REJECTED certificates (read-only history)
- Images for non-actionable certificates
- Notification history
- Full audit trail
- Admin/customer pages

### Image caching

- Only for actionable certificates (DRAFT, REVISION_REQUIRED, PENDING_REVIEW, CUSTOMER_REVISION_REQUIRED)
- Full-size download (needed for viewing/editing)
- Encrypted on disk using existing `saveImageEncrypted`
- New table `cached_images` for server-sourced images (separate from `draft_images`)
- If total cache > 500MB, skip older certificates and show placeholder: "Image available online"
- Each sync cycle: compare cached vs server image list, download new/changed, delete removed

---

## Offline Dashboard UI

### Engineer Dashboard (`/dashboard`) — Offline

```
┌────────────────────────────────────────────────────────────────────┐
│ ⚠ Offline Mode                                           [Retry] │
│ Showing your active certificates. Go online for full              │
│ history and to sync changes.                                      │
└────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────┐
│ ⏳ Waiting to sync: 📝 2 certs modified  🖼 3 images              │
└────────────────────────────────────────────────────────────────────┘

┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│ Drafts   │ │ Pending  │ │ Approved │ │ Revision │ │ Conflicts│
│    12    │ │    5     │ │    28    │ │    3     │ │    1     │
└──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘
(as of May 4, 2026 at 3:42 PM)

┌────────────────────────────────────────────────────────────────────┐
│ Certificate #    Customer         Status        Modified          │
├────────────────────────────────────────────────────────────────────┤
│ HTA-CAL-0042    Wipro Ltd        DRAFT         2 hours ago       │
│ HTA-CAL-0038    Bosch            REVISION      5 hours ago       │
└────────────────────────────────────────────────────────────────────┘
Only DRAFT and REVISION certificates available offline

┌────────────────────────────────────────────────────────────────────┐
│ 📂 Full certificate history available when online                  │
└────────────────────────────────────────────────────────────────────┘
```

### Reviewer Dashboard (`/dashboard/reviewer`) — Offline

```
┌────────────────────────────────────────────────────────────────────┐
│ ⚠ Offline Mode                                           [Retry] │
│ Showing your pending reviews. Review actions require an           │
│ online connection.                                                │
└────────────────────────────────────────────────────────────────────┘

┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│ Pending  │ │ Customer │ │ Reviewed │ │ Total    │
│    4     │ │ Revision │ │    15    │ │    21    │
│          │ │    2     │ │          │ │          │
└──────────┘ └──────────┘ └──────────┘ └──────────┘
(as of May 4, 2026 at 3:42 PM)

┌────────────────────────────────────────────────────────────────────┐
│ Certificate #    Engineer         Status        Submitted         │
├────────────────────────────────────────────────────────────────────┤
│ HTA-CAL-0040    Ravi Kumar       PENDING       1 day ago         │
│ HTA-CAL-0036    Priya S          CUST. REV     3 days ago        │
│ HTA-CAL-0035    Amit T           PENDING       4 days ago        │
│ HTA-CAL-0033    Kiran K          PENDING       5 days ago        │
└────────────────────────────────────────────────────────────────────┘
View-only offline. Approve/reject requires online connection.

┌────────────────────────────────────────────────────────────────────┐
│ 📂 Full review history available when online                       │
└────────────────────────────────────────────────────────────────────┘
```

### Syncing after reconnect (either dashboard)

```
┌────────────────────────────────────────────────────────────────────┐
│ 🔄 Syncing: 2 certificates, 3 images, 1 audit entry...           │
└────────────────────────────────────────────────────────────────────┘

       ↓ after sync completes ↓

┌────────────────────────────────────────────────────────────────────┐
│ ✓ All changes synced                         (fades after 5 sec)  │
└────────────────────────────────────────────────────────────────────┘
```

---

## Sidebar Sync Status

Always visible in the sidebar footer:

| State | Display |
|---|---|
| Online, synced | `● Online` / `Synced just now` |
| Online, syncing | `🔄 Syncing` / `2 certs, 3 images` |
| Offline | `● Offline` / `Last sync May 4, 3:42 PM` |
| Sync error | `● Error` / `Sync failed — retry in 2 min` |

Timestamp persisted in SQLCipher `session_meta` table → shows correctly after app restart.

---

## Pending Sync Summary

Shown when there's unsynced local data (both online and offline):

| Icon | Label | Source query |
|---|---|---|
| Pencil | "2 certificates modified" | `SELECT COUNT(*) FROM drafts WHERE synced_at IS NULL OR updated_at > synced_at` |
| Image | "3 images pending upload" | `SELECT COUNT(*) FROM draft_images WHERE synced = 0` |
| Clipboard | "1 audit entry" | `SELECT COUNT(*) FROM audit_log WHERE synced = 0` |

- Online: "Will sync in X seconds"
- Offline: "Will sync when reconnected"
- After sync: summary disappears or shows "All changes synced ✓"

---

## Offline Actions

### What works offline

- View any cached certificate (full data + images)
- Edit DRAFT and REVISION_REQUIRED certificates (saved to SQLCipher, synced when online)
- Attach images to drafts (encrypted locally, synced when online)

### What requires online

- Review actions (approve/reject/request revision) — risk of conflicts with concurrent edits
- Creating NEW certificates (needs server-generated certificate number)
- Full certificate history (APPROVED, AUTHORIZED, etc.)

Show on reviewer page when offline: "Review actions require an online connection"
Show on "New Certificate" button when offline: disabled + tooltip "Requires online connection"

---

## Shared UI Components

| Component | Location | Description |
|---|---|---|
| `SyncStatusBadge` | Sidebar footer | Green/amber/red dot + timestamp. Only renders when `window.electronAPI` exists |
| `OfflineBanner` | Top of dashboard content | Amber banner with context message + Retry button. Reusable across both dashboards |
| `PendingSyncSummary` | Below offline banner / above stat cards | Shows unsynced drafts/images/audit counts. Disappears when all synced |
| `OfflineHistoryFooter` | Bottom of certificate table | "Full history available when online" |
| `SyncToast` | Top of dashboard content | Green "All changes synced ✓" — auto-fades after 5 seconds |

---

## Files to Create/Modify

### New files
- `apps/desktop/src/migrations/004-cached-certificates.sql` — already created
- `apps/desktop/src/migrations/005-cached-images.sql` — new table for server-sourced images
- `apps/web-hta/src/components/desktop/SyncStatusBadge.tsx` — sidebar sync indicator
- `apps/web-hta/src/components/desktop/OfflineBanner.tsx` — reusable offline banner
- `apps/web-hta/src/components/desktop/PendingSyncSummary.tsx` — unsynced data counts
- `apps/web-hta/src/components/desktop/SyncToast.tsx` — sync complete notification

### Modified files
- `apps/desktop/src/main/index.ts` — sync intervals (30s → 2min/10min), certificate + image caching, sync status IPC broadcast, counts caching
- `apps/desktop/src/main/ipc-handlers.ts` — `certificates:list-cached` updated, new `sync:get-status` and `sync:get-pending` handlers
- `apps/desktop/src/preload/index.ts` — expose new IPC methods + `onSyncStatus` listener
- `apps/web-hta/src/app/(dashboard)/dashboard/EngineerDashboardClient.tsx` — offline UI with cached data, stat cards from cached counts, pending sync summary
- `apps/web-hta/src/app/(dashboard)/dashboard/reviewer/ReviewerDashboardClient.tsx` — same offline treatment for reviewer view
- `apps/web-hta/src/components/layout/DashboardSidebar.tsx` — render SyncStatusBadge in footer
- `apps/web-hta/src/types/electron.d.ts` — new IPC type declarations

---

## Implementation Order

1. **Sync intervals** — change 30s to 2min (drafts) / 10min (certs+images+counts)
2. **Certificate caching** — fetch actionable certs from both engineer + reviewer endpoints, store with role column
3. **Counts caching** — store engineer/reviewer counts in session_meta
4. **Image caching** — download images for actionable certs, encrypted on disk
5. **Sync status persistence** — store last_synced_at, broadcast via IPC
6. **SyncStatusBadge** — sidebar footer component
7. **OfflineBanner + PendingSyncSummary** — reusable components
8. **Engineer dashboard offline** — wire up cached data, stat cards, offline table
9. **Reviewer dashboard offline** — wire up cached data, stat cards, view-only table
10. **SyncToast** — "All changes synced" after reconnect
11. **Disable actions offline** — review buttons disabled, new cert disabled + tooltip
