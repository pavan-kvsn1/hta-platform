import type { FastifyRequest } from 'fastify'
import { prisma, Prisma } from '@hta/database'

type AuthActivityInput = {
  tenantId?: string | null
  userId?: string | null
  customerId?: string | null
  email?: string | null
  userType?: string | null
  eventType: string
  surface?: string | null
  deviceId?: string | null
  metadata?: Record<string, unknown>
}

type DeviceAuditInput = {
  tenantId?: string | null
  userId?: string | null
  deviceId?: string | null
  action: string
  entityType?: string | null
  entityId?: string | null
  metadata?: Record<string, unknown>
  occurredAt?: Date
}

type CertificateEditSessionInput = {
  tenantId?: string | null
  certificateId?: string | null
  userId?: string | null
  eventType: string
  mode?: string | null
  source?: string | null
  revision?: number | null
  activeDurationSeconds?: number | null
  metadata?: Record<string, unknown>
}

export function getRequestIp(request: FastifyRequest): string | undefined {
  const forwardedFor = request.headers['x-forwarded-for']
  if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
    return forwardedFor.split(',')[0]?.trim()
  }
  return request.ip
}

export function getRequestUserAgent(request: FastifyRequest): string | undefined {
  const userAgent = request.headers['user-agent']
  return typeof userAgent === 'string' ? userAgent : undefined
}

export function getRequestDeviceId(request: FastifyRequest): string | undefined {
  const deviceId = request.headers['x-device-id'] ?? request.headers['x-desktop-device-id']
  return typeof deviceId === 'string' && deviceId.trim() ? deviceId.trim() : undefined
}

export function getRequestSurface(request: FastifyRequest, fallback = 'API'): string {
  const surface = request.headers['x-auth-surface'] ?? request.headers['x-hta-surface']
  return typeof surface === 'string' && surface.trim() ? surface.trim().toUpperCase() : fallback
}

export async function writeAuthActivity(
  request: FastifyRequest,
  input: AuthActivityInput
): Promise<void> {
  try {
    await prisma.authActivityLog.create({
      data: {
        tenantId: input.tenantId ?? undefined,
        userId: input.userId ?? undefined,
        customerId: input.customerId ?? undefined,
        email: input.email ?? undefined,
        userType: input.userType ?? undefined,
        eventType: input.eventType,
        surface: input.surface ?? getRequestSurface(request),
        deviceId: input.deviceId ?? getRequestDeviceId(request),
        ipAddress: getRequestIp(request),
        userAgent: getRequestUserAgent(request),
        metadata: input.metadata as Prisma.InputJsonValue | undefined,
      },
    })
  } catch (err) {
    request.log.warn({ err, eventType: input.eventType }, 'Failed to write auth activity log')
  }
}

export async function writeDeviceAudit(
  request: FastifyRequest,
  input: DeviceAuditInput
): Promise<void> {
  try {
    await prisma.deviceAuditLog.create({
      data: {
        tenantId: input.tenantId ?? undefined,
        userId: input.userId ?? undefined,
        deviceId: input.deviceId ?? getRequestDeviceId(request),
        action: input.action,
        entityType: input.entityType ?? undefined,
        entityId: input.entityId ?? undefined,
        metadata: input.metadata as Prisma.InputJsonValue | undefined,
        ipAddress: getRequestIp(request),
        userAgent: getRequestUserAgent(request),
        occurredAt: input.occurredAt ?? new Date(),
      },
    })
  } catch (err) {
    request.log.warn({ err, action: input.action }, 'Failed to write device audit log')
  }
}

export async function writeCertificateEditSession(
  request: FastifyRequest,
  input: CertificateEditSessionInput
): Promise<void> {
  try {
    await prisma.certificateEditSessionLog.create({
      data: {
        tenantId: input.tenantId ?? undefined,
        certificateId: input.certificateId ?? undefined,
        userId: input.userId ?? undefined,
        eventType: input.eventType,
        mode: input.mode ?? undefined,
        source: input.source ?? getRequestSurface(request),
        revision: input.revision ?? undefined,
        activeDurationSeconds: input.activeDurationSeconds ?? undefined,
        ipAddress: getRequestIp(request),
        userAgent: getRequestUserAgent(request),
        metadata: input.metadata as Prisma.InputJsonValue | undefined,
      },
    })
  } catch (err) {
    request.log.warn({ err, eventType: input.eventType }, 'Failed to write certificate edit session log')
  }
}
