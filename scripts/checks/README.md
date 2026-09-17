# Checks

Look and report. Nothing here writes.

| script | status | what it checks |
|---|---|---|
| `check-prisma-schema-parity.mjs` | live | that the two copies of the Prisma schema agree |

Wired up as `npm run db:schema:check`.

The canonical schema is `packages/database/prisma/schema.prisma`. The copy under
`apps/web-hta/prisma/` is a mirror that nothing reads - every command in that app's
package.json points at the canonical one - and the two have drifted. This check is what
says so.
