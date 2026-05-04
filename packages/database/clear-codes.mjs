import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()
await p.$executeRawUnsafe('DELETE FROM "OfflineCode"')
await p.$executeRawUnsafe('DELETE FROM "OfflineCodeBatch"')
console.log('Cleared offline codes')
await p.$disconnect()
