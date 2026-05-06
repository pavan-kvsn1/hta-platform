import { net } from 'electron'
import { type WrappedDb } from './sqlite-db'
import { auditLog } from './audit'

/**
 * Fetch master instruments and customers from the API and cache
 * them in SQLCipher for offline dropdown use.
 */
export async function preCacheReferenceData(
  db: WrappedDb,
  apiBase: string,
  token: string,
  userId: string,
  deviceId: string,
): Promise<void> {
  if (!net.isOnline()) return

  const headers = { 'Authorization': `Bearer ${token}`, 'X-Tenant-ID': 'hta-calibration' }

  // Cache master instruments
  try {
    const res = await fetch(`${apiBase}/api/instruments?limit=9999`, { headers })
    if (res.ok) {
      // API returns a bare array of instruments
      const items = await res.json() as { id?: string; dbId?: string }[]
      for (const item of (Array.isArray(items) ? items : [])) {
        const id = item.dbId || item.id || ''
        if (!id) continue
        await db.run(
          "INSERT OR REPLACE INTO ref_master_instruments (id, data, cached_at) VALUES (?, ?, datetime('now'))",
          String(id), JSON.stringify(item)
        )
      }
      console.log(`[ref-cache] Cached ${Array.isArray(items) ? items.length : 0} master instruments`)
    } else {
      console.warn('[ref-cache] Instruments response:', res.status)
    }
  } catch (err) {
    console.error('[ref-cache] Failed to cache master instruments:', err)
  }

  // Cache customers (search API — fetch all by using a broad query)
  try {
    const res = await fetch(`${apiBase}/api/customers/search?q=a&limit=20`, { headers })
    if (res.ok) {
      const data = await res.json() as { customers?: { id: string }[] }
      const items = data.customers || []
      for (const item of items) {
        await db.run(
          "INSERT OR REPLACE INTO ref_customers (id, data, cached_at) VALUES (?, ?, datetime('now'))",
          item.id, JSON.stringify(item)
        )
      }
      // Also fetch other common starting letters
      for (const letter of ['b', 'c', 'd', 'e', 'h', 'i', 'm', 'p', 'r', 's', 't', 'w']) {
        try {
          const r2 = await fetch(`${apiBase}/api/customers/search?q=${letter}&limit=20`, { headers })
          if (r2.ok) {
            const d2 = await r2.json() as { customers?: { id: string }[] }
            for (const c of (d2.customers || [])) {
              await db.run(
                "INSERT OR REPLACE INTO ref_customers (id, data, cached_at) VALUES (?, ?, datetime('now'))",
                c.id, JSON.stringify(c)
              )
            }
          }
        } catch { /* skip letter */ }
      }
      const total = await db.get<{ cnt: number }>('SELECT COUNT(*) as cnt FROM ref_customers')
      console.log(`[ref-cache] Cached ${total?.cnt || 0} customers`)
    } else {
      console.warn('[ref-cache] Customers response:', res.status)
    }
  } catch (err) {
    console.error('[ref-cache] Failed to cache customers:', err)
  }

  await auditLog(db, { userId, deviceId, action: 'REF_DATA_CACHED', entityType: 'sync' })
}

/**
 * Read cached master instruments from SQLCipher.
 */
export async function getCachedMasterInstruments(db: WrappedDb): Promise<unknown[]> {
  const rows = await db.all<{ data: string }>('SELECT data FROM ref_master_instruments')
  return rows.map(r => JSON.parse(r.data))
}

/**
 * Read cached customers from SQLCipher.
 */
export async function getCachedCustomers(db: WrappedDb): Promise<unknown[]> {
  const rows = await db.all<{ data: string }>('SELECT data FROM ref_customers')
  return rows.map(r => JSON.parse(r.data))
}
