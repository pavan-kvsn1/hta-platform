# Seeding

Filling an empty database from `apps/web-hta/src/data/master-instrument-registry.json`.

| script | status | command |
|---|---|---|
| `seed-master-capabilities.ts` | spent | `pnpm --filter @hta/database db:seed:capabilities` |
| `seed-calibration-parameters.ts` | spent | `pnpm --filter @hta/database db:seed:parameters` |

**Insert-only.** Neither updates and neither deletes, so running them again leaves
everything already present exactly as it is - including whatever an admin has since
edited. That is deliberate: once a profile exists the database owns it, and a seed that
reset profiles on every deploy would quietly undo somebody's afternoon.

Spent rather than live because new instruments are added on the admin pages now. These
are what a fresh environment runs once.
