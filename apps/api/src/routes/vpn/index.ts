import { FastifyPluginAsync } from 'fastify'
import { prisma } from '@hta/database'
import {
  assignNextVpnIp,
  syncPeersToGcs,
  getServerPublicKey,
} from '../../services/vpn.js'

const WG_SERVER_ENDPOINT = process.env.WG_SERVER_ENDPOINT || '35.200.149.46:51820'
const WG_DNS = process.env.WG_DNS || '10.100.0.1'

const vpnRoutes: FastifyPluginAsync = async (fastify) => {
  // ---------------------------------------------------------------------------
  // POST /api/vpn/provision
  // Public endpoint — no auth required. Validates one-time token, assigns IP,
  // writes peers.conf to GCS, returns server config for hta-vpn.conf.
  // Rate-limited to 5 req/min per IP at the Fastify level.
  // ---------------------------------------------------------------------------
  fastify.post('/provision', {
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const body = request.body as { token?: string; publicKey?: string }

    if (!body.token || !body.publicKey) {
      return reply.status(400).send({ error: 'token and publicKey are required' })
    }

    // Validate token format (HTA-XXXX-XXXX-XXXX)
    if (!/^HTA-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/.test(body.token)) {
      return reply.status(400).send({ error: 'Invalid token format' })
    }

    // Find the user by provisioning token
    const user = await prisma.user.findUnique({
      where: { vpnProvisioningToken: body.token },
      select: { id: true, tenantId: true, email: true, vpnTokenGeneratedAt: true, vpnPeer: { select: { id: true } } },
    })

    if (!user) {
      return reply.status(401).send({ error: 'Invalid or expired provisioning token' })
    }

    // Token expiry check (7 days)
    if (user.vpnTokenGeneratedAt) {
      const ageMs = Date.now() - user.vpnTokenGeneratedAt.getTime()
      const sevenDays = 7 * 24 * 60 * 60 * 1000
      if (ageMs > sevenDays) {
        return reply.status(401).send({ error: 'Provisioning token has expired. Please request a new one.' })
      }
    }

    // Prevent duplicate provisioning (user already has an active peer)
    if (user.vpnPeer) {
      return reply.status(409).send({ error: 'VPN already provisioned for this account' })
    }

    // Validate public key format (base64, 44 chars — standard WireGuard key)
    if (!/^[A-Za-z0-9+/]{43}=$/.test(body.publicKey)) {
      return reply.status(400).send({ error: 'Invalid WireGuard public key format' })
    }

    // Check for duplicate public key
    const existingPeer = await prisma.vpnPeer.findUnique({
      where: { publicKey: body.publicKey },
    })
    if (existingPeer) {
      return reply.status(409).send({ error: 'This public key is already registered' })
    }

    // Assign next available IP
    const assignedIp = await assignNextVpnIp()

    // Create VpnPeer record + clear provisioning token atomically
    await prisma.$transaction([
      prisma.vpnPeer.create({
        data: {
          userId: user.id,
          tenantId: user.tenantId,
          publicKey: body.publicKey,
          ipAddress: assignedIp,
        },
      }),
      prisma.user.update({
        where: { id: user.id },
        data: {
          vpnProvisioningToken: null,
          vpnTokenGeneratedAt: null,
        },
      }),
    ])

    // Rebuild peers.conf in GCS
    await syncPeersToGcs()

    const serverPublicKey = await getServerPublicKey()

    return {
      serverPublicKey,
      serverEndpoint: WG_SERVER_ENDPOINT,
      assignedIp,
      serverIp: '10.100.0.1',
      dns: WG_DNS,
    }
  })
}

export default vpnRoutes
