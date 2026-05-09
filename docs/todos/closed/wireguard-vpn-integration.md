# WireGuard VPN Integration — Desktop App Network Access

Enables engineers to reach the private GCP API (`10.8.3.226`) from their Windows
workstations via an encrypted VPN tunnel. Follows a request-approval flow so admins
control who gets desktop access.

**Status:** Complete — pending end-to-end test  
**Last updated:** 2026-05-05  
**Phases complete:** 1, 2, 3, 4, 5, 6

---

## Architecture

```
Engineer laptop (WireGuard client, 10.100.0.x)
  └─ UDP 51820 ──► WireGuard Gateway VM (GCP e2-micro, static public IP)
                        └─ IP forward ──► API at 10.8.3.226:4000
```

- VPN subnet: `10.100.0.0/24` (separate from GKE subnet `10.0.0.0/20`)
- Server IP in tunnel: `10.100.0.1`
- Engineer IPs: `10.100.0.2` onwards (up to 253 engineers)
- Peer list managed via GCS (`hta-platform-prod-wireguard/peers.conf`)
- VM syncs peers every 30s via `wg syncconf` — no SSH from API needed

---

## Request-Approval Flow

```
Engineer → [Request Desktop Access] on offline-codes page
         ↓
InternalRequest { type: DESKTOP_VPN_REQUEST, status: PENDING }
         ↓
Admin sees request in /admin/requests → approves or rejects
         ↓
On approval: provisioning token generated → engineer notified
         ↓
Engineer sees token on offline-codes page → enters in desktop app
         ↓
Desktop app generates WireGuard key pair → calls POST /api/vpn/provision
         ↓
VPN configured as Windows service → auto-connects on boot
```

---

## Phase 1 — Infrastructure (Terraform)

| Item | Status |
|------|--------|
| WireGuard gateway VM (`e2-micro`, `production-vpc`) | Done — `terraform/modules/wireguard/main.tf` |
| Static external IP for VM | Done — `google_compute_address.wireguard` |
| Firewall rule: UDP 51820 inbound from `0.0.0.0/0` | Done — `google_compute_firewall.wireguard_ingress` |
| Firewall rule: `wireguard-gateway → api-server:4000` | Done — `google_compute_firewall.wireguard_to_api` |
| VM startup script: install WireGuard, configure `wg0`, enable IP forwarding | Done — `terraform/modules/wireguard/startup.sh.tpl` |
| GCS bucket `hta-platform-prod-wireguard` for `peers.conf` | Done — `google_storage_bucket.wireguard` |
| Server key persisted to GCS (survives VM recreation) | Done — startup script restores from `gs://<bucket>/server-private.key` |
| VM cron: poll GCS peers.conf every 30s → `wg syncconf wg0` | Done — `/etc/cron.d/wireguard-sync` |
| Add module to `terraform/environments/production/main.tf` | Done |
| WireGuard outputs added to `outputs.tf` | Done — `wireguard_external_ip`, `wireguard_peers_bucket`, `wireguard_server_pubkey_path` |
| **`terraform apply`** to provision live infra | **Done — 9 resources created** |
| External IP recorded | **Done — `35.200.149.46`** |

---

## Phase 2 — Database (Prisma)

| Item | Status |
|------|--------|
| Add `DESKTOP_VPN_REQUEST` to `InternalRequestType` enum | Done |
| Add `vpnProvisioningToken String? @unique` to `User` model | Done |
| Add `vpnTokenGeneratedAt DateTime?` to `User` model | Done |
| New `VpnPeer` model: `userId`, `publicKey`, `ipAddress`, `provisionedAt`, `revokedAt`, `isActive` | Done |
| `prisma db push` + `prisma generate` | Done — Prisma Client v6.19.3 |

**VpnPeer model:**
```prisma
model VpnPeer {
  id            String    @id @default(cuid())
  userId        String    @unique
  user          User      @relation(fields: [userId], references: [id])
  tenantId      String
  publicKey     String    @unique
  ipAddress     String    @unique
  provisionedAt DateTime  @default(now())
  revokedAt     DateTime?
  isActive      Boolean   @default(true)

  @@index([tenantId])
}
```

---

## Phase 3 — API Endpoints

### Public provisioning endpoint (the ONLY public-facing API route)

| Item | Status |
|------|--------|
| `POST /api/vpn/provision` — validate token, assign IP, write to GCS peers.conf, create VpnPeer | Done — `apps/api/src/routes/vpn/index.ts` |
| Rate limit: 5 req/min per IP on this endpoint | Done |
| Token cleared from User after successful provision | Done |

**Request:** `{ token: string, publicKey: string }`  
**Response:** `{ serverPublicKey, serverEndpoint, assignedIp, serverIp, dns }`

