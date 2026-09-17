# Retired

Kept as the record of what used to be checked. Nothing here has a job left.

| script | why it is retired |
|---|---|
| `check-prisma-schema-parity.mjs` | compared two copies of the Prisma schema. There is one now: `apps/web-hta/prisma/schema.prisma` was a mirror nothing read - every command in that app's package.json points at `packages/database/prisma/schema.prisma` - and it had drifted, so the check failed on every run and taught people to ignore it. Deleting the mirror left this with nothing to compare. |

`packages/database/scripts/retired/` holds the same kind of thing for the database.
