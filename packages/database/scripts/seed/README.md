# Seeding

Filling an empty database from `apps/web-hta/src/data/master-instrument-registry.json`.

| script | status | command |
|---|---|---|
| `seed-platform.ts` | live | `pnpm --filter @hta/database db:seed:platform`, or `prisma db seed` |
| `seed-master-capabilities.ts` | spent | `pnpm --filter @hta/database db:seed:capabilities` |
| `seed-calibration-parameters.ts` | spent | `pnpm --filter @hta/database db:seed:parameters` |

`seed-platform.ts` brings up an empty environment: the tenant, its users, customers,
master instruments and their certificates. It lived in `apps/web-hta/prisma/` next to a
schema that has since been deleted, and it is the `prisma.seed` entry - which belongs
beside the schema Prisma is pointed at, which is this package's.

It makes nothing go away: no deletes anywhere, the tenant is looked up before it is
created, and the admin upsert has an empty `update`, so an existing password is never
written over. It prints the database it is about to write to before it writes - this
package's .env is the one the migrations use, and knowing which that is should not
require reading a port number.

**Insert-only.** Neither updates and neither deletes, so running them again leaves
everything already present exactly as it is - including whatever an admin has since
edited. That is deliberate: once a profile exists the database owns it, and a seed that
reset profiles on every deploy would quietly undo somebody's afternoon.

Spent rather than live because new instruments are added on the admin pages now. These
are what a fresh environment runs once.
