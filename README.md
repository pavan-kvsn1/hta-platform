# HTA Platform

Multi-tenant calibration certificate management platform built with Turborepo.

## Structure

```
hta-platform/
├── apps/
│   ├── web-hta/     # Next.js frontend (HTA branded)
│   ├── api/         # Fastify API service
│   └── worker/      # BullMQ background jobs
├── packages/
│   ├── database/    # Prisma client & types
│   ├── shared/      # Shared utilities
│   ├── emails/      # Email templates (React Email)
│   └── ui/          # Shared UI components
├── tests/           # Cross-service tests
└── tenants/         # Tenant configurations
```

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 9+
- PostgreSQL 16+
- Redis (for worker queues)

### Setup

```bash
# Install dependencies
pnpm install

# Generate Prisma client
pnpm db:generate

# Push schema to database
pnpm db:push

# Start development servers
pnpm dev
```

### Development URLs

| Service | URL |
|---------|-----|
| Web (HTA) | http://localhost:3000 |
| API | http://localhost:4000 |
| Prisma Studio | http://localhost:5555 |

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start all services in development |
| `pnpm build` | Build all packages |
| `pnpm test` | Run all tests |
| `pnpm test:unit` | Run unit tests |
| `pnpm test:integration` | Run integration tests |
| `pnpm test:e2e` | Run E2E tests |
| `pnpm lint` | Lint all packages |
| `pnpm typecheck` | Type check all packages |

## Adding a New Tenant

1. Copy `tenants/_template/` to `tenants/{tenant-slug}/`
2. Update `config.json` with tenant settings
3. Copy `apps/web-tenant-template/` to `apps/web-{tenant-slug}/`
4. Update branding in the new web app
5. Deploy with tenant-specific environment variables

## Migration from hta-calibration

See `docs/migration-guide.md` for step-by-step migration instructions.
