-- CreateEnum
CREATE TYPE "EmailDeliveryStatus" AS ENUM (
  'QUEUED',
  'SENT',
  'DELIVERED',
  'DELAYED',
  'BOUNCED',
  'FAILED',
  'SUPPRESSED',
  'COMPLAINED'
);

-- CreateTable
CREATE TABLE "EmailDelivery" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "certificateId" TEXT NOT NULL,
  "emailType" TEXT NOT NULL,
  "recipientEmail" TEXT NOT NULL,
  "recipientName" TEXT,
  "status" "EmailDeliveryStatus" NOT NULL DEFAULT 'QUEUED',
  "bullJobId" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "providerEmailId" TEXT,
  "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sentAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "lastEventAt" TIMESTAMP(3),
  "failureReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "EmailDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailDeliveryEvent" (
  "id" TEXT NOT NULL,
  "deliveryId" TEXT NOT NULL,
  "providerEventId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "details" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "EmailDeliveryEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailDelivery_idempotencyKey_key" ON "EmailDelivery"("idempotencyKey");
CREATE UNIQUE INDEX "EmailDelivery_providerEmailId_key" ON "EmailDelivery"("providerEmailId");
CREATE INDEX "EmailDelivery_tenantId_certificateId_createdAt_idx" ON "EmailDelivery"("tenantId", "certificateId", "createdAt");
CREATE INDEX "EmailDelivery_certificateId_emailType_createdAt_idx" ON "EmailDelivery"("certificateId", "emailType", "createdAt");
CREATE INDEX "EmailDelivery_status_idx" ON "EmailDelivery"("status");
CREATE UNIQUE INDEX "EmailDeliveryEvent_providerEventId_key" ON "EmailDeliveryEvent"("providerEventId");
CREATE INDEX "EmailDeliveryEvent_deliveryId_occurredAt_idx" ON "EmailDeliveryEvent"("deliveryId", "occurredAt");

-- AddForeignKey
ALTER TABLE "EmailDelivery"
  ADD CONSTRAINT "EmailDelivery_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EmailDelivery"
  ADD CONSTRAINT "EmailDelivery_certificateId_fkey"
  FOREIGN KEY ("certificateId") REFERENCES "Certificate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EmailDeliveryEvent"
  ADD CONSTRAINT "EmailDeliveryEvent_deliveryId_fkey"
  FOREIGN KEY ("deliveryId") REFERENCES "EmailDelivery"("id") ON DELETE CASCADE ON UPDATE CASCADE;
