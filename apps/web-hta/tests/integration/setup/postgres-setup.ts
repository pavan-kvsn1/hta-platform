/**
 * PostgreSQL Integration Test Setup
 *
 * This file initializes the PostgreSQL test database connection
 * and handles schema migration before tests run.
 */

import { beforeAll, afterAll, beforeEach } from 'vitest'
import { execSync } from 'child_process'
import { prisma } from '@/lib/prisma'

// PostgreSQL connection string
const DATABASE_URL = process.env.DATABASE_URL ||
  'postgresql://hta_user:hta_dev_password@localhost:5432/hta_platform_test'

// Set DATABASE_URL environment variable for Prisma CLI commands
process.env.DATABASE_URL = DATABASE_URL

let isSetupComplete = false

/**
 * Global setup - runs once before all tests
 */
beforeAll(async () => {
  if (isSetupComplete) return

  console.log('\n🐘 Setting up PostgreSQL test database...')

  try {
    // Test connection
    await prisma.$queryRaw`SELECT 1`
    console.log('✅ PostgreSQL connection successful')

    // Push schema to database (creates tables if needed)
    console.log('📦 Pushing schema to PostgreSQL...')
    execSync(
      'npx prisma db push --accept-data-loss',
      {
        stdio: 'pipe',
        env: { ...process.env, DATABASE_URL },
      }
    )
    console.log('✅ Schema pushed successfully')

    isSetupComplete = true
  } catch (error) {
    console.error('\n❌ PostgreSQL setup failed!')
    console.error('Make sure PostgreSQL is running:')
    console.error('  pnpm docker:infra')
    console.error('\nError:', error)
    throw error
  }
})

/**
 * Clean database before each test
 */
beforeEach(async () => {
  try {
    // Truncate all tables in dependency order
    await prisma.$executeRaw`
      DO $$
      DECLARE
        r RECORD;
      BEGIN
        SET session_replication_role = replica;
        FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename != '_prisma_migrations') LOOP
          EXECUTE 'TRUNCATE TABLE "' || r.tablename || '" CASCADE';
        END LOOP;
        SET session_replication_role = DEFAULT;
      END $$;
    `
  } catch {
    // Fallback: delete in reverse dependency order
    try {
      await prisma.$transaction([
        prisma.auditLog.deleteMany(),
        prisma.notification.deleteMany(),
        prisma.downloadToken.deleteMany(),
        prisma.calibrationResult.deleteMany(),
        prisma.certificateMasterInstrument.deleteMany(),
        prisma.parameter.deleteMany(),
        prisma.certificateRevision.deleteMany(),
        prisma.certificate.deleteMany(),
        prisma.masterInstrument.deleteMany(),
        prisma.customerUser.deleteMany(),
        prisma.customerAccount.deleteMany(),
        prisma.user.deleteMany(),
      ])
    } catch (deleteError) {
      console.warn('Warning: Could not clean database:', deleteError)
    }
  }
})

/**
 * Global teardown - runs once after all tests
 */
afterAll(async () => {
  await prisma.$disconnect()
  console.log('\n🧹 PostgreSQL test cleanup complete')
})

/**
 * Export prisma client for tests
 */
export { prisma }
