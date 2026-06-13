-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'SENT', 'PAID', 'OVERDUE', 'CANCELLED');

-- AlterEnum
ALTER TYPE "CustomerRequestType" ADD VALUE 'ACCOUNT_DELETION';
ALTER TYPE "CustomerRequestType" ADD VALUE 'DATA_EXPORT';

-- AlterTable
ALTER TABLE "Certificate" ADD COLUMN "customerAccountId" TEXT;

-- AlterTable
ALTER TABLE "RefreshToken" ADD COLUMN "deviceId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN "vpnProvisioningToken" TEXT,
ADD COLUMN "vpnTokenGeneratedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "TenantInvoice" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "lineItems" JSONB NOT NULL,
    "subtotal" INTEGER NOT NULL,
    "tax" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "dueDate" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "paymentMethod" TEXT,
    "paymentReference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VpnPeer" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "provisionedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "reprovisionToken" TEXT,

    CONSTRAINT "VpnPeer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TenantInvoice_invoiceNumber_key" ON "TenantInvoice"("invoiceNumber");

-- CreateIndex
CREATE INDEX "TenantInvoice_tenantId_idx" ON "TenantInvoice"("tenantId");

-- CreateIndex
CREATE INDEX "TenantInvoice_status_idx" ON "TenantInvoice"("status");

-- CreateIndex
CREATE INDEX "TenantInvoice_invoiceNumber_idx" ON "TenantInvoice"("invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "VpnPeer_userId_key" ON "VpnPeer"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "VpnPeer_publicKey_key" ON "VpnPeer"("publicKey");

-- CreateIndex
CREATE UNIQUE INDEX "VpnPeer_ipAddress_key" ON "VpnPeer"("ipAddress");

-- CreateIndex
CREATE UNIQUE INDEX "VpnPeer_reprovisionToken_key" ON "VpnPeer"("reprovisionToken");

-- CreateIndex
CREATE INDEX "VpnPeer_tenantId_idx" ON "VpnPeer"("tenantId");

-- CreateIndex
CREATE INDEX "VpnPeer_isActive_idx" ON "VpnPeer"("isActive");

-- CreateIndex
CREATE INDEX "Certificate_customerAccountId_idx" ON "Certificate"("customerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "User_vpnProvisioningToken_key" ON "User"("vpnProvisioningToken");

-- AddForeignKey
ALTER TABLE "TenantInvoice" ADD CONSTRAINT "TenantInvoice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_customerAccountId_fkey" FOREIGN KEY ("customerAccountId") REFERENCES "CustomerAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VpnPeer" ADD CONSTRAINT "VpnPeer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
