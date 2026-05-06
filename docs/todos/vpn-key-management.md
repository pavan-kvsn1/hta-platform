# VPN Seamless Experience — Spec

**Goal:** Engineer installs the app, enters a token, and the VPN just works forever. If anything breaks, the app self-heals. Zero admin intervention for VPN issues.

---

## The Engineer Experience (target)

```
Install .exe → Open app → Enter token → VPN connects → Login → Work

Close app → Reopen → VPN auto-connects → Unlock → Dashboard

New laptop → Install → Enter token → Works (old laptop auto-revoked)

VPN breaks → App detects → Auto-reconnects → If key mismatch → Auto-re-provisions
```

No terminal commands. No admin help. No diagnostics.

---

## Current Problems

| Problem | Impact | Root Cause |
|---|---|---|
| Re-provisioning returns 409 | Engineer stuck, needs admin | API rejects if peer exists |
| Key mismatch after reinstall | Tunnel silently fails | New keypair doesn't match GCS/gateway |
| DNS hijacked by WireGuard | All DNS breaks (git, npm, browsers) | `DNS = 10.100.0.1` in conf (gateway isn't a DNS server) |
| No connectivity detection | App shows "online" when VPN is down | Only checks service status, not actual handshake |
| GCS sync fails silently | Gateway has stale keys | No verification after write |
| No self-healing | User stuck until admin fixes | App doesn't detect or recover from failures |

---

## Design: Self-Healing VPN

### Principle: The desktop app owns the VPN lifecycle

The app doesn't just provision once and hope — it continuously monitors and self-heals:

```
┌─────────────────────────────────────────────────────┐
│                    App Startup                       │
│                        │                             │
│              Is VPN provisioned?                     │
│               /            \                         │
│             NO              YES                      │
│              │               │                       │
│     Show token screen    Start tunnel                │
│              │               │                       │
│     Provision + install   Is tunnel connected?       │
│              │           (ping 10.100.0.1)           │
│              ▼             /           \             │
│           Login ←── YES               NO             │
│                                        │             │
│                              Retry 3 times (30s)     │
│                                 /          \         │
│                            Connected    Still down    │
│                                │            │        │
│                             Login    Auto-re-provision│
│                                      (new keypair,   │
│                                       upsert peer,   │
│                                       reinstall)     │
│                                           │          │
│                                     Connected?       │
│                                      /       \       │
│                                   YES         NO     │
│                                    │           │     │
│                                 Login    Show error:  │
│                                     "VPN cannot       │
│                                      connect.         │
│                                      Contact admin."  │
└─────────────────────────────────────────────────────┘
```

### Key behaviors

1. **Auto-retry on startup:** If tunnel is installed but not connecting, retry 3 times over 90 seconds before giving up
2. **Auto-re-provision:** If retries fail, generate a new keypair and call the provisioning API (upsert, not 409) with the stored token
3. **One device per user:** Provisioning always replaces the previous key — old device's tunnel stops working automatically
4. **Background health check:** Every 5 minutes, verify tunnel connectivity. If down, trigger the retry → re-provision flow
5. **No DNS override:** WireGuard config has no DNS line — system DNS untouched

---

## API Changes

### Provisioning endpoint: upsert, not create-or-fail

**`POST /api/vpn/provision`**

Current:
```
Token valid + peer exists → 409 "already provisioned"
```

New:
```
Token valid + peer exists → UPDATE peer with new public key → sync GCS → return config
Token valid + no peer → CREATE peer → sync GCS → return config
```

Both paths return the same response. The desktop app doesn't need to know if it's a first provision or a re-provision.

**One device enforcement:** Updating the public key automatically invalidates the old device — its key no longer matches the gateway. No explicit revocation needed.

### Token reuse for re-provisioning

Current: Token is cleared after first provision. Re-provisioning needs a new token from admin.

New: Store a **device-bound re-provisioning token** in the VpnPeer record. This token:
- Is generated during first provision and returned to the desktop app
- Is stored encrypted in safeStorage on the device
- Can be used for re-provisioning WITHOUT admin generating a new token
- Is rotated on each re-provision (old one invalidated)
- Is tied to the user ID (can't be used by someone else)

This means: the app can self-heal (re-provision) without user or admin involvement.

```typescript
// VpnPeer schema addition:
model VpnPeer {
  // ... existing fields ...
  reprovisionToken    String?   @unique  // Device-bound re-provisioning token
  reprovisionTokenAt  DateTime?          // When the token was last issued
}
```

### GCS sync with verification

After writing `peers.conf` to GCS:
1. Read it back
2. Verify the expected public key is present
3. If missing → retry write (up to 3 times)
4. Log outcome

---

## Desktop App Changes

### `vpnStatus()` → enhanced with connectivity check

```typescript
export async function vpnStatus(): Promise<{
  configured: boolean    // hta-vpn.conf exists + flag file
  serviceRunning: boolean // Windows service is RUNNING
  connected: boolean     // Can reach 10.100.0.1 (handshake + nginx responding)
}> {
  const configured = fs.existsSync(VPN_FLAG_FILE)
  if (!configured) return { configured: false, serviceRunning: false, connected: false }

  let serviceRunning = false
  try {
    const { stdout } = await execFileAsync('sc', ['query', 'WireGuardTunnel$hta-vpn'])
    serviceRunning = stdout.includes('RUNNING')
  } catch {
    serviceRunning = false
  }

  let connected = false
  if (serviceRunning) {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 3000)
      await fetch('http://10.100.0.1/', { signal: controller.signal })
      clearTimeout(timeout)
      connected = true
    } catch {
      connected = false
    }
  }

  return { configured, serviceRunning, connected }
}
```

### Auto-heal flow on startup

```typescript
// In main/index.ts, after window loads:

const vpn = await vpnStatus()

if (!vpn.configured) {
  // First time — show provisioning screen
  mainWindow.loadURL(`${APP_URL}/desktop/vpn-setup`)
  return
}

if (vpn.connected) {
  // All good — proceed to login
  return
}

// Tunnel not connected — auto-heal
console.log('[vpn] Tunnel not connected, attempting recovery...')

// Step 1: Retry connection (service might just be starting)
for (let i = 0; i < 3; i++) {
  await new Promise(r => setTimeout(r, 30000)) // Wait 30s
  const check = await vpnStatus()
  if (check.connected) {
    console.log('[vpn] Connected after retry', i + 1)
    return
  }
}

// Step 2: Auto-re-provision with stored re-provision token
const reprovisionToken = loadReprovisionToken() // From safeStorage
if (reprovisionToken) {
  console.log('[vpn] Auto-re-provisioning...')
  const result = await vpnProvision(reprovisionToken, PROVISION_URL)
  if (result.success) {
    // Wait for handshake
    await new Promise(r => setTimeout(r, 5000))
    const final = await vpnStatus()
    if (final.connected) {
      console.log('[vpn] Re-provisioned and connected')
      return
    }
  }
}

// Step 3: Give up — show error with manual re-provision option
mainWindow.loadURL(`${APP_URL}/desktop/vpn-error`)
```

### Background health check (every 5 minutes)

```typescript
setInterval(async () => {
  const vpn = await vpnStatus()
  if (vpn.configured && vpn.serviceRunning && !vpn.connected) {
    // Tunnel is installed but not connecting
    console.warn('[vpn] Background check: tunnel not connected')
    
    // Try re-provisioning silently
    const reprovisionToken = loadReprovisionToken()
    if (reprovisionToken) {
      await vpnProvision(reprovisionToken, PROVISION_URL)
    }
  }
}, 5 * 60 * 1000)
```

### WireGuard config: no DNS line

```typescript
function buildWgConf(params: { ... }): string {
  return [
    '[Interface]',
    `PrivateKey = ${params.privateKey}`,
    `Address = ${params.assignedIp}/32`,
    // NO DNS line — system DNS stays untouched
    '',
    '[Peer]',
    `PublicKey = ${params.serverPublicKey}`,
    `Endpoint = ${params.serverEndpoint}`,
    `AllowedIPs = ${params.serverIp}/32, 10.8.3.0/24`,
    `PersistentKeepalive = 25`,
    '',
  ].join('\n')
}
```

### VPN error page (`/desktop/vpn-error`)

Shown only when auto-heal fails completely:

```
┌────────────────────────────────────────────────────┐
│                                                    │
│   ⚠ VPN Connection Failed                         │
│                                                    │
│   The desktop app couldn't establish a secure      │
│   connection to the HTA platform.                  │
│                                                    │
│   What you can try:                                │
│   • Check your internet connection                 │
│   • Restart the app                                │
│   • Contact your admin for a new provisioning      │
│     token if the issue persists                    │
│                                                    │
│   [Retry Connection]  [Enter New Token]            │
│                                                    │
└────────────────────────────────────────────────────┘
```

- "Retry Connection" → runs the auto-heal flow again
- "Enter New Token" → shows the provisioning screen (for cases where the admin revoked access and issued a new token)

---

## Admin Changes

### Provisioning API: make POC optional for token-only

Already specced in `customer-account-linking.md`. No additional changes for VPN.

### Admin user VPN section: show connection health

The existing admin user edit page (`/admin/users/:id/edit`) VPN section should show:
- Peer public key (truncated)
- Provisioned date
- Last handshake time (if available from gateway API)
- "Force re-sync" button → rewrites GCS peers.conf from DB

---

## Implementation Order

| Step | What | Impact |
|---|---|---|
| 1 | **Upsert provisioning API** — update peer if exists, don't 409 | Eliminates the #1 failure mode |
| 2 | **Remove DNS from WireGuard config** — omit DNS line from `buildWgConf()`, remove `WG_DNS` from configmap | Prevents DNS hijack |
| 3 | **Enhanced `vpnStatus()`** — add connectivity check (ping 10.100.0.1) | Accurate online/offline detection |
| 4 | **Auto-heal on startup** — retry 3x → re-provision → error page | Self-healing, no admin needed |
| 5 | **Re-provision token** — schema + API + desktop storage | Enables auto-heal without admin tokens |
| 6 | **Background health check** — every 5 min, auto-re-provision if down | Catches mid-session failures |
| 7 | **GCS sync verification** — read-back after write | Prevents stale keys |
| 8 | **VPN error page** — last resort UI with retry + new token | Clean failure UX |

---

## Files to Modify

### Schema
- `packages/database/prisma/schema.prisma` — add `reprovisionToken` to VpnPeer

### API
- `apps/api/src/routes/vpn/index.ts` — upsert peer, return re-provision token
- `apps/api/src/services/vpn.ts` — GCS sync verification (read-back)
- `infra/k8s/base/configmap.yaml` — remove `WG_DNS`

### Desktop
- `apps/desktop/src/main/vpn.ts` — remove DNS from `buildWgConf()`, enhance `vpnStatus()`, add re-provision flow
- `apps/desktop/src/main/index.ts` — auto-heal on startup, background health check, store re-provision token
- `apps/desktop/src/preload/index.ts` — expose re-provision IPC if needed

### Web
- `apps/web-hta/src/app/desktop/vpn-error/page.tsx` — new error page
- `apps/web-hta/src/app/admin/users/[id]/edit/page.tsx` — show peer key + force re-sync button
