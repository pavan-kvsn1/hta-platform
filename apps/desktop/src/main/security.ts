import { app, Session } from 'electron'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

// ─── TLS Certificate Pinning ────────────────────────────────────────────────
// Pin your API's TLS certificate SHA-256 fingerprint.
// Update this map when rotating TLS certificates.

const PINNED_HOSTS: Record<string, string> = {
  // WireGuard gateway — engineers reach the API through this VM.
  // Fingerprint: run the following once the VM's TLS cert is issued:
  //   openssl s_client -connect 35.200.149.46:443 </dev/null 2>/dev/null \
  //     | openssl x509 -fingerprint -sha256 -noout
  // Then replace the placeholder below.
  // '35.200.149.46': 'sha256/REPLACE_WITH_ACTUAL_FINGERPRINT',
}

export function setupTlsPinning(ses: Session): void {
  if (Object.keys(PINNED_HOSTS).length === 0) return // No pins configured yet

  ses.setCertificateVerifyProc((request, callback) => {
    const pin = PINNED_HOSTS[request.hostname]
    if (pin) {
      // Pinned host — verify fingerprint matches
      callback(request.certificate.fingerprint === pin ? 0 : -2)
    } else {
      // Non-pinned host — use default OS verification
      callback(-3)
    }
  })
}

// ─── Secure Data Wipe ───────────────────────────────────────────────────────
// Overwrites files with random bytes before unlinking (prevents forensic recovery).

export async function wipeAllLocalData(reason: string): Promise<void> {
  const userData = app.getPath('userData')

  // 1. Overwrite + delete SQLite file and journals
  const dbPath = path.join(userData, 'hta-offline.db')
  for (const suffix of ['', '-wal', '-shm']) {
    const filePath = dbPath + suffix
    secureDelete(filePath)
  }

  // 2. Recursively wipe encrypted image directory
  const imagesDir = path.join(userData, 'images')
  secureDeleteDir(imagesDir)

  // 3. Clear last-opened timestamp
  const lastOpenFile = path.join(userData, '.last-opened')
  secureDelete(lastOpenFile)

  console.log(`[security] Local data wiped. Reason: ${reason}`)
}

function secureDelete(filePath: string): void {
  if (!fs.existsSync(filePath)) return
  try {
    const size = fs.statSync(filePath).size
    if (size > 0) {
      fs.writeFileSync(filePath, crypto.randomBytes(size))
    }
    fs.unlinkSync(filePath)
  } catch (err) {
    console.error(`[security] Failed to secure-delete ${filePath}:`, err)
  }
}

function secureDeleteDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) return
  try {
    for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
      const fullPath = path.join(dirPath, entry.name)
      if (entry.isDirectory()) {
        secureDeleteDir(fullPath)
      } else {
        secureDelete(fullPath)
      }
    }
    fs.rmdirSync(dirPath)
  } catch (err) {
    console.error(`[security] Failed to secure-delete dir ${dirPath}:`, err)
  }
}

// ─── Data Retention ─────────────────────────────────────────────────────────

export function enforceRetentionPolicy(
  db: { prepare: (sql: string) => { run: (...args: unknown[]) => void } },
  maxDays: number = 30
): void {
  // Delete synced drafts older than retention period
  db.prepare(
    `DELETE FROM drafts WHERE status = 'SYNCED' AND synced_at < datetime('now', ? || ' days')`
  ).run(`-${maxDays}`)

  // Delete stale reference data
  db.prepare(
    `DELETE FROM ref_master_instruments WHERE cached_at < datetime('now', ? || ' days')`
  ).run(`-${maxDays}`)

  db.prepare(
    `DELETE FROM ref_customers WHERE cached_at < datetime('now', ? || ' days')`
  ).run(`-${maxDays}`)
}

// ─── Inactivity Check ───────────────────────────────────────────────────────
// If the app hasn't been opened in maxInactiveDays, trigger a wipe on next launch.

export function checkInactivityWipe(maxInactiveDays: number = 30): boolean {
  const lastOpenFile = path.join(app.getPath('userData'), '.last-opened')

  if (fs.existsSync(lastOpenFile)) {
    try {
      const lastOpened = new Date(fs.readFileSync(lastOpenFile, 'utf8').trim())
      const daysSince = (Date.now() - lastOpened.getTime()) / (1000 * 60 * 60 * 24)
      if (daysSince > maxInactiveDays) return true // Should wipe
    } catch {
      // Corrupted file — treat as fresh
    }
  }

  // Update last-opened timestamp
  fs.writeFileSync(lastOpenFile, new Date().toISOString())
  return false
}