### Internal-requests route updates

| Item | Status |
|------|--------|
| Accept `DESKTOP_VPN_REQUEST` in `POST /api/internal-requests` | Done |
| Duplicate prevention: reject if PENDING request exists | Done |
| Notify all tenant admins on submit (`DESKTOP_VPN_REQUESTED`) | Done |
| On approve: generate provisioning token, store on User, notify engineer (`DESKTOP_VPN_APPROVED`) | Done |
| On reject: notify engineer (`DESKTOP_VPN_REJECTED`) with `adminNote` | Done |

### Admin routes updates

| Item | Status |
|------|--------|
| Include `DESKTOP_VPN_REQUEST` in `GET /api/admin/requests` unified list | Done |
| Include `DESKTOP_VPN_REQUEST` in pending counts | Done |
| `DELETE /api/admin/users/:id/vpn` — revoke: remove from GCS peers.conf, set `revokedAt` | Done |
| `POST /api/admin/users/:id/vpn/token` — regenerate provisioning token | Done |
| Extend `GET /api/admin/users/:id` to include VPN status | Done |

---

## Phase 4 — Web UI

### Offline codes page (`OfflineCodesClient.tsx`)

| Item | Status |
|------|--------|
| "Desktop App Setup" section below offline code card | Done |
| State: no request → show `[Request Desktop Access]` button | Done |
| State: PENDING → amber banner "Request pending admin approval" | Done |
| State: REJECTED → red banner with `adminNote` + `[Request Again]` | Done |
| State: APPROVED, not yet provisioned → show token + copy button + instructions | Done |
| State: APPROVED, provisioned → show "Desktop app configured" + provision date | Done |
| `GET /api/offline-codes` returns latest `DESKTOP_VPN_REQUEST` status + token | Done |

### Admin user edit page (`/admin/users/[id]/edit`)

| Item | Status |
|------|--------|
| New "Desktop VPN" sidebar card | Done |
| Show: no request / pending / approved (with provision date) | Done |
| `[Revoke VPN Access]` button — calls `DELETE /api/admin/users/:id/vpn` | Done |
| `[Regenerate Token]` button — calls `POST /api/admin/users/:id/vpn/token` | Done |

### Admin requests page (`/admin/requests`)

| Item | Status |
|------|--------|
| Add `DESKTOP_VPN_REQUEST` to `TYPE_CONFIG` with `Monitor` icon | Done |
| Summary card + filter option | Done |

### Admin request detail (`/admin/requests/[id]`)

| Item | Status |
|------|--------|
| Render review UI for `DESKTOP_VPN_REQUEST`: requester info, approve/reject buttons | Done — `DesktopVpnRequestClient.tsx` |

### Notification routing (`NotificationItem.tsx`)

| Item | Status |
|------|--------|
| `DESKTOP_VPN_REQUESTED` → icon + route to `/admin/requests` | Done |
| `DESKTOP_VPN_APPROVED` → icon + route to `/dashboard/offline-codes` | Done |
| `DESKTOP_VPN_REJECTED` → icon + route to `/dashboard/offline-codes` | Done |

---

## Phase 5 — Electron App

### NSIS installer

| Item | Status |
|------|--------|
| `scripts/download-wireguard.js` — downloads `wireguard-amd64.msi` at build time | Done |
| Add `resources/installer-extras.nsh` to `electron-builder.yml` | Done |
| NSIS: silently install WireGuard before app (`msiexec /i wireguard-amd64.msi /quiet`) | Done — `resources/installer-extras.nsh` |

### First-run provisioning screen

| Item | Status |
|------|--------|
| Detect if VPN already provisioned (check safeStorage flag file) | Done — `apps/desktop/src/main/vpn.ts` |
| Show provisioning screen on first launch if not provisioned | Done — redirect to `/desktop/vpn-setup` |
| Token input with format mask `HTA-XXXX-XXXX-XXXX` | Done — `apps/web-hta/src/app/desktop/vpn-setup/page.tsx` |
| `[Connect & Continue]` button | Done |

### IPC handler `vpn:provision`

| Item | Status |
|------|--------|
| Generate WireGuard key pair via `wg genkey` / `wg pubkey` (child_process) | Done |
| Call `POST /api/vpn/provision` with token + public key | Done |
| Build `hta-vpn.conf` from server response | Done |
| Install tunnel service: `wireguard /installtunnelservice hta-vpn.conf` | Done |
| Store `vpn-provisioned = true` in safeStorage (DPAPI-backed) | Done |
| Return `{ success, error }` to renderer | Done |

### IPC handler `vpn:status`

