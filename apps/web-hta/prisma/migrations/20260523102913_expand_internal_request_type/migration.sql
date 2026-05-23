-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "InternalRequestType" ADD VALUE 'FIELD_CHANGE';
ALTER TYPE "InternalRequestType" ADD VALUE 'OFFLINE_CODE_REQUEST';
ALTER TYPE "InternalRequestType" ADD VALUE 'DESKTOP_VPN_REQUEST';
