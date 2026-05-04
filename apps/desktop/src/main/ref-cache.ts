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

  const headers = { 'Authorization': `Bearer ${token}` }

  // Cache master instruments
  try {
    const res = await fetch(`${apiBase}/api/master-instruments?limit=9999`, { headers })
    if (res.ok) {
      const { items } = await res.json() as { items: { id: string }[] }
      for (const item of items) {
        await db.run(
          "INSERT OR REPLACE INTO ref_master_instruments (id, data, cached_at) VALUES (?, ?, datetime('now'))",
          item.id, JSON.stringify(item)
        )
      }
      console.log(`[ref-cache] Cached ${items.length} master instruments`)
    }
  } catch (err) {
    console.error('[ref-cache] Failed to cache master instruments:', err)
  }

  // Cache customers
  try {
    const res = await fetch(`${apiBase}/api/customers?limit=9999`, { headers })
    if (res.ok) {
      const { items } = await res.json() as { items: { id: string }[] }
      for (const item of items) {
        await db.run(
          "INSERT OR REPLACE INTO ref_customers (id, data, cached_at) VALUES (?, ?, datetime('now'))",
          item.id, JSON.stringify(item)
        )
      }
      console.log(`[ref-cache] Cached ${items.length} customers`)
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