| Item | Status |
|------|--------|
| Check if WireGuard tunnel service `hta-vpn` is running (`sc query WireGuardTunnel$hta-vpn`) | Done |
| Return `{ configured: bool, active: bool }` | Done |

### Sync loop update (`index.ts`)

| Item | Status |
|------|--------|
| Check `vpn:status` before starting sync loop — redirect if not configured | Done |
| Show VPN status indicator in renderer (optional) | Deferred — can add in a follow-up |

---

## Phase 6 — Build & Release

> **Note:** The CI/CD pipeline has been elevated from P2 (Nice to Have) to P1 (Should Have)
> in `docs/offline_setup/TODO.md` because WireGuard MSI bundling makes manual builds
> unreliable for production. Full CI/CD scope is documented there.

| Item | Status |
|------|--------|
| `apps/desktop/scripts/download-wireguard.js` — fetch + verify WireGuard MSI checksum | Done |
| `electron-builder.yml` — NSIS include + MSI excluded from asar | Done |
| NSIS config — silently install WireGuard before app (`msiexec /i wireguard-amd64.msi /quiet`) | Done — `resources/installer-extras.nsh` |
| `.github/workflows/desktop-release.yml` — full CI/CD pipeline | Done |
| Upload new installer + `latest.yml` to `gs://hta-platform-prod-desktop-releases` | Done — publish job in workflow |

---

## Security Notes

- Provisioning endpoint is the only public API route — token is one-time use, cleared after provision
- WireGuard uses Curve25519 / ChaCha20-Poly1305 — no passwords, not brute-forceable  
- Revoking removes the engineer's public key from `peers.conf` — VM picks up change within 30s
- API remains fully private — only accessible via the tunnel after provisioning
- Token is only visible to the engineer on an authenticated page (`/dashboard/offline-codes`)

---

## Follow-ups / Deferred

- [x] Token expiry: **7 days** — implemented in `POST /api/vpn/provision`
- [x] Token visibility: **always visible until provisioned**, then cleared — implemented
- [x] WireGuard MSI SHA-256: pinned hash `309ddac6...` added to `download-wireguard.js`
- [x] `WG_SERVER_ENDPOINT`, `WG_DNS`, `WG_PEERS_BUCKET` — added to `infra/k8s/base/configmap.yaml`, applied to cluster
- [x] TLS pinning: **not applicable** — API runs plain HTTP inside the WireGuard tunnel; the tunnel provides encryption. No cert to pin.
- [ ] GitHub Actions secrets to add in repo settings: `GCP_WORKLOAD_IDENTITY_PROVIDER` (from `terraform output github_workload_identity_provider`), `GCP_DESKTOP_RELEASES_SA` (from `terraform output github_service_account_email`), `NEXTAUTH_SECRET` (run `openssl rand -base64 32`)
- [ ] VPN status indicator in Electron renderer (deferred — nice to have)
- [ ] End-to-end test (see Testing section below)

---

## Testing

### Step 1 — API (can test now, no desktop needed)

```bash
# 1. Deploy the latest API build so the new routes are live
kubectl rollout restart deployment/hta-api -n hta-platform

# 2. Log in as an engineer on the web app
# 3. Go to /dashboard/offline-codes → click "Request Desktop Access"
# 4. Log in as master admin → go to /admin/requests → approve the request
# 5. Back as engineer on /dashboard/offline-codes → token should appear
# 6. Test the provisioning endpoint directly (replace TOKEN and PUBKEY):
curl -X POST https://<api-url>/api/vpn/provision \
  -H "Content-Type: application/json" \
  -d '{"token":"HTA-XXXX-XXXX-XXXX","publicKey":"<base64-44-char-wg-pubkey>"}'
# Should return: serverPublicKey, serverEndpoint, assignedIp, serverIp, dns
```

To generate a throwaway WireGuard keypair for the curl test (requires WireGuard installed):
```bash
wg genkey | tee /tmp/privkey | wg pubkey
```

### Step 2 — WireGuard gateway (verify peer sync)

```bash
# SSH into the gateway VM
gcloud compute ssh wireguard-gateway --zone=asia-south1-b --project=hta-platform-prod

# Check WireGuard is running
sudo wg show

# After a successful provision, the peer should appear within 30s:
watch -n 5 sudo wg show
```

### Step 3 — Desktop app end-to-end

Requires a packaged build. Once the CI pipeline is set up:
1. Trigger `.github/workflows/desktop-release.yml` manually with a test version
2. Install the output `.exe` on a Windows machine
3. On first launch → provisioning screen appears
4. Enter the token from step 1 → click "Connect & Continue"
5. Check tunnel service: `sc query WireGuardTunnel$hta-vpn`
6. Verify API reachable: `curl http://10.8.3.226:4000/health`
