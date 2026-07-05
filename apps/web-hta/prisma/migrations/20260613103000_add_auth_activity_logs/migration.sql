-- Add dedicated auth activity logging and request context for device audit logs.

CREATE TABLE "AuthActivityLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "userId" TEXT,
    "customerId" TEXT,
    "email" TEXT,
    "userType" TEXT,
    "eventType" TEXT NOT NULL,
    "surface" TEXT,
    "deviceId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthActivityLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AuthActivityLog_tenantId_createdAt_idx" ON "AuthActivityLog"("tenantId", "createdAt");
CREATE INDEX "AuthActivityLog_userId_createdAt_idx" ON "AuthActivityLog"("userId", "createdAt");
CREATE INDEX "AuthActivityLog_customerId_createdAt_idx" ON "AuthActivityLog"("customerId", "createdAt");
CREATE INDEX "AuthActivityLog_deviceId_createdAt_idx" ON "AuthActivityLog"("deviceId", "createdAt");
CREATE INDEX "AuthActivityLog_eventType_createdAt_idx" ON "AuthActivityLog"("eventType", "createdAt");

CREATE TABLE "CertificateEditSessionLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "certificateId" TEXT,
    "userId" TEXT,
    "eventType" TEXT NOT NULL,
    "mode" TEXT,
    "source" TEXT,
    "revision" INTEGER,
    "activeDurationSeconds" INTEGER,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CertificateEditSessionLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CertificateEditSessionLog_tenantId_createdAt_idx" ON "CertificateEditSessionLog"("tenantId", "createdAt");
CREATE INDEX "CertificateEditSessionLog_certificateId_createdAt_idx" ON "CertificateEditSessionLog"("certificateId", "createdAt");
CREATE INDEX "CertificateEditSessionLog_userId_createdAt_idx" ON "CertificateEditSessionLog"("userId", "createdAt");
CREATE INDEX "CertificateEditSessionLog_eventType_createdAt_idx" ON "CertificateEditSessionLog"("eventType", "createdAt");

ALTER TABLE "DeviceAuditLog" ADD COLUMN "ipAddress" TEXT;
ALTER TABLE "DeviceAuditLog" ADD COLUMN "userAgent" TEXT;
ALTER TABLE "DeviceAuditLog" ALTER COLUMN "tenantId" DROP NOT NULL;
ALTER TABLE "DeviceAuditLog" ALTER COLUMN "deviceId" DROP NOT NULL;
ALTER TABLE "DeviceAuditLog" ALTER COLUMN "userId" DROP NOT NULL;
CREATE INDEX "DeviceAuditLog_action_idx" ON "DeviceAuditLog"("action");
