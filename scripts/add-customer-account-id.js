const { PrismaClient } = require('@prisma/client')

const p = new PrismaClient({
  datasources: {
    db: { url: 'postgresql://hta_app:hta_calibration_0809@127.0.0.1:5433/hta_platform' }
  }
})

async function main() {
  // Add the column
  await p.$executeRawUnsafe(`
    ALTER TABLE "Certificate"
    ADD COLUMN IF NOT EXISTS "customerAccountId" TEXT
    REFERENCES "CustomerAccount"(id)
  `)
  console.log('Added customerAccountId column')

  // Add index
  await p.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_certificate_customer_account
    ON "Certificate"("customerAccountId")
  `)
  console.log('Added index')

  // Backfill: link existing certs to matching customer accounts
  const result = await p.$executeRawUnsafe(`
    UPDATE "Certificate" c
    SET "customerAccountId" = ca.id
    FROM "CustomerAccount" ca
    WHERE c."tenantId" = ca."tenantId"
      AND LOWER(TRIM(c."customerName")) = LOWER(TRIM(ca."companyName"))
      AND c."customerAccountId" IS NULL
  `)
  console.log('Backfilled existing certificates:', result)
}

main()
  .catch(e => console.error('Failed:', e))
  .finally(() => p.$disconnect())
