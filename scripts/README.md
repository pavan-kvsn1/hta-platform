# Scripts

Four folders, by what a script is for rather than by what it is written in.

| folder | what lives there |
|---|---|
| [`registry-build/`](registry-build/) | how the lab's spreadsheet became a JSON register. **Archive** — the app no longer reads that register. |
| [`maintenance/`](maintenance/) | repairs run against real data when something is found wrong |
| [`ops/`](ops/) | recovery drills, rollbacks, local environment |
| [`checks/`](checks/) | things that only look and report |

Database migration and seeding live with the package that owns the schema:
[`packages/database/scripts/`](../packages/database/scripts/).

## Status, as used in each folder's README

| | |
|---|---|
| **live** | still run, still correct |
| **ad-hoc** | run when a specific problem turns up, not on a schedule |
| **spent** | a one-way job already applied; kept so a fresh environment can repeat it |
| **archive** | superseded. Kept as the record of how the data got here, not as tooling. |

## Why several of these are archive now

Until this week the app carried a 1.3 MB copy of the master instrument register compiled
into it, generated from the lab's spreadsheet. The database has since become the record:
instruments, their capabilities and their accuracies are edited on the admin pages, and
the app reads them from there.

That leaves the spreadsheet pipeline making a file nothing ships. It is kept because the
test suite still uses that file as a fixture, and because it is how this data got here -
but new instruments are added on the admin pages, not in the spreadsheet.
