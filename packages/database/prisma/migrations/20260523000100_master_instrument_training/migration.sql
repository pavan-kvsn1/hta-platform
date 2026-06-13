-- CreateTable
CREATE TABLE "MasterInstrumentTraining" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "instrumentId" TEXT NOT NULL,
  "masterInstrumentId" TEXT,
  "engineerId" TEXT NOT NULL,
  "certificateFileName" TEXT NOT NULL,
  "certificateFileSize" INTEGER NOT NULL,
  "certificateMimeType" TEXT NOT NULL DEFAULT 'application/pdf',
  "certificatePath" TEXT NOT NULL,
  "trainedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "notes" TEXT,
  "uploadedById" TEXT NOT NULL,
  "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,

  CONSTRAINT "MasterInstrumentTraining_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MasterInstrumentTraining_tenantId_instrumentId_idx" ON "MasterInstrumentTraining"("tenantId", "instrumentId");

-- CreateIndex
CREATE INDEX "MasterInstrumentTraining_engineerId_idx" ON "MasterInstrumentTraining"("engineerId");

-- CreateIndex
CREATE INDEX "MasterInstrumentTraining_expiresAt_idx" ON "MasterInstrumentTraining"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "MasterInstrumentTraining_active_unique" ON "MasterInstrumentTraining"("tenantId", "instrumentId", "engineerId") WHERE "isActive" = true;

-- AddForeignKey
ALTER TABLE "MasterInstrumentTraining" ADD CONSTRAINT "MasterInstrumentTraining_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MasterInstrumentTraining" ADD CONSTRAINT "MasterInstrumentTraining_engineerId_fkey" FOREIGN KEY ("engineerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MasterInstrumentTraining" ADD CONSTRAINT "MasterInstrumentTraining_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MasterInstrumentTraining" ADD CONSTRAINT "MasterInstrumentTraining_masterInstrumentId_fkey" FOREIGN KEY ("masterInstrumentId") REFERENCES "MasterInstrument"("id") ON DELETE SET NULL ON UPDATE CASCADE;
