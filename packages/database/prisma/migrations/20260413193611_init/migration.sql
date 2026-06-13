-- CreateEnum
CREATE TYPE "CustomerRequestType" AS ENUM ('USER_ADDITION', 'POC_CHANGE');

-- CreateEnum
CREATE TYPE "CustomerRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CertificateImageType" AS ENUM ('UUC', 'MASTER_INSTRUMENT', 'READING_UUC', 'READING_MASTER');

-- CreateEnum
CREATE TYPE "StorageProvider" AS ENUM ('LOCAL', 'GCP');

-- CreateEnum
CREATE TYPE "InternalRequestType" AS ENUM ('SECTION_UNLOCK');

-- CreateEnum
CREATE TYPE "InternalRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT,
    "settings" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT,
    "role" TEXT NOT NULL DEFAULT 'ENGINEER',
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "adminType" TEXT,
    "assignedAdminId" TEXT,
    "signatureUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "activationToken" TEXT,
    "activationExpiry" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "googleId" TEXT,
    "authProvider" TEXT NOT NULL DEFAULT 'PASSWORD',
    "profileImageUrl" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerUser" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT,
    "companyName" TEXT,
    "customerAccountId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isPoc" BOOLEAN NOT NULL DEFAULT false,
    "activatedAt" TIMESTAMP(3),
    "activationToken" TEXT,
    "activationExpiry" TIMESTAMP(3),

    CONSTRAINT "CustomerUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerAccount" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "address" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "assignedAdminId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "primaryPocId" TEXT,

    CONSTRAINT "CustomerAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AllowedGoogleEmail" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'ENGINEER',
    "hodId" TEXT,
    "name" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AllowedGoogleEmail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerRegistration" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "customerAccountId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerRequest" (
    "id" TEXT NOT NULL,
    "type" "CustomerRequestType" NOT NULL,
    "status" "CustomerRequestStatus" NOT NULL DEFAULT 'PENDING',
    "customerAccountId" TEXT NOT NULL,
    "requestedById" TEXT,
    "data" TEXT NOT NULL,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MasterInstrument" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isLatest" BOOLEAN NOT NULL DEFAULT true,
    "legacyId" INTEGER,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "make" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "assetNumber" TEXT NOT NULL,
    "serialNumber" TEXT NOT NULL,
    "usage" TEXT,
    "calibratedAtLocation" TEXT,
    "reportNo" TEXT,
    "calibrationDueDate" TIMESTAMP(3),
    "rangeData" JSONB,
    "remarks" TEXT,
    "status" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "changeReason" TEXT,
    "importedFromJson" BOOLEAN NOT NULL DEFAULT false,
    "parameterCapabilities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "parameterGroup" TEXT,
    "parameterRoles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sopReferences" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "MasterInstrument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MasterInstrumentCertificate" (
    "id" TEXT NOT NULL,
    "masterInstrumentId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'application/pdf',
    "storagePath" TEXT NOT NULL,
    "reportNo" TEXT,
    "validFrom" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedById" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isLatest" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "MasterInstrumentCertificate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Certificate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "certificateNumber" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "currentRevision" INTEGER NOT NULL DEFAULT 1,
    "reviewerId" TEXT,
    "customerApprovedAt" TIMESTAMP(3),
    "calibratedAt" TEXT,
    "srfNumber" TEXT,
    "srfDate" TIMESTAMP(3),
    "dateOfCalibration" TIMESTAMP(3),
    "calibrationTenure" INTEGER NOT NULL DEFAULT 12,
    "dueDateAdjustment" INTEGER NOT NULL DEFAULT 0,
    "calibrationDueDate" TIMESTAMP(3),
    "dueDateNotApplicable" BOOLEAN NOT NULL DEFAULT false,
    "customerName" TEXT,
    "customerAddress" TEXT,
    "uucDescription" TEXT,
    "uucMake" TEXT,
    "uucModel" TEXT,
    "uucSerialNumber" TEXT,
    "uucInstrumentId" TEXT,
    "uucLocationName" TEXT,
    "uucMachineName" TEXT,
    "ambientTemperature" TEXT,
    "relativeHumidity" TEXT,
    "calibrationStatus" JSONB,
    "stickerOldRemoved" TEXT,
    "stickerNewAffixed" TEXT,
    "statusNotes" TEXT,
    "selectedConclusionStatements" JSONB,
    "additionalConclusionStatement" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "lastModifiedById" TEXT NOT NULL,
    "signedPdfPath" TEXT,
    "customerContactName" TEXT,
    "customerContactEmail" TEXT,

    CONSTRAINT "Certificate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CertificateEvent" (
    "id" TEXT NOT NULL,
    "certificateId" TEXT NOT NULL,
    "sequenceNumber" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL,
    "eventType" TEXT NOT NULL,
    "eventData" JSONB NOT NULL,
    "userId" TEXT,
    "customerId" TEXT,
    "userRole" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CertificateEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CertificateRevision" (
    "id" TEXT NOT NULL,
    "certificateId" TEXT NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "snapshotData" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "submittedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewOutcome" TEXT,
    "reviewNotes" TEXT,
    "fromEventSeq" INTEGER NOT NULL,
    "toEventSeq" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CertificateRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewFeedback" (
    "id" TEXT NOT NULL,
    "certificateId" TEXT NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "eventId" TEXT,
    "feedbackType" TEXT NOT NULL,
    "targetField" TEXT,
    "targetSection" TEXT,
    "comment" TEXT NOT NULL,
    "isResolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReviewFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Parameter" (
    "id" TEXT NOT NULL,
    "certificateId" TEXT NOT NULL,
    "parameterName" TEXT NOT NULL,
    "parameterUnit" TEXT NOT NULL,
    "rangeMin" TEXT,
    "rangeMax" TEXT,
    "rangeUnit" TEXT,
    "operatingMin" TEXT,
    "operatingMax" TEXT,
    "operatingUnit" TEXT,
    "leastCountValue" TEXT,
    "leastCountUnit" TEXT,
    "accuracyValue" TEXT,
    "accuracyUnit" TEXT,
    "accuracyType" TEXT NOT NULL DEFAULT 'ABSOLUTE',
    "errorFormula" TEXT NOT NULL DEFAULT 'A-B',
    "showAfterAdjustment" BOOLEAN NOT NULL DEFAULT false,
    "requiresBinning" BOOLEAN NOT NULL DEFAULT false,
    "bins" JSONB,
    "sopReference" TEXT,
    "masterInstrumentId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Parameter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalibrationResult" (
    "id" TEXT NOT NULL,
    "parameterId" TEXT NOT NULL,
    "pointNumber" INTEGER NOT NULL,
    "standardReading" TEXT,
    "beforeAdjustment" TEXT,
    "afterAdjustment" TEXT,
    "errorObserved" DOUBLE PRECISION,
    "isOutOfLimit" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "CalibrationResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CertificateMasterInstrument" (
    "id" TEXT NOT NULL,
    "certificateId" TEXT NOT NULL,
    "parameterId" TEXT,
    "masterInstrumentId" TEXT NOT NULL,
    "category" TEXT,
    "description" TEXT,
    "make" TEXT,
    "model" TEXT,
    "assetNo" TEXT,
    "serialNumber" TEXT,
    "calibratedAt" TEXT,
    "reportNo" TEXT,
    "calibrationDueDate" TEXT,
    "sopReference" TEXT NOT NULL,

    CONSTRAINT "CertificateMasterInstrument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Signature" (
    "id" TEXT NOT NULL,
    "certificateId" TEXT NOT NULL,
    "signerType" TEXT NOT NULL,
    "signerName" TEXT NOT NULL,
    "signerEmail" TEXT NOT NULL,
    "signatureData" TEXT NOT NULL,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "customerId" TEXT,
    "signerId" TEXT,

    CONSTRAINT "Signature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalToken" (
    "id" TEXT NOT NULL,
    "certificateId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApprovalToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorId" TEXT,
    "actorType" TEXT NOT NULL,
    "changes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "customerId" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "certificateId" TEXT,
    "data" JSONB,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpenSignDocument" (
    "id" TEXT NOT NULL,
    "certificateId" TEXT NOT NULL,
    "openSignDocumentId" TEXT NOT NULL,
    "signerType" TEXT NOT NULL,
    "signerEmail" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "signingUrl" TEXT,
    "signedPdfUrl" TEXT,
    "auditTrailUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpenSignDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SigningEvidence" (
    "id" TEXT NOT NULL,
    "certificateId" TEXT NOT NULL,
    "signatureId" TEXT,
    "revision" INTEGER NOT NULL,
    "sequenceNumber" INTEGER NOT NULL,
    "previousHash" TEXT NOT NULL,
    "recordHash" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SigningEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatThread" (
    "id" TEXT NOT NULL,
    "certificateId" TEXT NOT NULL,
    "threadType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "senderId" TEXT,
    "customerId" TEXT,
    "senderType" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatAttachment" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UUCImage" (
    "id" TEXT NOT NULL,
    "certificateId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "caption" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UUCImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CertificateImage" (
    "id" TEXT NOT NULL,
    "certificateId" TEXT NOT NULL,
    "imageType" "CertificateImageType" NOT NULL,
    "masterInstrumentIndex" INTEGER,
    "parameterIndex" INTEGER,
    "pointNumber" INTEGER,
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "storageProvider" "StorageProvider" NOT NULL,
    "storageBucket" TEXT,
    "storageKey" TEXT NOT NULL,
    "optimizedKey" TEXT,
    "thumbnailKey" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isLatest" BOOLEAN NOT NULL DEFAULT true,
    "supersededById" TEXT,
    "archivedAt" TIMESTAMP(3),
    "caption" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedById" TEXT NOT NULL,
    "certificateRevision" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "CertificateImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobQueue" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxRetries" INTEGER NOT NULL DEFAULT 3,
    "error" TEXT,
    "scheduledFor" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "JobQueue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RealtimeEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "customerId" TEXT,
    "channel" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "delivered" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RealtimeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InternalRequest" (
    "id" TEXT NOT NULL,
    "type" "InternalRequestType" NOT NULL,
    "status" "InternalRequestStatus" NOT NULL DEFAULT 'PENDING',
    "requestedById" TEXT NOT NULL,
    "certificateId" TEXT,
    "data" TEXT NOT NULL,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "adminNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InternalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT,
    "customerId" TEXT,
    "userType" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,
    "replacedById" TEXT,
    "userAgent" TEXT,
    "ipAddress" TEXT,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT,
    "customerId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DownloadToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "certificateId" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "downloadedAt" TIMESTAMP(3),
    "downloadCount" INTEGER NOT NULL DEFAULT 0,
    "maxDownloads" INTEGER NOT NULL DEFAULT 5,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentById" TEXT,

    CONSTRAINT "DownloadToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TokenAccessLog" (
    "id" TEXT NOT NULL,
    "tokenType" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TokenAccessLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE INDEX "Tenant_slug_idx" ON "Tenant"("slug");

-- CreateIndex
CREATE INDEX "Tenant_domain_idx" ON "Tenant"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "User_activationToken_key" ON "User"("activationToken");

-- CreateIndex
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");

-- CreateIndex
CREATE INDEX "User_tenantId_idx" ON "User"("tenantId");

-- CreateIndex
CREATE INDEX "User_tenantId_role_idx" ON "User"("tenantId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "User_tenantId_email_key" ON "User"("tenantId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerUser_activationToken_key" ON "CustomerUser"("activationToken");

-- CreateIndex
CREATE INDEX "CustomerUser_tenantId_idx" ON "CustomerUser"("tenantId");

-- CreateIndex
CREATE INDEX "CustomerUser_customerAccountId_idx" ON "CustomerUser"("customerAccountId");

-- CreateIndex
CREATE INDEX "CustomerUser_activationToken_idx" ON "CustomerUser"("activationToken");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerUser_tenantId_email_key" ON "CustomerUser"("tenantId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerAccount_primaryPocId_key" ON "CustomerAccount"("primaryPocId");

-- CreateIndex
CREATE INDEX "CustomerAccount_tenantId_idx" ON "CustomerAccount"("tenantId");

-- CreateIndex
CREATE INDEX "CustomerAccount_companyName_idx" ON "CustomerAccount"("companyName");

-- CreateIndex
CREATE INDEX "CustomerAccount_assignedAdminId_idx" ON "CustomerAccount"("assignedAdminId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerAccount_tenantId_companyName_key" ON "CustomerAccount"("tenantId", "companyName");

-- CreateIndex
CREATE UNIQUE INDEX "AllowedGoogleEmail_email_key" ON "AllowedGoogleEmail"("email");

-- CreateIndex
CREATE INDEX "AllowedGoogleEmail_email_idx" ON "AllowedGoogleEmail"("email");

-- CreateIndex
CREATE INDEX "AllowedGoogleEmail_type_idx" ON "AllowedGoogleEmail"("type");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerRegistration_email_key" ON "CustomerRegistration"("email");

-- CreateIndex
CREATE INDEX "CustomerRegistration_status_idx" ON "CustomerRegistration"("status");

-- CreateIndex
CREATE INDEX "CustomerRegistration_customerAccountId_idx" ON "CustomerRegistration"("customerAccountId");

-- CreateIndex
CREATE INDEX "CustomerRequest_customerAccountId_idx" ON "CustomerRequest"("customerAccountId");

-- CreateIndex
CREATE INDEX "CustomerRequest_status_idx" ON "CustomerRequest"("status");

-- CreateIndex
CREATE INDEX "CustomerRequest_type_idx" ON "CustomerRequest"("type");

-- CreateIndex
CREATE INDEX "MasterInstrument_tenantId_idx" ON "MasterInstrument"("tenantId");

-- CreateIndex
CREATE INDEX "MasterInstrument_instrumentId_isLatest_idx" ON "MasterInstrument"("instrumentId", "isLatest");

-- CreateIndex
CREATE INDEX "MasterInstrument_category_idx" ON "MasterInstrument"("category");

-- CreateIndex
CREATE INDEX "MasterInstrument_description_idx" ON "MasterInstrument"("description");

-- CreateIndex
CREATE INDEX "MasterInstrument_assetNumber_idx" ON "MasterInstrument"("assetNumber");

-- CreateIndex
CREATE INDEX "MasterInstrument_calibrationDueDate_idx" ON "MasterInstrument"("calibrationDueDate");

-- CreateIndex
CREATE INDEX "MasterInstrument_parameterGroup_idx" ON "MasterInstrument"("parameterGroup");

-- CreateIndex
CREATE UNIQUE INDEX "MasterInstrument_tenantId_instrumentId_version_key" ON "MasterInstrument"("tenantId", "instrumentId", "version");

-- CreateIndex
CREATE INDEX "MasterInstrumentCertificate_masterInstrumentId_idx" ON "MasterInstrumentCertificate"("masterInstrumentId");

-- CreateIndex
CREATE INDEX "MasterInstrumentCertificate_masterInstrumentId_isLatest_idx" ON "MasterInstrumentCertificate"("masterInstrumentId", "isLatest");

-- CreateIndex
CREATE INDEX "MasterInstrumentCertificate_reportNo_idx" ON "MasterInstrumentCertificate"("reportNo");

-- CreateIndex
CREATE INDEX "Certificate_tenantId_idx" ON "Certificate"("tenantId");

-- CreateIndex
CREATE INDEX "Certificate_tenantId_status_idx" ON "Certificate"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Certificate_createdById_idx" ON "Certificate"("createdById");

-- CreateIndex
CREATE INDEX "Certificate_reviewerId_idx" ON "Certificate"("reviewerId");

-- CreateIndex
CREATE UNIQUE INDEX "Certificate_tenantId_certificateNumber_key" ON "Certificate"("tenantId", "certificateNumber");

-- CreateIndex
CREATE INDEX "CertificateEvent_certificateId_createdAt_idx" ON "CertificateEvent"("certificateId", "createdAt");

-- CreateIndex
CREATE INDEX "CertificateEvent_certificateId_revision_idx" ON "CertificateEvent"("certificateId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "CertificateEvent_certificateId_sequenceNumber_key" ON "CertificateEvent"("certificateId", "sequenceNumber");

-- CreateIndex
CREATE INDEX "CertificateRevision_certificateId_createdAt_idx" ON "CertificateRevision"("certificateId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CertificateRevision_certificateId_revisionNumber_key" ON "CertificateRevision"("certificateId", "revisionNumber");

-- CreateIndex
CREATE INDEX "ReviewFeedback_certificateId_revisionNumber_idx" ON "ReviewFeedback"("certificateId", "revisionNumber");

-- CreateIndex
CREATE INDEX "ReviewFeedback_certificateId_isResolved_idx" ON "ReviewFeedback"("certificateId", "isResolved");

-- CreateIndex
CREATE INDEX "Parameter_certificateId_idx" ON "Parameter"("certificateId");

-- CreateIndex
CREATE INDEX "CalibrationResult_parameterId_idx" ON "CalibrationResult"("parameterId");

-- CreateIndex
CREATE INDEX "CertificateMasterInstrument_certificateId_idx" ON "CertificateMasterInstrument"("certificateId");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalToken_token_key" ON "ApprovalToken"("token");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "Notification_userId_read_idx" ON "Notification"("userId", "read");

-- CreateIndex
CREATE INDEX "Notification_customerId_read_idx" ON "Notification"("customerId", "read");

-- CreateIndex
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "OpenSignDocument_openSignDocumentId_key" ON "OpenSignDocument"("openSignDocumentId");

-- CreateIndex
CREATE INDEX "OpenSignDocument_certificateId_idx" ON "OpenSignDocument"("certificateId");

-- CreateIndex
CREATE INDEX "OpenSignDocument_status_idx" ON "OpenSignDocument"("status");

-- CreateIndex
CREATE INDEX "SigningEvidence_certificateId_idx" ON "SigningEvidence"("certificateId");

-- CreateIndex
CREATE INDEX "SigningEvidence_certificateId_revision_idx" ON "SigningEvidence"("certificateId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "SigningEvidence_certificateId_sequenceNumber_key" ON "SigningEvidence"("certificateId", "sequenceNumber");

-- CreateIndex
CREATE INDEX "ChatThread_certificateId_idx" ON "ChatThread"("certificateId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatThread_certificateId_threadType_key" ON "ChatThread"("certificateId", "threadType");

-- CreateIndex
CREATE INDEX "ChatMessage_threadId_createdAt_idx" ON "ChatMessage"("threadId", "createdAt");

-- CreateIndex
CREATE INDEX "ChatMessage_senderId_idx" ON "ChatMessage"("senderId");

-- CreateIndex
CREATE INDEX "ChatMessage_customerId_idx" ON "ChatMessage"("customerId");

-- CreateIndex
CREATE INDEX "ChatAttachment_messageId_idx" ON "ChatAttachment"("messageId");

-- CreateIndex
CREATE INDEX "UUCImage_certificateId_sortOrder_idx" ON "UUCImage"("certificateId", "sortOrder");

-- CreateIndex
CREATE INDEX "CertificateImage_certificateId_imageType_idx" ON "CertificateImage"("certificateId", "imageType");

-- CreateIndex
CREATE INDEX "CertificateImage_certificateId_imageType_isLatest_idx" ON "CertificateImage"("certificateId", "imageType", "isLatest");

-- CreateIndex
CREATE INDEX "CertificateImage_certificateId_parameterIndex_pointNumber_idx" ON "CertificateImage"("certificateId", "parameterIndex", "pointNumber");

-- CreateIndex
CREATE INDEX "CertificateImage_certificateId_masterInstrumentIndex_idx" ON "CertificateImage"("certificateId", "masterInstrumentIndex");

-- CreateIndex
CREATE INDEX "CertificateImage_storageKey_idx" ON "CertificateImage"("storageKey");

-- CreateIndex
CREATE INDEX "JobQueue_status_scheduledFor_priority_idx" ON "JobQueue"("status", "scheduledFor", "priority");

-- CreateIndex
CREATE INDEX "JobQueue_type_idx" ON "JobQueue"("type");

-- CreateIndex
CREATE INDEX "RealtimeEvent_userId_delivered_createdAt_idx" ON "RealtimeEvent"("userId", "delivered", "createdAt");

-- CreateIndex
CREATE INDEX "RealtimeEvent_customerId_delivered_createdAt_idx" ON "RealtimeEvent"("customerId", "delivered", "createdAt");

-- CreateIndex
CREATE INDEX "RealtimeEvent_channel_createdAt_idx" ON "RealtimeEvent"("channel", "createdAt");

-- CreateIndex
CREATE INDEX "InternalRequest_certificateId_idx" ON "InternalRequest"("certificateId");

-- CreateIndex
CREATE INDEX "InternalRequest_status_idx" ON "InternalRequest"("status");

-- CreateIndex
CREATE INDEX "InternalRequest_type_idx" ON "InternalRequest"("type");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_token_key" ON "RefreshToken"("token");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE INDEX "RefreshToken_customerId_idx" ON "RefreshToken"("customerId");

-- CreateIndex
CREATE INDEX "RefreshToken_token_idx" ON "RefreshToken"("token");

-- CreateIndex
CREATE INDEX "RefreshToken_expiresAt_idx" ON "RefreshToken"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_token_key" ON "PasswordResetToken"("token");

-- CreateIndex
CREATE INDEX "PasswordResetToken_token_idx" ON "PasswordResetToken"("token");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- CreateIndex
CREATE INDEX "PasswordResetToken_customerId_idx" ON "PasswordResetToken"("customerId");

-- CreateIndex
CREATE INDEX "PasswordResetToken_expiresAt_idx" ON "PasswordResetToken"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "DownloadToken_token_key" ON "DownloadToken"("token");

-- CreateIndex
CREATE INDEX "DownloadToken_token_idx" ON "DownloadToken"("token");

-- CreateIndex
CREATE INDEX "DownloadToken_certificateId_idx" ON "DownloadToken"("certificateId");

-- CreateIndex
CREATE INDEX "DownloadToken_expiresAt_idx" ON "DownloadToken"("expiresAt");

-- CreateIndex
CREATE INDEX "TokenAccessLog_tokenId_idx" ON "TokenAccessLog"("tokenId");

-- CreateIndex
CREATE INDEX "TokenAccessLog_tokenType_action_idx" ON "TokenAccessLog"("tokenType", "action");

-- CreateIndex
CREATE INDEX "TokenAccessLog_createdAt_idx" ON "TokenAccessLog"("createdAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_assignedAdminId_fkey" FOREIGN KEY ("assignedAdminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerUser" ADD CONSTRAINT "CustomerUser_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerUser" ADD CONSTRAINT "CustomerUser_customerAccountId_fkey" FOREIGN KEY ("customerAccountId") REFERENCES "CustomerAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerAccount" ADD CONSTRAINT "CustomerAccount_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerAccount" ADD CONSTRAINT "CustomerAccount_assignedAdminId_fkey" FOREIGN KEY ("assignedAdminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerAccount" ADD CONSTRAINT "CustomerAccount_primaryPocId_fkey" FOREIGN KEY ("primaryPocId") REFERENCES "CustomerUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerRegistration" ADD CONSTRAINT "CustomerRegistration_customerAccountId_fkey" FOREIGN KEY ("customerAccountId") REFERENCES "CustomerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerRegistration" ADD CONSTRAINT "CustomerRegistration_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerRequest" ADD CONSTRAINT "CustomerRequest_customerAccountId_fkey" FOREIGN KEY ("customerAccountId") REFERENCES "CustomerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerRequest" ADD CONSTRAINT "CustomerRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "CustomerUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerRequest" ADD CONSTRAINT "CustomerRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MasterInstrument" ADD CONSTRAINT "MasterInstrument_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MasterInstrument" ADD CONSTRAINT "MasterInstrument_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MasterInstrumentCertificate" ADD CONSTRAINT "MasterInstrumentCertificate_masterInstrumentId_fkey" FOREIGN KEY ("masterInstrumentId") REFERENCES "MasterInstrument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MasterInstrumentCertificate" ADD CONSTRAINT "MasterInstrumentCertificate_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_lastModifiedById_fkey" FOREIGN KEY ("lastModifiedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CertificateEvent" ADD CONSTRAINT "CertificateEvent_certificateId_fkey" FOREIGN KEY ("certificateId") REFERENCES "Certificate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CertificateEvent" ADD CONSTRAINT "CertificateEvent_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "CustomerUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CertificateEvent" ADD CONSTRAINT "CertificateEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CertificateRevision" ADD CONSTRAINT "CertificateRevision_certificateId_fkey" FOREIGN KEY ("certificateId") REFERENCES "Certificate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CertificateRevision" ADD CONSTRAINT "CertificateRevision_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CertificateRevision" ADD CONSTRAINT "CertificateRevision_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewFeedback" ADD CONSTRAINT "ReviewFeedback_certificateId_fkey" FOREIGN KEY ("certificateId") REFERENCES "Certificate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewFeedback" ADD CONSTRAINT "ReviewFeedback_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "CertificateEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewFeedback" ADD CONSTRAINT "ReviewFeedback_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewFeedback" ADD CONSTRAINT "ReviewFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Parameter" ADD CONSTRAINT "Parameter_certificateId_fkey" FOREIGN KEY ("certificateId") REFERENCES "Certificate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalibrationResult" ADD CONSTRAINT "CalibrationResult_parameterId_fkey" FOREIGN KEY ("parameterId") REFERENCES "Parameter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CertificateMasterInstrument" ADD CONSTRAINT "CertificateMasterInstrument_certificateId_fkey" FOREIGN KEY ("certificateId") REFERENCES "Certificate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CertificateMasterInstrument" ADD CONSTRAINT "CertificateMasterInstrument_parameterId_fkey" FOREIGN KEY ("parameterId") REFERENCES "Parameter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Signature" ADD CONSTRAINT "Signature_certificateId_fkey" FOREIGN KEY ("certificateId") REFERENCES "Certificate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Signature" ADD CONSTRAINT "Signature_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "CustomerUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Signature" ADD CONSTRAINT "Signature_signerId_fkey" FOREIGN KEY ("signerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalToken" ADD CONSTRAINT "ApprovalToken_certificateId_fkey" FOREIGN KEY ("certificateId") REFERENCES "Certificate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalToken" ADD CONSTRAINT "ApprovalToken_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "CustomerUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_certificateId_fkey" FOREIGN KEY ("certificateId") REFERENCES "Certificate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "CustomerUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpenSignDocument" ADD CONSTRAINT "OpenSignDocument_certificateId_fkey" FOREIGN KEY ("certificateId") REFERENCES "Certificate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SigningEvidence" ADD CONSTRAINT "SigningEvidence_certificateId_fkey" FOREIGN KEY ("certificateId") REFERENCES "Certificate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatThread" ADD CONSTRAINT "ChatThread_certificateId_fkey" FOREIGN KEY ("certificateId") REFERENCES "Certificate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "CustomerUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "ChatThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatAttachment" ADD CONSTRAINT "ChatAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UUCImage" ADD CONSTRAINT "UUCImage_certificateId_fkey" FOREIGN KEY ("certificateId") REFERENCES "Certificate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UUCImage" ADD CONSTRAINT "UUCImage_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CertificateImage" ADD CONSTRAINT "CertificateImage_certificateId_fkey" FOREIGN KEY ("certificateId") REFERENCES "Certificate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CertificateImage" ADD CONSTRAINT "CertificateImage_supersededById_fkey" FOREIGN KEY ("supersededById") REFERENCES "CertificateImage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CertificateImage" ADD CONSTRAINT "CertificateImage_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InternalRequest" ADD CONSTRAINT "InternalRequest_certificateId_fkey" FOREIGN KEY ("certificateId") REFERENCES "Certificate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InternalRequest" ADD CONSTRAINT "InternalRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InternalRequest" ADD CONSTRAINT "InternalRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "CustomerUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DownloadToken" ADD CONSTRAINT "DownloadToken_certificateId_fkey" FOREIGN KEY ("certificateId") REFERENCES "Certificate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DownloadToken" ADD CONSTRAINT "DownloadToken_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TokenAccessLog" ADD CONSTRAINT "TokenAccessLog_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "DownloadToken"("id") ON DELETE CASCADE ON UPDATE CASCADE;
