/**
 * PostgreSQL Test Setup for Worker Integration Tests
 *
 * Connects to the test PostgreSQL database for integration testing.
 */

import { PrismaClient } from '@prisma/client'
import { execSync } from 'child_process'

// Test database URL
const DATABASE_URL = process.env.DATABASE_URL ||
  'postgresql://hta_test:hta_test_password@localhost:5433/hta_calibration_test'

// Create Prisma client with explicit connection URL
export const prisma = new PrismaClient({
  datasources: {
    db: {
      url: DATABASE_URL,
    },
  },
})

/**
 * Setup test database - push schema
 */
export async function setupTestDatabase(): Promise<void> {
  console.log('\n🐘 Setting up PostgreSQL test database for worker tests...')

  // Test connection
  try {
    await prisma.$connect()
    console.log('✅ PostgreSQL connection successful')
  } catch (error) {
    console.error('❌ Failed to connect to PostgreSQL:', error)
    throw error
  }

  // Push schema
  try {
    console.log('📦 Pushing schema to PostgreSQL...')
    execSync(`npx prisma db push --skip-generate`, {
      cwd: process.cwd().replace(/apps[\\\/]worker$/, 'packages/database'),
      env: { ...process.env, DATABASE_URL },
      stdio: 'pipe',
    })
    console.log('✅ Schema pushed successfully')
  } catch (error) {
    console.error('❌ Failed to push schema:', error)
    throw error
  }
}

/**
 * Cleanup test database
 */
export async function cleanupTestDatabase(): Promise<void> {
  console.log('\n🧹 PostgreSQL test cleanup complete')
  await prisma.$disconnect()
}
