# Prisma Schema And Migrations

This directory is the canonical Prisma home for the platform database.

- `schema.prisma` is the schema used by the shared `@hta/database` package.
- `migrations/` is the migration history used for future `prisma migrate` commands.

There is no second copy any more. `apps/web-hta/prisma/` held a mirror of this schema
and a copy of the migrations up to June; the mirror had drifted, nothing read either -
every command in that app's package.json points here - and the parity check that
compared them failed on every run, which taught people to ignore it. All three are
gone. What remains in that folder is `seed.ts`, which `npm run seed` still uses.

Create and deploy migrations from the repository root or `packages/database`:

```bash
pnpm db:migrate
pnpm db:migrate:deploy
pnpm db:migrate:status
```

Do not create new migrations from `apps/web-hta/prisma`.
