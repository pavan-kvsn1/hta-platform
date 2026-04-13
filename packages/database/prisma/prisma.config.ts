import path from 'node:path'
import { defineConfig } from 'prisma/config'

/**
 * Prisma 7 Configuration
 *
 * Connection URLs are configured here instead of schema.prisma.
 * Runtime connection is handled in src/client.ts
 */

export default defineConfig({
  earlyAccess: true,
  schema: path.join(__dirname, 'schema.prisma'),

  migrate: {
    url: process.env.DIRECT_URL || process.env.DATABASE_URL ||
      'postgresql://hta_user:hta_dev_password@127.0.0.1:5432/hta_platform',
  },
})
