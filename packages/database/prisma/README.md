# Prisma Schema And Migrations

This directory is the canonical Prisma home for the platform database.

- `schema.prisma` is the schema used by the shared `@hta/database` package.
- `migrations/` is the migration history used for future `prisma migrate` commands.
- `apps/web-hta/prisma/schema.prisma` currently remains as a compatibility mirror.
- `apps/web-hta/prisma/migrations/` currently remains as a compatibility copy of the old migration location.

Until the web-local Prisma directory is removed, run the parity check before creating migrations:

```bash
pnpm db:schema:check
```

Create and deploy migrations from the repository root or `packages/database`:

```bash
pnpm db:migrate
pnpm db:migrate:deploy
pnpm db:migrate:status
```

Do not create new migrations from `apps/web-hta/prisma`.
