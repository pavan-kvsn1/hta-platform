import { FastifyPluginAsync } from 'fastify'
import { prisma } from '@hta/database'
import { randomBytes } from 'crypto'
import {
  assignNextVpnIp,
  syncPeersToGcs,
  getServerPublicKey,
} from '../../services/vpn.js'

const WG_SERVER_ENDPOINT = process.env.WG_SERVER_ENDPOINT || '35.200.149.46:51820'

function generateReprovisionToken(): string {
  return `RPT-${randomBytes(24).toString('base64url')}`
}

const vpnRoutes: FastifyPluginAsync = async (fastify) => {
  // ---------------------------------------------------------------------------
  // POST /api/vpn/provision
  //
  // Accepts TWO kinds of tokens:
  //   1. Admin-issued one-time token: HTA-XXXX-XXXX-XXXX (first provision)
  //   2. Device-bound re-provision token: RPT-... (auto-heal, reinstall)
  //
  // If the user already has a peer → upsert (update key, keep IP)
  // If new → create peer, assign IP
  // Always returns a new re-provision token for the device to store.
  // ---------------------------------------------------------------------------
  fastify.post('/provision', {
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const body = request.body as { token?: string; publicKey?: string }

    if (!body.token || !body.publicKey) {
      return reply.status(400).send({ error: 'token and publicKey are required' })
    }

    // Validate public key format
    if (!/^[A-Za-z0-9+/]{43}=$/.test(body.publicKey)) {
      return reply.status(400).send({ error: 'Invalid WireGuard public key format' })
    }

    // ── Try admin-issued token (HTA-XXXX-XXXX-XXXX) ──────────────────
    if (/^HTA-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/.test(body.token)) {
      const user = await prisma.user.findUnique({
        where: { vpnProvisioningToken: body.token },
        select: { id: true, tenantId: true, email: true, vpnTokenGeneratedAt: true, vpnPeer: { select: { id: true, ipAddress: true } } },
      })

      if (!user) {
        return reply.status(401).send({ error: 'Invalid or expired provisioning token' })
      }

      // Token expiry check (7 days)
      if (user.vpnTokenGeneratedAt) {
        const ageMs = Date.now() - user.vpnTokenGeneratedAt.getTime()
        if (ageMs > 7 * 24 * 60 * 60 * 1000) {
          return reply.status(401).send({ error: 'Provisioning token has expired. Please request a new one.' })
        }
      }

      const reprovisionToken = generateReprovisionToken()

      if (user.vpnPeer) {
        // Upsert: update existing peer
        await prisma.$transaction([
          prisma.vpnPeer.update({
            where: { id: user.vpnPeer.id },
            data: {
              publicKey: body.publicKey,
              provisionedAt: new Date(),
              isActive: true,
              reprovisionToken,
            },
          }),
          prisma.user.update({
            where: { id: user.id },
            data: { vpnProvisioningToken: null, vpnTokenGeneratedAt: null },
          }),
        ])

        await syncPeersToGcs()
        const serverPublicKey = await getServerPublicKey()

        return {
          serverPublicKey,
          serverEndpoint: WG_SERVER_ENDPOINT,
          assignedIp: user.vpnPeer.ipAddress,
          serverIp: '10.100.0.1',
          reprovisionToken,
        }
      }

      // New peer
      const assignedIp = await assignNextVpnIp()

      await prisma.$transaction([
        prisma.vpnPeer.create({
          data: {
            userId: user.id,
            tenantId: user.tenantId,
            publicKey: body.publicKey,
            ipAddress: assignedIp,
            reprovisionToken,
          },
        }),
        prisma.user.update({
          where: { id: user.id },
          data: { vpnProvisioningToken: null, vpnTokenGeneratedAt: null },
        }),
      ])

      await syncPeersToGcs()
      const serverPublicKey = await getServerPublicKey()

      return {
        serverPublicKey,
        serverEndpoint: WG_SERVER_ENDPOINT,
        assignedIp,
        serverIp: '10.100.0.1',
        reprovisionToken,
      }
    }

    // ── Try re-provision token (RPT-...) ──────────────────────────────
    if (body.token.startsWith('RPT-')) {
      const peer = await prisma.vpnPeer.findUnique({
        where: { reprovisionToken: body.token },
        select: { id: true, userId: true, tenantId: true, ipAddress: true },
      })

      if (!peer) {
        return reply.status(401).send({ error: 'Invalid re-provision token' })
      }

      // Rotate the re-provision token (old one invalidated)
      const newReprovisionToken = generateReprovisionToken()

      await prisma.vpnPeer.update({
        where: { id: peer.id },
        data: {
          publicKey: body.publicKey,
          provisionedAt: new Date(),
          isActive: true,
          reprovisionToken: newReprovisionToken,
        },
      })

      await syncPeersToGcs()
      const serverPublicKey = await getServerPublicKey()

      return {
        serverPublicKey,
        serverEndpoint: WG_SERVER_ENDPOINT,
        assignedIp: peer.ipAddress,
        serverIp: '10.100.0.1',
        reprovisionToken: newReprovisionToken,
      }
    }

    return reply.status(400).send({ error: 'Invalid token format' })
  })
}

export default vpnRoutes
