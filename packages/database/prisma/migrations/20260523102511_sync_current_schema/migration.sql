/*
  Warnings:

  - Added the required column `tenantId` to the `RefreshToken` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "TenantTier" AS ENUM ('STARTER', 'GROWTH', 'SCALE', 'INTERNAL');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'SUSPENDED');

-- AlterTable
ALTER TABLE "RefreshToken" ADD COLUMN     "isRevoked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "tenantId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "backupCodes" TEXT[],
ADD COLUMN     "totpEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "totpSecret" TEXT,
ADD COLUMN     "totpVerifiedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "TenantSubscription" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tier" "TenantTier" NOT NULL DEFAULT 'STARTER',
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "currentPeriodStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
    "trialEndsAt" TIMESTAMP(3),
    "basePriceInPaise" INTEGER NOT NULL DEFAULT 299900,
    "extraStaffSeats" INTEGER NOT NULL DEFAULT 0,
    "extraCustomerAccounts" INTEGER NOT NULL DEFAULT 0,
    "extraCustomerUserSeats" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantUsage" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "certificatesIssued" INTEGER NOT NULL DEFAULT 0,
    "staffUserCount" INTEGER NOT NULL DEFAULT 0,
    "customerAccountCount" INTEGER NOT NULL DEFAULT 0,
    "customerUserCount" INTEGER NOT NULL DEFAULT 0,
    "apiCallCount" INTEGER NOT NULL DEFAULT 0,
    "storageUsedMb" INTEGER NOT NULL DEFAULT 0,
    "snapshotAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TenantSubscription_tenantId_key" ON "TenantSubscription"("tenantId");

-- CreateIndex
CREATE INDEX "TenantSubscription_tenantId_idx" ON "TenantSubscription"("tenantId");

-- CreateIndex
CREATE INDEX "TenantSubscription_status_idx" ON "TenantSubscription"("status");

-- CreateIndex
CREATE INDEX "TenantUsage_subscriptionId_idx" ON "TenantUsage"("subscriptionId");

-- CreateIndex
CREATE INDEX "TenantUsage_periodStart_idx" ON "TenantUsage"("periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "TenantUsage_subscriptionId_periodStart_key" ON "TenantUsage"("subscriptionId", "periodStart");

-- CreateIndex
CREATE INDEX "RefreshToken_tenantId_idx" ON "RefreshToken"("tenantId");

-- CreateIndex
CREATE INDEX "RefreshToken_isRevoked_idx" ON "RefreshToken"("isRevoked");

-- AddForeignKey
ALTER TABLE "TenantSubscription" ADD CONSTRAINT "TenantSubscription_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantUsage" ADD CONSTRAINT "TenantUsage_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "TenantSubscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
