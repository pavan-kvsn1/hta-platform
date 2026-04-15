import { describe, it, expect } from 'vitest'

describe('@hta/database exports', () => {
  it('exports prisma client', async () => {
    const { prisma } = await import('../src/index.js')
    expect(prisma).toBeDefined()
    expect(typeof prisma).toBe('object')
  })

  it('exports tenant context functions', async () => {
    const { getTenantContext, withTenant } = await import('../src/index.js')
    expect(typeof getTenantContext).toBe('function')
    expect(typeof withTenant).toBe('function')
  })

  it('exports Prisma namespace', async () => {
    const { Prisma } = await import('../src/index.js')
    expect(Prisma).toBeDefined()
    // Prisma namespace should have common utilities
    expect(Prisma.PrismaClientKnownRequestError).toBeDefined()
  })
})
