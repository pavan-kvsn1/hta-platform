-- CreateTable
CREATE TABLE "DeviceRegistration" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "deviceName" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "appVersion" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "lastSyncAt" TIMESTAMP(3),
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "wipedAt" TIMESTAMP(3),

    CONSTRAINT "DeviceRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceAuditLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "metadata" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfflineCodeBatch" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OfflineCodeBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfflineCode" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "valueHash" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "OfflineCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeviceRegistration_deviceId_key" ON "DeviceRegistration"("deviceId");

-- CreateIndex
CREATE INDEX "DeviceRegistration_tenantId_idx" ON "DeviceRegistration"("tenantId");

-- CreateIndex
CREATE INDEX "DeviceRegistration_userId_idx" ON "DeviceRegistration"("userId");

-- CreateIndex
CREATE INDEX "DeviceAuditLog_tenantId_deviceId_idx" ON "DeviceAuditLog"("tenantId", "deviceId");

-- CreateIndex
CREATE INDEX "DeviceAuditLog_tenantId_userId_idx" ON "DeviceAuditLog"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "DeviceAuditLog_occurredAt_idx" ON "DeviceAuditLog"("occurredAt");

-- CreateIndex
CREATE INDEX "OfflineCodeBatch_tenantId_userId_idx" ON "OfflineCodeBatch"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "OfflineCodeBatch_userId_isActive_idx" ON "OfflineCodeBatch"("userId", "isActive");

-- CreateIndex
CREATE INDEX "OfflineCode_batchId_used_idx" ON "OfflineCode"("batchId", "used");

-- CreateIndex
CREATE UNIQUE INDEX "OfflineCode_batchId_key_key" ON "OfflineCode"("batchId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "OfflineCode_batchId_sequence_key" ON "OfflineCode"("batchId", "sequence");

-- AddForeignKey
ALTER TABLE "DeviceRegistration" ADD CONSTRAINT "DeviceRegistration_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceRegistration" ADD CONSTRAINT "DeviceRegistration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfflineCodeBatch" ADD CONSTRAINT "OfflineCodeBatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfflineCode" ADD CONSTRAINT "OfflineCode_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "OfflineCodeBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
