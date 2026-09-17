# Migration

One-way jobs. All have been applied to this database; all are safe to re-run, and say
"0 to change" when there is nothing left to do.

| script | status | what it did |
|---|---|---|
| `fix-formula-accuracy.mjs` | **not yet run on the live database** | the three steps below as one command |
| `backfill-accuracy-formula-parts.mjs` | spent | put back the numbers behind 120 formula accuracies that the import dropped |
| `standardise-accuracy.mjs` | spent | settled 38 bands the rating engine could not use - `fsd` to full scale, `%RH` to a plain figure, and the five the lab decided |
| `backfill-capability-part.mjs` | spent | said which capability is the readout's and which the probe's, on the six two-part masters |

## On the live database

```
cd packages/database
DATABASE_URL="postgresql://…" node scripts/migration/fix-formula-accuracy.mjs
```

Adds four columns, copies the values across, then refuses to say "done" unless the
result matches. Nothing is dropped and no existing value is overwritten with a worse
one. `backfill-capability-part.mjs` and `standardise-accuracy.mjs` are separate runs.

`standardise-accuracy.mjs` writes the register file as well as the database. That was to
keep the app's bundled copy in step with the record; the app no longer carries a copy,
so what it keeps in step now is the test fixture.
