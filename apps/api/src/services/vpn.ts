import crypto from 'crypto'
import { Storage } from '@google-cloud/storage'
import { prisma } from '@hta/database'
import { createLogger } from '@hta/shared'

const logger = createLogger('vpn-service')

const PEERS_BUCKET = process.env.WG_PEERS_BUCKET || 'hta-platform-prod-wireguard'
const PEERS_FILE = 'peers.conf'
const SERVER_PUBKEY_FILE = 'server-public.key'
const WG_SUBNET_BASE = '10.100.0.'
const WG_SUBNET_START = 2   // 10.100.0.2 is the first engineer IP
const WG_SUBNET_END = 254   // 10.100.0.254 is the last

// ─── Token Generation ────────────────────────────────────────────────────────

/** Generates a token in the format HTA-XXXX-XXXX-XXXX (hex, uppercase) */
export function generateVpnProvisioningToken(): string {
  const part = () => crypto.randomBytes(2).toString('hex').toUpperCase()
  return `HTA-${part()}-${part()}-${part()}`
}

// ─── IP Assignment ───────────────────────────────────────────────────────────

/** Returns the next available 10.100.0.x IP, or throws if subnet is full */
export async function assignNextVpnIp(): Promise<string> {
  const activePeers = await prisma.vpnPeer.findMany({
    where: { isActive: true },
    select: { ipAddress: true },
  })

  const usedIps = new Set(activePeers.map((p) => p.ipAddress))

  for (let i = WG_SUBNET_START; i <= WG_SUBNET_END; i++) {
    const candidate = `${WG_SUBNET_BASE}${i}`
    if (!usedIps.has(candidate)) return candidate
  }

  throw new Error('VPN subnet exhausted — no available IP addresses')
}

// ─── GCS peers.conf ──────────────────────────────────────────────────────────

/**
 * Rebuilds peers.conf from all currently active VpnPeer rows in the DB
 * and writes it to GCS. Called after every provision or revocation.
 */
export async function syncPeersToGcs(): Promise<void> {
  const peers = await prisma.vpnPeer.findMany({
    where: { isActive: true },
    include: { user: { select: { email: true } } },
    orderBy: { provisionedAt: 'asc' },
  })

  const lines = peers.flatMap((p) => [
    `[Peer]`,
    `# ${p.user.email}`,
    `PublicKey = ${p.publicKey}`,
    `AllowedIPs = ${p.ipAddress}/32`,
    ``,
  ])

  const content = lines.join('\n')

  const storage = new Storage({ projectId: process.env.GCP_PROJECT_ID })
  const file = storage.bucket(PEERS_BUCKET).file(PEERS_FILE)
  await file.save(Buffer.from(content, 'utf8'), {
    contentType: 'text/plain',
    resumable: false,
  })

  logger.info(`[vpn] Synced ${peers.length} peer(s) to GCS peers.conf`)
}

// ─── Server Public Key ───────────────────────────────────────────────────────

/** Reads the server public key from GCS. Cached in memory for the process lifetime. */
let _serverPubKeyCache: string | null = null

export async function getServerPublicKey(): Promise<string> {
  if (_serverPubKeyCache) return _serverPubKeyCache

  const storage = new Storage({ projectId: process.env.GCP_PROJECT_ID })
  const file = storage.bucket(PEERS_BUCKET).file(SERVER_PUBKEY_FILE)
  const [contents] = await file.download()
  _serverPubKeyCache = contents.toString('utf8').trim()
  return _serverPubKeyCache
}
